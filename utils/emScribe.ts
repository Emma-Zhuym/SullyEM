/**
 * emScribe.ts — EM 版角色代记（借上游 lifeRecords 的思路，落库全走自家的库）
 *
 * 上游那套（lifeRecords.ts / 个人档案-生活记录）在 EM fork 里保持关闭，
 * 本模块是独立实现：角色在聊天中听到用户明确说出的事实时，
 * 输出 [[REC:...]] 指令 → 写进 EM 自己的 Health App（healthDb）/ BankApp（银行流水），
 * 并在聊天里落一张可确认/否决的卡片（复用上游 life_card 消息类型 + UI，
 * metadata.emRec=true 分流到本模块的回滚逻辑）。
 *
 * 五类指令（饮食不做——阿萌的晚餐后统一结算工作流不需要代记插手）：
 *   [[REC:EXPENSE|金额|用途]]            → BankApp 流水
 *   [[REC:WORKOUT|项目|时长分钟|备注?]]   → Health 训练事件
 *   [[REC:SYMPTOM|症状1、症状2]]         → Health 症状事件
 *   [[REC:PERIOD]]                       → Health 经期事件（当日 flow=medium，细节去 App 里改）
 *   [[REC:SLEEP|入睡HH:MM|起床HH:MM]]    → Health 睡眠事件（时长自动算，质量默认 ok）
 *
 * 防翻车设计（照抄上游精华）：
 *   - 提示词强调"只有明确说出才记"，暗示/玩笑/过去的事/别人的事不记
 *   - 单条消息最多执行 4 条指令
 *   - 去重：同日同内容不重复写，落"已有记录"提示卡（角色不算记错）
 *   - 否决闭环：否决 = 删除健康事件/银行流水 + 给角色挂一次性反馈，下轮认错
 *
 * 开关：localStorage 'em_scribe_enabled'，默认开；写 '0' 关闭（全局，对所有角色生效）。
 */

import { DB } from './db';
import {
    saveHealthEvent, deleteHealthEvent, getEventsByDate,
    type HealthEvent, type WorkoutHealthEvent, type SymptomHealthEvent,
    type PeriodHealthEvent, type SleepHealthEvent,
} from './healthDb';
import type { BankTransaction, CharacterProfile, Message } from '../types';

// ─── 开关 ───
export const isEmScribeOn = (): boolean => {
    try { return localStorage.getItem('em_scribe_enabled') !== '0'; } catch { return true; }
};

const todayStr = (): string => new Date().toISOString().split('T')[0];

// ─── 否决反馈队列（localStorage，一次性） ───
const FB_KEY = 'em_scribe_feedback';
interface ScribeFeedback { charId: string; summary: string; date: string }

const loadFeedback = (): ScribeFeedback[] => {
    try { return JSON.parse(localStorage.getItem(FB_KEY) || '[]'); } catch { return []; }
};
const saveFeedback = (list: ScribeFeedback[]) => {
    try { localStorage.setItem(FB_KEY, JSON.stringify(list)); } catch { /* ignore */ }
};
const pushFeedback = (fb: ScribeFeedback) => saveFeedback([...loadFeedback(), fb]);
/** 取走并清除某角色的否决反馈（注入即消费） */
const takeFeedback = (charId: string): ScribeFeedback[] => {
    const all = loadFeedback();
    const mine = all.filter(f => f.charId === charId);
    if (mine.length > 0) saveFeedback(all.filter(f => f.charId !== charId));
    return mine;
};

// ═══════════════════════════════════════════════════════════
// 1. 注入（教角色指令 + 否决反馈）
//    今日健康/花销摘要已由 healthContextBuilder 等注入，这里不重复。
// ═══════════════════════════════════════════════════════════

export const buildEmScribeInjection = (char: CharacterProfile, userName: string): string => {
    if (!isEmScribeOn()) return '';

    let s = `\n### 代记工具（帮 ${userName} 顺手记一笔）\n`;
    s += `只有当 ${userName} 在对话中**明确说出**以下事实时，才单独起一行输出对应指令、帮 TA 顺手记进 TA 的健康/记账 App（一次一条）：\n`;
    s += `- TA 明确说花了多少钱买什么 → \`[[REC:EXPENSE|金额|用途]]\`（金额是纯数字）\n`;
    s += `- TA 明确说做了什么运动 → \`[[REC:WORKOUT|项目|时长分钟]]\`（时长不知道就估个整数分钟）\n`;
    s += `- TA 明确说身体哪里不舒服 → \`[[REC:SYMPTOM|症状]]\`（多个用、分隔）\n`;
    s += `- TA 明确说生理期来了 → \`[[REC:PERIOD]]\`\n`;
    s += `- TA 明确说昨晚几点睡几点起 → \`[[REC:SLEEP|入睡HH:MM|起床HH:MM]]\`\n`;
    s += `TA 只是暗示、开玩笑、说过去的事或别人的事时，一律不要记。记录成功后系统会插一张卡片，TA 可以确认或否决；被否决说明你理解错了。平时不要把这些指令挂在嘴边，也不要替 TA 补记你只是猜测的事。\n`;

    const fbs = takeFeedback(char.id);
    if (fbs.length > 0) {
        s += `\n**【记录反馈】**你之前帮 ${userName} 代记的这些被 TA **否决**了——你理解错了，这些事并没有发生（记录已撤销）：\n`;
        fbs.forEach(f => { s += `- ${f.summary}（${f.date}）\n`; });
        s += `修正你的认知，接下来视语境自然地认个错或带过即可，不要长篇道歉。\n`;
    }
    return s;
};

// ═══════════════════════════════════════════════════════════
// 2. 代记（解析并执行 [[REC:...]] 指令，chatParser 调用）
// ═══════════════════════════════════════════════════════════

const REC_TAG_RE = /\[\[REC:([A-Z_]+)((?:\|[^\]|]*)*)\]\]/;
const REC_TAG_GLOBAL_RE = /\[\[REC:[^\]]*\]\]/g;

type RecKind = 'expense' | 'workout' | 'symptom' | 'period' | 'sleep';
interface RecDirective { kind: RecKind; payload: Record<string, any> }

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const parseRecDirective = (verb: string, args: string[]): RecDirective | null => {
    switch (verb) {
        case 'EXPENSE': {
            const amount = parseFloat((args[0] || '').replace(/[^\d.]/g, ''));
            const note = (args[1] || '').trim();
            if (isNaN(amount) || amount <= 0) return null;
            return { kind: 'expense', payload: { amount, note } };
        }
        case 'WORKOUT': {
            const activity = (args[0] || '').trim();
            const duration = parseInt((args[1] || '').replace(/[^\d]/g, ''), 10);
            if (!activity) return null;
            return { kind: 'workout', payload: { activity, duration: isNaN(duration) || duration <= 0 ? 30 : duration, note: (args[2] || '').trim() } };
        }
        case 'SYMPTOM': {
            const symptoms = (args[0] || '').split(/[、,，;；]/).map(s => s.trim()).filter(Boolean);
            return symptoms.length > 0 ? { kind: 'symptom', payload: { symptoms } } : null;
        }
        case 'PERIOD': return { kind: 'period', payload: {} };
        case 'SLEEP': {
            const bedtime = (args[0] || '').trim();
            const wakeTime = (args[1] || '').trim();
            if (!HHMM_RE.test(bedtime) || !HHMM_RE.test(wakeTime)) return null;
            const [bh, bm] = bedtime.split(':').map(Number);
            const [wh, wm] = wakeTime.split(':').map(Number);
            let duration = (wh * 60 + wm) - (bh * 60 + bm);
            if (duration <= 0) duration += 24 * 60; // 跨午夜
            return { kind: 'sleep', payload: { bedtime, wakeTime, duration } };
        }
        default: return null;
    }
};

export const summarizeRec = (d: RecDirective): string => {
    switch (d.kind) {
        case 'expense': return `支出 ${d.payload.amount}${d.payload.note ? `（${d.payload.note}）` : ''}`;
        case 'workout': return `锻炼 · ${d.payload.activity} ${d.payload.duration}分钟`;
        case 'symptom': return `症状 · ${(d.payload.symptoms as string[]).join('、')}`;
        case 'period': return '生理期开始';
        case 'sleep': return `睡眠 ${d.payload.bedtime}~${d.payload.wakeTime}`;
    }
};

/** 去重：null=无重复；否则返回提示文案 */
const findDuplicate = async (d: RecDirective, today: string): Promise<string | null> => {
    if (d.kind === 'expense') {
        const txs = await DB.getAllTransactions().catch(() => [] as BankTransaction[]);
        return txs.some(t => t.dateStr === today && t.amount === d.payload.amount && (t.note || '') === (d.payload.note || ''))
            ? '同日已有相同金额和备注的一笔' : null;
    }
    const events = await getEventsByDate(today).catch(() => [] as HealthEvent[]);
    switch (d.kind) {
        case 'workout':
            return events.some(e => e.type === 'workout' && (e as WorkoutHealthEvent).summary === d.payload.activity
                && (e as WorkoutHealthEvent).duration === d.payload.duration) ? '今天已记过这项训练' : null;
        case 'symptom': {
            const mine = new Set(d.payload.symptoms as string[]);
            return events.some(e => e.type === 'symptom' && (e as SymptomHealthEvent).symptoms.some(s => mine.has(s)))
                ? '今天已记过相关症状' : null;
        }
        case 'period': return events.some(e => e.type === 'period') ? '今天已有经期记录' : null;
        case 'sleep': return events.some(e => e.type === 'sleep') ? '今天已有睡眠记录' : null;
    }
};

/** 写库，返回回滚所需的引用（healthEventId 或 bankTxId） */
const writeRec = async (d: RecDirective, char: CharacterProfile, today: string):
    Promise<{ healthEventId?: string; bankTxId?: string }> => {
    const id = `em-rec-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    switch (d.kind) {
        case 'expense': {
            const tx: BankTransaction = {
                id: `tx-em-rec-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
                amount: d.payload.amount,
                category: 'general',
                note: d.payload.note || `${char.name}代记`,
                timestamp: Date.now(),
                dateStr: today,
            };
            await DB.saveTransaction(tx);
            return { bankTxId: tx.id };
        }
        case 'workout': {
            const ev: WorkoutHealthEvent = {
                id, date: today, createdAt: Date.now(), type: 'workout',
                activities: [d.payload.activity], parts: [],
                duration: d.payload.duration,
                summary: d.payload.activity,
                rawInput: `${char.name}代记${d.payload.note ? `：${d.payload.note}` : ''}`,
            };
            await saveHealthEvent(ev);
            return { healthEventId: id };
        }
        case 'symptom': {
            const ev: SymptomHealthEvent = { id, date: today, createdAt: Date.now(), type: 'symptom', symptoms: d.payload.symptoms };
            await saveHealthEvent(ev);
            return { healthEventId: id };
        }
        case 'period': {
            const ev: PeriodHealthEvent = { id, date: today, createdAt: Date.now(), type: 'period', flow: 'medium' };
            await saveHealthEvent(ev);
            return { healthEventId: id };
        }
        case 'sleep': {
            const ev: SleepHealthEvent = {
                id, date: today, createdAt: Date.now(), type: 'sleep',
                bedtime: d.payload.bedtime, wakeTime: d.payload.wakeTime,
                duration: d.payload.duration, quality: 'ok',
                note: `${char.name}代记`,
            };
            await saveHealthEvent(ev);
            return { healthEventId: id };
        }
    }
};

/**
 * 解析并执行 [[REC:...]]（chatParser 调用，本地 / instant push 共用路径）。
 * 返回剥掉所有 REC tag 的文本。
 */
export const executeEmScribeDirectives = async (
    aiContent: string,
    char: CharacterProfile,
    addToast: (msg: string, type: 'info' | 'success' | 'error') => void,
): Promise<string> => {
    let content = aiContent;
    if (!content.includes('[[REC:')) return content;

    const today = todayStr();
    let executed = 0;
    const MAX_PER_MESSAGE = 4;

    let m: RegExpMatchArray | null;
    while ((m = content.match(REC_TAG_RE)) !== null) {
        const [tag, verb, argStr] = m;
        content = content.replace(tag, '').trim();
        if (!isEmScribeOn() || executed >= MAX_PER_MESSAGE) continue;

        const args = argStr ? argStr.split('|').slice(1).map(s => s.trim()) : [];
        const d = parseRecDirective(verb, args);
        if (!d) continue;
        executed++;

        try {
            const dup = await findDuplicate(d, today);
            const summary = summarizeRec(d);

            // 卡片样式键：workout 复用上游 exercise 样式（图标/标签一致）
            const styleModule = d.kind === 'workout' ? 'exercise' : d.kind;

            if (dup) {
                await DB.saveMessage({
                    charId: char.id, role: 'assistant', type: 'life_card',
                    content: `[生活记录：${summary}（已有记录，未重复添加）]`,
                    metadata: {
                        emRec: true, module: styleModule, summary, dateStr: today,
                        recordedByName: char.name, duplicate: true, duplicateBy: dup,
                    },
                } as any);
                addToast(`${char.name} 想记「${summary}」，已有记录`, 'info');
                continue;
            }

            const refs = await writeRec(d, char, today);
            await DB.saveMessage({
                charId: char.id, role: 'assistant', type: 'life_card',
                content: `[生活记录：${summary}]`,
                metadata: {
                    emRec: true, module: styleModule, summary, dateStr: today,
                    recordedByName: char.name, reviewStatus: 'active', ...refs,
                },
            } as any);
            addToast(`${char.name} 帮你记录了「${summary}」`, 'success');
        } catch (e) {
            console.error('[EmScribe] directive failed:', verb, e);
        }
    }

    return content.replace(REC_TAG_GLOBAL_RE, '').trim();
};

// ═══════════════════════════════════════════════════════════
// 3. 卡片裁决（Chat.tsx 分流调用：metadata.emRec === true 时走这里）
// ═══════════════════════════════════════════════════════════

export const resolveEmScribeCard = async (
    msg: Message,
    action: 'confirmed' | 'rejected',
): Promise<void> => {
    const meta: any = msg.metadata || {};
    if (action === 'rejected') {
        if (meta.healthEventId) await deleteHealthEvent(meta.healthEventId).catch(() => {});
        if (meta.bankTxId) await DB.deleteTransaction(meta.bankTxId).catch(() => {});
        pushFeedback({ charId: msg.charId, summary: meta.summary || '一条记录', date: meta.dateStr || todayStr() });
    }
    await DB.updateMessageMetadata(msg.id, (prev: any) => ({
        ...(prev || {}), reviewStatus: action, resolvedAt: Date.now(),
    }));
};

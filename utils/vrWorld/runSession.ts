/**
 * 「彼方」会话运行器 —— 一次自主登入的完整闭环。
 *
 * 触发某角色后：
 *   1. 选房间（v1：图书馆）+ 选一本书（续读未读完的，否则随机）
 *   2. 从该角色对这本书的【独立书签】取阅读窗口（~2w 字原文 + 已有批注）
 *   3. 用 buildChatRequestPayload 取得角色既有人设/向量记忆/最近 contextLimit
 *      条上下文，再叠加「彼方」世界观说明 + 房间现场（user turn）
 *   4. 调一次 LLM（per-char API 覆盖 → 回落全局）
 *   5. 解析输出：落库批注、推进书签、更新 vrState
 *   6. 向该角色 1v1 聊天注入一条 vr_card（steam 式活动播报，省略原文、保留
 *      批注），天然被上下文与记忆总结捕捉
 *   7. fire-and-forget 触发记忆管线，让这件事被总结
 */

import {
    CharacterProfile, UserProfile, GroupProfile, RealtimeConfig, APIConfig,
    VRWorldNovel, VRNovelAnnotation, VRCardMeta, VRRoomId,
} from '../../types';
import { DB } from '../db';
import { buildChatRequestPayload } from '../chatRequestPayload';
import { safeFetchJson } from '../safeApi';
import { processNewMessages } from '../memoryPalace/pipeline';
import { getRoom, VR_DEFAULT_INTERVAL_MIN } from './constants';
import {
    getReadingWindow, getBookmark, buildAnnotation,
} from './novel';
import {
    buildVRSystemAddendum, buildLibraryRoomTurn, parseVROutput,
} from './prompts';

/** 记忆管线所需配置的最小形状（避免从 OSContext 反向 import 造成循环依赖）。 */
interface MemoryConfigLike {
    embedding?: { baseUrl?: string; apiKey?: string; model?: string; dimensions?: number };
    lightLLM?: { baseUrl?: string; apiKey?: string; model?: string };
}

export interface VRSessionDeps {
    char: CharacterProfile;
    apiConfig: APIConfig;
    userProfile: UserProfile;
    groups: GroupProfile[];
    realtimeConfig?: RealtimeConfig;
    memoryPalaceConfig?: MemoryConfigLike;
    /** 持久化角色（更新 vrState 用）。 */
    updateCharacter: (id: string, updates: Partial<CharacterProfile>) => Promise<void> | void;
}

export interface VRSessionResult {
    ok: boolean;
    room: VRRoomId;
    reason?: string;
    novelTitle?: string;
    annotationsWritten?: number;
    activity?: string;
}

// 同一角色同时只跑一次
const running = new Set<string>();

/** 选一本要读的书：优先续读未读完的，否则取最近更新的一本。 */
function pickNovel(novels: VRWorldNovel[], char: CharacterProfile): VRWorldNovel | null {
    if (novels.length === 0) return null;
    const bookmarks = char.vrState?.novelBookmarks;
    const unfinished = novels.filter(n => getBookmark(bookmarks, n.id) < n.segments.length);
    const pool = unfinished.length > 0 ? unfinished : novels;
    // 续读优先：已有进度的排前面，其余按更新时间
    pool.sort((a, b) => {
        const ba = getBookmark(bookmarks, a.id);
        const bb = getBookmark(bookmarks, b.id);
        const aStarted = ba > 0 ? 1 : 0;
        const bStarted = bb > 0 ? 1 : 0;
        if (aStarted !== bStarted) return bStarted - aStarted;
        return b.updatedAt - a.updatedAt;
    });
    return pool[0];
}

export async function runVRSession(deps: VRSessionDeps): Promise<VRSessionResult> {
    const { char, apiConfig, userProfile, groups, realtimeConfig, memoryPalaceConfig, updateCharacter } = deps;
    const room = getRoom('library'); // v1：只实装图书馆

    if (running.has(char.id)) {
        return { ok: false, room: room.id, reason: 'busy' };
    }

    // API 选择：角色专属覆盖 → 全局
    const vrApi = char.vrState?.api?.baseUrl ? char.vrState.api : apiConfig;
    if (!vrApi.baseUrl) {
        return { ok: false, room: room.id, reason: 'no-api' };
    }

    const novels = await DB.getVRNovels();
    const novel = pickNovel(novels, char);
    if (!novel) {
        return { ok: false, room: room.id, reason: 'no-novel' };
    }

    running.add(char.id);
    try {
        const bookmark = getBookmark(char.vrState?.novelBookmarks, novel.id);
        const win = getReadingWindow(novel, bookmark >= novel.segments.length ? 0 : bookmark);
        const allAnn = await DB.getVRAnnotations(novel.id);
        const windowAnn = allAnn.filter(a => a.segIdx >= win.from && a.segIdx < win.to);

        // 1. 构造材料（人设 + 向量记忆 + 最近 contextLimit 上下文）
        const emojis = await DB.getEmojis();
        const categories = await DB.getEmojiCategories();
        const contextLimit = char.contextLimit || 500;
        const historyMsgs = await DB.getRecentMessagesByCharId(char.id, contextLimit);

        const payload = await buildChatRequestPayload({
            char, userProfile, groups, emojis, categories,
            historyMsgs, contextLimit, realtimeConfig,
        });

        const systemPrompt = payload.systemPrompt + buildVRSystemAddendum(room, char.name);
        const roomTurn = buildLibraryRoomTurn(novel, win, windowAnn);
        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...payload.cleanedApiMessages,
            { role: 'user', content: roomTurn },
        ];

        // 2. 调 LLM
        const baseUrl = vrApi.baseUrl.replace(/\/+$/, '');
        const data = await safeFetchJson(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${vrApi.apiKey || 'sk-none'}`,
            },
            body: JSON.stringify({
                model: vrApi.model,
                messages: fullMessages,
                temperature: 0.9,
                stream: false,
            }),
        });

        let aiContent: string = data.choices?.[0]?.message?.content || '';
        aiContent = aiContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        const parsed = parseVROutput(aiContent);

        // 3. 落库批注（仅接受落在本次窗口内的段落）
        const label2id = new Map<string, string>();
        for (const a of allAnn) label2id.set(a.id.slice(-4), a.id);

        const savedExcerpts: string[] = [];
        let written = 0;
        for (const pa of parsed.annotations) {
            if (pa.segIdx < win.from || pa.segIdx >= win.to) continue;
            const targetId = pa.refLabel ? label2id.get(pa.refLabel) : undefined;
            const ann = buildAnnotation({
                novelId: novel.id,
                segIdx: pa.segIdx,
                authorId: char.id,
                authorName: char.name,
                content: pa.content,
                targetAnnotationId: targetId,
            });
            await DB.saveVRAnnotation(ann);
            label2id.set(ann.id.slice(-4), ann.id);
            savedExcerpts.push(pa.content.length > 60 ? pa.content.slice(0, 60) + '…' : pa.content);
            written += 1;
        }

        // 4. 推进书签 + 更新 vrState
        const nextBookmark = win.reachedEnd ? novel.segments.length : win.to;
        const prevState = char.vrState || { enabled: true, intervalMinutes: VR_DEFAULT_INTERVAL_MIN };
        await updateCharacter(char.id, {
            vrState: {
                ...prevState,
                novelBookmarks: { ...(prevState.novelBookmarks || {}), [novel.id]: nextBookmark },
                currentRoom: room.id,
                lastActiveAt: Date.now(),
            },
        });

        // 5. 注入 vr_card（省略原文，保留标题+批注+活动播报）
        const activity = parsed.activity
            || `读了《${novel.title}》第 ${win.from + 1}~${win.to} 段${written ? `，留下了 ${written} 条批注` : '，安静读完没多说什么'}。`;
        const cardLines = [
            `「${room.emoji} 彼方·${room.name}」`,
            `${char.name}${activity}`,
        ];
        if (savedExcerpts.length) {
            cardLines.push('批注：');
            for (const ex of savedExcerpts) cardLines.push(`· ${ex}`);
        }
        const meta: VRCardMeta = {
            vrCard: true,
            room: room.id,
            activity,
            novelId: novel.id,
            novelTitle: novel.title,
            segRange: [win.from, win.to],
            annotationExcerpts: savedExcerpts,
        };
        await DB.saveMessage({
            charId: char.id,
            role: 'assistant',
            type: 'vr_card',
            content: cardLines.join('\n'),
            metadata: meta,
        });

        // 6. 记忆管线（fire-and-forget）—— 让这件事被总结捕捉
        try {
            const mpEmb = memoryPalaceConfig?.embedding;
            const mpLLMConfigured = memoryPalaceConfig?.lightLLM;
            const mpLLM = (mpLLMConfigured?.baseUrl)
                ? mpLLMConfigured
                : { baseUrl: apiConfig.baseUrl, apiKey: apiConfig.apiKey, model: apiConfig.model };
            if (char.memoryPalaceEnabled && mpEmb?.baseUrl && mpEmb?.apiKey && mpLLM.baseUrl) {
                const recentMsgs = await DB.getRecentMessagesByCharId(char.id, 50);
                void processNewMessages(
                    recentMsgs, char.id, char.name,
                    mpEmb as any, mpLLM as any, userProfile?.name || '', false,
                ).catch(() => {});
            }
        } catch { /* 记忆失败不影响主流程 */ }

        // 7. 通知 UI 刷新
        try {
            window.dispatchEvent(new CustomEvent('vr-session-done', {
                detail: { charId: char.id, room: room.id, novelTitle: novel.title, activity },
            }));
        } catch { /* SSR / 无 window 环境 */ }

        return { ok: true, room: room.id, novelTitle: novel.title, annotationsWritten: written, activity };
    } catch (err) {
        console.error('[VRWorld] session error:', err);
        return { ok: false, room: room.id, reason: 'error' };
    } finally {
        running.delete(char.id);
    }
}

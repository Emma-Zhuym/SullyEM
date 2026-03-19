/**
 * LifeSim AI Prompts — CHAR决策提示词
 *
 * 角色们和用户一起玩模拟人生游戏，作为"玩家"操控游戏里的NPC小人
 */

import { LifeSimState, SimFamily, SimNPC, SimAction, CharacterProfile, UserProfile, SimSeason, CharNarrative } from '../types';
import { ContextBuilder } from './context';
import {
    getFamilyMembers, getIndependentNPCs, getMoodLabel, getFamilyAtmosphere,
    SEASON_INFO, TIME_INFO, WEATHER_INFO, getProfessionInfo, getChaosLabel, getRelLabel
} from './lifeSimEngine';

// ── 季节戏剧提示 ────────────────────────────────────────────

function getSeasonDramaHint(season: SimSeason): string {
    switch (season) {
        case 'spring': return '游戏里春暖花开，适合搞暧昧和制造新关系';
        case 'summer': return '游戏里夏日燥热，小人们脾气容易上头，冲突概率大增';
        case 'fall':   return '游戏里秋天EMO季，小人们容易翻旧账闹矛盾';
        case 'winter': return '游戏里寒冬窝家，八卦和drama是唯一的乐趣';
    }
}

// ── 游戏状态序列化 ────────────────────────────────────────────

function serializeWorldContext(state: LifeSimState): string {
    const season = state.season ?? 'spring';
    const si = SEASON_INFO[season];
    const ti = TIME_INFO[state.timeOfDay ?? 'morning'];
    const wi = WEATHER_INFO[state.weather ?? 'sunny'];

    const lines: string[] = [];
    lines.push(`=== 游戏世界环境 ===`);
    lines.push(`当前时间：第${state.year ?? 1}年 ${si.emoji}${si.zh}季 第${state.day ?? 1}天/28天 ${ti.emoji}${ti.zh}`);
    lines.push(`今日天气：${wi.emoji}${wi.zh}`);
    lines.push(`季节氛围：${getSeasonDramaHint(season)}`);
    lines.push('');
    return lines.join('\n');
}

function serializeGameState(state: LifeSimState): string {
    const lines: string[] = [];

    lines.push(`=== 游戏当前状态 (第${state.turnNumber}回合) ===`);
    const { label: chaosLabel } = getChaosLabel(state.chaosLevel);
    lines.push(`混乱度: ${state.chaosLevel}/100 (${chaosLabel})`);
    lines.push('');

    // ── 各家庭情况 ──
    lines.push('【游戏里各家庭情况】');
    for (const family of state.families) {
        const members = getFamilyMembers(state, family.id);
        if (members.length === 0) {
            lines.push(`${family.emoji} ${family.name}：(无人入住)`);
            continue;
        }
        const atmosphere = getFamilyAtmosphere(state, family.id);
        lines.push(`${family.emoji} ${family.name}（${atmosphere}）`);
        for (const npc of members) {
            const { emoji: moodEmoji } = getMoodLabel(npc.mood);
            lines.push(`  - ${npc.emoji}${npc.name}｜心情:${moodEmoji}(${npc.mood})`);
        }

        // 家庭内关系
        if (members.length >= 2) {
            const relLines: string[] = [];
            for (let i = 0; i < members.length; i++) {
                for (let j = i + 1; j < members.length; j++) {
                    const a = members[i]; const b = members[j];
                    const rel = family.relationships?.[a.id]?.[b.id] ?? 0;
                    const { label: relLabel } = getRelLabel(rel);
                    relLines.push(`    ${a.name}↔${b.name}: ${rel > 0 ? '+' : ''}${rel} (${relLabel})`);
                }
            }
            if (relLines.length > 0) { lines.push('  关系:'); lines.push(...relLines); }
        }
    }
    lines.push('');

    // ── 独行侠 ──
    const solos = getIndependentNPCs(state);
    if (solos.length > 0) {
        lines.push('【游戏里独居的小人】');
        for (const npc of solos) {
            const { emoji: moodEmoji } = getMoodLabel(npc.mood);
            lines.push(`  ${npc.emoji}${npc.name}｜心情:${moodEmoji}(${npc.mood})`);
        }
        lines.push('');
    }

    // ── 跨家庭关系（仇恨/暗恋）──
    const crossRelLines: string[] = [];
    for (const npc of state.npcs) {
        if (npc.grudges && npc.grudges.length > 0) {
            for (const targetId of npc.grudges) {
                const target = state.npcs.find(n => n.id === targetId);
                if (target) {
                    crossRelLines.push(`  💢 ${npc.emoji}${npc.name} 记恨 ${target.emoji}${target.name}`);
                }
            }
        }
        if (npc.crushes && npc.crushes.length > 0) {
            for (const targetId of npc.crushes) {
                const target = state.npcs.find(n => n.id === targetId);
                if (target) {
                    crossRelLines.push(`  💗 ${npc.emoji}${npc.name} 暗恋 ${target.emoji}${target.name}`);
                }
            }
        }
    }
    if (crossRelLines.length > 0) {
        lines.push('【跨家庭关系】');
        lines.push(...crossRelLines);
        lines.push('');
    }

    // ── 戏剧局势 ──
    lines.push('【游戏当前Drama局势】');

    // 仇恨关系汇总
    const grudgeSummary: string[] = [];
    for (const npc of state.npcs) {
        if (npc.grudges && npc.grudges.length > 0) {
            for (const targetId of npc.grudges) {
                const target = state.npcs.find(n => n.id === targetId);
                if (target) {
                    grudgeSummary.push(`${npc.name} 记恨 ${target.name}`);
                }
            }
        }
    }
    lines.push(`仇恨关系: ${grudgeSummary.length > 0 ? grudgeSummary.join('、') : '暂无'}`);

    // 暗恋关系汇总
    const crushSummary: string[] = [];
    for (const npc of state.npcs) {
        if (npc.crushes && npc.crushes.length > 0) {
            for (const targetId of npc.crushes) {
                const target = state.npcs.find(n => n.id === targetId);
                if (target) {
                    crushSummary.push(`${npc.name} 暗恋 ${target.name}`);
                }
            }
        }
    }
    lines.push(`暗恋关系: ${crushSummary.length > 0 ? crushSummary.join('、') : '暂无'}`);

    // 进行中的事件链
    if (state.pendingEffects.length > 0) {
        const effectLines = state.pendingEffects.map(eff =>
            `[${eff.id}] ${eff.description}（将在第${eff.triggerTurn}回合爆发）`
        );
        lines.push(`进行中的事件链: ${effectLines.join('；')}`);
    } else {
        lines.push('进行中的事件链: 暂无');
    }

    lines.push(`混乱度: ${state.chaosLevel}/100 (${chaosLabel})`);
    lines.push('');

    return lines.join('\n');
}

function serializeActionLog(log: SimAction[], maxEntries = 15): string {
    if (log.length === 0) return '（目前还没有任何操作记录）';
    const recent = log.slice(-maxEntries);
    return recent.map(a =>
        `[第${a.turnNumber}回合 | ${a.actor}] ${a.description}\n  → 结果: ${a.immediateResult}`
    ).join('\n\n');
}

// ── 构建CHAR决策Prompt ────────────────────────────────────────

export interface CharDecision {
    action: {
        type: 'ADD_NPC' | 'MOVE_NPC' | 'TRIGGER_EVENT' | 'GO_SOLO' | 'DO_NOTHING';
        newNpcName?: string;
        newNpcEmoji?: string;
        newNpcPersonality?: string[];
        targetFamilyId?: string;
        npcId?: string;
        newFamilyName?: string;
        eventType?: 'fight' | 'party' | 'gossip' | 'romance' | 'rivalry' | 'alliance';
        involvedNpcIds?: string[];
        eventDescription?: string;
    };
    narrative: {
        innerThought: string;
        dialogue: string;
        commentOnWorld: string;
        emotionalTone: 'vengeful' | 'romantic' | 'scheming' | 'chaotic' | 'peaceful' | 'amused' | 'anxious';
    };
    reactionToUser?: string;
    immediateResultHint?: string;
}

/** 将LLM输出的扁平/嵌套JSON统一规范化为CharDecision格式 */
export function normalizeCharDecision(raw: any): CharDecision {
    if (!raw || typeof raw !== 'object') {
        return { action: { type: 'DO_NOTHING' }, narrative: { innerThought: '', dialogue: '', commentOnWorld: '', emotionalTone: 'peaceful' } };
    }

    // 兼容扁平格式（新）和嵌套格式（旧）
    const hasNestedAction = raw.action && typeof raw.action === 'object' && raw.action.type;
    const actionObj = hasNestedAction ? raw.action : raw;

    const VALID_TYPES = ['ADD_NPC', 'MOVE_NPC', 'TRIGGER_EVENT', 'GO_SOLO', 'DO_NOTHING'];
    const rawType = String(actionObj.type || '').toUpperCase().replace(/[^A-Z_]/g, '_');
    const type = VALID_TYPES.includes(rawType) ? rawType as CharDecision['action']['type'] : 'DO_NOTHING';

    const action: CharDecision['action'] = {
        type,
        newNpcName: actionObj.newNpcName,
        newNpcEmoji: actionObj.newNpcEmoji,
        newNpcPersonality: actionObj.newNpcPersonality,
        targetFamilyId: actionObj.targetFamilyId,
        npcId: actionObj.npcId,
        newFamilyName: actionObj.newFamilyName,
        eventType: actionObj.eventType ? String(actionObj.eventType).toLowerCase() as any : undefined,
        involvedNpcIds: actionObj.involvedNpcIds,
        eventDescription: actionObj.eventDescription,
    };

    // 兼容嵌套 narrative 或扁平字段
    const narr = raw.narrative && typeof raw.narrative === 'object' ? raw.narrative : raw;
    const VALID_TONES = ['vengeful', 'romantic', 'scheming', 'chaotic', 'peaceful', 'amused', 'anxious'];
    const rawTone = String(narr.emotionalTone || narr.tone || 'peaceful').toLowerCase();

    const narrative: CharDecision['narrative'] = {
        innerThought: narr.innerThought || narr.thought || narr.inner_thought || '',
        dialogue: narr.dialogue || narr.dialog || '',
        commentOnWorld: narr.commentOnWorld || narr.comment || '',
        emotionalTone: (VALID_TONES.includes(rawTone) ? rawTone : 'peaceful') as any,
    };

    return {
        action,
        narrative,
        reactionToUser: raw.reactionToUser || raw.reaction || undefined,
        immediateResultHint: raw.immediateResultHint || raw.result || undefined,
    };
}

export function buildCharTurnSystemPrompt(
    char: CharacterProfile,
    user: UserProfile,
    recentChatHistory: string,
    state: LifeSimState,
    actionLog: SimAction[]
): string {
    // 1. 角色核心上下文
    const coreContext = ContextBuilder.buildCoreContext(char, user, true);

    // 2. 季节/天气信息
    const season = state.season ?? 'spring';
    const si = SEASON_INFO[season];
    const ti = TIME_INFO[state.timeOfDay ?? 'morning'];
    const wi = WEATHER_INFO[state.weather ?? 'sunny'];

    // 3. 游戏设定
    const dramaSetup = `
=== 你正在和${user.name}一起玩一款叫【模拟人生】的游戏 ===

你们是一群朋友围在一起玩游戏，游戏里有一个小镇，里面住着各种NPC小人。
你不在游戏世界里——你是坐在外面的玩家，在操控和观察游戏里的小人们。
每个玩家轮流操作，现在轮到你了。

当前游戏画面：${si.emoji}${si.zh}季 第${state.day ?? 1}天 | ${ti.emoji}${ti.zh} | ${wi.emoji}${wi.zh}
${getSeasonDramaHint(season)}

你可以做的操作：
- TRIGGER_EVENT：在游戏里制造事件，让小人们打架/聚会/八卦/恋爱/竞争/结盟
- ADD_NPC：往游戏里捏一个新小人丢进去
- MOVE_NPC：把某个小人搬到另一个家庭
- GO_SOLO：让某个小人搬出去独居
- DO_NOTHING：这轮跳过，看戏

玩法提示：
- 用你自己的性格来决定怎么玩——你是玩家，用你觉得有趣的方式搞事
- 你可以把某个小人代入成你自己或你认识的人，但要说出来（比如"这个小人就是我！"）
- TRIGGER_EVENT最好玩——让小人们上演各种drama
- 你的thought是你作为玩家的内心吐槽/想法，dialogue是你对着屏幕说的话或对游戏的评论
- 用你自己的说话风格，像朋友一起打游戏时的聊天
`;

    // 4. 世界环境
    const worldContextSection = `\n${serializeWorldContext(state)}\n`;

    // 5. 戏剧局势 + 游戏状态
    const gameStateSection = `\n${serializeGameState(state)}\n`;

    // 6. 操作记录
    const logSection = `\n=== 最近操作记录 ===\n${serializeActionLog(actionLog, 10)}\n`;

    // 7. 聊天记录
    const chatSection = recentChatHistory
        ? `\n=== 你和${user.name}最近的聊天（游戏外的对话）===\n${recentChatHistory}\n`
        : '';

    // 8. 可用资源
    const availableResources = buildAvailableResources(state);

    // 9. 输出格式（简化版，提高LLM成功率）
    const outputFormat = `
=== 你的回合 ===

请以JSON格式返回你的决策，只返回JSON不要其他文字。

你有5种行动可选：
1. TRIGGER_EVENT — 制造事件（最常用）
2. ADD_NPC — 拉新人入住
3. MOVE_NPC — 搬人到另一栋
4. GO_SOLO — 让某人搬出去独居
5. DO_NOTHING — 什么都不做

根据你选的行动类型，返回对应格式：

TRIGGER_EVENT示例：
{"type":"TRIGGER_EVENT","eventType":"fight","involvedNpcIds":["id1","id2"],"eventDescription":"在走廊里对峙","thought":"内心独白","dialogue":"说的话或场景描写","tone":"chaotic"}

ADD_NPC示例：
{"type":"ADD_NPC","newNpcName":"小明","newNpcEmoji":"🐱","newNpcPersonality":["暴躁","重情"],"targetFamilyId":"xxx","thought":"内心独白","dialogue":"场景描写","tone":"amused"}

MOVE_NPC示例：
{"type":"MOVE_NPC","npcId":"xxx","targetFamilyId":"yyy","thought":"内心独白","dialogue":"场景描写","tone":"scheming"}

GO_SOLO示例：
{"type":"GO_SOLO","npcId":"xxx","thought":"独白","dialogue":"描写","tone":"peaceful"}

DO_NOTHING示例：
{"type":"DO_NOTHING","thought":"内心独白","dialogue":"场景描写","tone":"scheming"}

字段说明：
- type: 必填，以上5选1
- eventType: TRIGGER_EVENT时必填，可选 fight/party/gossip/romance/rivalry/alliance
- involvedNpcIds: TRIGGER_EVENT时必填，参与的小人ID数组
- eventDescription: 游戏里发生了什么，一句话
- thought: 你作为玩家的内心想法/吐槽（简短）
- dialogue: 你对着屏幕说的话，或对其他玩家的评论
- tone: 你的情绪，可选 vengeful/romantic/scheming/chaotic/peaceful/amused/anxious

记住你是玩家不是游戏里的人物。用你自己的说话风格。
`;

    return [coreContext, dramaSetup, worldContextSection, gameStateSection, chatSection, logSection, availableResources, outputFormat].join('\n');
}

function buildAvailableResources(state: LifeSimState): string {
    const lines: string[] = ['\n=== 游戏里可操作的对象（复制ID填入JSON）==='];

    lines.push('\n【家庭列表】');
    for (const fam of state.families) {
        const count = fam.memberIds.length;
        lines.push(`  家庭ID: "${fam.id}" | ${fam.emoji}${fam.name} (${count}个小人)`);
    }

    lines.push('\n【小人列表】');
    for (const npc of state.npcs) {
        const fam = state.families.find(f => f.id === npc.familyId);
        const { emoji: moodEmoji } = getMoodLabel(npc.mood);
        lines.push(`  小人ID: "${npc.id}" | ${npc.emoji}${npc.name} | ${fam ? fam.name : '独居'} | 心情:${moodEmoji}(${npc.mood})`);
    }

    return lines.join('\n');
}

export function formatRecentChatForSim(
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
    charName: string,
    userName: string,
    maxMessages = 20
): string {
    const relevant = messages
        .filter(m => m.role !== 'system' && ((m as any).type === 'text' || (m as any).type === 'voice' || !(m as any).type))
        .slice(-maxMessages);
    if (relevant.length === 0) return '（暂无聊天记录）';
    return relevant.map(m =>
        `[${m.role === 'user' ? userName : charName}] ${m.content.replace(/\n/g, ' ').slice(0, 100)}`
    ).join('\n');
}

export function buildUserActionDescription(
    actionType: string,
    actorName: string,
    details: {
        npcName?: string;
        npcEmoji?: string;
        npcPersonality?: string[];
        targetFamilyName?: string;
        fromFamilyName?: string;
        eventType?: string;
        eventDesc?: string;
    }
): string {
    switch (actionType) {
        case 'ADD_NPC':
            return `${actorName}往游戏里捏了个叫"${details.npcEmoji}${details.npcName}"的小人（性格：${details.npcPersonality?.join('/')}），放进了${details.targetFamilyName}`;
        case 'MOVE_NPC':
            return `${actorName}把小人${details.npcEmoji}${details.npcName}从${details.fromFamilyName || '某处'}搬到了${details.targetFamilyName || '独居'}`;
        case 'GO_SOLO':
            return `${actorName}让小人${details.npcEmoji}${details.npcName}从${details.fromFamilyName || '某处'}搬出去独居了`;
        case 'TRIGGER_EVENT':
            return `${actorName}在游戏里制造了${details.eventType}事件：${details.eventDesc}`;
        case 'DO_NOTHING':
            return `${actorName}选择看戏，这轮跳过了`;
        default:
            return `${actorName}进行了一个操作`;
    }
}

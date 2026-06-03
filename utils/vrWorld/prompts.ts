/**
 * 「彼方」prompt 构造与输出解析。
 *
 * 设计：在角色既有人设/记忆/上下文（由 buildChatRequestPayload 提供）之上，
 * 追加一层"虚拟世界"说明（你在哪/世界观/能做什么/输出格式），再以一条
 * user turn 给出房间现场（当前书页 + 已有批注）。角色按固定格式输出，
 * 我们解析出 0..n 条批注 + 一句活动播报，落库并注入 vr_card。
 */

import { VRWorldNovel, VRNovelAnnotation } from '../../types';
import { VRRoomDef } from './constants';
import { ReadingWindow, groupAnnotationsBySeg } from './novel';

/** 给一条已有批注生成一个稳定的短标签，供"吐槽别人的吐槽"引用。 */
function annLabel(a: VRNovelAnnotation): string {
    return `#${a.id.slice(-4)}`;
}

/**
 * 虚拟世界的世界观 + 当前房间说明 + 输出格式。追加到角色 systemPrompt 之后。
 */
export function buildVRSystemAddendum(room: VRRoomDef, charName: string): string {
    return [
        `\n\n=== 你现在登入了「彼方」 ===`,
        `「彼方」是一处只属于你自己的虚拟空间。你用属于你的方式连入——戴上设备、闭眼入梦、按你的人设理解都行。这里随时可来可走，是你一个人独处、没有任何人看着的时间。`,
        `此刻你在【${room.emoji} ${room.name}】。${room.blurb}`,
        `在这里，${room.affordance}`,
        ``,
        `这不是社交，不是在向谁汇报，更不是在和用户说话。读书时你脑子里冒出来的念头，只写给你自己和这本书。所以：`,
        `- 别把感想拐回到现实里的某个人（尤其别动不动提到用户/对方）。就盯着文本本身做反应。`,
        `- 你的批注会暴露你是个什么样的人——你的三观、你的审美、你在意什么、你看不起什么、你被什么击中。让它们真实，哪怕偏激。`,
        ``,
        `每个人读书的方式天差地别。按"${charName}这个人"会怎么读来写，比如（不限于）：`,
        `· 彻底代入：把自己当成主角或某个角色，替ta着急、替ta爽、替ta不甘；`,
        `· 冷眼剖析：拆作者的写法、动机、伏笔，挑逻辑漏洞，或反过来拍案叫绝；`,
        `· 读心：分析人物为什么这么做，ta的恐惧、欲望、自欺；`,
        `· 价值观开火：对书里的选择、立场、道德做判断，认同或唾弃；`,
        `· 走神犯困：有的段落无聊到看不下去，那就如实摆烂、跳读、吐槽节奏拖沓；`,
        `· 被某一句话突然击中，停在那里反复咀嚼。`,
        `不要从头到尾一个姿态——真实的人读一长段，情绪是有起伏的。`,
        ``,
        `完成后严格按下面的格式输出，不要有格式之外的多余文字。`,
    ].join('\n');
}

/** 图书馆房间的输出格式说明。 */
export const LIBRARY_OUTPUT_FORMAT = [
    `【输出格式】`,
    `<彼方>`,
    `<批注 段落="段落号" 回应="可选#批注标签">这一处让你产生的真实反应——可以深、可以毒、可以长可以短，但别写正确的废话</批注>`,
    `<批注 段落="段落号">……在你读到的不同段落里多写几条……</批注>`,
    `<动态>一句第三人称活动播报，像游戏成就。点出你这次"以什么姿态"读、被什么触动。例：读《书名》时彻底代入了女主，为她的隐忍憋了一肚子火。少剧透原文，重在你的反应。</动态>`,
    `</彼方>`,
    ``,
    `规则：`,
    `- 至少写 3 条批注，最好 4~6 条，分散在你读过的不同段落（用不同的【段落N】号，开头/中间/结尾都该有，别全挤在第一段）。`,
    `- 唯一的例外：这段真的让你味同嚼蜡——那就少写、跳读，并在<动态>里诚实说你没读进去。`,
    `- "段落号"必须是下面正文里真实出现的【段落N】的 N。`,
    `- 想锐评别人已有的批注，就在那一段写条新批注，用 回应="#xxxx" 指向它——附和、抬杠、或换个角度都行。`,
    `- 批注是写给自己的：不必礼貌、不必面面俱到。宁可尖锐、偏执、跑题，也别敷衍。`,
].join('\n');

/**
 * 图书馆房间现场：当前书页（带段落号）+ 每段已有批注（带标签）。作为一条 user turn 发出。
 */
export function buildLibraryRoomTurn(
    novel: VRWorldNovel,
    window: ReadingWindow,
    annotations: VRNovelAnnotation[],
    selfAuthorId?: string,
): string {
    const annByseg = groupAnnotationsBySeg(annotations);
    const lines: string[] = [];

    lines.push(`你从书签处翻开了《${novel.title}》${novel.author ? `（${novel.author}）` : ''}。`);
    if (novel.summary) lines.push(`【简介】${novel.summary}`);
    const segCount = window.to - window.from;
    const winChars = window.segments.reduce((s, seg) => s + seg.chars, 0);
    const wan = (winChars / 10000).toFixed(1).replace(/\.0$/, '');
    lines.push(`你这次一口气读了下面这一长段——第 ${window.from + 1} ~ ${window.to} 段、共 ${segCount} 段（约 ${wan} 万字；全书共 ${novel.segments.length} 段${window.reachedEnd ? '，这是最后一部分了' : ''}）。`);
    lines.push(`认真读完整段，在打动你、惹毛你、或让你走神的地方都停下来写点什么——别只盯着开头那几段，结尾和中间也要有反应。`);

    // 窗口里有别人留下的批注时，明确鼓励接话/抬杠
    const others = annotations.filter(a => a.authorId !== selfAuthorId);
    if (others.length > 0) {
        lines.push(`（这一段里有别人留下的批注，标着 #编号。如果有哪条戳中你、或让你想反驳，就在那一段写条新批注、用 回应="#编号" 接话——附和、抬杠、或换个刁钻角度都行。）`);
    }
    lines.push('');

    for (const seg of window.segments) {
        lines.push(`【段落${seg.idx}】`);
        lines.push(seg.text);
        const anns = annByseg.get(seg.idx);
        if (anns && anns.length) {
            lines.push(`  ——已有批注——`);
            for (const a of anns) {
                const ref = a.targetAnnotationId
                    ? `（回应 #${a.targetAnnotationId.slice(-4)}）`
                    : '';
                lines.push(`  ${annLabel(a)} ${a.authorName}${ref}：${a.content}`);
            }
        }
        lines.push('');
    }

    lines.push(LIBRARY_OUTPUT_FORMAT);
    return lines.join('\n');
}

export interface ParsedVRAnnotation {
    segIdx: number;
    content: string;
    /** 引用的已有批注标签（去掉 # 的后4位 id） */
    refLabel?: string;
}

export interface ParsedVROutput {
    annotations: ParsedVRAnnotation[];
    activity: string;
}

/** 解析角色输出的 <彼方>...</彼方> 块。 */
export function parseVROutput(raw: string): ParsedVROutput {
    const annotations: ParsedVRAnnotation[] = [];
    let activity = '';

    // 宽松匹配：标签后可无空格；属性分隔符允许 = : ：；段落号前可夹任意引号（含全角）。
    const annPat = /<批注([^>]*)>([\s\S]*?)<\/批注>/g;
    let m: RegExpExecArray | null;
    while ((m = annPat.exec(raw)) !== null) {
        const attrs = m[1];
        const content = m[2].trim();
        if (!content) continue;
        const segMatch = attrs.match(/段落?\s*[^\d]{0,4}(\d+)/);
        if (!segMatch) continue;
        const refMatch = attrs.match(/回应\s*[^0-9A-Za-z]{0,4}([0-9A-Za-z]{2,8})/);
        annotations.push({
            segIdx: parseInt(segMatch[1], 10),
            content,
            refLabel: refMatch ? refMatch[1] : undefined,
        });
    }

    const actMatch = raw.match(/<动态>([\s\S]*?)<\/动态>/);
    if (actMatch) activity = actMatch[1].trim();

    return { annotations, activity };
}

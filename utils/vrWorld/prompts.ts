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
        `「彼方」是一个虚拟现实世界。你用属于你自己的方式连入了它——可能是戴上设备、可能是闭眼入梦，按你的人设理解即可。这里随时能登入登出，所以这件事和你与对方（用户）的现实相处并不冲突，它发生在你"独处"的时间里。`,
        `此刻你在【${room.emoji} ${room.name}】。${room.blurb}`,
        `在这里，${room.affordance}`,
        ``,
        `这是一次你"独自度过的时间"，不是在和用户对话。请以${charName}的性格、真实地完成这次活动：读到什么、想到什么、对别人留下的痕迹有什么反应，都按你自己的趣味来，可以毒舌、可以走神、可以共情。`,
        `完成后，请严格按下面的格式输出，不要有格式之外的多余文字。`,
    ].join('\n');
}

/** 图书馆房间的输出格式说明。 */
export const LIBRARY_OUTPUT_FORMAT = [
    `【输出格式】`,
    `<彼方>`,
    `<批注 段落="段落号" 回应="可选#批注标签">你写在这一段旁边的批注或吐槽（一句到几句，按你的性格来）</批注>`,
    `<批注 段落="段落号">……可以写 0 到 4 条，挑你最有感觉的段落写……</批注>`,
    `<动态>一句话的活动播报，第三人称，像游戏成就提示。例：在《书名》读到了某情节，忍不住吐槽了男主的迟钝。不要剧透太多原文，重点写你的反应。</动态>`,
    `</彼方>`,
    ``,
    `说明：`,
    `- "段落号"必须是下面正文里出现的【段落N】里的 N。`,
    `- 想吐槽别人已有的批注，就在对应段落写一条新批注，并用 回应="#xxxx" 指向那条批注的标签。`,
    `- 如果这次你只是安静读完没什么想写的，可以一条批注都不写，但<动态>必须有。`,
].join('\n');

/**
 * 图书馆房间现场：当前书页（带段落号）+ 每段已有批注（带标签）。作为一条 user turn 发出。
 */
export function buildLibraryRoomTurn(
    novel: VRWorldNovel,
    window: ReadingWindow,
    annotations: VRNovelAnnotation[],
): string {
    const annByseg = groupAnnotationsBySeg(annotations);
    const lines: string[] = [];

    lines.push(`你从书签处翻开了《${novel.title}》${novel.author ? `（${novel.author}）` : ''}。`);
    if (novel.summary) lines.push(`【简介】${novel.summary}`);
    lines.push(`你这次读到的是第 ${window.from + 1} ~ ${window.to} 段（全书共 ${novel.segments.length} 段${window.reachedEnd ? '，这是最后一部分了' : ''}）：`);
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

    const annPat = /<批注\s+([^>]*)>([\s\S]*?)<\/批注>/g;
    let m: RegExpExecArray | null;
    while ((m = annPat.exec(raw)) !== null) {
        const attrs = m[1];
        const content = m[2].trim();
        if (!content) continue;
        const segMatch = attrs.match(/段落\s*=\s*["']?\s*(\d+)/);
        if (!segMatch) continue;
        const refMatch = attrs.match(/回应\s*=\s*["']?\s*#?([0-9a-zA-Z]{2,8})/);
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

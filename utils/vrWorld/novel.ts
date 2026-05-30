/**
 * 「彼方」小说工具 —— 切块、阅读窗口、书签推进、批注组织。
 */

import { VRWorldNovel, VRNovelSegment, VRNovelAnnotation } from '../../types';
import { VR_SEGMENT_TARGET_CHARS, VR_NOVEL_FEED_CHARS } from './constants';

const genId = (prefix: string) =>
    `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * 把整本小说原文切成阅读单元。按段落（空行/换行）聚合到 ~目标字数，
 * 尽量不切断自然段；超长自然段按字数硬切。
 */
export function chunkNovelText(raw: string, target = VR_SEGMENT_TARGET_CHARS): VRNovelSegment[] {
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!normalized) return [];

    // 先按自然段拆
    const paragraphs = normalized
        .split(/\n\s*\n|\n/)
        .map(p => p.trim())
        .filter(Boolean);

    const segments: VRNovelSegment[] = [];
    let buffer = '';

    const flush = () => {
        const text = buffer.trim();
        if (text) {
            segments.push({ idx: segments.length, text, chars: text.length });
        }
        buffer = '';
    };

    for (const para of paragraphs) {
        // 超长自然段：硬切
        if (para.length > target * 2) {
            flush();
            for (let i = 0; i < para.length; i += target) {
                const piece = para.slice(i, i + target);
                segments.push({ idx: segments.length, text: piece, chars: piece.length });
            }
            continue;
        }
        if ((buffer.length + para.length) > target && buffer.length > 0) {
            flush();
        }
        buffer = buffer ? `${buffer}\n${para}` : para;
    }
    flush();

    return segments;
}

/** 从原文新建一本小说。 */
export function buildNovel(title: string, raw: string, opts?: { author?: string; summary?: string }): VRWorldNovel {
    const segments = chunkNovelText(raw);
    const totalChars = segments.reduce((s, seg) => s + seg.chars, 0);
    const now = Date.now();
    return {
        id: genId('vrnovel'),
        title: title.trim() || '无题',
        author: opts?.author?.trim() || undefined,
        summary: opts?.summary?.trim() || undefined,
        segments,
        totalChars,
        createdAt: now,
        updatedAt: now,
    };
}

export interface ReadingWindow {
    /** 起始 segment 索引（含） */
    from: number;
    /** 结束 segment 索引（不含） */
    to: number;
    segments: VRNovelSegment[];
    /** 是否已读到全书末尾 */
    reachedEnd: boolean;
}

/**
 * 从书签处取一个阅读窗口：累计原文字数直到接近预算（含已有批注的开销由调用方另算）。
 * 至少给一个 segment，避免预算太小卡死。
 */
export function getReadingWindow(
    novel: VRWorldNovel,
    bookmark: number,
    budgetChars = VR_NOVEL_FEED_CHARS,
): ReadingWindow {
    const from = Math.max(0, Math.min(bookmark, novel.segments.length));
    let used = 0;
    let to = from;
    while (to < novel.segments.length) {
        const seg = novel.segments[to];
        if (to > from && used + seg.chars > budgetChars) break;
        used += seg.chars;
        to += 1;
    }
    return {
        from,
        to,
        segments: novel.segments.slice(from, to),
        reachedEnd: to >= novel.segments.length,
    };
}

/** 新建一条批注。 */
export function buildAnnotation(input: {
    novelId: string;
    segIdx: number;
    authorId: string;
    authorName: string;
    content: string;
    targetAnnotationId?: string;
}): VRNovelAnnotation {
    return {
        id: genId('vrann'),
        novelId: input.novelId,
        segIdx: input.segIdx,
        authorId: input.authorId,
        authorName: input.authorName,
        content: input.content.trim(),
        targetAnnotationId: input.targetAnnotationId,
        createdAt: Date.now(),
    };
}

/** 把批注按段落索引归组，便于渲染与喂 prompt。 */
export function groupAnnotationsBySeg(annotations: VRNovelAnnotation[]): Map<number, VRNovelAnnotation[]> {
    const map = new Map<number, VRNovelAnnotation[]>();
    for (const a of annotations) {
        const arr = map.get(a.segIdx) || [];
        arr.push(a);
        map.set(a.segIdx, arr);
    }
    for (const arr of map.values()) arr.sort((x, y) => x.createdAt - y.createdAt);
    return map;
}

/** 读取某角色对某本书的书签（默认 0）。 */
export function getBookmark(bookmarks: Record<string, number> | undefined, novelId: string): number {
    return bookmarks?.[novelId] ?? 0;
}

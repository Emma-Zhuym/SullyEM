import type { NotionExtraDatabase } from '../types';

/** 与 types / realtimeContext 两套 RealtimeConfig 都兼容 */
export type NotionNotesConfigSlice = {
    notionExtraDatabases?: NotionExtraDatabase[];
    notionNotesDatabaseId?: string;
};

/** 用户笔记库固定 TAG：与 [[READ_NOTE: 关键词]] 一致；走「标题搜索 + 拉取正文 blocks」路径 */
export const NOTION_USER_NOTES_TAG = 'READ_NOTE';

export function normalizeNotionExtraTag(tag: string): string {
    return String(tag || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '');
}

/**
 * 从「额外库」列表或旧字段解析用户笔记库 Database ID（兼容迁移前只填 notionNotesDatabaseId）
 */
export function resolveNotionNotesDatabaseId(config: NotionNotesConfigSlice): string | undefined {
    const list = config.notionExtraDatabases || [];
    const fromExtra = list.find(
        (d) => d?.databaseId?.trim() && normalizeNotionExtraTag(d.tag) === NOTION_USER_NOTES_TAG
    );
    if (fromExtra?.databaseId?.trim()) return fromExtra.databaseId.trim();
    const legacy = config.notionNotesDatabaseId?.trim();
    return legacy || undefined;
}

/**
 * 若仅有旧版「笔记数据库 ID」，自动追加一条 tag=READ_NOTE 的额外库（展示名默认「用户笔记」）
 */
export function migrateLegacyNotionNotesToExtra<T extends NotionNotesConfigSlice>(config: T): { config: T & NotionNotesConfigSlice; migrated: boolean } {
    const legacy = config.notionNotesDatabaseId?.trim();
    const list = [...(config.notionExtraDatabases || [])];
    const hasReadNote = list.some((d) => normalizeNotionExtraTag(d.tag) === NOTION_USER_NOTES_TAG);
    let migrated = false;
    if (legacy && !hasReadNote) {
        list.push({
            id:
                typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : `note_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            name: '用户笔记',
            tag: NOTION_USER_NOTES_TAG,
            databaseId: legacy,
        });
        migrated = true;
    }
    const notesId = resolveNotionNotesDatabaseId({ ...config, notionExtraDatabases: list });
    return {
        config: {
            ...(config as object),
            notionExtraDatabases: list,
            notionNotesDatabaseId: notesId || undefined,
        } as T & NotionNotesConfigSlice,
        migrated,
    };
}

/** 保存时只保留第一条 READ_NOTE，避免重复配置 */
export function dedupeNotionReadNoteRows(list: NotionExtraDatabase[]): NotionExtraDatabase[] {
    let seenReadNote = false;
    const out: NotionExtraDatabase[] = [];
    for (const row of list) {
        const t = normalizeNotionExtraTag(row.tag);
        if (t === NOTION_USER_NOTES_TAG) {
            if (seenReadNote) continue;
            seenReadNote = true;
        }
        out.push(row);
    }
    return out;
}

/** 额外库排序：READ_NOTE 优先（与旧版「先处理读笔记」一致） */
export function sortExtraDatabasesForProcessing(list: NotionExtraDatabase[]): NotionExtraDatabase[] {
    return [...list].sort((a, b) => {
        const ta = normalizeNotionExtraTag(a.tag);
        const tb = normalizeNotionExtraTag(b.tag);
        if (ta === NOTION_USER_NOTES_TAG && tb !== NOTION_USER_NOTES_TAG) return -1;
        if (tb === NOTION_USER_NOTES_TAG && ta !== NOTION_USER_NOTES_TAG) return 1;
        return 0;
    });
}

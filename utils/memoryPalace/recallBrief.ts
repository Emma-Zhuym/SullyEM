/**
 * [EM: token-panel-recall] 本轮召回明细 → Token ⚡ 面板展示
 *
 * 与 recallReceipts.ts 平行的新数据流（回执服务 extraction 反查，别耦合）：
 * formatter.expandAndFormat 在整理注入列表的同一瞬间，把「这轮喂了哪几条记忆」
 * 的简报写进模块级缓存；chatRequestPayload 组装 contextBreakdown 时读出来，
 * 随 payload 穿到 useChatAI → ChatHeaderShell ⚡ 面板。
 *
 * 「最后一次」语义：按 charId 分键，单聊场景足够（群聊不在本功能范围）。
 * 仅内存，不落盘——面板只关心"本轮"，刷新后清零是正确行为。
 * 不新增任何 LLM 调用或重复检索：数据在召回瞬间就是现成的。
 */

export interface RecalledMemoryBrief {
    id: string;
    /** 记忆一句话摘要/标题，截 ~40 字 */
    snippet: string;
    /** 来源：记忆 / 事件盒 / 便利贴 */
    source?: string;
}

const lastRecallDetail = new Map<string, RecalledMemoryBrief[]>();

export function setLastRecallBriefs(charId: string, briefs: RecalledMemoryBrief[]): void {
    if (!charId) return;
    lastRecallDetail.set(charId, briefs);
}

/** 本轮没跑召回（短消息跳过/宫殿关闭/失败）时返回 []，面板显示"未触发"。 */
export function getLastRecallBriefs(charId: string): RecalledMemoryBrief[] {
    return lastRecallDetail.get(charId) || [];
}

/** 每轮 payload 构建前清掉上一轮残留，防止"召回没跑但面板显示旧数据"。 */
export function clearLastRecallBriefs(charId: string): void {
    lastRecallDetail.delete(charId);
}

/** snippet 统一裁剪：压掉换行/连续空白，截 40 字加省略号。 */
export function toSnippet(text: string, max: number = 40): string {
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

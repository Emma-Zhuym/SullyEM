/**
 * cycleCalc.ts — 经期周期推算（纯计算，无副作用）
 *
 * 输入：经期事件列表（PeriodHealthEvent[]）
 * 输出：CycleStatus（当前周期天数、预测下次、排卵窗口）
 */

import { PeriodHealthEvent } from './healthDb';

export interface CycleStatus {
  /** 当前周期第几天（从最近经期开始算，最小1） */
  cycleDay: number;
  /** 预测下次开始日（YYYY-MM-DD）*/
  nextPredictedStart: string;
  /** 预测范围字符串，如 "6月17日 ~ 6月20日" */
  nextRangeStr: string;
  /** 预测排卵窗口（YYYY-MM-DD[]，周期第12-16天）*/
  ovulationWindow: string[];
  /** 数据不足或变异系数大时标注不确定 */
  uncertain: boolean;
  /** 最近经期开始日（YYYY-MM-DD）*/
  lastPeriodStart: string | null;
  /** 平均周期长度（天）*/
  avgCycleLength: number;
}

// ── 工具函数 ───────────────────────────────────────────────────────────────────

function dateStrToTimestamp(d: string): number {
  return new Date(d + 'T00:00:00').getTime();
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateCN(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

// ── 核心：从经期事件列表提取「周期开始日」数组 ──────────────────────────────────

/**
 * 连续的经期天被视为一次周期。
 * 找到每次连续段的第一天作为 periodStart。
 */
function extractPeriodStarts(events: PeriodHealthEvent[]): string[] {
  if (events.length === 0) return [];

  // 按日期升序
  const dates = [...new Set(events.map(e => e.date))].sort();
  const starts: string[] = [];

  for (let i = 0; i < dates.length; i++) {
    const prev = i > 0 ? dates[i - 1] : null;
    const curr = dates[i];
    if (!prev) {
      starts.push(curr);
      continue;
    }
    // 如果和上一个间隔 > 2 天，视为新一次经期
    const gap = (dateStrToTimestamp(curr) - dateStrToTimestamp(prev)) / 86400000;
    if (gap > 2) starts.push(curr);
  }

  return starts;
}

// ── 主函数 ─────────────────────────────────────────────────────────────────────

export function calcCycleStatus(periodEvents: PeriodHealthEvent[]): CycleStatus {
  const todayTs = new Date().setHours(0, 0, 0, 0);
  const todayStr = new Date(todayTs).toISOString().slice(0, 10);

  const periodStarts = extractPeriodStarts(periodEvents);

  // 没有任何经期数据
  if (periodStarts.length === 0) {
    return {
      cycleDay: 1,
      nextPredictedStart: addDays(todayStr, 28),
      nextRangeStr: `约 ${formatDateCN(addDays(todayStr, 26))} ~ ${formatDateCN(addDays(todayStr, 30))}`,
      ovulationWindow: [],
      uncertain: true,
      lastPeriodStart: null,
      avgCycleLength: 28,
    };
  }

  const lastStart = periodStarts[periodStarts.length - 1];
  const cycleDay = Math.max(
    1,
    Math.floor((todayTs - dateStrToTimestamp(lastStart)) / 86400000) + 1
  );

  // 计算历史周期长度
  const cycleLengths: number[] = [];
  for (let i = 1; i < periodStarts.length; i++) {
    const len = Math.round(
      (dateStrToTimestamp(periodStarts[i]) - dateStrToTimestamp(periodStarts[i - 1])) / 86400000
    );
    // 过滤明显异常值（< 15 或 > 45 天）
    if (len >= 15 && len <= 45) cycleLengths.push(len);
  }

  let avgCycleLength = 28;
  let uncertain = true;

  if (cycleLengths.length >= 2) {
    avgCycleLength = Math.round(
      cycleLengths.reduce((s, v) => s + v, 0) / cycleLengths.length
    );
    // 变异系数检测
    const mean = avgCycleLength;
    const sd = Math.sqrt(
      cycleLengths.reduce((s, v) => s + (v - mean) ** 2, 0) / cycleLengths.length
    );
    const cv = sd / mean;
    uncertain = cv > 0.15;
  } else if (cycleLengths.length === 1) {
    avgCycleLength = cycleLengths[0];
    uncertain = true;
  }

  const nextPredictedStart = addDays(lastStart, avgCycleLength);
  const rangeStart = addDays(lastStart, avgCycleLength - 2);
  const rangeEnd   = addDays(lastStart, avgCycleLength + 2);
  const nextRangeStr = `${formatDateCN(rangeStart)} ~ ${formatDateCN(rangeEnd)}`;

  // 排卵窗口 = 周期第 12 ~ 16 天
  const ovulationWindow: string[] = [];
  for (let d = 12; d <= 16; d++) {
    ovulationWindow.push(addDays(lastStart, d - 1));
  }

  return {
    cycleDay,
    nextPredictedStart,
    nextRangeStr,
    ovulationWindow,
    uncertain,
    lastPeriodStart: lastStart,
    avgCycleLength,
  };
}

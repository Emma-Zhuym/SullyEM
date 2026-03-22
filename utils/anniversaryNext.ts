import type { Anniversary } from '../types';

/** 按「月-日」每年重复：返回今年或明年的下一次到来日 */
export function getNextOccurrenceDate(dateStr: string): Date {
    const parts = dateStr.split('-').map(Number);
    if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return new Date(NaN);
    const [, month, day] = parts;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let next = new Date(today.getFullYear(), month - 1, day);
    next.setHours(0, 0, 0, 0);
    if (Number.isNaN(next.getTime())) return new Date(NaN);
    if (next < today) next.setFullYear(next.getFullYear() + 1);
    return next;
}

function parseYMD(dateStr: string): Date | null {
    const parts = dateStr.split('-').map(Number);
    if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return null;
    const [y, m, d] = parts;
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * 未指定 repeatYearly 时视为每年重复（兼容旧数据）。
 * repeatYearly === false：仅一次，日期已过则不再出现在「即将到来」。
 */
export function getNextOccurrenceForAnniversary(anni: Anniversary): Date | null {
    if (anni.repeatYearly === false) {
        const once = parseYMD(anni.date);
        if (!once) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (once < today) return null;
        return once;
    }
    const next = getNextOccurrenceDate(anni.date);
    return Number.isNaN(next.getTime()) ? null : next;
}

export function sortAnniversariesByNextOccurrence(annis: Anniversary[]): Array<{ anni: Anniversary; next: Date }> {
    return annis
        .map(a => {
            const next = getNextOccurrenceForAnniversary(a);
            return next ? { anni: a, next } : null;
        })
        .filter((x): x is { anni: Anniversary; next: Date } => x !== null)
        .sort((a, b) => a.next.getTime() - b.next.getTime());
}

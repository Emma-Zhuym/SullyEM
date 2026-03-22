/**
 * 情人节活动纯工具（与 ValentineEvent.tsx 组件分离，避免 Vite Fast Refresh 与「组件 + 非组件混导」冲突）
 */

export const VALENTINE_DISMISSED_KEY = 'sullyos_valentine_2026_dismissed';
export const VALENTINE_COMPLETED_KEY = 'sullyos_valentine_2026_completed';
export const VALENTINE_RECORD_KEY = 'valentine_2026';

/** 判断今天是否是情人节 (2026-02-14) */
const isValentineDay = (): boolean => {
    const now = new Date();
    return now.getFullYear() === 2026 && now.getMonth() === 1 && now.getDate() === 14;
};

/** 判断是否应该显示弹窗 */
export const shouldShowValentinePopup = (): boolean => {
    if (!isValentineDay()) return false;
    try {
        if (localStorage.getItem(VALENTINE_DISMISSED_KEY)) return false;
        if (localStorage.getItem(VALENTINE_COMPLETED_KEY)) return false;
    } catch { /* ignore */ }
    return true;
};

/** 判断情人节活动是否当前可用（2026年2月） */
export const isValentineEventAvailable = (): boolean => {
    const now = new Date();
    return now.getFullYear() === 2026 && now.getMonth() === 1;
};

/** 判断情人节活动是否已过期（2026年2月之后，永久可回看） */
export const isValentinePast = (): boolean => {
    const now = new Date();
    return now.getFullYear() > 2026 || (now.getFullYear() === 2026 && now.getMonth() > 1);
};

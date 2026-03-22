/**
 * 白色情人节活动纯工具（与 WhiteDayEvent.tsx 组件分离，避免 Vite Fast Refresh 混导冲突）
 */

export const WHITEDAY_ASSETS = {
    chocolateBottom: 'https://sharkpan.xyz/f/dDzLi8/001.png',
    chocolateTop: 'https://sharkpan.xyz/f/lmD6Tx/002.png',
};

export const WHITEDAY_DISMISSED_KEY = 'sullyos_whiteday_2026_dismissed';
export const WHITEDAY_COMPLETED_KEY = 'sullyos_whiteday_2026_completed';
export const WHITEDAY_RECORD_KEY = 'whiteday_2026';

export const isWhiteDay = (): boolean => {
    const now = new Date();
    return now.getFullYear() === 2026 && now.getMonth() === 2 && now.getDate() === 14;
};

export const shouldShowWhiteDayPopup = (): boolean => {
    if (!isWhiteDay()) return false;
    try {
        if (localStorage.getItem(WHITEDAY_DISMISSED_KEY)) return false;
        if (localStorage.getItem(WHITEDAY_COMPLETED_KEY)) return false;
    } catch { /* ignore */ }
    return true;
};

export const isWhiteDayEventAvailable = (): boolean => {
    const now = new Date();
    return now.getFullYear() === 2026 && now.getMonth() === 2;
};

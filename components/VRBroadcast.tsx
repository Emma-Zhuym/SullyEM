import React, { useEffect, useRef, useState } from 'react';

/**
 * 「彼方」大世界喇叭 —— 当某角色正在登入彼方、调用 API 行动时，
 * 顶部滑出一条 MMO 风格的世界播报。监听 runSession 派发的
 * vr-session-start / vr-session-end 事件，全局挂载（App 根级）。
 */

interface ActiveSession { charId: string; charName: string; room: string; novelTitle?: string; }

const ROOM_LABEL: Record<string, { emoji: string; name: string }> = {
    library: { emoji: '📚', name: '图书馆' },
    music: { emoji: '🎧', name: '听歌房' },
    guestbook: { emoji: '📝', name: '留言簿' },
    gym: { emoji: '🤸', name: '活动场' },
};

const VRBroadcast: React.FC = () => {
    const [active, setActive] = useState<ActiveSession[]>([]);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const onStart = (e: Event) => {
            const d = (e as CustomEvent).detail as ActiveSession;
            if (!d?.charId) return;
            setActive(prev => prev.some(s => s.charId === d.charId) ? prev : [...prev, d]);
        };
        const onEnd = (e: Event) => {
            const id = (e as CustomEvent).detail?.charId;
            // 结束时延迟一会再移除，让"刚逛完"的播报多留一下
            setTimeout(() => setActive(prev => prev.filter(s => s.charId !== id)), 1500);
        };
        window.addEventListener('vr-session-start', onStart);
        window.addEventListener('vr-session-end', onEnd);
        return () => {
            window.removeEventListener('vr-session-start', onStart);
            window.removeEventListener('vr-session-end', onEnd);
            if (hideTimer.current) clearTimeout(hideTimer.current);
        };
    }, []);

    if (active.length === 0) return null;
    const cur = active[active.length - 1];
    const room = ROOM_LABEL[cur.room] || { emoji: '🪐', name: '彼方' };
    const extra = active.length > 1 ? ` 等 ${active.length} 人` : '';

    return (
        <div className="fixed left-1/2 -translate-x-1/2 z-[999] pointer-events-none"
            style={{ top: 'calc(env(safe-area-inset-top) + 6px)' }}>
            <style>{`@keyframes vrbcin{from{opacity:0;transform:translateY(-14px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
                     @keyframes vrbcshimmer{0%{background-position:-120% 0}100%{background-position:220% 0}}`}</style>
            <div className="relative flex items-center gap-2 px-3.5 py-1.5 rounded-full overflow-hidden"
                style={{
                    animation: 'vrbcin .35s cubic-bezier(.2,.9,.3,1.2)',
                    background: 'linear-gradient(90deg,#3a2e6e,#5a3f9e,#3a2e6e)',
                    border: '1px solid rgba(200,190,255,.4)',
                    boxShadow: '0 6px 22px rgba(80,60,160,.5), inset 0 0 12px rgba(180,160,255,.25)',
                }}>
                {/* 流光 */}
                <div className="absolute inset-0 pointer-events-none" style={{
                    background: 'linear-gradient(105deg,transparent 30%,rgba(255,255,255,.18) 50%,transparent 70%)',
                    backgroundSize: '220% 100%',
                    animation: 'vrbcshimmer 2.4s linear infinite',
                }} />
                <span className="relative text-[13px]">📢</span>
                <span className="relative text-[11.5px] font-bold text-white whitespace-nowrap drop-shadow">
                    <span className="text-amber-200">{cur.charName}</span>{extra} 正在彼方·{room.emoji}{room.name}
                    {cur.novelTitle ? `读《${cur.novelTitle}》` : ''}…
                </span>
                <span className="relative flex gap-0.5">
                    {[0, 1, 2].map(i => (
                        <span key={i} className="w-1 h-1 rounded-full bg-indigo-200"
                            style={{ animation: 'vrbcin .6s infinite alternate', animationDelay: `${i * 0.2}s` }} />
                    ))}
                </span>
            </div>
        </div>
    );
};

export default VRBroadcast;

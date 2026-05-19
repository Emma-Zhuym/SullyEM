import React, { useMemo, useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { INSTALLED_APPS, DOCK_APPS } from '../constants';
import AppIcon from '../components/os/AppIcon';
import { DB } from '../utils/db';
import { AppConfig, CharacterProfile, Anniversary, AppID, DailySchedule } from '../types';
import { ScheduleHomeWidget, ScheduleFullscreenViewer } from '../components/schedule/ScheduleHomeWidget';
import NowPlayingSquareWidget from '../components/os/NowPlayingSquareWidget';
import { sortAnniversariesByNextOccurrence } from '../utils/anniversaryNext';

// --- Isolated Components to prevent full re-renders ---

// 1. Clock Component (Consumes virtualTime)
const DesktopClock = React.memo(() => {
    const { virtualTime, theme } = useOS();
    const contentColor = theme.contentColor || '#ffffff';

    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const now = new Date();
    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const dateNum = now.getDate().toString().padStart(2, '0');
    const yearNum = now.getFullYear();

    // 简单问候（基于虚拟时间）
    const greeting = virtualTime.hours < 5 ? 'Good Night'
        : virtualTime.hours < 12 ? 'Good Morning'
        : virtualTime.hours < 18 ? 'Good Afternoon'
        : 'Good Evening';

    return (
        <div className="flex flex-col mb-4 mt-5 relative animate-fade-in" style={{ color: contentColor }}>
            {/* 顶部装饰 — 状态胶囊 + 细线 */}
            <div className="flex items-center gap-2 mb-3 opacity-90">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                    style={{
                        background: 'rgba(255,255,255,0.28)',
                        border: '1px solid rgba(255,255,255,0.18)',
                    }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 6px #4ade80' }} />
                    <span className="text-[9px] font-bold tracking-[0.2em] uppercase">System Online</span>
                </div>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-current to-transparent opacity-30" />
                <span className="text-[9px] tracking-[0.2em] uppercase opacity-60">{yearNum}</span>
            </div>

            {/* 问候 */}
            <div className="text-[11px] tracking-[0.25em] uppercase opacity-55 font-semibold mb-1">
                {greeting}
            </div>

            {/* 主时钟 */}
            <div className="flex items-end gap-4">
                <div className="relative">
                    <div className="text-[6.25rem] leading-[0.82] font-black tracking-tighter drop-shadow-2xl"
                        style={{ fontFamily: `'Space Grotesk', 'SF Pro Display', sans-serif`, fontFeatureSettings: '"tnum"' }}>
                        <span>{virtualTime.hours.toString().padStart(2, '0')}</span>
                        <span className="opacity-35 font-thin mx-0.5 animate-pulse">:</span>
                        <span>{virtualTime.minutes.toString().padStart(2, '0')}</span>
                    </div>
                    {/* 细光斑 */}
                    <div className="absolute -top-2 -right-3 w-8 h-8 rounded-full pointer-events-none"
                        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.4), transparent 70%)' }} />
                </div>

                <div className="flex flex-col justify-end pb-2.5 gap-0.5">
                    <div className="text-[10px] font-bold tracking-[0.22em] opacity-85">{dayName}</div>
                    <div className="flex items-baseline gap-1">
                        <div className="text-2xl font-black leading-none" style={{ fontFamily: `'Space Grotesk', sans-serif` }}>{dateNum}</div>
                        <div className="text-[10px] font-bold tracking-[0.2em] opacity-70">{monthName}</div>
                    </div>
                </div>
            </div>
        </div>
    );
});

// 2. Character Widget (Consumes Character Data & Messages)
const CharacterWidget = React.memo(({ 
    char, 
    unreadCount, 
    lastMessage, 
    onClick, 
    contentColor 
}: { 
    char: CharacterProfile | null, 
    unreadCount: number, 
    lastMessage: string, 
    onClick: () => void,
    contentColor: string
}) => {
    return (
        <div className="mb-3 group animate-fade-in">
             <div
                className="relative h-24 w-full overflow-hidden rounded-3xl cursor-pointer transition-transform duration-300 active:scale-[0.98]"
                onClick={onClick}
                style={{
                    background: 'rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(24px) saturate(1.4)',
                    WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
             >
                 {/* 背景虚化角色头像 */}
                 {char?.avatar && (
                     <div className="absolute inset-0 opacity-25 pointer-events-none"
                         style={{
                             backgroundImage: `url(${char.avatar})`,
                             backgroundSize: 'cover',
                             backgroundPosition: 'center',
                             filter: 'blur(30px) saturate(1.6)',
                             transform: 'scale(1.3)',
                         }} />
                 )}

                 <div className="relative flex items-center p-3 gap-3 h-full">
                     {/* 头像 */}
                     <div className="w-[68px] h-[68px] shrink-0 rounded-2xl overflow-hidden relative bg-slate-800"
                         style={{
                             border: '1.5px solid rgba(255,255,255,0.25)',
                             boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                         }}>
                         {char ? (
                             <img src={char.avatar} className="w-full h-full object-cover" alt="char" loading="lazy" />
                         ) : <div className="w-full h-full bg-white/10 animate-pulse" />}
                         {unreadCount > 0 ? (
                            <div className="absolute bottom-0.5 right-0.5 min-w-[16px] h-[16px] px-1 bg-red-500 rounded-full border border-white/30 shadow-sm flex items-center justify-center text-[9px] font-bold text-white">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </div>
                         ) : (
                            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-white/30" style={{ boxShadow: '0 0 6px #4ade80' }}></div>
                         )}
                     </div>

                     {/* 文本 */}
                     <div className="flex-1 min-w-0 flex flex-col justify-center gap-1" style={{ color: contentColor }}>
                         <div className="flex items-center gap-1.5">
                             <h3 className="text-[15px] font-bold tracking-wide drop-shadow-md truncate">
                                 {char?.name || 'NO SIGNAL'}
                             </h3>
                             {unreadCount > 0 ? (
                                 <div className="px-1.5 py-px rounded-full text-[8px] font-bold uppercase tracking-[0.15em]"
                                     style={{ background: 'rgba(239,68,68,0.9)', color: 'white' }}>NEW</div>
                             ) : (
                                 <div className="px-1.5 py-px rounded-full text-[8px] font-bold uppercase tracking-[0.15em]"
                                     style={{ background: 'rgba(255,255,255,0.18)' }}>Online</div>
                             )}
                         </div>
                         <div className="text-xs line-clamp-2 font-medium leading-relaxed opacity-85">
                            <span className="opacity-50 mr-1 text-[10px]">▶</span>
                            {lastMessage}
                         </div>
                     </div>
                 </div>
             </div>
        </div>
    );
});

// 3. Grid Page Component — supports edit mode with ghost drag
const AppGridPage = React.memo(({
    apps, openApp, onLongPress,
    isEditMode = false, pageStartIndex = 0,
    draggingIdx, hoverIdx: hoverGlobalIdx, onIconPointerDown,
}: {
    apps: AppConfig[];
    openApp: (id: AppID) => void;
    onLongPress?: () => void;
    isEditMode?: boolean;
    pageStartIndex?: number;
    draggingIdx?: number | null;
    hoverIdx?: number | null;
    onIconPointerDown?: (e: React.PointerEvent, globalIdx: number) => void;
}) => {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPress = () => {
        if (!onLongPress) return;
        timerRef.current = setTimeout(onLongPress, 600);
    };
    const cancelPress = () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };

    return (
        <div className="grid grid-cols-4 gap-y-6 gap-x-2 place-items-center animate-fade-in relative">
            {apps.map((app, localIdx) => {
                const globalIdx = pageStartIndex + localIdx;
                const isDragging = draggingIdx === globalIdx;
                const isHover = hoverGlobalIdx === globalIdx && hoverGlobalIdx !== draggingIdx;
                return (
                    <div
                        key={app.id}
                        data-global-idx={globalIdx}
                        className={[
                            'relative transition-all duration-150',
                            isEditMode ? 'animate-icon-wobble cursor-grab' : 'active:scale-95',
                            isDragging ? 'opacity-0 pointer-events-none' : '',
                            isHover ? 'scale-110 drop-shadow-lg' : '',
                        ].join(' ')}
                        style={{ touchAction: isEditMode ? 'none' : 'auto' }}
                        onMouseDown={!isEditMode ? startPress : undefined}
                        onMouseUp={!isEditMode ? cancelPress : undefined}
                        onMouseLeave={!isEditMode ? cancelPress : undefined}
                        onTouchStart={!isEditMode ? startPress : undefined}
                        onTouchEnd={!isEditMode ? cancelPress : undefined}
                        onTouchMove={!isEditMode ? cancelPress : undefined}
                        onPointerDown={isEditMode ? (e) => {
                            e.preventDefault();
                            onIconPointerDown?.(e, globalIdx);
                        } : undefined}
                    >
                        <AppIcon
                            app={app}
                            onClick={isEditMode ? () => {} : () => openApp(app.id)}
                        />
                    </div>
                );
            })}
        </div>
    );
});

// 3b. Small 2x2 app grid for pinwheel cells
const AppQuadGrid = React.memo(({ apps, openApp }: { apps: typeof INSTALLED_APPS, openApp: (id: AppID) => void }) => {
    return (
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 place-items-center gap-x-2 gap-y-3">
            {apps.map(app => (
                <div key={app.id} className="relative transition-transform duration-200 active:scale-95">
                    <AppIcon app={app} onClick={() => openApp(app.id)} />
                </div>
            ))}
        </div>
    );
});

// 3c. Square image slot for pinwheel (bottom-right)
const DesktopSquareImage = React.memo(({ image, contentColor, onClick }: {
    image?: string,
    contentColor: string,
    onClick: () => void,
}) => {
    return (
        <div
            onClick={onClick}
            className="relative w-full h-full rounded-[1.75rem] overflow-hidden cursor-pointer animate-fade-in transition-transform active:scale-[0.98]"
            style={{
                background: image ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.28)',
                border: '1px solid rgba(255,255,255,0.18)',
                boxShadow: '0 8px 30px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.07)',
                color: contentColor,
            }}
        >
            {image ? (
                <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center"
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.16)' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-4 h-4 opacity-70">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                    </div>
                    <div className="text-[8.5px] uppercase font-bold tracking-[0.22em] opacity-55">Add Image</div>
                    <div className="text-[8.5px] opacity-40 leading-tight">从 外观 · 启动器组件<br/>设置一张方图</div>
                </div>
            )}
        </div>
    );
});

// 4. Widget Page Component (Calendar + Events)
const WidgetsPage = React.memo(({ contentColor, openApp, anniversaries, characters }: any) => {
    const upcomingAnniversaryRows = useMemo(() => sortAnniversariesByNextOccurrence(anniversaries).slice(0, 8), [anniversaries]);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthName = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][currentMonth];

    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const totalDays = getDaysInMonth(currentYear, currentMonth);
    const startOffset = getFirstDayOfMonth(currentYear, currentMonth);

    const calendarDays = Array.from({ length: totalDays }, (_, i) => i + 1);
    const paddingDays = Array.from({ length: startOffset }, () => null);

    return (
        <div className="w-full flex-shrink-0 snap-center snap-always flex flex-col px-6 pt-24 pb-8 space-y-6 h-full overflow-y-auto no-scrollbar">
              <div className="bg-white/10 backdrop-blur-2xl rounded-3xl p-6 border border-white/20 shadow-2xl">
                  <div className="flex justify-between items-center mb-4" style={{ color: contentColor }}>
                      <h3 className="text-xl font-bold tracking-widest">{monthName} {currentYear}</h3>
                      <div onClick={() => openApp('schedule')} className="bg-white/20 p-2 rounded-full cursor-pointer hover:bg-white/40 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      </div>
                  </div>
                  <div className="grid grid-cols-7 gap-y-3 gap-x-1 text-center mb-2">
                      {['S','M','T','W','T','F','S'].map(d => <div key={d} className="text-[10px] font-bold opacity-40" style={{ color: contentColor }}>{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-y-2 gap-x-1 text-center">
                      {paddingDays.map((_, i) => <div key={`pad-${i}`} />)}
                      {calendarDays.map(day => {
                          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const isToday = day === now.getDate();
                          const hasEvent = anniversaries.some((a: any) => a.date === dateStr);
                          return (
                              <div key={day} className="flex flex-col items-center justify-center h-8 relative">
                                  <div
                                    className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium ${isToday ? 'bg-white text-black font-bold shadow-lg' : 'opacity-80'}`}
                                    style={isToday ? {} : { color: contentColor }}
                                  >
                                      {day}
                                  </div>
                                  {hasEvent && <div className="w-1.5 h-1.5 bg-purple-400 rounded-full absolute bottom-0 shadow-sm border border-black/20"></div>}
                              </div>
                          );
                      })}
                  </div>
              </div>
              <div className="bg-white/10 backdrop-blur-2xl rounded-3xl p-5 border border-white/20 shadow-2xl flex flex-col min-h-0 max-h-[min(340px,42vh)]">
                  <h3 className="text-xs font-bold opacity-60 uppercase tracking-widest mb-2 flex items-center gap-2 shrink-0" style={{ color: contentColor }}>
                      <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
                      Upcoming Events
                  </h3>
                  <div className="space-y-3 overflow-y-auto overflow-x-hidden min-h-0 pr-1 flex-1 -mr-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                      {upcomingAnniversaryRows.length > 0 ? upcomingAnniversaryRows.map(({ anni, next }) => {
                          const today = new Date(); today.setHours(0, 0, 0, 0);
                          const daysLeft = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                          const dayLabel = daysLeft === 0 ? '今天' : daysLeft === 1 ? '明天' : `${daysLeft} 天后`;
                          return (
                          <div key={anni.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 shrink-0">
                              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex flex-col items-center justify-center text-purple-200 border border-purple-500/30 shrink-0">
                                  <span className="text-[9px] opacity-70">{String(next.getMonth() + 1).padStart(2, '0')}</span>
                                  <span className="text-sm font-bold leading-none">{String(next.getDate()).padStart(2, '0')}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                  <div className="text-sm font-bold truncate" style={{ color: contentColor }}>{anni.title}</div>
                                  <div className="text-[10px] opacity-50 flex flex-wrap gap-x-2 gap-y-0.5" style={{ color: contentColor }}>
                                      <span>{characters.find((c: any) => c.id === anni.charId)?.name || 'Unknown'}</span>
                                      <span className="opacity-70">· {dayLabel}</span>
                                  </div>
                              </div>
                          </div>
                          );
                      }) : (
                          <div className="text-center opacity-30 text-xs py-8" style={{ color: contentColor }}>No upcoming events</div>
                      )}
                  </div>
              </div>
        </div>
    );
});

// --- Persist scroll page across remounts (e.g. returning from apps) ---
let _lastPageIndex = 0;

// --- Main Launcher ---

const Launcher: React.FC = () => {
  const { openApp, characters, activeCharacterId, theme, lastMsgTimestamp, isDataLoaded, unreadMessages, appOrder, setAppOrder } = useOS();

  // Local state for widget data to prevent context trashing
  const [widgetChar, setWidgetChar] = useState<CharacterProfile | null>(null);
  const [lastMessage, setLastMessage] = useState<string>('');
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
  const [scheduleData, setScheduleData] = useState<DailySchedule | null>(null);
  const [scheduleCharId, setScheduleCharId] = useState<string | null>(null);
  const [scheduleViewerOpen, setScheduleViewerOpen] = useState(false);

  const [activePageIndex, setActivePageIndex] = useState(_lastPageIndex);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // --- Edit Mode ---
  const [isEditMode, setIsEditMode] = useState(false);

  // --- Ghost Drag State ---
  interface DragInfo { srcIdx: number; offsetX: number; offsetY: number; }
  const dragStateRef = useRef<DragInfo | null>(null);
  const [ghostInfo, setGhostInfo] = useState<{ app: AppConfig; x: number; y: number } | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hoverIdxRef = useRef<number | null>(null);

  // Edge-based page flip
  const edgePageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEdgeDir = useRef<'left' | 'right' | null>(null);
  const activePageIdxRef = useRef(activePageIndex);

  // Mouse drag for page scroll (desktop, non-edit mode)
  const isPageDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftRef = useRef(0);
  const dragMoved = useRef(0);

  // App grid (respects user-defined appOrder)
  const gridApps = useMemo(() => {
    const dockSet = new Set<string>(DOCK_APPS);
    const nonDockOrder = appOrder.filter(id => !dockSet.has(id));
    const ordered = nonDockOrder
      .map(id => INSTALLED_APPS.find(a => a.id === id))
      .filter((a): a is AppConfig => a !== undefined);
    const orderedSet = new Set(nonDockOrder);
    const extras = INSTALLED_APPS.filter(a => !dockSet.has(a.id) && !orderedSet.has(a.id));
    return [...ordered, ...extras];
  }, [appOrder]);

  const handleReorder = useCallback((srcIdx: number, destIdx: number) => {
    if (srcIdx === destIdx) return;
    const newApps = [...gridApps];
    const [moved] = newApps.splice(srcIdx, 1);
    newApps.splice(destIdx, 0, moved);
    setAppOrder(newApps.map(a => a.id));
  }, [gridApps, setAppOrder]);

  const handleReorderRef = useRef(handleReorder);
  useEffect(() => { handleReorderRef.current = handleReorder; }, [handleReorder]);
  useEffect(() => { activePageIdxRef.current = activePageIndex; }, [activePageIndex]);

  // Jump to a page instantly
  const scrollToPage = useCallback((pageIdx: number, totalPgs: number) => {
    if (!scrollContainerRef.current) return;
    const clamped = Math.max(0, Math.min(pageIdx, totalPgs - 1));
    scrollContainerRef.current.scrollLeft = scrollContainerRef.current.clientWidth * clamped;
    setActivePageIndex(clamped);
    _lastPageIndex = clamped;
  }, []);

  const clearEdgeTimer = useCallback(() => {
    if (edgePageTimer.current) { clearTimeout(edgePageTimer.current); edgePageTimer.current = null; }
    lastEdgeDir.current = null;
  }, []);

  const scheduleEdgeFlip = useCallback((dir: 'left' | 'right', totalPgs: number) => {
    if (lastEdgeDir.current === dir) return;
    clearEdgeTimer();
    lastEdgeDir.current = dir;
    edgePageTimer.current = setTimeout(() => {
      const next = activePageIdxRef.current + (dir === 'right' ? 1 : -1);
      scrollToPage(next, totalPgs);
      lastEdgeDir.current = null;
      edgePageTimer.current = null;
    }, 350);
  }, [clearEdgeTimer, scrollToPage]);

  const lastPointerPos = useRef({ x: 0, y: 0 });

  const handleIconPointerDown = useCallback((e: React.PointerEvent, globalIdx: number) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragStateRef.current = { srcIdx: globalIdx, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    hoverIdxRef.current = globalIdx;
    setDraggingIdx(globalIdx);
    setHoverIdx(globalIdx);
    setGhostInfo({ app: gridApps[globalIdx], x: rect.left, y: rect.top });
    try { el.setPointerCapture(e.pointerId); } catch {}
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.scrollSnapType = 'none';
    }
  }, [gridApps]);

  // Global pointer listeners — active while edit mode is on
  useEffect(() => {
    if (!isEditMode) return;
    const getTotalPages = () => {
      if (!scrollContainerRef.current) return 99;
      const w = scrollContainerRef.current.clientWidth;
      return w > 0 ? Math.round(scrollContainerRef.current.scrollWidth / w) : 99;
    };
    const findNearestIcon = (px: number, py: number): number | null => {
      const vw = window.innerWidth; const vh = window.innerHeight;
      let minDist = Infinity; let nearest: number | null = null;
      document.querySelectorAll<HTMLElement>('[data-global-idx]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.right < 0 || r.left > vw || r.bottom < 0 || r.top > vh) return;
        const dist = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
        if (dist < minDist) { minDist = dist; nearest = parseInt(el.dataset.globalIdx!); }
      });
      return nearest;
    };
    const handleMove = (e: PointerEvent) => {
      if (!dragStateRef.current) return;
      e.preventDefault();
      const { offsetX, offsetY } = dragStateRef.current;
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
      setGhostInfo(prev => prev ? { ...prev, x: e.clientX - offsetX, y: e.clientY - offsetY } : null);
      const nearest = findNearestIcon(e.clientX, e.clientY);
      if (nearest !== null) { hoverIdxRef.current = nearest; setHoverIdx(nearest); }
      const containerRect = scrollContainerRef.current?.getBoundingClientRect();
      const EDGE = 110;
      if (containerRect) {
        if (e.clientX - containerRect.left < EDGE) scheduleEdgeFlip('left', getTotalPages());
        else if (containerRect.right - e.clientX < EDGE) scheduleEdgeFlip('right', getTotalPages());
        else clearEdgeTimer();
      }
    };
    const handleUp = (e: PointerEvent) => {
      if (dragStateRef.current) {
        const px = (e.clientX > 0 || e.clientY > 0) ? e.clientX : lastPointerPos.current.x;
        const py = (e.clientX > 0 || e.clientY > 0) ? e.clientY : lastPointerPos.current.y;
        const dest = findNearestIcon(px, py) ?? hoverIdxRef.current;
        const src = dragStateRef.current.srcIdx;
        if (dest !== null && dest !== src) handleReorderRef.current(src, dest);
      }
      dragStateRef.current = null; hoverIdxRef.current = null; lastPointerPos.current = { x: 0, y: 0 };
      setGhostInfo(null); setDraggingIdx(null); setHoverIdx(null); clearEdgeTimer();
      if (scrollContainerRef.current) scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
    };
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      clearEdgeTimer();
    };
  }, [isEditMode, scheduleEdgeFlip, clearEdgeTimer]);

  const dockAppsConfig = useMemo(() =>
    DOCK_APPS.map(id => INSTALLED_APPS.find(app => app.id === id)).filter(Boolean) as typeof INSTALLED_APPS,
    []
  );

  // Page 0: 12 apps (4×3 below clock+widget); page 1: pinwheel with 8; pages 2+: 16 each
  const PAGE0_COUNT = 12;
  const PINWHEEL_COUNT = 8;
  const PAGE_COUNT = 16;
  const appPages = useMemo(() => {
      const pages: typeof INSTALLED_APPS[] = [];
      pages.push(gridApps.slice(0, PAGE0_COUNT));
      pages.push(gridApps.slice(PAGE0_COUNT, PAGE0_COUNT + PINWHEEL_COUNT));
      for (let i = PAGE0_COUNT + PINWHEEL_COUNT; i < gridApps.length; i += PAGE_COUNT) {
          pages.push(gridApps.slice(i, i + PAGE_COUNT));
      }
      while (pages.length < 3) pages.push([]);
      return pages;
  }, [gridApps]);

  // Page 1 (pinwheel) uses appPages[1]: split into two 2x2 quads
  const page2Apps = appPages[1] || [];
  const page2QuadA = useMemo(() => page2Apps.slice(0, 4), [page2Apps]);
  const page2QuadB = useMemo(() => page2Apps.slice(4, 8), [page2Apps]);

  // Total pages = App Pages + 1 Widget Page
  const totalPages = appPages.length + 1;

  // pageStartIndex: how many global indices before page i
  const getPageStart = (pageIdx: number) => {
    if (pageIdx === 0) return 0;
    if (pageIdx === 1) return PAGE0_COUNT;
    return PAGE0_COUNT + PINWHEEL_COUNT + (pageIdx - 2) * PAGE_COUNT;
  };

  useEffect(() => {
      const loadData = async () => {
          // SAFEGUARD: If characters array is empty, reset widget char
          if (!characters || characters.length === 0) {
              setWidgetChar(null);
              setLastMessage('No Character Connected');
              setAnniversaries([]);
              return;
          }

          const targetChar = characters.find(c => c.id === activeCharacterId) || characters[0];
          setWidgetChar(targetChar);

          try {
              const [msgs, annis] = await Promise.all([
                  DB.getMessagesByCharId(targetChar.id),
                  DB.getAllAnniversaries()
              ]);
              
              if (msgs.length > 0) {
                  const visibleMsgs = msgs.filter(m => m.role !== 'system');
                  if (visibleMsgs.length > 0) {
                      const last = visibleMsgs[visibleMsgs.length - 1];
                      const cleanContent = last.content.replace(/\[.*?\]/g, '').trim();
                      setLastMessage(cleanContent || (last.type === 'image' ? '[图片]' : '[消息]'));
                  } else {
                      setLastMessage(targetChar.description || "System Ready.");
                  }
              } else {
                  setLastMessage(targetChar.description || "System Ready.");
              }
              setAnniversaries(annis);
          } catch (e) {
              console.error(e);
          }
      };
      
      if (isDataLoaded) {
          loadData();
      }
  }, [activeCharacterId, lastMsgTimestamp, isDataLoaded, characters]); // Trigger on characters change

  // Schedule widget data loading (shown below SpecialMoments icon)
  const scheduleChar = useMemo(() => {
      if (!characters || characters.length === 0) return null;
      if (scheduleCharId) return characters.find(c => c.id === scheduleCharId) || characters[0];
      return characters.find(c => c.id === activeCharacterId) || characters[0];
  }, [characters, scheduleCharId, activeCharacterId]);

  useEffect(() => {
      if (!scheduleChar || !isDataLoaded) return;
      const today = new Date().toISOString().split('T')[0];
      DB.getDailySchedule(scheduleChar.id, today).then(s => setScheduleData(s)).catch(() => {});
  }, [scheduleChar, isDataLoaded]);

  // Restore scroll position BEFORE paint to avoid visible flash/slide
  useLayoutEffect(() => {
      const el = scrollContainerRef.current;
      if (el && _lastPageIndex > 0) {
          // Temporarily disable smooth scroll so jump is instant
          el.style.scrollBehavior = 'auto';
          el.scrollLeft = el.clientWidth * _lastPageIndex;
          // Re-enable on next frame
          requestAnimationFrame(() => { el.style.scrollBehavior = 'smooth'; });
      }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = () => {
      if (scrollContainerRef.current) {
          const width = scrollContainerRef.current.clientWidth;
          const scrollLeft = scrollContainerRef.current.scrollLeft;
          const index = Math.round(scrollLeft / width);
          setActivePageIndex(index);
          _lastPageIndex = index; // Persist across remounts
      }
  };

  // --- Mouse Drag Handlers (page scroll, desktop only) ---
  const handleMouseDown = (e: React.MouseEvent) => {
      if (!scrollContainerRef.current || isEditMode) return;
      isPageDragging.current = true;
      dragMoved.current = 0;
      startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
      scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
      scrollContainerRef.current.style.scrollBehavior = 'auto';
      scrollContainerRef.current.style.scrollSnapType = 'none';
      scrollContainerRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isPageDragging.current || !scrollContainerRef.current) return;
      e.preventDefault();
      const x = e.pageX - scrollContainerRef.current.offsetLeft;
      scrollContainerRef.current.scrollLeft = scrollLeftRef.current - (x - startX.current);
      dragMoved.current = Math.abs(x - (startX.current + scrollContainerRef.current.offsetLeft));
  };

  const handleMouseUp = () => {
      if (!isPageDragging.current || !scrollContainerRef.current) return;
      isPageDragging.current = false;
      scrollContainerRef.current.style.scrollBehavior = 'smooth';
      scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
      scrollContainerRef.current.style.cursor = 'grab';
  };

  const handleMouseLeave = () => {
      if (isPageDragging.current) handleMouseUp();
  };

  const handleClickCapture = (e: React.MouseEvent) => {
      if (dragMoved.current > 5) {
          e.stopPropagation();
          e.preventDefault();
      }
  };

  const contentColor = theme.contentColor || '#ffffff';
  const launcherBottomInset = 'max(env(safe-area-inset-bottom), 1.25rem)';
  
  const totalUnread = Object.values(unreadMessages).reduce((a, b) => a + b, 0);
  const widgetUnread = widgetChar && unreadMessages[widgetChar.id] ? unreadMessages[widgetChar.id] : 0;

  return (
    <div className="h-full w-full flex flex-col relative z-10 overflow-hidden font-sans select-none">
      
      {/* Visual Elements (Decorative Background - Static, low-cost gradients instead of blur) */}
      <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }}></div>
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }}></div>
      </div>

      {/* Scrollable Content Layer */}
      {/* UPDATE: Added snap-always to children to ensure one-page-at-a-time scrolling on mobile swipe */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClickCapture={handleClickCapture}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar cursor-grab active:cursor-grabbing"
        style={{
            scrollBehavior: 'smooth',
            overscrollBehaviorX: 'contain',
            overscrollBehaviorY: 'none',
            touchAction: 'pan-x pan-y',
            willChange: 'scroll-position',
            contain: 'layout paint',
            transform: 'translateZ(0)',
            WebkitOverflowScrolling: 'touch',
        }}
      >
          {/* Render App Pages */}
          {appPages.map((pageApps, idx) => (
              <div
                key={idx}
                className="w-full flex-shrink-0 snap-center snap-always flex flex-col px-6 pt-12 pb-8 h-full"
                style={{ contentVisibility: 'auto', contain: 'layout paint', transform: 'translateZ(0)' }}
              >
                  {idx === 0 ? (
                      // Page 1 (original): Clock + Chat + 4x3 App Grid
                      <>
                        <DesktopClock />
                        <CharacterWidget
                            char={widgetChar}
                            unreadCount={widgetUnread}
                            lastMessage={lastMessage}
                            onClick={() => (widgetChar ? openApp(AppID.Chat, { messageWidgetCharId: widgetChar.id }) : openApp(AppID.Chat))}
                            contentColor={contentColor}
                        />
                        <div className="flex-1">
                            <AppGridPage
                                apps={pageApps}
                                openApp={openApp}
                                onLongPress={isEditMode ? undefined : () => setIsEditMode(true)}
                                isEditMode={isEditMode}
                                pageStartIndex={getPageStart(idx)}
                                draggingIdx={draggingIdx}
                                hoverIdx={hoverIdx}
                                onIconPointerDown={handleIconPointerDown}
                            />
                        </div>
                      </>
                  ) : idx === 1 ? (
                      // Page 2: Schedule 4x2 widget on top + Pinwheel (Music / 2x2 icons / 2x2 icons / Image) below
                      <div className="flex-1 min-h-0 w-full flex flex-col gap-5 justify-center">
                          {scheduleChar && (
                              <ScheduleHomeWidget
                                  schedule={scheduleData}
                                  character={scheduleChar}
                                  contentColor={contentColor}
                                  onOpen={() => setScheduleViewerOpen(true)}
                              />
                          )}
                          <div className="grid grid-cols-2 gap-x-3 gap-y-5 w-full">
                              <div className="aspect-square min-w-0">
                                  <NowPlayingSquareWidget contentColor={contentColor} />
                              </div>
                              <div className="aspect-square min-w-0">
                                  <AppQuadGrid apps={page2QuadA} openApp={openApp} />
                              </div>
                              <div className="aspect-square min-w-0">
                                  <AppQuadGrid apps={page2QuadB} openApp={openApp} />
                              </div>
                              <div className="aspect-square min-w-0">
                                  <DesktopSquareImage
                                      image={theme.launcherWidgets?.['dsq']}
                                      contentColor={contentColor}
                                      onClick={() => openApp(AppID.Appearance)}
                                  />
                              </div>
                          </div>
                      </div>
                  ) : (
                      // Page 3+: Widget Images (idx===2 only) + Free Decorations + Apps
                      <div className="pt-10 flex-1 flex flex-col relative">
                          {idx === 2 && (() => {
                            const raw = theme.launcherWidgets || {};
                            const w = { ...raw };
                            const hasAny = w['tl'] || w['tr'] || w['wide'];
                            const hasTopRow = w['tl'] || w['tr'];
                            return (
                              <>
                                {hasAny && (
                                  <div className="mb-3 space-y-2 relative z-10">
                                    {hasTopRow && (
                                      <div className="flex gap-2">
                                        {['tl', 'tr'].map(key => w[key] ? (
                                          <div key={key} className="flex-1 aspect-square rounded-2xl overflow-hidden shadow-md border border-white/20">
                                            <img src={w[key]} className="w-full h-full object-cover" alt="" loading="lazy" />
                                          </div>
                                        ) : <div key={key} className="flex-1"></div>)}
                                      </div>
                                    )}
                                    {w['wide'] && (
                                      <div className="w-full h-32 rounded-2xl overflow-hidden shadow-md border border-white/20">
                                        <img src={w['wide']} className="w-full h-full object-cover" alt="" loading="lazy" />
                                      </div>
                                    )}
                                  </div>
                                )}
                                {/* Free-positioned Desktop Decorations (z-20 to float above widgets z-10) */}
                                {theme.desktopDecorations && theme.desktopDecorations.length > 0 && (
                                  <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
                                    {theme.desktopDecorations.map(deco => (
                                      <img
                                        key={deco.id}
                                        src={deco.content}
                                        alt=""
                                        loading="lazy"
                                        className="absolute w-16 h-16 object-contain select-none"
                                        style={{
                                          left: `${deco.x}%`,
                                          top: `${deco.y}%`,
                                          transform: `translate(-50%, -50%) scale(${deco.scale}) rotate(${deco.rotation}deg)${deco.flip ? ' scaleX(-1)' : ''}`,
                                          opacity: deco.opacity,
                                          zIndex: deco.zIndex,
                                          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))',
                                        }}
                                      />
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}

                          <AppGridPage
                                apps={pageApps}
                                openApp={openApp}
                                onLongPress={isEditMode ? undefined : () => setIsEditMode(true)}
                                isEditMode={isEditMode}
                                pageStartIndex={getPageStart(idx)}
                                draggingIdx={draggingIdx}
                                hoverIdx={hoverIdx}
                                onIconPointerDown={handleIconPointerDown}
                          />
                          <div className="flex-1"></div>
                      </div>
                  )}
              </div>
          ))}

          {/* Final Page: Widgets */}
          <WidgetsPage
            contentColor={contentColor}
            openApp={openApp}
            anniversaries={anniversaries}
            characters={characters}
          />

      </div>

      {/* Ghost element — follows pointer during drag */}
      {ghostInfo && (
        <div
          className="fixed pointer-events-none z-[200]"
          style={{
            left: ghostInfo.x,
            top: ghostInfo.y,
            transform: 'scale(1.2)',
            filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.55))',
            opacity: 0.92,
            transition: 'none',
          }}
        >
          <AppIcon app={ghostInfo.app} onClick={() => {}} />
        </div>
      )}

      {/* Edit mode: floating top bar */}
      {isEditMode && (
        <div className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-6 pt-12 pb-2 pointer-events-none">
          <div className="text-white/50 text-[10px] font-semibold tracking-widest uppercase bg-black/20 backdrop-blur-sm px-2 py-1 rounded-full">
            {ghostInfo ? '松手放置' : '长按图标拖动'}
          </div>
          <button
            className="pointer-events-auto px-4 py-1.5 bg-white/25 rounded-full text-white text-sm font-semibold border border-white/30 backdrop-blur-sm active:scale-95 transition-transform"
            onClick={() => { setIsEditMode(false); setGhostInfo(null); setDraggingIdx(null); setHoverIdx(null); }}
          >
            完成
          </button>
        </div>
      )}

      {/* Page Indicators */}
      <div
          className="absolute left-0 w-full flex justify-center gap-2 pointer-events-none z-20"
          style={{ bottom: `calc(${launcherBottomInset} + 5.5rem)` }}
      >
          {Array.from({ length: totalPages }).map((_, i) => (
              <div 
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${activePageIndex === i ? 'w-4 opacity-100' : 'w-1.5 opacity-40'}`} 
                style={{ backgroundColor: contentColor }}
              ></div>
          ))}
      </div>

      {/* Floating Dock - Updated Margin and Safe Area handling */}
      <div
           className="mt-auto flex justify-center w-full px-4 relative z-30"
           style={{ paddingBottom: launcherBottomInset }}
      >
           <div className="bg-white/30 rounded-[1.75rem] border border-white/25 shadow-[0_8px_40px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.08)] px-4 py-3 flex gap-3 sm:gap-6 items-center mx-auto max-w-full justify-between overflow-x-auto no-scrollbar transform-gpu">
               {dockAppsConfig.map(app => (
                   <div key={app.id} className="relative">
                        <AppIcon app={app} onClick={() => openApp(app.id)} variant="dock" size="md" />
                        {app.id === 'chat' && totalUnread > 0 && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center border-2 border-white/20 shadow-sm font-bold pointer-events-none animate-pop-in">
                                {totalUnread > 9 ? '9+' : totalUnread}
                            </div>
                        )}
                   </div>
               ))}
           </div>
      </div>

      <ScheduleFullscreenViewer
          open={scheduleViewerOpen}
          onClose={() => setScheduleViewerOpen(false)}
          characters={characters}
          activeCharId={scheduleChar?.id || null}
          onSwitchCharacter={(id) => setScheduleCharId(id)}
          schedule={scheduleData}
          activeCharacter={scheduleChar}
          contentColor={contentColor}
      />

    </div>
  );
};

export default Launcher;

import React, { useMemo, useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { INSTALLED_APPS, DOCK_APPS } from '../constants';
import AppIcon from '../components/os/AppIcon';
import { DB } from '../utils/db';
import { AppConfig, CharacterProfile, Anniversary, AppID } from '../types';
import { sortAnniversariesByNextOccurrence } from '../utils/anniversaryNext';

// --- Isolated Components to prevent full re-renders ---

// 1. Clock Component
const DesktopClock = React.memo(() => {
    const { virtualTime, theme } = useOS();
    const contentColor = theme.contentColor || '#ffffff';
    
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const now = new Date();
    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const dateNum = now.getDate().toString().padStart(2, '0');

    return (
        <div className="flex flex-col mb-6 mt-6 relative animate-fade-in" style={{ color: contentColor }}>
             <div className="absolute -top-6 left-1 flex items-center gap-2">
                 <div className="bg-white/20 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase border border-white/10">
                     System Ready
                 </div>
                 <div className="h-[1px] w-20 bg-gradient-to-r from-current to-transparent opacity-40"></div>
             </div>
             <div className="flex items-end gap-4">
                 <div className="text-[6.5rem] leading-[0.85] font-bold tracking-tighter drop-shadow-2xl font-sans">
                    {virtualTime.hours.toString().padStart(2, '0')}
                    <span className="opacity-40 font-light mx-1">:</span>
                    {virtualTime.minutes.toString().padStart(2, '0')}
                 </div>
                 <div className="flex flex-col justify-end pb-3 opacity-90">
                     <div className="text-3xl font-bold tracking-tight">{dayName}</div>
                     <div className="text-sm font-medium opacity-80 tracking-widest">{monthName} . {dateNum}</div>
                 </div>
             </div>
        </div>
    );
});

// 2. Character Widget
const CharacterWidget = React.memo(({ 
    char, unreadCount, lastMessage, onClick, contentColor 
}: { 
    char: CharacterProfile | null; unreadCount: number; lastMessage: string;
    onClick: () => void; contentColor: string;
}) => {
    return (
        <div className="mb-4 group animate-fade-in">
             <div 
                className="relative h-28 w-full overflow-hidden rounded-[1.5rem] bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl transition-all duration-300 active:scale-[0.98] cursor-pointer"
                onClick={onClick}
             >
                 <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-l from-white/5 to-transparent skew-x-12 pointer-events-none"></div>
                 <div className="absolute inset-0 flex items-center p-4 gap-4">
                     <div className="w-20 h-20 shrink-0 rounded-2xl overflow-hidden shadow-lg border-2 border-white/20 relative bg-slate-800">
                         {char ? (
                             <img src={char.avatar} className="w-full h-full object-cover" alt="char" loading="lazy" />
                         ) : <div className="w-full h-full bg-white/10 animate-pulse"></div>}
                         {unreadCount > 0 ? (
                            <div className="absolute bottom-1 right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-white">
                                {unreadCount}
                            </div>
                         ) : (
                            <div className="absolute bottom-1 right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-black/20 shadow-sm"></div>
                         )}
                     </div>
                     <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                         <div className="flex items-center gap-2">
                             <h3 className="text-lg font-bold tracking-wide drop-shadow-md truncate" style={{ color: contentColor }}>
                                 {char?.name || 'NO SIGNAL'}
                             </h3>
                             <div className="px-1.5 py-0.5 bg-white/20 rounded text-[9px] font-bold uppercase tracking-wider" style={{ color: contentColor }}>
                                 {unreadCount > 0 ? 'NEW MESSAGE' : 'Active'}
                             </div>
                         </div>
                         <div className="relative">
                             <div className="text-xs line-clamp-2 font-medium leading-relaxed opacity-90" style={{ color: contentColor }}>
                                <span className="opacity-40 mr-1 text-[10px]">▶</span>
                                {lastMessage}
                             </div>
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
        <div className="grid grid-cols-4 gap-y-5 gap-x-2 place-items-center relative">
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

// 4. Widget Page Component (Calendar)
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

// --- Persist scroll page across remounts ---
let _lastPageIndex = 0;

// Icons per page: page 0 has clock+widget so fewer; pages 1+ have more room
const PAGE0_COUNT = 12;
const PAGE_COUNT = 16;

// --- Main Launcher ---
const Launcher: React.FC = () => {
  const { openApp, characters, activeCharacterId, theme, lastMsgTimestamp, isDataLoaded, unreadMessages, appOrder, setAppOrder } = useOS();

  const [widgetChar, setWidgetChar] = useState<CharacterProfile | null>(null);
  const [lastMessage, setLastMessage] = useState<string>('');
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>([]);
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

  // Edge-based page flip (timer approach — more reliable on mobile)
  const edgePageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEdgeDir = useRef<'left' | 'right' | null>(null);
  const activePageIdxRef = useRef(activePageIndex); // stable ref to avoid stale closure

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

  // Stable refs to avoid stale closures in global event listeners
  const handleReorderRef = useRef(handleReorder);
  useEffect(() => { handleReorderRef.current = handleReorder; }, [handleReorder]);
  useEffect(() => { activePageIdxRef.current = activePageIndex; }, [activePageIndex]);

  // Jump to a page instantly (snap disabled during drag)
  const scrollToPage = useCallback((pageIdx: number, totalPgs: number) => {
    if (!scrollContainerRef.current) return;
    const clamped = Math.max(0, Math.min(pageIdx, totalPgs - 1));
    scrollContainerRef.current.scrollLeft = scrollContainerRef.current.clientWidth * clamped;
    setActivePageIndex(clamped);
    _lastPageIndex = clamped;
  }, []);

  // Clear pending page-flip timer
  const clearEdgeTimer = useCallback(() => {
    if (edgePageTimer.current) { clearTimeout(edgePageTimer.current); edgePageTimer.current = null; }
    lastEdgeDir.current = null;
  }, []);

  // Schedule a page flip when pointer lingers in the edge zone
  const scheduleEdgeFlip = useCallback((dir: 'left' | 'right', totalPgs: number) => {
    if (lastEdgeDir.current === dir) return; // already scheduled this direction
    clearEdgeTimer();
    lastEdgeDir.current = dir;
    edgePageTimer.current = setTimeout(() => {
      const next = activePageIdxRef.current + (dir === 'right' ? 1 : -1);
      scrollToPage(next, totalPgs);
      lastEdgeDir.current = null;
      edgePageTimer.current = null;
    }, 350);
  }, [clearEdgeTimer, scrollToPage]);

  // Last known pointer position (backup for pointercancel which may lack coords)
  const lastPointerPos = useRef({ x: 0, y: 0 });

  // Start dragging an icon
  const handleIconPointerDown = useCallback((e: React.PointerEvent, globalIdx: number) => {
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragStateRef.current = {
      srcIdx: globalIdx,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    hoverIdxRef.current = globalIdx;
    setDraggingIdx(globalIdx);
    setHoverIdx(globalIdx);
    setGhostInfo({
      app: gridApps[globalIdx],
      x: rect.left,
      y: rect.top,
    });
    // Capture pointer so events aren't lost to browser gestures
    try { el.setPointerCapture(e.pointerId); } catch {}
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.scrollSnapType = 'none';
    }
  }, [gridApps]);

  // Global pointer listeners — active while edit mode is on
  useEffect(() => {
    if (!isEditMode) return;

    // totalPages captured at effect-run time; use ref if it changes
    const getTotalPages = () => {
      if (!scrollContainerRef.current) return 99;
      const w = scrollContainerRef.current.clientWidth;
      return w > 0 ? Math.round(scrollContainerRef.current.scrollWidth / w) : 99;
    };

    // Shared helper: find nearest on-screen icon to a point
    const findNearestIcon = (px: number, py: number): number | null => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let minDist = Infinity;
      let nearest: number | null = null;
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

      setGhostInfo(prev => prev
        ? { ...prev, x: e.clientX - offsetX, y: e.clientY - offsetY }
        : null
      );

      const nearest = findNearestIcon(e.clientX, e.clientY);
      if (nearest !== null) {
        hoverIdxRef.current = nearest;
        setHoverIdx(nearest);
      }

      const containerRect = scrollContainerRef.current?.getBoundingClientRect();
      const EDGE = 110;
      if (containerRect) {
        if (e.clientX - containerRect.left < EDGE) {
          scheduleEdgeFlip('left', getTotalPages());
        } else if (containerRect.right - e.clientX < EDGE) {
          scheduleEdgeFlip('right', getTotalPages());
        } else {
          clearEdgeTimer();
        }
      }
    };

    const handleUp = (e: PointerEvent) => {
      if (dragStateRef.current) {
        // Use pointer-up coordinates if available, fall back to last known position
        const px = (e.clientX > 0 || e.clientY > 0) ? e.clientX : lastPointerPos.current.x;
        const py = (e.clientX > 0 || e.clientY > 0) ? e.clientY : lastPointerPos.current.y;
        // Final nearest-icon calculation at release point — most reliable
        const dest = findNearestIcon(px, py) ?? hoverIdxRef.current;
        const src = dragStateRef.current.srcIdx;
        if (dest !== null && dest !== src) {
          handleReorderRef.current(src, dest);
        }
      }
      dragStateRef.current = null;
      hoverIdxRef.current = null;
      lastPointerPos.current = { x: 0, y: 0 };
      setGhostInfo(null);
      setDraggingIdx(null);
      setHoverIdx(null);
      clearEdgeTimer();
      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.scrollSnapType = 'x mandatory';
      }
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

  // Page 0: 8 apps (space shared with clock+widget); pages 1+: 12 apps
  const appPages = useMemo(() => {
    const pages: AppConfig[][] = [];
    pages.push(gridApps.slice(0, PAGE0_COUNT));
    for (let i = PAGE0_COUNT; i < gridApps.length; i += PAGE_COUNT) {
      pages.push(gridApps.slice(i, i + PAGE_COUNT));
    }
    if (pages.length === 0) pages.push([]);
    return pages;
  }, [gridApps]);

  // pageStartIndex: how many global indices before page i
  const getPageStart = (pageIdx: number) => {
    if (pageIdx === 0) return 0;
    return PAGE0_COUNT + (pageIdx - 1) * PAGE_COUNT;
  };

  const totalPages = appPages.length + 1;

  useEffect(() => {
      const loadData = async () => {
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
      if (isDataLoaded) loadData();
  }, [activeCharacterId, lastMsgTimestamp, isDataLoaded, characters]);

  useLayoutEffect(() => {
      const el = scrollContainerRef.current;
      if (el && _lastPageIndex > 0) {
          el.style.scrollBehavior = 'auto';
          el.scrollLeft = el.clientWidth * _lastPageIndex;
          requestAnimationFrame(() => { el.style.scrollBehavior = 'smooth'; });
      }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = () => {
      if (scrollContainerRef.current) {
          const width = scrollContainerRef.current.clientWidth;
          const scrollLeft = scrollContainerRef.current.scrollLeft;
          const index = Math.round(scrollLeft / width);
          setActivePageIndex(index);
          _lastPageIndex = index;
      }
  };

  // Mouse drag (desktop page scroll — disabled in edit mode)
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
  const handleMouseLeave = () => { if (isPageDragging.current) handleMouseUp(); };
  const handleClickCapture = (e: React.MouseEvent) => {
      if (dragMoved.current > 5) { e.stopPropagation(); e.preventDefault(); }
  };

  const contentColor = theme.contentColor || '#ffffff';
  const totalUnread = Object.values(unreadMessages).reduce((a, b) => a + b, 0);
  const widgetUnread = widgetChar && unreadMessages[widgetChar.id] ? unreadMessages[widgetChar.id] : 0;

  return (
    <div className="h-full w-full flex flex-col relative z-10 overflow-hidden font-sans select-none">
      
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)' }}></div>
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }}></div>
      </div>

      {/* Paginated scrollable area */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClickCapture={handleClickCapture}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar cursor-grab active:cursor-grabbing"
        style={{ scrollBehavior: 'smooth', overscrollBehaviorX: 'contain', contain: 'layout style', transform: 'translateZ(0)' }}
      >
          {appPages.map((pageApps, idx) => (
              <div key={idx} className="w-full flex-shrink-0 snap-center snap-always flex flex-col px-6 pt-12 pb-8 h-full" style={{ contentVisibility: 'auto' }}>
                  {idx === 0 ? (
                      <>
                        <DesktopClock />
                        <CharacterWidget 
                            char={widgetChar} unreadCount={widgetUnread}
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
                  ) : (
                      <div className="pt-10 flex-1 flex flex-col relative">
                          {idx === 1 && (() => {
                            const raw = theme.launcherWidgets || {};
                            const w = { ...raw };
                            if (!w['wide'] && theme.launcherWidgetImage) w['wide'] = theme.launcherWidgetImage;
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
                                {theme.desktopDecorations && theme.desktopDecorations.length > 0 && (
                                  <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
                                    {theme.desktopDecorations.map(deco => (
                                      <img
                                        key={deco.id} src={deco.content} alt="" loading="lazy"
                                        className="absolute w-16 h-16 object-contain select-none"
                                        style={{
                                          left: `${deco.x}%`, top: `${deco.y}%`,
                                          transform: `translate(-50%, -50%) scale(${deco.scale}) rotate(${deco.rotation}deg)${deco.flip ? ' scaleX(-1)' : ''}`,
                                          opacity: deco.opacity, zIndex: deco.zIndex,
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

          <WidgetsPage 
            contentColor={contentColor} openApp={openApp}
            anniversaries={anniversaries} characters={characters} 
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
      <div className="absolute bottom-24 left-0 w-full flex justify-center gap-2 pointer-events-none z-20">
          {Array.from({ length: totalPages }).map((_, i) => (
              <div 
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${activePageIndex === i ? 'w-4 opacity-100' : 'w-1.5 opacity-40'}`} 
                style={{ backgroundColor: contentColor }}
              ></div>
          ))}
      </div>

      {/* Floating Dock */}
      <div className="mt-auto flex justify-center w-full px-4 mb-2 pb-[env(safe-area-inset-bottom)] relative z-30">
           <div className="bg-white/20 backdrop-blur-2xl rounded-3xl border border-white/20 shadow-[0_10px_30px_rgba(0,0,0,0.2)] px-4 py-3 flex gap-3 sm:gap-6 items-center mx-auto max-w-full justify-between overflow-x-auto no-scrollbar transform-gpu">
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

    </div>
  );
};

export default Launcher;

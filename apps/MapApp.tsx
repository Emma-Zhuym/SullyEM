/**
 * MapApp.tsx — 地图系统（可编辑版 v3）
 *
 * EM 独有功能。角色按日程 slot.location 在自定义地图上移动。
 * 世界配置存 IndexedDB，用户可增删改。
 * 每个区域可在地图上手动选位置。
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CaretLeft, ChatTeardrop, Plus, Trash, PencilSimple, Check, X, Crosshair, MapPin } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { AppID, CharacterProfile, DailySchedule, ScheduleSlot } from '../types';
import { DB } from '../utils/db';
import { computeCharStatus, CharAvailability } from '../utils/charStatus';

// ══════════════════════════════════════════════════════════════
//  Types
// ══════════════════════════════════════════════════════════════

interface MapRegion {
  id: string;
  name: string;
  glyph: string;
  color: string;
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  isHome?: boolean;       // "你" 的默认位置
  isCharDefault?: boolean; // 角色的默认位置
  locationKeys?: string[];
}

type MapTheme = 'lilac' | 'peach' | 'mint' | 'dusk' | 'rainbow';

interface MapWorld {
  id: string;
  charId: string;
  genre: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  theme: MapTheme;
  regions: MapRegion[];
  homeRegionId?: string;
}

// ══════════════════════════════════════════════════════════════
//  IndexedDB — Map worlds storage
// ══════════════════════════════════════════════════════════════

const MAP_DB = 'SullyEM_Map';
const MAP_DB_VER = 2; // bumped for schema change
const STORE = 'worlds';

function openMapDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MAP_DB, MAP_DB_VER);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
  });
}

const MapDB = {
  getAll: async (): Promise<MapWorld[]> => {
    const db = await openMapDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },
  save: async (w: MapWorld) => {
    const db = await openMapDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(w);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  remove: async (id: string) => {
    const db = await openMapDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};

// ══════════════════════════════════════════════════════════════
//  Default / Template data
// ══════════════════════════════════════════════════════════════

const REGION_COLORS = ['#cfdcef', '#ddd2ec', '#f4d7c2', '#c9e3cd', '#efd0db', '#f1e5c8', '#b6b8d6', '#d6e3c6'];

const SEED_WORLD: Omit<MapWorld, 'charId'> & { charNameMatch: string } = {
  id: 'chenzhao_default',
  charNameMatch: '陈照',
  genre: '现代都市',
  tag: '同居',
  tagColor: '#8a3251',
  tagBg: '#ffd7e1',
  theme: 'lilac',
  homeRegionId: 'home',
  regions: [
    { id: 'office', name: '星澜大厦', glyph: '🏢', color: '#cfdcef',
      x: 70, y: 20, isCharDefault: true,
      locationKeys: ['公司', '会议室', '星澜', '办公', '大厦'] },
    { id: 'home', name: '你们的家', glyph: '🏠', color: '#ddd2ec',
      x: 20, y: 50, isHome: true,
      locationKeys: ['家', '卧室', '客厅', '厨房'] },
    { id: 'dinner', name: '街角餐厅', glyph: '🍷', color: '#f4d7c2',
      x: 55, y: 70,
      locationKeys: ['餐厅', '吃饭', '晚餐', '约会'] },
    { id: 'gym', name: '健身房', glyph: '💪', color: '#c9e3cd',
      x: 85, y: 55,
      locationKeys: ['健身', '跑步', '运动'] },
  ],
};

const THEMES: { id: MapTheme; label: string; color: string }[] = [
  { id: 'lilac', label: '紫雾', color: '#d8d2e8' },
  { id: 'peach', label: '蜜桃', color: '#f3dccc' },
  { id: 'mint', label: '薄荷', color: '#cee2d2' },
  { id: 'dusk', label: '暮色', color: '#b4b6cf' },
  { id: 'rainbow', label: '彩虹', color: '#efd0db' },
];

const TAG_PRESETS = [
  { tag: '暧昧', bg: '#ffe5b3', color: '#7a5320' },
  { tag: '恋爱', bg: '#ffd7e1', color: '#8a3251' },
  { tag: '同居', bg: '#f4d2e8', color: '#8a3271' },
  { tag: '订婚', bg: '#e8d2f4', color: '#6b3a8a' },
  { tag: '结婚', bg: '#d6e7ff', color: '#284a82' },
  { tag: '朋友', bg: '#f1e5c8', color: '#6b5230' },
  { tag: '同事', bg: '#ddd2ec', color: '#5b4a8a' },
  { tag: '助手', bg: '#d2ecd3', color: '#2c6c3a' },
];

// ══════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════

function matchRegion(world: MapWorld, location?: string): MapRegion | undefined {
  if (!location) return undefined;
  const loc = location.toLowerCase();
  return world.regions.find(r => r.locationKeys?.some(k => loc.includes(k.toLowerCase())));
}

function getCurrentSlot(schedule: DailySchedule | null): ScheduleSlot | undefined {
  if (!schedule?.slots?.length) return undefined;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let current: ScheduleSlot | undefined;
  for (const s of schedule.slots) { if (s.startTime <= hhmm) current = s; }
  return current;
}

const THEME_BG: Record<string, string> = {
  lilac: 'linear-gradient(180deg, #d8d2e8 0%, #e3dcef 55%, #ece6f3 100%)',
  peach: 'linear-gradient(180deg, #f3dccc 0%, #f6e3d3 55%, #faecdc 100%)',
  mint: 'linear-gradient(180deg, #cee2d2 0%, #dceadc 55%, #e6f0e4 100%)',
  dusk: 'linear-gradient(180deg, #b4b6cf 0%, #c6c5da 55%, #d7d4e3 100%)',
  rainbow: 'linear-gradient(135deg, #efd0db 0%, #f4d7c2 26%, #d6e3c6 55%, #cfdcef 80%, #ddd2ec 100%)',
};

const STATUS_DOT: Record<CharAvailability, string> = { online: '#3aa763', busy: '#ff9466', offline: '#8a8ab1' };
const STATUS_LABEL: Record<CharAvailability, string> = { online: '在线', busy: '忙碌', offline: '离线' };

/** Auto-generate dashed path lines connecting regions */
function generatePaths(regions: MapRegion[]): string[] {
  if (regions.length < 2) return [];
  const paths: string[] = [];
  // Connect each region to the next (simple chain)
  for (let i = 0; i < regions.length - 1; i++) {
    const a = regions[i], b = regions[i + 1];
    // Use quadratic curve with midpoint offset for organic feel
    const mx = (a.x + b.x) / 2 + (Math.random() * 10 - 5);
    const my = (a.y + b.y) / 2 + (Math.random() * 10 - 5);
    paths.push(`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`);
  }
  // Also connect last to first if 3+ regions
  if (regions.length >= 3) {
    const a = regions[regions.length - 1], b = regions[0];
    const mx = (a.x + b.x) / 2 + 5;
    const my = (a.y + b.y) / 2 - 5;
    paths.push(`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`);
  }
  return paths;
}

// ══════════════════════════════════════════════════════════════
//  Map Canvas — shared between MapView and Editor
// ══════════════════════════════════════════════════════════════

const MapCanvas: React.FC<{
  regions: MapRegion[];
  theme: MapTheme;
  charAvatar?: string;
  charName?: string;
  charRegionId?: string; // which region the character is at
  homeRegionId?: string;
  status?: CharAvailability;
  highlightRegionId?: string; // editor: which region is selected
  placingRegionId?: string;   // editor: which region is being placed
  onTapMap?: (x: number, y: number) => void;
  onTapRegion?: (id: string) => void;
  className?: string;
}> = ({ regions, theme, charAvatar, charName, charRegionId, homeRegionId, status, highlightRegionId, placingRegionId, onTapMap, onTapRegion, className }) => {
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!onTapMap || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const x = Math.round(((clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((clientY - rect.top) / rect.height) * 100);
    onTapMap(Math.max(5, Math.min(95, x)), Math.max(5, Math.min(95, y)));
  }, [onTapMap]);

  const paths = useMemo(() => generatePaths(regions), [regions]);

  const charRegion = regions.find(r => r.id === charRegionId);
  const homeRegion = regions.find(r => r.id === homeRegionId) || regions.find(r => r.isHome);

  return (
    <div ref={canvasRef}
      className={`relative overflow-hidden bg-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_22px_rgba(80,60,140,0.08)] ${className || ''}`}
      style={{ background: THEME_BG[theme] || THEME_BG.lilac }}
      onClick={handleTap}
      onTouchStart={onTapMap ? (e) => { e.preventDefault(); handleTap(e); } : undefined}>

      {/* Dashed connection lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <g stroke="rgba(28,22,38,0.10)" strokeWidth="0.4" strokeDasharray="1 2" fill="none">
          {paths.map((d, i) => <path key={i} d={d} />)}
        </g>
      </svg>

      {/* Placing mode crosshair */}
      {placingRegionId && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="bg-violet-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full animate-pulse">
            点击地图放置位置
          </div>
        </div>
      )}

      {/* Region markers */}
      {regions.map(r => {
        const isHighlighted = r.id === highlightRegionId;
        const isCharHere = r.id === charRegionId;
        const isPlacing = r.id === placingRegionId;
        return (
          <div key={r.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 select-none transition-all duration-300 ease-out"
            style={{ left: `${r.x}%`, top: `${r.y}%`, zIndex: isHighlighted || isCharHere ? 20 : 10 }}
            onClick={(e) => { if (onTapRegion && !placingRegionId) { e.stopPropagation(); onTapRegion(r.id); } }}>
            {/* Glow ring for highlighted/placing */}
            {(isHighlighted || isPlacing) && (
              <div className="absolute inset-0 -m-2 rounded-full animate-pulse" style={{ background: `${r.color}55`, boxShadow: `0 0 20px ${r.color}88` }} />
            )}
            {/* Main circle */}
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-transform ${
              isHighlighted ? 'scale-125 ring-2 ring-violet-500' : ''
            }`} style={{ background: r.color, boxShadow: `0 4px 12px ${r.color}66` }}>
              {r.glyph}
            </div>
            {/* Name label */}
            <div className={`absolute left-1/2 top-full -translate-x-1/2 mt-1 whitespace-nowrap text-center ${
              isHighlighted ? 'font-bold text-[12px]' : 'text-[10.5px]'
            }`}>
              <span className="bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-full text-[#1c1626]/80 font-semibold shadow-sm">
                {r.name}
              </span>
            </div>
            {/* Home badge */}
            {r.isHome && (
              <div className="absolute -right-1 -top-1 w-4 h-4 rounded-full bg-violet-500 text-white text-[8px] flex items-center justify-center font-bold shadow-sm">你</div>
            )}
            {r.isCharDefault && !isCharHere && (
              <div className="absolute -right-1 -top-1 w-4 h-4 rounded-full bg-slate-500 text-white text-[8px] flex items-center justify-center font-bold shadow-sm">★</div>
            )}
          </div>
        );
      })}

      {/* Character avatar pin — overlaid on the matched region */}
      {charAvatar && charRegion && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2 z-20 select-none transition-all duration-500 ease-out pointer-events-none"
          style={{ left: `${charRegion.x}%`, top: `${charRegion.y - 10}%` }}>
          <div className="w-10 h-10 rounded-full bg-white p-[2px] shadow-[0_0_0_3px_#6f5cd9,0_6px_14px_rgba(111,92,217,0.4)]">
            <img src={charAvatar} className="w-full h-full rounded-full object-cover" />
          </div>
          <div className="absolute -right-0.5 top-0 w-3 h-3 rounded-full border-2 border-white" style={{ background: STATUS_DOT[status || 'offline'] }} />
          <div className="w-2.5 h-2.5 bg-white mx-auto -mt-[5px] rotate-45 rounded-sm shadow-sm" />
        </div>
      )}

      {/* "Me" pin at home region */}
      {homeRegion && !charRegionId && (
        <div className="absolute -translate-x-1/2 -translate-y-1/2 z-15 select-none pointer-events-none"
          style={{ left: `${homeRegion.x}%`, top: `${homeRegion.y - 10}%` }}>
          <div className="w-9 h-9 rounded-full p-[2px] animate-pulse"
            style={{ background: '#6f5cd9', boxShadow: '0 0 0 3px rgba(111,92,217,0.20), 0 4px 10px rgba(111,92,217,0.45)' }}>
            <div className="w-full h-full rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: '#6f5cd9' }}>你</div>
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  Bottom Sheet
// ══════════════════════════════════════════════════════════════

const BottomSheet: React.FC<{
  char: CharacterProfile; region?: MapRegion; status: CharAvailability;
  activity?: string; location?: string; lastMsg?: string; onGoChat: () => void;
}> = ({ char, region, status, activity, location, lastMsg, onGoChat }) => (
  <div className="mx-3.5 mb-3 bg-white/[0.86] rounded-3xl p-4 shadow-[0_6px_22px_rgba(80,60,140,0.10)] border border-white/70">
    <div className="w-10 h-1 rounded-full bg-black/[0.18] mx-auto -mt-1 mb-2.5" />
    <div className="flex items-center gap-2.5">
      {region && (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: region.color }}>{region.glyph}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 font-bold text-[15px] text-[#1c1626] flex-wrap">
          {char.name}
          {region && <span className="font-normal text-[#1c1626]/60"> · {region.name}</span>}
          <span className="text-[9.5px] px-[7px] py-[1px] rounded-full font-bold ml-1"
            style={{ background: status === 'online' ? '#d2ecd3' : status === 'busy' ? '#ffe5b3' : '#e0dfe6',
              color: status === 'online' ? '#2c6c3a' : status === 'busy' ? '#7a5320' : '#55526a' }}>
            {activity ? `${activity}中` : STATUS_LABEL[status]}
          </span>
        </div>
        <div className="text-[11.5px] text-[#1c1626]/60 mt-0.5 truncate">
          {location && activity ? `${location} · ${activity}` : activity || '暂无日程'}
        </div>
      </div>
      <button className="bg-[#1c1626] text-white font-semibold text-xs px-3.5 py-2 rounded-full shrink-0 active:scale-95 transition-transform flex items-center gap-1.5"
        onClick={onGoChat}>
        <ChatTeardrop size={14} weight="fill" />去找TA
      </button>
    </div>
    {lastMsg && (
      <div className="mt-2.5 px-3 py-2.5 bg-white/55 border border-white/60 rounded-xl text-[12.5px] leading-relaxed text-[#1c1626] relative pl-5">
        <span className="absolute left-1.5 -top-1 text-2xl text-[#1c1626]/30 font-serif">&ldquo;</span>
        <span className="line-clamp-2">{lastMsg}</span>
        <span className="block text-[11px] text-[#1c1626]/50 font-semibold mt-1">— {char.name}</span>
      </div>
    )}
  </div>
);

// ══════════════════════════════════════════════════════════════
//  Map View
// ══════════════════════════════════════════════════════════════

const MapView: React.FC<{
  world: MapWorld; char: CharacterProfile;
  onBack: () => void; onEdit: () => void;
}> = ({ world, char, onBack, onEdit }) => {
  const { openApp } = useOS();
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);
  const [lastMsg, setLastMsg] = useState<string | undefined>();

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    DB.getDailySchedule(char.id, today).then(s => setSchedule(s)).catch(() => {});
    DB.getRecentMessagesByCharId(char.id, 5).then(msgs => {
      const aiMsg = msgs.find(m => m.role === 'assistant' && m.type === 'text');
      if (aiMsg) setLastMsg(typeof aiMsg.content === 'string' ? aiMsg.content.slice(0, 120) : '');
    }).catch(() => {});
  }, [char.id]);

  const statusResult = useMemo(() => computeCharStatus(schedule), [schedule]);
  const currentSlot = useMemo(() => getCurrentSlot(schedule), [schedule]);

  const matchedRegion = useMemo(() => {
    if (currentSlot?.location) { const m = matchRegion(world, currentSlot.location); if (m) return m; }
    return world.regions.find(r => r.isCharDefault) || world.regions[0];
  }, [world, currentSlot]);

  return (
    <div className="flex flex-col h-full" style={{ background: THEME_BG[world.theme] || THEME_BG.lilac }}>
      <div className="flex items-center gap-2.5 px-4 py-3 shrink-0">
        <button className="w-9 h-9 rounded-xl bg-white/45 border border-white/50 flex items-center justify-center active:scale-92 transition-transform" onClick={onBack}>
          <CaretLeft size={18} weight="bold" />
        </button>
        <div className="flex-1 text-center min-w-0">
          <div className="font-bold text-[17px] tracking-tight truncate">{char.name}</div>
          <div className="text-[11px] text-[#1c1626]/60 mt-0.5">{world.genre} · {world.tag}</div>
        </div>
        <button className="w-9 h-9 rounded-xl bg-white/45 border border-white/50 flex items-center justify-center active:scale-92 transition-transform" onClick={onEdit}>
          <PencilSimple size={16} weight="bold" />
        </button>
      </div>

      <MapCanvas
        className="flex-1 mx-3.5 rounded-[28px]"
        regions={world.regions}
        theme={world.theme}
        charAvatar={char.avatar}
        charName={char.name}
        charRegionId={matchedRegion?.id}
        homeRegionId={world.homeRegionId}
        status={statusResult.status}
      />

      {/* Status bar overlay */}
      <div className="absolute left-7 top-[72px] bg-white/[0.86] rounded-full px-3 py-1.5 flex items-center gap-2 text-[11.5px] font-semibold text-[#1c1626] shadow-[0_4px_14px_rgba(80,60,140,0.10)] z-30">
        <span className="w-2 h-2 rounded-full shadow-[0_0_0_4px_rgba(58,167,99,0.18)]" style={{ background: STATUS_DOT[statusResult.status] }} />
        {char.name} · {statusResult.currentActivity || STATUS_LABEL[statusResult.status]}
      </div>

      <BottomSheet char={char} region={matchedRegion} status={statusResult.status}
        activity={statusResult.currentActivity} location={currentSlot?.location} lastMsg={lastMsg}
        onGoChat={() => openApp(AppID.Chat, { messageWidgetCharId: char.id })} />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  World Editor
// ══════════════════════════════════════════════════════════════

const FormRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between py-3 px-4 border-b border-slate-100 last:border-b-0">
    <span className="text-sm text-slate-600 shrink-0 mr-3">{label}</span>
    <div className="flex-1 text-right">{children}</div>
  </div>
);

const WorldEditor: React.FC<{
  world: MapWorld;
  char: CharacterProfile;
  onSave: (w: MapWorld) => void;
  onDelete?: () => void;
  onBack: () => void;
  isNew?: boolean;
  apiConfig: { baseUrl: string; apiKey: string; model: string };
}> = ({ world: initial, char, onSave, onDelete, onBack, isNew, apiConfig }) => {
  const [w, setW] = useState<MapWorld>({ ...initial });
  const [editingRegion, setEditingRegion] = useState<string | null>(null);
  const [placingRegionId, setPlacingRegionId] = useState<string | null>(null);
  const [importedLocations, setImportedLocations] = useState<{ name: string; emoji: string; keywords: string[] }[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importDone, setImportDone] = useState(false);

  // Use LLM to extract locations from character profile + chat history + schedules
  const handleImportLocations = useCallback(async () => {
    setImportLoading(true);
    try {
      const textParts: string[] = [];
      if (char.description) textParts.push(`[角色简介] ${char.description}`);
      if (char.systemPrompt) textParts.push(`[角色设定] ${char.systemPrompt.slice(0, 3000)}`);
      if (char.worldview) textParts.push(`[世界观] ${char.worldview.slice(0, 2000)}`);
      if (char.mountedWorldbooks) {
        for (const wb of char.mountedWorldbooks) textParts.push(`[世界书: ${wb.title}] ${wb.content.slice(0, 1500)}`);
      }
      try {
        const msgs = await DB.getRecentMessagesByCharId(char.id, 100);
        const chatSnippets = msgs
          .filter(m => typeof m.content === 'string' && m.type === 'text')
          .map(m => (m.content as string).slice(0, 200))
          .join('\n');
        if (chatSnippets) textParts.push(`[近期聊天]\n${chatSnippets.slice(0, 4000)}`);
      } catch {}
      try {
        const today = new Date();
        const schedParts: string[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const sched = await DB.getDailySchedule(char.id, dateStr);
          if (sched?.slots) {
            for (const s of sched.slots) {
              const parts = [s.startTime, s.activity, s.location, s.description].filter(Boolean).join(' ');
              if (parts) schedParts.push(parts);
            }
          }
        }
        if (schedParts.length) textParts.push(`[近7天日程]\n${schedParts.join('\n')}`);
      } catch {}

      const allText = textParts.join('\n\n').slice(0, 12000);
      const resp = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey}` },
        body: JSON.stringify({
          model: apiConfig.model,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: `你是地点提取助手。从下面关于虚构角色"${char.name}"的文本中，提取所有出现过的**具体地点/场所**。

规则：
- 只提取具体的场所名（如"星澜大厦""家""健身房""梧桐苑""露台"），不要提取模糊词（如"这里""那边""外面"）
- 同一个地方的不同说法合并（如"家/卧室/客厅"算同一个地点"家"，但可以把"卧室""客厅"作为 keywords）
- 每个地点给一个合适的 emoji
- 每个地点给出用于匹配日程 location 字段的关键词列表
- 按重要性排序（角色最常出现的地方排前面）

返回 JSON 数组，格式：
[{"name":"地点名","emoji":"🏢","keywords":["关键词1","关键词2"]}]

只返回 JSON，不要其他文字。`,
            },
            { role: 'user', content: allText },
          ],
        }),
      });

      if (!resp.ok) throw new Error('API error');
      const data = await resp.json();
      const raw = data.choices?.[0]?.message?.content || '';
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { name: string; emoji: string; keywords: string[] }[];
        setImportedLocations(parsed.filter((p: any) => p.name && p.emoji));
      }
      setImportDone(true);
    } catch (e) {
      console.error('Location import failed:', e);
      setImportDone(true);
    }
    setImportLoading(false);
  }, [char, apiConfig]);

  const update = (patch: Partial<MapWorld>) => setW(prev => ({ ...prev, ...patch }));
  const updateRegion = (regionId: string, patch: Partial<MapRegion>) => {
    setW(prev => ({
      ...prev,
      regions: prev.regions.map(r => r.id === regionId ? { ...r, ...patch } : r),
    }));
  };

  const addRegionFromImport = (loc: { name: string; emoji: string; keywords: string[] }) => {
    const idx = w.regions.length;
    // Auto-distribute in a circle pattern
    const angle = (idx / Math.max(idx + 1, 6)) * Math.PI * 2 - Math.PI / 2;
    const cx = 50, cy = 50, radius = 30;
    const x = Math.round(cx + Math.cos(angle) * radius);
    const y = Math.round(cy + Math.sin(angle) * radius);
    const newRegion: MapRegion = {
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: loc.name,
      glyph: loc.emoji,
      color: REGION_COLORS[idx % REGION_COLORS.length],
      x: Math.max(10, Math.min(90, x)),
      y: Math.max(10, Math.min(90, y)),
      locationKeys: loc.keywords,
    };
    setW(prev => ({ ...prev, regions: [...prev.regions, newRegion] }));
  };

  const addBlankRegion = () => {
    const idx = w.regions.length;
    const angle = (idx / Math.max(idx + 1, 6)) * Math.PI * 2 - Math.PI / 2;
    const cx = 50, cy = 50, radius = 30;
    const newRegion: MapRegion = {
      id: `r_${Date.now()}`,
      name: `新地点`,
      glyph: '📍',
      color: REGION_COLORS[idx % REGION_COLORS.length],
      x: Math.max(10, Math.min(90, Math.round(cx + Math.cos(angle) * radius))),
      y: Math.max(10, Math.min(90, Math.round(cy + Math.sin(angle) * radius))),
      locationKeys: [],
    };
    setW(prev => ({ ...prev, regions: [...prev.regions, newRegion] }));
    // Auto-enter placing mode for the new region
    setPlacingRegionId(newRegion.id);
  };

  const removeRegion = (id: string) => {
    setW(prev => ({ ...prev, regions: prev.regions.filter(r => r.id !== id) }));
    if (placingRegionId === id) setPlacingRegionId(null);
    if (editingRegion === id) setEditingRegion(null);
  };

  const handleMapTap = useCallback((x: number, y: number) => {
    if (placingRegionId) {
      updateRegion(placingRegionId, { x, y });
      setPlacingRegionId(null);
    }
  }, [placingRegionId]);

  return (
    <div className="flex flex-col h-full" style={{ background: THEME_BG.lilac }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 shrink-0">
        <button className="w-9 h-9 rounded-xl bg-white/45 border border-white/50 flex items-center justify-center active:scale-92 transition-transform" onClick={onBack}>
          <CaretLeft size={18} weight="bold" />
        </button>
        <div className="flex-1 text-center font-bold text-[17px]">{isNew ? '创建世界' : '编辑世界'}</div>
        <button className="w-9 h-9 rounded-xl bg-violet-500 text-white flex items-center justify-center active:scale-92 transition-transform" onClick={() => onSave(w)}>
          <Check size={18} weight="bold" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-8 scrollbar-none">
        {/* Map Preview — interactive positioning */}
        <div className="px-4 mb-4">
          <div className="text-xs font-semibold text-slate-500 mb-2 px-1 flex items-center gap-1.5">
            <MapPin size={12} weight="bold" />
            地图预览
            {placingRegionId && (
              <span className="text-violet-500 animate-pulse ml-1">· 点击放置「{w.regions.find(r => r.id === placingRegionId)?.name}」</span>
            )}
          </div>
          <MapCanvas
            className="rounded-[22px] aspect-square"
            regions={w.regions}
            theme={w.theme}
            highlightRegionId={editingRegion || undefined}
            placingRegionId={placingRegionId || undefined}
            onTapMap={handleMapTap}
            onTapRegion={(id) => {
              if (!placingRegionId) {
                setEditingRegion(editingRegion === id ? null : id);
              }
            }}
          />
          {placingRegionId && (
            <button onClick={() => setPlacingRegionId(null)}
              className="mt-2 w-full py-2 text-center text-sm text-slate-400 font-semibold bg-white/60 rounded-xl active:bg-white/80">
              取消定位
            </button>
          )}
        </div>

        {/* Character info */}
        <div className="flex items-center gap-3 px-4 py-2">
          <img src={char.avatar} className="w-10 h-10 rounded-2xl object-cover shadow-md" />
          <div>
            <div className="font-bold text-[15px]">{char.name}</div>
            <div className="text-[11px] text-slate-400">{w.regions.length} 个地点</div>
          </div>
        </div>

        {/* Basic info */}
        <div className="mx-4 bg-white rounded-2xl shadow-sm mb-4">
          <FormRow label="类型">
            <input value={w.genre} onChange={e => update({ genre: e.target.value })}
              className="text-sm text-right w-full outline-none bg-transparent" placeholder="现代都市 / 校园 / 末世 / ..." />
          </FormRow>
        </div>

        {/* Tag */}
        <div className="px-4 mb-4">
          <div className="text-xs font-semibold text-slate-500 mb-2 px-1">关系</div>
          <div className="flex flex-wrap gap-2">
            {TAG_PRESETS.map(t => (
              <button key={t.tag} onClick={() => update({ tag: t.tag, tagBg: t.bg, tagColor: t.color })}
                className={`text-xs px-3 py-1.5 rounded-full font-bold transition-all ${w.tag === t.tag ? 'ring-2 ring-violet-400 scale-105' : ''}`}
                style={{ background: t.bg, color: t.color }}>
                {t.tag}
              </button>
            ))}
          </div>
        </div>

        {/* Theme */}
        <div className="px-4 mb-4">
          <div className="text-xs font-semibold text-slate-500 mb-2 px-1">主题色</div>
          <div className="flex gap-3">
            {THEMES.map(t => (
              <button key={t.id} onClick={() => update({ theme: t.id })}
                className={`flex flex-col items-center gap-1 transition-transform ${w.theme === t.id ? 'scale-110' : ''}`}>
                <div className={`w-8 h-8 rounded-full border-2 ${w.theme === t.id ? 'border-violet-500' : 'border-white'}`}
                  style={{ background: t.color }} />
                <span className="text-[10px] text-slate-500">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Location Import */}
        <div className="px-4 mb-4">
          <div className="text-xs font-semibold text-slate-500 mb-2 px-1">从记忆导入地点</div>
          <div className="bg-white rounded-2xl shadow-sm p-3">
            {!importDone ? (
              <button onClick={handleImportLocations} disabled={importLoading}
                className="w-full py-2.5 text-center text-sm font-semibold text-violet-500 bg-violet-50 rounded-xl active:bg-violet-100 disabled:opacity-50 transition-colors">
                {importLoading ? '✨ AI 正在扫描聊天记录 + 人设...' : '🔍 AI 扫描记忆中的地名'}
              </button>
            ) : importedLocations.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-2">没有找到地名，可手动添加</div>
            ) : (
              <div>
                <div className="text-[11px] text-slate-400 mb-2">点击添加到地图（添加后可在地图上定位）：</div>
                <div className="flex flex-col gap-1.5">
                  {importedLocations.map(loc => {
                    const alreadyAdded = w.regions.some(r => r.name === loc.name || r.locationKeys?.some(k => loc.keywords.includes(k)));
                    return (
                      <button key={loc.name} disabled={alreadyAdded}
                        onClick={() => addRegionFromImport(loc)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all ${
                          alreadyAdded ? 'bg-slate-50 opacity-40' : 'bg-violet-50 active:bg-violet-100'
                        }`}>
                        <span className="text-base shrink-0">{loc.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold ${alreadyAdded ? 'text-slate-300 line-through' : 'text-violet-700'}`}>{loc.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{loc.keywords.join('、')}</div>
                        </div>
                        {!alreadyAdded && <Plus size={14} weight="bold" className="text-violet-400 shrink-0" />}
                        {alreadyAdded && <Check size={14} weight="bold" className="text-slate-300 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Regions list */}
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-semibold text-slate-500">地点 ({w.regions.length})</span>
            <button onClick={addBlankRegion} className="text-xs text-violet-500 font-semibold flex items-center gap-0.5">
              <Plus size={12} weight="bold" />添加
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {w.regions.map(r => (
              <div key={r.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden transition-all ${
                editingRegion === r.id ? 'ring-2 ring-violet-400' : ''
              }`}>
                <div className="flex items-center gap-2.5 p-3 cursor-pointer" onClick={() => setEditingRegion(editingRegion === r.id ? null : r.id)}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: r.color }}>{r.glyph}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{r.name}</div>
                    <div className="text-[10px] text-slate-400">({r.x}, {r.y}) · {r.locationKeys?.length || 0} 个关键词</div>
                  </div>
                  {r.isHome && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 font-bold">你</span>}
                  {r.isCharDefault && <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 font-bold">TA</span>}
                  {w.regions.length > 1 && (
                    <button onClick={e => { e.stopPropagation(); removeRegion(r.id); }} className="text-slate-300 active:text-rose-400">
                      <Trash size={16} />
                    </button>
                  )}
                </div>

                {/* Expanded edit */}
                {editingRegion === r.id && (
                  <div className="border-t border-slate-100 p-3 space-y-2.5">
                    <div className="flex gap-2">
                      <input value={r.glyph} onChange={e => updateRegion(r.id, { glyph: e.target.value.slice(0, 2) })}
                        className="w-10 text-center text-base bg-slate-50 rounded-lg p-1 outline-none" />
                      <input value={r.name} onChange={e => updateRegion(r.id, { name: e.target.value })}
                        className="flex-1 text-sm bg-slate-50 rounded-lg px-2 py-1 outline-none" placeholder="地点名" />
                    </div>

                    {/* Position button */}
                    <button onClick={() => setPlacingRegionId(r.id)}
                      className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-colors ${
                        placingRegionId === r.id
                          ? 'bg-violet-500 text-white'
                          : 'bg-violet-50 text-violet-600 active:bg-violet-100'
                      }`}>
                      <Crosshair size={14} weight="bold" />
                      {placingRegionId === r.id ? '点击地图放置...' : '在地图上定位'}
                    </button>

                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">位置关键词（逗号分隔，匹配日程 location）</div>
                      <input value={(r.locationKeys || []).join(', ')}
                        onChange={e => updateRegion(r.id, { locationKeys: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) })}
                        className="w-full text-xs bg-slate-50 rounded-lg px-2 py-1.5 outline-none" placeholder="公司, 会议室, 星澜" />
                    </div>
                    <div className="flex gap-2">
                      <div className="text-[10px] text-slate-400 mt-1 shrink-0">颜色</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {REGION_COLORS.map(c => (
                          <button key={c} onClick={() => updateRegion(r.id, { color: c })}
                            className={`w-5 h-5 rounded-full border-2 ${r.color === c ? 'border-violet-500 scale-110' : 'border-transparent'}`}
                            style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        // Clear other isCharDefault, set this one
                        setW(prev => ({
                          ...prev,
                          regions: prev.regions.map(reg => ({ ...reg, isCharDefault: reg.id === r.id })),
                        }));
                      }}
                        className={`text-[10px] px-2 py-1 rounded-full font-bold ${r.isCharDefault ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        TA的默认位
                      </button>
                      <button onClick={() => {
                        setW(prev => ({
                          ...prev,
                          regions: prev.regions.map(reg => ({ ...reg, isHome: reg.id === r.id })),
                          homeRegionId: r.id,
                        }));
                      }}
                        className={`text-[10px] px-2 py-1 rounded-full font-bold ${r.isHome ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        你的默认位
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Delete world */}
        {!isNew && onDelete && (
          <div className="px-4 mt-4">
            <button onClick={onDelete} className="w-full py-3 text-center text-sm text-rose-400 font-semibold bg-white rounded-2xl shadow-sm active:bg-rose-50">
              删除这个世界
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  World Card (Shelf item — with world)
// ══════════════════════════════════════════════════════════════

const WorldCard: React.FC<{
  world: MapWorld; char: CharacterProfile; status: CharAvailability; activity?: string; onClick: () => void;
}> = ({ world, char, status, activity, onClick }) => {
  const colors = world.regions.slice(0, 3).map(r => r.color);
  return (
    <div className="relative rounded-[22px] overflow-hidden p-3.5 border border-white/70 shadow-[0_10px_26px_rgba(80,60,140,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] cursor-pointer active:scale-[0.985] transition-transform" onClick={onClick}>
      <div className="absolute inset-0 pointer-events-none">
        <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="w-full h-full opacity-95">
          <circle cx={world.regions[0]?.x ?? 40} cy={world.regions[0]?.y ?? 40} r="35" fill={colors[0] || '#ddd'} opacity="0.6" />
          <circle cx={world.regions[1]?.x ? world.regions[1].x * 2 : 130} cy={world.regions[1]?.y ?? 50} r="30" fill={colors[1] || '#eee'} opacity="0.6" />
          {colors[2] && <circle cx={world.regions[2]?.x ? world.regions[2].x * 1.5 : 80} cy="70" r="25" fill={colors[2]} opacity="0.6" />}
        </svg>
      </div>
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[4px]" />
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-[52px] h-[52px] rounded-[18px] bg-white p-[3px] shadow-[0_6px_14px_rgba(20,10,40,0.18)] shrink-0">
            <img src={char.avatar} className="w-full h-full rounded-[16px] object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[17px] font-bold tracking-tight text-[#1c1626]">{char.name}</span>
              <span className="text-[9.5px] px-[7px] py-[1px] rounded-full font-bold" style={{ background: world.tagBg, color: world.tagColor }}>{world.tag}</span>
            </div>
            <div className="text-[11.5px] text-[#1c1626]/60 mt-0.5">{world.genre} · {world.regions.length} 个地点</div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2.5 text-[11px] text-[#1c1626]/60">
          <span className="bg-white/65 px-2.5 py-1 rounded-full border border-white/50">
            <b className="text-[#1c1626]">{char.name}</b> · {activity ? `${activity}中` : STATUS_LABEL[status]}
          </span>
          <span className="flex-1" />
          <span className="bg-[#1c1626] text-white font-bold text-[11.5px] px-3 py-1.5 rounded-full">进入 →</span>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  Character Row (Shelf item — without world)
// ══════════════════════════════════════════════════════════════

const CharRow: React.FC<{
  char: CharacterProfile; status: CharAvailability; activity?: string;
  onCreateWorld: () => void; onGoChat: () => void;
}> = ({ char, status, activity, onCreateWorld, onGoChat }) => (
  <div className="flex items-center gap-3 bg-white/60 rounded-2xl p-3 border border-white/50">
    <img src={char.avatar} className="w-10 h-10 rounded-full object-cover shrink-0 shadow-sm" />
    <div className="flex-1 min-w-0">
      <div className="text-[14px] font-bold text-[#1c1626] flex items-center gap-1.5">
        {char.name}
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: STATUS_DOT[status] }} />
      </div>
      <div className="text-[11px] text-[#1c1626]/50 truncate">{activity || STATUS_LABEL[status]}</div>
    </div>
    <button onClick={onCreateWorld} className="text-[11px] text-violet-500 font-bold px-2.5 py-1.5 rounded-full bg-violet-50 active:bg-violet-100 shrink-0">
      创建世界
    </button>
    <button onClick={onGoChat} className="text-[11px] text-slate-400 font-semibold px-2 py-1.5 rounded-full bg-slate-50 active:bg-slate-100 shrink-0">
      聊天
    </button>
  </div>
);

// ══════════════════════════════════════════════════════════════
//  Shelf — All Characters
// ══════════════════════════════════════════════════════════════

const Shelf: React.FC<{
  worlds: MapWorld[];
  characters: CharacterProfile[];
  schedules: Record<string, DailySchedule | null>;
  onOpenWorld: (worldId: string) => void;
  onCreateWorld: (charId: string) => void;
  onGoChat: (charId: string) => void;
}> = ({ worlds, characters, schedules, onOpenWorld, onCreateWorld, onGoChat }) => {
  const { closeApp } = useOS();
  const charsWithWorld = new Set(worlds.map(w => w.charId));
  const charsWithout = characters.filter(c => !charsWithWorld.has(c.id));

  return (
    <div className="flex flex-col h-full" style={{ background: THEME_BG.lilac }}>
      <div className="flex items-center gap-2.5 px-4 py-3 shrink-0">
        <button className="w-9 h-9 rounded-xl bg-white/45 border border-white/50 flex items-center justify-center active:scale-92 transition-transform" onClick={() => closeApp()}>
          <CaretLeft size={18} weight="bold" />
        </button>
        <div className="flex-1" />
      </div>

      <div className="px-5 pb-3 shrink-0">
        <h2 className="text-2xl font-bold tracking-tight text-[#1c1626]">彼此的世界</h2>
        <p className="text-[12.5px] text-[#1c1626]/60 mt-1">你和他们各自的生活 · 每个人有自己的小世界</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-3 scrollbar-none">
        {worlds.map(w => {
          const char = characters.find(c => c.id === w.charId);
          if (!char) return null;
          const sr = computeCharStatus(schedules[w.charId] || null);
          return <WorldCard key={w.id} world={w} char={char} status={sr.status} activity={sr.currentActivity} onClick={() => onOpenWorld(w.id)} />;
        })}

        {worlds.length > 0 && charsWithout.length > 0 && (
          <div className="text-[11px] text-[#1c1626]/40 font-semibold px-1 pt-2 tracking-wide">其他角色</div>
        )}

        {charsWithout.map(c => {
          const sr = computeCharStatus(schedules[c.id] || null);
          return <CharRow key={c.id} char={c} status={sr.status} activity={sr.currentActivity}
            onCreateWorld={() => onCreateWorld(c.id)} onGoChat={() => onGoChat(c.id)} />;
        })}

        {characters.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🗺️</div>
            <div className="text-sm text-[#1c1626]/40">还没有角色</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  MapApp — Root
// ══════════════════════════════════════════════════════════════

type View =
  | { type: 'shelf' }
  | { type: 'map'; worldId: string }
  | { type: 'editor'; worldId: string; isNew: boolean }
  | { type: 'create'; charId: string };

export default function MapApp() {
  const { characters, openApp, apiConfig } = useOS();
  const [view, setView] = useState<View>({ type: 'shelf' });
  const [worlds, setWorlds] = useState<MapWorld[]>([]);
  const [schedules, setSchedules] = useState<Record<string, DailySchedule | null>>({});
  const [loaded, setLoaded] = useState(false);

  // Load worlds from DB, seed default if empty
  useEffect(() => {
    (async () => {
      let stored = await MapDB.getAll().catch(() => [] as MapWorld[]);

      // Seed default 陈照 world if first run
      if (stored.length === 0) {
        const char = characters.find(c => c.name.includes(SEED_WORLD.charNameMatch));
        if (char) {
          const seeded: MapWorld = { ...SEED_WORLD, charId: char.id };
          await MapDB.save(seeded).catch(() => {});
          stored = [seeded];
        }
      }

      setWorlds(stored);
      setLoaded(true);
    })();
  }, [characters]);

  // Load schedules for all characters
  useEffect(() => {
    if (characters.length === 0) return;
    const today = new Date().toISOString().split('T')[0];
    (async () => {
      const result: Record<string, DailySchedule | null> = {};
      for (const c of characters) {
        try { result[c.id] = await DB.getDailySchedule(c.id, today); } catch { result[c.id] = null; }
      }
      setSchedules(result);
    })();
  }, [characters]);

  const handleSaveWorld = useCallback(async (w: MapWorld) => {
    await MapDB.save(w);
    setWorlds(prev => {
      const idx = prev.findIndex(p => p.id === w.id);
      return idx >= 0 ? prev.map((p, i) => i === idx ? w : p) : [...prev, w];
    });
    setView({ type: 'map', worldId: w.id });
  }, []);

  const handleDeleteWorld = useCallback(async (id: string) => {
    await MapDB.remove(id);
    setWorlds(prev => prev.filter(w => w.id !== id));
    setView({ type: 'shelf' });
  }, []);

  const handleCreateWorld = useCallback((charId: string) => {
    setView({ type: 'create', charId });
  }, []);

  if (!loaded) return null;

  // ─── Create new world ───
  if (view.type === 'create') {
    const char = characters.find(c => c.id === view.charId);
    if (!char) { setView({ type: 'shelf' }); return null; }
    const newWorld: MapWorld = {
      id: `world_${Date.now()}`,
      charId: char.id,
      genre: '',
      tag: '朋友',
      tagColor: '#6b5230',
      tagBg: '#f1e5c8',
      theme: 'lilac',
      regions: [], // start empty — user imports from memory or adds manually
      homeRegionId: undefined,
    };
    return <WorldEditor world={newWorld} char={char} isNew apiConfig={apiConfig} onSave={handleSaveWorld} onBack={() => setView({ type: 'shelf' })} />;
  }

  // ─── Edit existing world ───
  if (view.type === 'editor') {
    const world = worlds.find(w => w.id === view.worldId);
    const char = world ? characters.find(c => c.id === world.charId) : undefined;
    if (!world || !char) { setView({ type: 'shelf' }); return null; }
    return <WorldEditor world={world} char={char} apiConfig={apiConfig} onSave={handleSaveWorld} onDelete={() => handleDeleteWorld(world.id)} onBack={() => setView({ type: 'map', worldId: world.id })} />;
  }

  // ─── Map view ───
  if (view.type === 'map') {
    const world = worlds.find(w => w.id === view.worldId);
    const char = world ? characters.find(c => c.id === world.charId) : undefined;
    if (!world || !char) { setView({ type: 'shelf' }); return null; }
    return <MapView world={world} char={char} onBack={() => setView({ type: 'shelf' })} onEdit={() => setView({ type: 'editor', worldId: world.id, isNew: false })} />;
  }

  // ─── Shelf ───
  return (
    <Shelf worlds={worlds} characters={characters} schedules={schedules}
      onOpenWorld={id => setView({ type: 'map', worldId: id })}
      onCreateWorld={handleCreateWorld}
      onGoChat={charId => openApp(AppID.Chat, { messageWidgetCharId: charId })} />
  );
}

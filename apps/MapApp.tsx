/**
 * MapApp.tsx — 地图系统（可编辑版）
 *
 * EM 独有功能。角色按日程 slot.location 在自定义地图上移动。
 * 世界配置存 IndexedDB，用户可增删改。
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CaretLeft, ChatTeardrop, Plus, Trash, PencilSimple, Check, X } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { AppID, CharacterProfile, DailySchedule, ScheduleSlot } from '../types';
import { DB } from '../utils/db';
import { computeCharStatus, CharAvailability } from '../utils/charStatus';

// ══════════════════════════════════════════════════════════════
//  Types
// ══════════════════════════════════════════════════════════════

interface MapRegion {
  id: string;
  en: string;
  name: string;
  glyph: string;
  color: string;
  blob: string;
  labelX: number;
  labelY: number;
  pin?: { x: string; y: string; target?: string; me?: boolean };
  locationKeys?: string[];
}

type MapTheme = 'lilac' | 'peach' | 'mint' | 'dusk' | 'rainbow';

interface MapWorld {
  id: string;
  charId: string;
  title: string;
  genre: string;
  role: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  theme: MapTheme;
  regions: MapRegion[];
  paths: string[];
  homeRegionId?: string;
}

// ══════════════════════════════════════════════════════════════
//  IndexedDB — Map worlds storage
// ══════════════════════════════════════════════════════════════

const MAP_DB = 'SullyEM_Map';
const MAP_DB_VER = 1;
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

const TEMPLATE_REGIONS: MapRegion[] = [
  {
    id: 'r1', en: 'AREA 01', name: '主要区域', glyph: '🏢', color: '#cfdcef',
    blob: 'M30 50 q 30 -22 80 -10 t 70 35 q 10 30 -20 50 t -90 5 q -50 -15 -40 -80z',
    labelX: 40, labelY: 62, pin: { x: '30%', y: '30%', target: 'char' }, locationKeys: [],
  },
  {
    id: 'r2', en: 'AREA 02', name: '你的地方', glyph: '🏠', color: '#ddd2ec',
    blob: 'M35 250 q 25 -22 80 -15 t 60 35 q 5 30 -35 50 t -90 -5 q -32 -25 -15 -65z',
    labelX: 45, labelY: 262, pin: { x: '25%', y: '68%', me: true }, locationKeys: [],
  },
  {
    id: 'r3', en: 'AREA 03', name: '其他地方', glyph: '☕', color: '#f4d7c2',
    blob: 'M210 200 q 60 -10 110 25 q 30 30 5 70 t -90 18 q -50 -15 -55 -55 t 30 -58z',
    labelX: 225, labelY: 212, locationKeys: [],
  },
];
const TEMPLATE_PATHS = ['M110 90 Q 200 160 250 230', 'M120 280 Q 200 250 250 240'];

const SEED_WORLD: Omit<MapWorld, 'charId'> & { charNameMatch: string } = {
  id: 'chenzhao_default',
  charNameMatch: '陈照',
  title: '星澜的他',
  genre: '现代都市',
  role: '你 -> 他的女友',
  tag: '同居',
  tagColor: '#8a3251',
  tagBg: '#ffd7e1',
  theme: 'lilac',
  homeRegionId: 'home',
  regions: [
    { id: 'office', en: 'OFFICE', name: '星澜大厦', glyph: '🏢', color: '#cfdcef',
      blob: 'M30 50 q 30 -22 80 -10 t 70 35 q 10 30 -20 50 t -90 5 q -50 -15 -40 -80z',
      labelX: 40, labelY: 62, pin: { x: '30%', y: '30%', target: 'char' },
      locationKeys: ['公司', '会议室', '星澜', '办公', '大厦'] },
    { id: 'home', en: 'HOME', name: '你们的家', glyph: '🏠', color: '#ddd2ec',
      blob: 'M35 250 q 25 -22 80 -15 t 60 35 q 5 30 -35 50 t -90 -5 q -32 -25 -15 -65z',
      labelX: 45, labelY: 262, pin: { x: '25%', y: '68%', me: true },
      locationKeys: ['家', '卧室', '客厅', '厨房'] },
    { id: 'dinner', en: 'DINNER', name: '街角餐厅', glyph: '🍷', color: '#f4d7c2',
      blob: 'M210 200 q 60 -10 110 25 q 30 30 5 70 t -90 18 q -50 -15 -55 -55 t 30 -58z',
      labelX: 225, labelY: 212,
      locationKeys: ['餐厅', '吃饭', '晚餐', '约会'] },
  ],
  paths: ['M110 90 Q 200 160 250 230', 'M120 280 Q 200 250 250 240'],
};

const THEMES: { id: MapTheme; label: string; color: string }[] = [
  { id: 'lilac', label: '紫雾', color: '#d8d2e8' },
  { id: 'peach', label: '蜜桃', color: '#f3dccc' },
  { id: 'mint', label: '薄荷', color: '#cee2d2' },
  { id: 'dusk', label: '暮色', color: '#b4b6cf' },
  { id: 'rainbow', label: '彩虹', color: '#efd0db' },
];

const TAG_PRESETS = [
  { tag: '同居', bg: '#ffd7e1', color: '#8a3251' },
  { tag: '暧昧', bg: '#ffe5b3', color: '#7a5320' },
  { tag: '校园', bg: '#d2ecd3', color: '#2c6c3a' },
  { tag: '末世', bg: '#d6e7ff', color: '#284a82' },
  { tag: '同事', bg: '#ddd2ec', color: '#5b4a8a' },
  { tag: '朋友', bg: '#f1e5c8', color: '#6b5230' },
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

// ══════════════════════════════════════════════════════════════
//  Pin Components
// ══════════════════════════════════════════════════════════════

const CharPin: React.FC<{
  name: string; avatar: string; x: string; y: string;
  status: CharAvailability; active: boolean; onClick: () => void;
}> = ({ name, avatar, x, y, status, active, onClick }) => (
  <div className="absolute -translate-x-1/2 -translate-y-full cursor-pointer select-none transition-transform hover:scale-105"
    style={{ left: x, top: y }} onClick={onClick}>
    <div className={`w-11 h-11 rounded-full bg-white p-[3px] transition-shadow ${
      active ? 'shadow-[0_0_0_3px_#6f5cd9,0_8px_18px_rgba(111,92,217,0.4)]' : 'shadow-[0_6px_14px_rgba(20,10,40,0.22)]'}`}>
      <img src={avatar} className="w-full h-full rounded-full object-cover" />
    </div>
    <div className="absolute -right-0.5 top-0 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ background: STATUS_DOT[status] }} />
    <div className="w-3 h-3 bg-white mx-auto -mt-[7px] rotate-45 rounded-sm shadow-[3px_3px_6px_rgba(20,10,40,0.14)]" />
    <div className="absolute left-1/2 top-full -translate-x-1/2 mt-1.5 bg-[rgba(28,22,38,0.82)] text-white text-[10.5px] font-semibold px-2 py-[3px] rounded-full whitespace-nowrap">
      {name}
    </div>
  </div>
);

const MePin: React.FC<{ x: string; y: string }> = ({ x, y }) => (
  <div className="absolute -translate-x-1/2 -translate-y-full select-none" style={{ left: x, top: y }}>
    <div className="w-11 h-11 rounded-full p-[3px] animate-pulse"
      style={{ background: '#6f5cd9', boxShadow: '0 0 0 4px rgba(111,92,217,0.20), 0 6px 14px rgba(111,92,217,0.45)' }}>
      <div className="w-full h-full rounded-full flex items-center justify-center text-white text-[13px] font-bold" style={{ background: '#6f5cd9' }}>你</div>
    </div>
    <div className="w-3 h-3 mx-auto -mt-[7px] rotate-45 rounded-sm" style={{ background: '#6f5cd9', boxShadow: '3px 3px 6px rgba(111,92,217,0.45)' }} />
    <div className="absolute left-1/2 top-full -translate-x-1/2 mt-1.5 text-white text-[10.5px] font-semibold px-2 py-[3px] rounded-full whitespace-nowrap" style={{ background: '#6f5cd9' }}>你在这里</div>
  </div>
);

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
    return world.regions.find(r => r.id === world.homeRegionId) || world.regions.find(r => r.pin?.target === 'char');
  }, [world, currentSlot]);

  const charPinPos = useMemo(() => {
    if (matchedRegion?.pin) return { x: matchedRegion.pin.x, y: matchedRegion.pin.y };
    const r = world.regions.find(r => r.pin?.target === 'char');
    return r?.pin ? { x: r.pin.x, y: r.pin.y } : { x: '50%', y: '50%' };
  }, [matchedRegion, world]);

  const mePinRegion = world.regions.find(r => r.pin?.me);

  return (
    <div className="flex flex-col h-full" style={{ background: THEME_BG[world.theme] || THEME_BG.lilac }}>
      <div className="flex items-center gap-2.5 px-4 py-3 shrink-0">
        <button className="w-9 h-9 rounded-xl bg-white/45 border border-white/50 flex items-center justify-center active:scale-92 transition-transform" onClick={onBack}>
          <CaretLeft size={18} weight="bold" />
        </button>
        <div className="flex-1 text-center min-w-0">
          <div className="font-bold text-[17px] tracking-tight truncate">{world.title}</div>
          <div className="text-[11px] text-[#1c1626]/60 mt-0.5">{world.genre} · {world.role}</div>
        </div>
        <button className="w-9 h-9 rounded-xl bg-white/45 border border-white/50 flex items-center justify-center active:scale-92 transition-transform" onClick={onEdit}>
          <PencilSimple size={16} weight="bold" />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden mx-3.5 rounded-[28px] bg-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_22px_rgba(80,60,140,0.08)]">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 365 440" preserveAspectRatio="xMidYMid slice">
          <defs><filter id="mapSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0.6" /></filter></defs>
          <g stroke="rgba(28,22,38,0.10)" strokeWidth="1.2" strokeDasharray="3 5" fill="none">
            {world.paths.map((d, i) => <path key={i} d={d} />)}
          </g>
          <g filter="url(#mapSoft)">
            {world.regions.map(r => <path key={r.id} d={r.blob} fill={r.color} opacity="0.92" />)}
          </g>
          <g>
            {world.regions.map(r => (
              <React.Fragment key={r.id + '-lbl'}>
                <text x={r.labelX} y={r.labelY} style={{ fontFamily: 'Inter,sans-serif', fontSize: '8px', fontWeight: 600, fill: 'rgba(28,22,38,0.32)', letterSpacing: '0.18em' }}>{r.en}</text>
                <text x={r.labelX} y={r.labelY + 18} style={{ fontFamily: 'Noto Sans SC,sans-serif', fontSize: '11px', fontWeight: 600, fill: 'rgba(28,22,38,0.55)', letterSpacing: '0.05em' }}>{r.name}</text>
              </React.Fragment>
            ))}
          </g>
        </svg>

        <div className="absolute left-3 top-3 bg-white/[0.86] rounded-full px-3 py-1.5 flex items-center gap-2 text-[11.5px] font-semibold text-[#1c1626] shadow-[0_4px_14px_rgba(80,60,140,0.10)]">
          <span className="w-2 h-2 rounded-full shadow-[0_0_0_4px_rgba(58,167,99,0.18)]" style={{ background: STATUS_DOT[statusResult.status] }} />
          {char.name} · {statusResult.currentActivity || STATUS_LABEL[statusResult.status]}
        </div>

        <CharPin name={char.name} avatar={char.avatar} x={charPinPos.x} y={charPinPos.y}
          status={statusResult.status} active={true} onClick={() => {}} />
        {mePinRegion?.pin && <MePin x={mePinRegion.pin.x} y={mePinRegion.pin.y} />}
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
}> = ({ world: initial, char, onSave, onDelete, onBack, isNew }) => {
  const [w, setW] = useState<MapWorld>({ ...initial });
  const [editingRegion, setEditingRegion] = useState<string | null>(null);

  const update = (patch: Partial<MapWorld>) => setW(prev => ({ ...prev, ...patch }));
  const updateRegion = (regionId: string, patch: Partial<MapRegion>) => {
    setW(prev => ({
      ...prev,
      regions: prev.regions.map(r => r.id === regionId ? { ...r, ...patch } : r),
    }));
  };

  const addRegion = () => {
    const idx = w.regions.length + 1;
    const extraBlobs = [
      'M200 40 q 40 -15 90 10 t 50 50 q 0 30 -40 40 t -80 -10 q -35 -20 -20 -90z',
      'M30 160 q 25 -20 75 -10 t 65 30 q 10 25 -15 45 t -80 5 q -45 -15 -45 -70z',
      'M220 140 q 50 -12 95 20 q 25 25 5 55 t -80 15 q -50 -10 -50 -45 t 30 -45z',
    ];
    const newRegion: MapRegion = {
      id: `r_${Date.now()}`,
      en: `AREA ${String(idx).padStart(2, '0')}`,
      name: `新区域 ${idx}`,
      glyph: '📍',
      color: REGION_COLORS[(idx - 1) % REGION_COLORS.length],
      blob: extraBlobs[(idx - 1) % extraBlobs.length],
      labelX: 120 + (idx % 2) * 100,
      labelY: 100 + Math.floor(idx / 2) * 120,
      locationKeys: [],
    };
    setW(prev => ({ ...prev, regions: [...prev.regions, newRegion] }));
  };

  const removeRegion = (id: string) => {
    setW(prev => ({ ...prev, regions: prev.regions.filter(r => r.id !== id) }));
  };

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
        {/* Character info */}
        <div className="flex items-center gap-3 px-4 py-3">
          <img src={char.avatar} className="w-12 h-12 rounded-2xl object-cover shadow-md" />
          <div>
            <div className="font-bold text-[15px]">{char.name}</div>
            <div className="text-[11px] text-slate-400">这个世界属于 {char.name}</div>
          </div>
        </div>

        {/* Basic info */}
        <div className="mx-4 bg-white rounded-2xl shadow-sm mb-4">
          <FormRow label="标题">
            <input value={w.title} onChange={e => update({ title: e.target.value })}
              className="text-sm text-right w-full outline-none bg-transparent" placeholder="世界标题" />
          </FormRow>
          <FormRow label="类型">
            <input value={w.genre} onChange={e => update({ genre: e.target.value })}
              className="text-sm text-right w-full outline-none bg-transparent" placeholder="现代都市 / 校园 / ..." />
          </FormRow>
          <FormRow label="你的角色">
            <input value={w.role} onChange={e => update({ role: e.target.value })}
              className="text-sm text-right w-full outline-none bg-transparent" placeholder="你 -> 他的女友" />
          </FormRow>
        </div>

        {/* Tag */}
        <div className="px-4 mb-4">
          <div className="text-xs font-semibold text-slate-500 mb-2 px-1">标签</div>
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

        {/* Regions */}
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-semibold text-slate-500">区域 ({w.regions.length})</span>
            <button onClick={addRegion} className="text-xs text-violet-500 font-semibold flex items-center gap-0.5">
              <Plus size={12} weight="bold" />添加
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {w.regions.map(r => (
              <div key={r.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-2.5 p-3 cursor-pointer" onClick={() => setEditingRegion(editingRegion === r.id ? null : r.id)}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: r.color }}>{r.glyph}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{r.name}</div>
                    <div className="text-[10px] text-slate-400">{r.en} · {r.locationKeys?.length || 0} 个关键词</div>
                  </div>
                  {r.pin?.target === 'char' && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 font-bold">角色</span>}
                  {r.pin?.me && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 font-bold">你</span>}
                  {w.regions.length > 1 && (
                    <button onClick={e => { e.stopPropagation(); removeRegion(r.id); }} className="text-slate-300 active:text-rose-400">
                      <Trash size={16} />
                    </button>
                  )}
                </div>

                {/* Expanded edit */}
                {editingRegion === r.id && (
                  <div className="border-t border-slate-100 p-3 space-y-2">
                    <div className="flex gap-2">
                      <input value={r.glyph} onChange={e => updateRegion(r.id, { glyph: e.target.value.slice(0, 2) })}
                        className="w-10 text-center text-base bg-slate-50 rounded-lg p-1 outline-none" />
                      <input value={r.name} onChange={e => updateRegion(r.id, { name: e.target.value })}
                        className="flex-1 text-sm bg-slate-50 rounded-lg px-2 py-1 outline-none" placeholder="区域名" />
                    </div>
                    <input value={r.en} onChange={e => updateRegion(r.id, { en: e.target.value })}
                      className="w-full text-xs bg-slate-50 rounded-lg px-2 py-1 outline-none text-slate-400" placeholder="英文标签（如 OFFICE）" />
                    <div>
                      <div className="text-[10px] text-slate-400 mb-1">位置关键词（逗号分隔，用于匹配日程 location）</div>
                      <input value={(r.locationKeys || []).join(', ')}
                        onChange={e => updateRegion(r.id, { locationKeys: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) })}
                        className="w-full text-xs bg-slate-50 rounded-lg px-2 py-1.5 outline-none" placeholder="公司, 会议室, 星澜" />
                    </div>
                    <div className="flex gap-2">
                      <div className="text-[10px] text-slate-400 mt-1">颜色</div>
                      <div className="flex gap-1.5 flex-wrap">
                        {REGION_COLORS.map(c => (
                          <button key={c} onClick={() => updateRegion(r.id, { color: c })}
                            className={`w-5 h-5 rounded-full border-2 ${r.color === c ? 'border-violet-500 scale-110' : 'border-transparent'}`}
                            style={{ background: c }} />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => updateRegion(r.id, { pin: { x: r.pin?.x || '50%', y: r.pin?.y || '50%', target: 'char' } })}
                        className={`text-[10px] px-2 py-1 rounded-full font-bold ${r.pin?.target === 'char' ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        角色默认位
                      </button>
                      <button onClick={() => updateRegion(r.id, { pin: { x: r.pin?.x || '50%', y: r.pin?.y || '50%', me: true } })}
                        className={`text-[10px] px-2 py-1 rounded-full font-bold ${r.pin?.me ? 'bg-violet-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        你的位置
                      </button>
                      <button onClick={() => updateRegion(r.id, { pin: undefined })}
                        className={`text-[10px] px-2 py-1 rounded-full font-bold ${!r.pin ? 'bg-slate-300 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        无 pin
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
          <path d="M-5 30 q 30 -25 80 -15 t 70 25 q 20 25 -10 45 t -90 5 q -50 -10 -50 -60z" fill={colors[0] || '#ddd'} opacity="0.85" />
          <path d="M90 -10 q 60 -5 110 25 q 25 25 5 50 t -90 8 q -45 -10 -55 -45 t 30 -38z" fill={colors[1] || '#eee'} opacity="0.85" />
          {colors[2] && <path d="M40 60 q 30 -10 80 0 t 80 30 q -5 25 -50 30 t -100 -10 q -30 -15 -10 -50z" fill={colors[2]} opacity="0.85" />}
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
              <span className="text-[17px] font-bold tracking-tight text-[#1c1626]">{world.title}</span>
              <span className="text-[9.5px] px-[7px] py-[1px] rounded-full font-bold" style={{ background: world.tagBg, color: world.tagColor }}>{world.tag}</span>
            </div>
            <div className="text-[11.5px] text-[#1c1626]/60 mt-0.5">{world.genre} · <b className="text-[#1c1626] font-bold">{world.role}</b></div>
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
        {/* Characters WITH worlds */}
        {worlds.map(w => {
          const char = characters.find(c => c.id === w.charId);
          if (!char) return null;
          const sr = computeCharStatus(schedules[w.charId] || null);
          return <WorldCard key={w.id} world={w} char={char} status={sr.status} activity={sr.currentActivity} onClick={() => onOpenWorld(w.id)} />;
        })}

        {/* Divider */}
        {worlds.length > 0 && charsWithout.length > 0 && (
          <div className="text-[11px] text-[#1c1626]/40 font-semibold px-1 pt-2 tracking-wide">其他角色</div>
        )}

        {/* Characters WITHOUT worlds */}
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
  const { characters, openApp } = useOS();
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
      title: `${char.name}的世界`,
      genre: '',
      role: '',
      tag: '朋友',
      tagColor: '#6b5230',
      tagBg: '#f1e5c8',
      theme: 'lilac',
      regions: TEMPLATE_REGIONS.map(r => ({ ...r, id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })),
      paths: [...TEMPLATE_PATHS],
      homeRegionId: undefined,
    };
    return <WorldEditor world={newWorld} char={char} isNew onSave={handleSaveWorld} onBack={() => setView({ type: 'shelf' })} />;
  }

  // ─── Edit existing world ───
  if (view.type === 'editor') {
    const world = worlds.find(w => w.id === view.worldId);
    const char = world ? characters.find(c => c.id === world.charId) : undefined;
    if (!world || !char) { setView({ type: 'shelf' }); return null; }
    return <WorldEditor world={world} char={char} onSave={handleSaveWorld} onDelete={() => handleDeleteWorld(world.id)} onBack={() => setView({ type: 'map', worldId: world.id })} />;
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

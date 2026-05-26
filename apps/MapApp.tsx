/**
 * MapApp.tsx — 地图系统
 *
 * EM 独有功能。角色按日程 slot 的 location 字段在自定义地图上移动。
 * 原型：/Tavern/mapsystem/
 *
 * 视图：书架（世界列表）→ 地图（SVG 区域 + pins）→ 底部抽屉（角色详情）
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CaretLeft, ChatTeardrop } from '@phosphor-icons/react';
import { useOS } from '../context/OSContext';
import { AppID, CharacterProfile, DailySchedule, ScheduleSlot } from '../types';
import { DB } from '../utils/db';
import { computeCharStatus, CharAvailability } from '../utils/charStatus';

// ══════════════════════════════════════════════════════════════
//  World Config Types
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

interface MapWorld {
  id: string;
  charId: string;       // 运行时填充
  charNameMatch: string; // 用角色名匹配（支持部分匹配）
  title: string;
  genre: string;
  role: string;
  tag: string;
  tagColor: string;
  tagBg: string;
  theme: 'lilac' | 'peach' | 'mint' | 'dusk' | 'rainbow';
  regions: MapRegion[];
  paths: string[];
  homeRegionId?: string;
}

// ══════════════════════════════════════════════════════════════
//  World Configs — 每个角色的世界地图
//  只需在这里加新 world，其余代码自动联动
// ══════════════════════════════════════════════════════════════

const MAP_WORLDS: Omit<MapWorld, 'charId'>[] = [
  {
    id: 'chenzhao',
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
      {
        id: 'office', en: 'OFFICE', name: '星澜大厦', glyph: '🏢',
        color: '#cfdcef',
        blob: 'M30 50 q 30 -22 80 -10 t 70 35 q 10 30 -20 50 t -90 5 q -50 -15 -40 -80z',
        labelX: 40, labelY: 62,
        pin: { x: '30%', y: '30%', target: 'char' },
        locationKeys: ['公司', '会议室', '星澜', '办公', '大厦'],
      },
      {
        id: 'home', en: 'HOME', name: '你们的家', glyph: '🏠',
        color: '#ddd2ec',
        blob: 'M35 250 q 25 -22 80 -15 t 60 35 q 5 30 -35 50 t -90 -5 q -32 -25 -15 -65z',
        labelX: 45, labelY: 262,
        pin: { x: '25%', y: '68%', me: true },
        locationKeys: ['家', '卧室', '客厅', '厨房'],
      },
      {
        id: 'dinner', en: 'DINNER', name: '街角餐厅', glyph: '🍷',
        color: '#f4d7c2',
        blob: 'M210 200 q 60 -10 110 25 q 30 30 5 70 t -90 18 q -50 -15 -55 -55 t 30 -58z',
        labelX: 225, labelY: 212,
        locationKeys: ['餐厅', '吃饭', '晚餐', '约会'],
      },
    ],
    paths: ['M110 90 Q 200 160 250 230', 'M120 280 Q 200 250 250 240'],
  },
];

// ══════════════════════════════════════════════════════════════
//  Helper: 根据 slot.location 匹配区域
// ══════════════════════════════════════════════════════════════

function matchRegion(world: MapWorld, location?: string): MapRegion | undefined {
  if (!location) return undefined;
  const loc = location.toLowerCase();
  return world.regions.find(r =>
    r.locationKeys?.some(k => loc.includes(k.toLowerCase()))
  );
}

function getCurrentSlot(schedule: DailySchedule | null): ScheduleSlot | undefined {
  if (!schedule?.slots?.length) return undefined;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let current: ScheduleSlot | undefined;
  for (const s of schedule.slots) {
    if (s.startTime <= hhmm) current = s;
  }
  return current;
}

// ══════════════════════════════════════════════════════════════
//  Theme backgrounds (Tailwind-compatible inline styles)
// ══════════════════════════════════════════════════════════════

const THEME_BG: Record<string, string> = {
  lilac: 'linear-gradient(180deg, #d8d2e8 0%, #e3dcef 55%, #ece6f3 100%)',
  peach: 'linear-gradient(180deg, #f3dccc 0%, #f6e3d3 55%, #faecdc 100%)',
  mint: 'linear-gradient(180deg, #cee2d2 0%, #dceadc 55%, #e6f0e4 100%)',
  dusk: 'linear-gradient(180deg, #b4b6cf 0%, #c6c5da 55%, #d7d4e3 100%)',
  rainbow: 'linear-gradient(135deg, #efd0db 0%, #f4d7c2 26%, #d6e3c6 55%, #cfdcef 80%, #ddd2ec 100%)',
};

// ══════════════════════════════════════════════════════════════
//  Status color helpers
// ══════════════════════════════════════════════════════════════

const STATUS_DOT: Record<CharAvailability, string> = {
  online: '#3aa763',
  busy: '#ff9466',
  offline: '#8a8ab1',
};
const STATUS_LABEL: Record<CharAvailability, string> = {
  online: '在线',
  busy: '忙碌',
  offline: '离线',
};

// ══════════════════════════════════════════════════════════════
//  Pin Component
// ══════════════════════════════════════════════════════════════

const CharPin: React.FC<{
  name: string;
  avatar: string;
  x: string;
  y: string;
  status: CharAvailability;
  active: boolean;
  onClick: () => void;
}> = ({ name, avatar, x, y, status, active, onClick }) => (
  <div
    className="absolute -translate-x-1/2 -translate-y-full cursor-pointer select-none transition-transform hover:scale-105"
    style={{ left: x, top: y }}
    onClick={onClick}
  >
    {/* Pin body */}
    <div
      className={`w-11 h-11 rounded-full bg-white p-[3px] transition-shadow ${
        active ? 'shadow-[0_0_0_3px_#6f5cd9,0_8px_18px_rgba(111,92,217,0.4)]' : 'shadow-[0_6px_14px_rgba(20,10,40,0.22)]'
      }`}
    >
      <img src={avatar} className="w-full h-full rounded-full object-cover" />
    </div>
    {/* Status dot */}
    <div
      className="absolute -right-0.5 top-0 w-3.5 h-3.5 rounded-full border-2 border-white"
      style={{ background: STATUS_DOT[status] }}
    />
    {/* Tail */}
    <div className="w-3 h-3 bg-white mx-auto -mt-[7px] rotate-45 rounded-sm shadow-[3px_3px_6px_rgba(20,10,40,0.14)]" />
    {/* Name capsule */}
    <div className="absolute left-1/2 top-full -translate-x-1/2 mt-1.5 bg-[rgba(28,22,38,0.82)] text-white text-[10.5px] font-semibold px-2 py-[3px] rounded-full whitespace-nowrap">
      {name}
    </div>
  </div>
);

const MePin: React.FC<{ x: string; y: string }> = ({ x, y }) => (
  <div
    className="absolute -translate-x-1/2 -translate-y-full select-none"
    style={{ left: x, top: y }}
  >
    <div className="w-11 h-11 rounded-full p-[3px] animate-pulse"
      style={{ background: '#6f5cd9', boxShadow: '0 0 0 4px rgba(111,92,217,0.20), 0 6px 14px rgba(111,92,217,0.45)' }}
    >
      <div className="w-full h-full rounded-full flex items-center justify-center text-white text-[13px] font-bold" style={{ background: '#6f5cd9' }}>
        你
      </div>
    </div>
    <div className="w-3 h-3 mx-auto -mt-[7px] rotate-45 rounded-sm" style={{ background: '#6f5cd9', boxShadow: '3px 3px 6px rgba(111,92,217,0.45)' }} />
    <div className="absolute left-1/2 top-full -translate-x-1/2 mt-1.5 text-white text-[10.5px] font-semibold px-2 py-[3px] rounded-full whitespace-nowrap" style={{ background: '#6f5cd9' }}>
      你在这里
    </div>
  </div>
);

// ══════════════════════════════════════════════════════════════
//  Bottom Sheet
// ══════════════════════════════════════════════════════════════

const BottomSheet: React.FC<{
  char: CharacterProfile;
  region?: MapRegion;
  status: CharAvailability;
  activity?: string;
  location?: string;
  lastMsg?: string;
  onGoChat: () => void;
}> = ({ char, region, status, activity, location, lastMsg, onGoChat }) => (
  <div className="mx-3.5 mb-3 bg-white/[0.86] rounded-3xl p-4 shadow-[0_6px_22px_rgba(80,60,140,0.10)] border border-white/70">
    {/* Handle */}
    <div className="w-10 h-1 rounded-full bg-black/[0.18] mx-auto -mt-1 mb-2.5" />

    <div className="flex items-center gap-2.5">
      {/* Region swatch */}
      {region && (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: region.color }}>
          {region.glyph}
        </div>
      )}
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 font-bold text-[15px] text-[#1c1626]">
          {char.name}
          {region && <span className="font-normal text-[#1c1626]/60"> · {region.name}</span>}
          <span
            className="text-[9.5px] px-[7px] py-[1px] rounded-full font-bold ml-1"
            style={{
              background: status === 'online' ? '#d2ecd3' : status === 'busy' ? '#ffe5b3' : '#e0dfe6',
              color: status === 'online' ? '#2c6c3a' : status === 'busy' ? '#7a5320' : '#55526a',
            }}
          >
            {activity ? `${activity}中` : STATUS_LABEL[status]}
          </span>
        </div>
        <div className="text-[11.5px] text-[#1c1626]/60 mt-0.5 truncate">
          {location && activity ? `${location} · ${activity}` : activity || '暂无日程'}
        </div>
      </div>
      {/* Go to chat */}
      <button
        className="bg-[#1c1626] text-white font-semibold text-xs px-3.5 py-2 rounded-full shrink-0 active:scale-95 transition-transform flex items-center gap-1.5"
        onClick={onGoChat}
      >
        <ChatTeardrop size={14} weight="fill" />
        去找TA
      </button>
    </div>

    {/* Last message quote */}
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
//  Map View — Single World
// ══════════════════════════════════════════════════════════════

const MapView: React.FC<{
  world: MapWorld;
  char: CharacterProfile;
  onBack: () => void;
}> = ({ world, char, onBack }) => {
  const { openApp } = useOS();
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);
  const [lastMsg, setLastMsg] = useState<string | undefined>();

  // Load schedule + last message
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

  // Figure out where the character pin should be
  const matchedRegion = useMemo(() => {
    if (currentSlot?.location) {
      const m = matchRegion(world, currentSlot.location);
      if (m) return m;
    }
    // Fallback: home region or first region with target pin
    return world.regions.find(r => r.id === world.homeRegionId)
      || world.regions.find(r => r.pin?.target === 'char');
  }, [world, currentSlot]);

  // Dynamic pin position: use matched region's pin or default
  const charPinPos = useMemo(() => {
    if (matchedRegion?.pin) return { x: matchedRegion.pin.x, y: matchedRegion.pin.y };
    // Fallback to first char pin
    const r = world.regions.find(r => r.pin?.target === 'char');
    return r?.pin ? { x: r.pin.x, y: r.pin.y } : { x: '50%', y: '50%' };
  }, [matchedRegion, world]);

  const mePinRegion = world.regions.find(r => r.pin?.me);

  const handleGoChat = useCallback(() => {
    openApp(AppID.Chat, { messageWidgetCharId: char.id });
  }, [openApp, char.id]);

  return (
    <div className="flex flex-col h-full" style={{ background: THEME_BG[world.theme] || THEME_BG.lilac }}>
      {/* Nav bar */}
      <div className="flex items-center gap-2.5 px-4 py-3 shrink-0">
        <button
          className="w-9 h-9 rounded-xl bg-white/45 border border-white/50 flex items-center justify-center active:scale-92 transition-transform"
          onClick={onBack}
        >
          <CaretLeft size={18} weight="bold" />
        </button>
        <div className="flex-1 text-center min-w-0">
          <div className="font-bold text-[17px] tracking-tight truncate">{world.title}</div>
          <div className="text-[11px] text-[#1c1626]/60 mt-0.5">{world.genre} · {world.role}</div>
        </div>
        <div className="w-9" /> {/* spacer */}
      </div>

      {/* Map area */}
      <div className="flex-1 relative overflow-hidden mx-3.5 rounded-[28px] bg-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_4px_22px_rgba(80,60,140,0.08)]">
        {/* SVG: regions + paths */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 365 440"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <filter id="mapSoft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="0.6" />
            </filter>
          </defs>
          {/* Paths */}
          <g stroke="rgba(28,22,38,0.10)" strokeWidth="1.2" strokeDasharray="3 5" fill="none">
            {world.paths.map((d, i) => <path key={i} d={d} />)}
          </g>
          {/* Region blobs */}
          <g filter="url(#mapSoft)">
            {world.regions.map(r => (
              <path key={r.id} d={r.blob} fill={r.color} opacity="0.92" />
            ))}
          </g>
          {/* Labels */}
          <g>
            {world.regions.map(r => (
              <React.Fragment key={r.id + '-lbl'}>
                <text
                  x={r.labelX} y={r.labelY}
                  style={{ fontFamily: 'Inter, sans-serif', fontSize: '8px', fontWeight: 600, fill: 'rgba(28,22,38,0.32)', letterSpacing: '0.18em', textTransform: 'uppercase' as const }}
                >
                  {r.en}
                </text>
                <text
                  x={r.labelX} y={r.labelY + 18}
                  style={{ fontFamily: 'Noto Sans SC, sans-serif', fontSize: '11px', fontWeight: 600, fill: 'rgba(28,22,38,0.55)', letterSpacing: '0.05em' }}
                >
                  {r.name}
                </text>
              </React.Fragment>
            ))}
          </g>
        </svg>

        {/* Legend */}
        <div className="absolute left-3 top-3 bg-white/[0.86] rounded-full px-3 py-1.5 flex items-center gap-2 text-[11.5px] font-semibold text-[#1c1626] shadow-[0_4px_14px_rgba(80,60,140,0.10)]">
          <span className="w-2 h-2 rounded-full shadow-[0_0_0_4px_rgba(58,167,99,0.18)]" style={{ background: STATUS_DOT[statusResult.status] }} />
          {char.name} · {statusResult.currentActivity ? `${statusResult.currentActivity}` : STATUS_LABEL[statusResult.status]}
        </div>

        {/* Pins */}
        <CharPin
          name={char.name}
          avatar={char.avatar}
          x={charPinPos.x}
          y={charPinPos.y}
          status={statusResult.status}
          active={true}
          onClick={() => {}}
        />
        {mePinRegion?.pin && (
          <MePin x={mePinRegion.pin.x} y={mePinRegion.pin.y} />
        )}
      </div>

      {/* Bottom Sheet */}
      <BottomSheet
        char={char}
        region={matchedRegion}
        status={statusResult.status}
        activity={statusResult.currentActivity}
        location={currentSlot?.location}
        lastMsg={lastMsg}
        onGoChat={handleGoChat}
      />
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  World Card (Shelf item)
// ══════════════════════════════════════════════════════════════

const WorldCard: React.FC<{
  world: MapWorld;
  char: CharacterProfile;
  status: CharAvailability;
  activity?: string;
  onClick: () => void;
}> = ({ world, char, status, activity, onClick }) => {
  const colors = world.regions.slice(0, 3).map(r => r.color);

  return (
    <div
      className="relative rounded-[22px] overflow-hidden p-3.5 border border-white/70 shadow-[0_10px_26px_rgba(80,60,140,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] cursor-pointer active:scale-[0.985] transition-transform"
      onClick={onClick}
    >
      {/* Cover blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="w-full h-full opacity-95">
          <path d="M-5 30 q 30 -25 80 -15 t 70 25 q 20 25 -10 45 t -90 5 q -50 -10 -50 -60z" fill={colors[0] || '#ddd'} opacity="0.85" />
          <path d="M90 -10 q 60 -5 110 25 q 25 25 5 50 t -90 8 q -45 -10 -55 -45 t 30 -38z" fill={colors[1] || '#eee'} opacity="0.85" />
          {colors[2] && <path d="M40 60 q 30 -10 80 0 t 80 30 q -5 25 -50 30 t -100 -10 q -30 -15 -10 -50z" fill={colors[2]} opacity="0.85" />}
        </svg>
      </div>
      {/* Frost overlay */}
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[4px]" />

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-[52px] h-[52px] rounded-[18px] bg-white p-[3px] shadow-[0_6px_14px_rgba(20,10,40,0.18)] shrink-0">
            <img src={char.avatar} className="w-full h-full rounded-[16px] object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[17px] font-bold tracking-tight text-[#1c1626]">{world.title}</span>
              <span className="text-[9.5px] px-[7px] py-[1px] rounded-full font-bold" style={{ background: world.tagBg, color: world.tagColor }}>
                {world.tag}
              </span>
            </div>
            <div className="text-[11.5px] text-[#1c1626]/60 mt-0.5">
              {world.genre} · <b className="text-[#1c1626] font-bold">{world.role}</b>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2.5 text-[11px] text-[#1c1626]/60">
          <span className="bg-white/65 px-2.5 py-1 rounded-full border border-white/50">
            <b className="text-[#1c1626]">{char.name}</b> · {activity ? `${activity}中` : STATUS_LABEL[status]}
          </span>
          <span className="flex-1" />
          <span className="bg-[#1c1626] text-white font-bold text-[11.5px] px-3 py-1.5 rounded-full">
            进入 →
          </span>
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  Shelf — World List (entry view)
// ══════════════════════════════════════════════════════════════

const Shelf: React.FC<{
  worlds: MapWorld[];
  characters: CharacterProfile[];
  schedules: Record<string, DailySchedule | null>;
  onOpenWorld: (worldId: string) => void;
}> = ({ worlds, characters, schedules, onOpenWorld }) => {
  const { closeApp } = useOS();

  return (
    <div className="flex flex-col h-full" style={{ background: THEME_BG.lilac }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 shrink-0">
        <button
          className="w-9 h-9 rounded-xl bg-white/45 border border-white/50 flex items-center justify-center active:scale-92 transition-transform"
          onClick={() => closeApp()}
        >
          <CaretLeft size={18} weight="bold" />
        </button>
        <div className="flex-1" />
      </div>

      <div className="px-5 pb-3 shrink-0">
        <h2 className="text-2xl font-bold tracking-tight text-[#1c1626]">彼此的世界</h2>
        <p className="text-[12.5px] text-[#1c1626]/60 mt-1">你和他们各自的生活 · 每个人有自己的小世界</p>
      </div>

      {/* World list */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-3.5 scrollbar-none">
        {worlds.map(w => {
          const char = characters.find(c => c.id === w.charId);
          if (!char) return null;
          const statusResult = computeCharStatus(schedules[w.charId] || null);
          return (
            <WorldCard
              key={w.id}
              world={w}
              char={char}
              status={statusResult.status}
              activity={statusResult.currentActivity}
              onClick={() => onOpenWorld(w.id)}
            />
          );
        })}

        {worlds.length === 0 && (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🗺️</div>
            <div className="text-sm text-[#1c1626]/40">还没有世界地图</div>
            <div className="text-xs text-[#1c1626]/30 mt-1">给角色配置世界后这里会显示</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
//  MapApp — Root Component
// ══════════════════════════════════════════════════════════════

export default function MapApp() {
  const { characters } = useOS();
  const [currentWorldId, setCurrentWorldId] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Record<string, DailySchedule | null>>({});

  // Resolve charId by matching character names, filter to available worlds
  const availableWorlds = useMemo(() => {
    const resolved: MapWorld[] = [];
    for (const w of MAP_WORLDS) {
      const char = characters.find(c => c.name.includes(w.charNameMatch));
      if (char) resolved.push({ ...w, charId: char.id } as MapWorld);
    }
    return resolved;
  }, [characters]);

  // Load all character schedules once worlds are resolved
  useEffect(() => {
    if (availableWorlds.length === 0) return;
    const today = new Date().toISOString().split('T')[0];
    const load = async () => {
      const result: Record<string, DailySchedule | null> = {};
      for (const w of availableWorlds) {
        try {
          result[w.charId] = await DB.getDailySchedule(w.charId, today);
        } catch {
          result[w.charId] = null;
        }
      }
      setSchedules(result);
    };
    load();
  }, [availableWorlds]);

  const currentWorld = availableWorlds.find(w => w.id === currentWorldId);
  const currentChar = currentWorld ? characters.find(c => c.id === currentWorld.charId) : undefined;

  if (currentWorld && currentChar) {
    return (
      <MapView
        world={currentWorld}
        char={currentChar}
        onBack={() => setCurrentWorldId(null)}
      />
    );
  }

  return (
    <Shelf
      worlds={availableWorlds}
      characters={characters}
      schedules={schedules}
      onOpenWorld={setCurrentWorldId}
    />
  );
}

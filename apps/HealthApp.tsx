import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { CaretLeft, CaretRight, Plus, X, Drop, PencilSimple, Trash, ArrowClockwise, Camera } from '@phosphor-icons/react';
import {
  HealthEvent, WorkoutHealthEvent, PeriodHealthEvent, SymptomHealthEvent,
  SleepHealthEvent, DietHealthEvent,
  PeriodFlow, SleepQuality,
  saveHealthEvent, deleteHealthEvent, getAllHealthEvents, buildEventMap,
} from '../utils/healthDb';
import { calcCycleStatus } from '../utils/cycleCalc';

// ── Constants ──────────────────────────────────────────────────────────────────

const FLOW_DOT: Record<PeriodFlow, string> = {
  heavy: 'bg-red-500', medium: 'bg-red-400', light: 'bg-rose-300', spotting: 'bg-pink-300',
};
const FLOW_LABEL: Record<PeriodFlow, string> = {
  heavy: '量多', medium: '量中', light: '量少', spotting: '点滴',
};
const QUALITY_LABEL: Record<SleepQuality, string> = { good: '很好', ok: '还行', poor: '不太好' };
const MONTH_NAMES = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const WEEKDAYS    = ['日','一','二','三','四','五','六'];

const toDateStr = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

type RecordMode = 'workout' | 'period' | 'symptom' | 'sleep' | 'diet';
type TopTab = 'calendar' | 'today';

// ── Category color system ──────────────────────────────────────────────────────

const CAT_COLORS = {
  workout: { bg: '#d1fae5', fg: '#065f46', active: '#10b981', border: '#a7f3d0', shadow: '#059669' },
  sleep:   { bg: '#e0e7ff', fg: '#3730a3', active: '#6366f1', border: '#c7d2fe', shadow: '#4338ca' },
  diet:    { bg: '#fef3c7', fg: '#92400e', active: '#f59e0b', border: '#fde68a', shadow: '#b45309' },
  period:  { bg: '#ffe4e6', fg: '#9f1239', active: '#f43f5e', border: '#fecdd3', shadow: '#be123c' },
  symptom: { bg: '#ede9fe', fg: '#5b21b6', active: '#8b5cf6', border: '#ddd6fe', shadow: '#6d28d9' },
} as const;

const TAB_ORDER: { id: RecordMode; label: string }[] = [
  { id: 'workout', label: '训练' },
  { id: 'sleep',   label: '睡眠' },
  { id: 'diet',    label: '饮食' },
  { id: 'period',  label: '经期' },
  { id: 'symptom', label: '症状' },
];

// ── LLM parsers ───────────────────────────────────────────────────────────────

interface ParsedWorkout {
  parts: string[]; duration: number; calories?: number; summary: string;
}

async function parseWorkoutText(text: string, apiBase: string, apiKey: string, model: string): Promise<ParsedWorkout | null> {
  const systemPrompt = `你是一个健身数据提取助手。从用户的自然语言训练记录中，提取以下字段并以 JSON 格式返回：
- parts: 训练部位数组，从这些选项中选（可多选）：胸、臀、背、腿、肩、手臂、核心、全身。没有明确提及的不要猜。
- duration: 总时长（分钟，整数）。没有提及则填 60。
- calories: 消耗热量（数字，可选，没有明确数字则不填）。
- summary: 主要动作的简短摘要，最多50字。
只返回 JSON，不要解释。`;
  try {
    const base = apiBase.replace(/\/+$/, '');
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey || 'sk-none'}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }], temperature: 0.2, max_tokens: 300, stream: false }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) as ParsedWorkout : null;
  } catch { return null; }
}

interface ParsedDiet {
  calories: number; protein?: number; carbs?: number; fat?: number; fiber?: number;
}

async function parseDietText(text: string, apiBase: string, apiKey: string, model: string): Promise<ParsedDiet | null> {
  const systemPrompt = `你是一个营养估算助手。根据用户描述的饮食内容，估算营养数据并以 JSON 格式返回：
- calories: 总热量 kcal（整数）
- protein: 蛋白质 g（整数）
- carbs: 碳水化合物 g（整数）
- fat: 脂肪 g（整数）
- fiber: 膳食纤维 g（整数）
尽可能准确估算中国家常菜的营养成分。只返回 JSON，不要解释。`;
  try {
    const base = apiBase.replace(/\/+$/, '');
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey || 'sk-none'}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }], temperature: 0.2, max_tokens: 300, stream: false }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) as ParsedDiet : null;
  } catch { return null; }
}

// ── Sleep duration helper ─────────────────────────────────────────────────────

function calcSleepMinutes(bedtime: string, wakeTime: string): number {
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60; // 跨午夜
  return mins;
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

// ── Component ──────────────────────────────────────────────────────────────────

const HealthApp: React.FC = () => {
  const { closeApp, addToast, apiConfig } = useOS();

  const today    = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate());

  // ── Top-level tab ──
  const [topTab, setTopTab] = useState<TopTab>('calendar');

  // ── Calendar navigation ──
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // ── Data ──
  const [allEvents, setAllEvents] = useState<HealthEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // ── Record modal ──
  const [recordMode, setRecordMode] = useState<RecordMode | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Workout
  const [recordText, setRecordText] = useState('');
  // Period / symptom
  const [periodFlow, setPeriodFlow] = useState<PeriodFlow | null>(null);
  const [periodSymptoms, setPeriodSymptoms] = useState<string[]>([]);
  const [periodDate, setPeriodDate] = useState(todayStr);
  // Sleep
  const [sleepBedtime, setSleepBedtime]   = useState('23:00');
  const [sleepWakeTime, setSleepWakeTime] = useState('07:30');
  const [sleepQuality, setSleepQuality]   = useState<SleepQuality>('good');
  const [sleepNote, setSleepNote]         = useState('');
  // Diet
  const [dietText, setDietText]         = useState('');
  const [dietCalories, setDietCalories] = useState<number | ''>('');
  const [dietProtein, setDietProtein]   = useState<number | ''>('');
  const [dietCarbs, setDietCarbs]       = useState<number | ''>('');
  const [dietFat, setDietFat]           = useState<number | ''>('');
  const [dietFiber, setDietFiber]       = useState<number | ''>('');
  const [dietNote, setDietNote]         = useState('');
  const [dietParsed, setDietParsed]     = useState(false);

  // ── Load data ──
  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try { setAllEvents(await getAllHealthEvents()); }
    catch (err) { console.error('[HealthApp] Failed to load events:', err); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Derived data ──
  const eventMap     = useMemo(() => buildEventMap(allEvents), [allEvents]);
  const periodEvents = useMemo(() => allEvents.filter((e): e is PeriodHealthEvent => e.type === 'period'), [allEvents]);
  const cycleStatus  = useMemo(() => calcCycleStatus(periodEvents), [periodEvents]);
  const ovulationSet = useMemo(() => new Set(cycleStatus.ovulationWindow), [cycleStatus.ovulationWindow]);

  // ── Today's events ──
  const todayEvents = useMemo(() => eventMap[todayStr] || [], [eventMap, todayStr]);
  const todayWorkout = todayEvents.find(e => e.type === 'workout') as WorkoutHealthEvent | undefined;
  const todaySleep   = todayEvents.find(e => e.type === 'sleep')   as SleepHealthEvent   | undefined;
  const todayDiets   = todayEvents.filter(e => e.type === 'diet')  as DietHealthEvent[];
  const todayDietTotal = todayDiets.reduce((s, d) => s + d.calories, 0);

  // ── Calendar grid ──
  const calendarDays = useMemo(() => {
    const firstDay    = new Date(viewYear, viewMonth - 1, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const prevMonth = () => { if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); } else setViewMonth(m => m + 1); };

  // ── Selected day ──
  const selectedEvents = selectedDate ? (eventMap[selectedDate] || []) : [];
  const selWorkout = selectedEvents.find(e => e.type === 'workout') as WorkoutHealthEvent | undefined;
  const selPeriod  = selectedEvents.find(e => e.type === 'period')  as PeriodHealthEvent  | undefined;
  const selSymptom = selectedEvents.find(e => e.type === 'symptom') as SymptomHealthEvent | undefined;
  const selSleep   = selectedEvents.find(e => e.type === 'sleep')   as SleepHealthEvent   | undefined;
  const selDiet    = selectedEvents.filter(e => e.type === 'diet')   as DietHealthEvent[];

  // ── Modal close / reset ──
  const closeRecord = () => {
    setRecordMode(null); setRecordText(''); setPeriodFlow(null);
    setPeriodSymptoms([]); setPeriodDate(todayStr); setEditingId(null);
    setSleepBedtime('23:00'); setSleepWakeTime('07:30');
    setSleepQuality('good'); setSleepNote('');
    setDietText(''); setDietCalories(''); setDietProtein('');
    setDietCarbs(''); setDietFat(''); setDietFiber('');
    setDietNote(''); setDietParsed(false);
  };

  // ── Submit: Workout ──
  const handleSubmitWorkout = async () => {
    if (!recordText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let parsed: ParsedWorkout | null = null;
      if (apiConfig?.baseUrl && apiConfig?.model) {
        parsed = await parseWorkoutText(recordText, apiConfig.baseUrl, apiConfig.apiKey, apiConfig.model);
      }
      const event: WorkoutHealthEvent = {
        id: editingId ?? `workout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: selectedDate ?? todayStr, createdAt: Date.now(), type: 'workout',
        parts: parsed?.parts ?? [], duration: parsed?.duration ?? 60,
        calories: parsed?.calories, summary: parsed?.summary ?? recordText.slice(0, 80),
        rawInput: recordText,
      };
      await saveHealthEvent(event); await loadEvents(); closeRecord();
      addToast(editingId ? '训练记录已更新' : '训练记录已保存', 'success');
    } catch { addToast('保存失败，请重试', 'error'); }
    finally { setIsSubmitting(false); }
  };

  // ── Submit: Period ──
  const handleSubmitPeriod = async () => {
    if (!periodFlow) return;
    setIsSubmitting(true);
    try {
      const event: PeriodHealthEvent = {
        id: editingId ?? `period_${periodDate}_${Math.random().toString(36).slice(2, 7)}`,
        date: periodDate, createdAt: Date.now(), type: 'period', flow: periodFlow,
      };
      await saveHealthEvent(event); await loadEvents(); closeRecord();
      addToast(editingId ? '经期记录已更新' : '经期记录已保存', 'success');
    } catch { addToast('保存失败，请重试', 'error'); }
    finally { setIsSubmitting(false); }
  };

  // ── Submit: Symptom ──
  const handleSubmitSymptom = async () => {
    if (periodSymptoms.length === 0) return;
    setIsSubmitting(true);
    try {
      const event: SymptomHealthEvent = {
        id: editingId ?? `symptom_${periodDate}_${Math.random().toString(36).slice(2, 7)}`,
        date: periodDate, createdAt: Date.now(), type: 'symptom', symptoms: periodSymptoms,
      };
      await saveHealthEvent(event); await loadEvents(); closeRecord();
      addToast(editingId ? '症状记录已更新' : '症状已保存', 'success');
    } catch { addToast('保存失败，请重试', 'error'); }
    finally { setIsSubmitting(false); }
  };

  // ── Submit: Sleep ──
  const handleSubmitSleep = async () => {
    setIsSubmitting(true);
    try {
      const dur = calcSleepMinutes(sleepBedtime, sleepWakeTime);
      const event: SleepHealthEvent = {
        id: editingId ?? `sleep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: selectedDate ?? todayStr, createdAt: Date.now(), type: 'sleep',
        bedtime: sleepBedtime, wakeTime: sleepWakeTime,
        duration: dur, quality: sleepQuality,
        note: sleepNote || undefined,
      };
      await saveHealthEvent(event); await loadEvents(); closeRecord();
      addToast(editingId ? '睡眠记录已更新' : '睡眠记录已保存', 'success');
    } catch { addToast('保存失败，请重试', 'error'); }
    finally { setIsSubmitting(false); }
  };

  // ── Submit: Diet ──
  const handleSubmitDiet = async () => {
    if (!dietCalories) return;
    setIsSubmitting(true);
    try {
      const event: DietHealthEvent = {
        id: editingId ?? `diet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: selectedDate ?? todayStr, createdAt: Date.now(), type: 'diet',
        calories: Number(dietCalories),
        protein: dietProtein ? Number(dietProtein) : undefined,
        carbs: dietCarbs ? Number(dietCarbs) : undefined,
        fat: dietFat ? Number(dietFat) : undefined,
        fiber: dietFiber ? Number(dietFiber) : undefined,
        rawInput: dietText || undefined,
        note: dietNote || undefined,
      };
      await saveHealthEvent(event); await loadEvents(); closeRecord();
      addToast(editingId ? '饮食记录已更新' : '饮食记录已保存', 'success');
    } catch { addToast('保存失败，请重试', 'error'); }
    finally { setIsSubmitting(false); }
  };

  // ── AI Diet Estimate ──
  const handleDietEstimate = async () => {
    if (!dietText.trim() || isSubmitting) return;
    if (!apiConfig?.baseUrl || !apiConfig?.model) { addToast('请先配置 API', 'error'); return; }
    setIsSubmitting(true);
    try {
      const parsed = await parseDietText(dietText, apiConfig.baseUrl, apiConfig.apiKey, apiConfig.model);
      if (parsed) {
        setDietCalories(parsed.calories);
        if (parsed.protein != null) setDietProtein(parsed.protein);
        if (parsed.carbs != null)   setDietCarbs(parsed.carbs);
        if (parsed.fat != null)     setDietFat(parsed.fat);
        if (parsed.fiber != null)   setDietFiber(parsed.fiber);
        setDietParsed(true);
      } else { addToast('估算失败，请手动输入', 'error'); }
    } catch { addToast('估算失败', 'error'); }
    finally { setIsSubmitting(false); }
  };

  // ── Delete ──
  const handleDelete = async (id: string, label: string) => {
    try { await deleteHealthEvent(id); await loadEvents(); addToast(`${label}已删除`, 'success'); }
    catch { addToast('删除失败', 'error'); }
  };

  // ── Edit helpers ──
  const startEditWorkout = (w: WorkoutHealthEvent) => { setEditingId(w.id); setRecordText(w.rawInput ?? w.summary); setSelectedDate(w.date); setRecordMode('workout'); };
  const startEditPeriod  = (p: PeriodHealthEvent)  => { setEditingId(p.id); setPeriodFlow(p.flow); setPeriodDate(p.date); setRecordMode('period'); };
  const startEditSymptom = (s: SymptomHealthEvent) => { setEditingId(s.id); setPeriodSymptoms(s.symptoms); setPeriodDate(s.date); setRecordMode('symptom'); };
  const startEditSleep   = (s: SleepHealthEvent)   => { setEditingId(s.id); setSleepBedtime(s.bedtime); setSleepWakeTime(s.wakeTime); setSleepQuality(s.quality); setSleepNote(s.note ?? ''); setRecordMode('sleep'); };
  const startEditDiet    = (d: DietHealthEvent)     => { setEditingId(d.id); setDietCalories(d.calories); setDietProtein(d.protein ?? ''); setDietCarbs(d.carbs ?? ''); setDietFat(d.fat ?? ''); setDietFiber(d.fiber ?? ''); setDietText(d.rawInput ?? ''); setDietNote(d.note ?? ''); setDietParsed(true); setRecordMode('diet'); };

  const toggleSymptom = (sym: string) =>
    setPeriodSymptoms(prev => prev.includes(sym) ? prev.filter(x => x !== sym) : [...prev, sym]);

  const openRecord = (mode: RecordMode) => { setPeriodDate(selectedDate ?? todayStr); setRecordMode(mode); };

  // ── Clay theme ────────────────────────────────────────────────────────────────
  const shadowL = '2px 4px 0 1px';
  const shadowS = '1px 3px 0 1px';
  const insetShadow = 'inset -2px -2px 4px rgba(255,255,255,0.7), inset 2px 2px 4px rgba(0,0,0,0.07)';
  const clay = {
    bg: '#f5f4f2',
    card:       { background: '#fff', borderRadius: '14px', boxShadow: `${shadowL} #e0dcd8`, border: '1px solid rgba(0,0,0,0.03)' },
    cardGreen:  { background: '#f0fdf8', borderRadius: '14px', boxShadow: `${shadowL} #98d4c0`, border: '1px solid rgba(16,185,129,0.08)' },
    cardRose:   { background: '#fff5f6', borderRadius: '14px', boxShadow: `${shadowL} #f0b0b8`, border: '1px solid rgba(251,113,133,0.08)' },
    cardViolet: { background: '#f5f3ff', borderRadius: '14px', boxShadow: `${shadowL} #baa8f0`, border: '1px solid rgba(167,139,250,0.08)' },
    cardIndigo: { background: '#eef2ff', borderRadius: '14px', boxShadow: `${shadowL} #a0b0f0`, border: '1px solid rgba(99,102,241,0.08)' },
    cardAmber:  { background: '#fffbeb', borderRadius: '14px', boxShadow: `${shadowL} #e0c080`, border: '1px solid rgba(245,158,11,0.08)' },
    btnPrimary: { background: '#475569', borderRadius: '10px', boxShadow: `${shadowL} #d0ccc8` },
    press:      'active:translate-y-[3px] transition-transform duration-150',
    pressSmall: 'active:translate-y-[2px] transition-transform duration-150',
  } as const;

  // ── SVG ring helper ──
  const ringArc = (r: number, pct: number) => {
    const c = 2 * Math.PI * r;
    const arc = c * Math.min(pct, 1);
    return { strokeDasharray: `${arc.toFixed(1)} ${(c - arc).toFixed(1)}` };
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{ background: clay.bg }}>

      {/* ── Header ── */}
      <div className="shrink-0 pt-12 pb-3 px-4 flex items-center justify-between sticky top-0 z-20" style={{ background: clay.bg }}>
        <button onClick={closeApp}
          className={`w-9 h-9 flex items-center justify-center ${clay.pressSmall}`}
          style={{ background: '#fff', borderRadius: '10px', boxShadow: `${shadowS} #e0dcd8`, border: '1px solid rgba(0,0,0,0.03)' }}>
          <CaretLeft size={18} weight="bold" className="text-slate-500" />
        </button>

        {topTab === 'calendar' && (
          <div className="flex items-center gap-2 px-4 py-1.5"
            style={{ background: '#fff', borderRadius: '10px', boxShadow: `${shadowS} #e0dcd8`, border: '1px solid rgba(0,0,0,0.03)' }}>
            <button onClick={prevMonth} className={clay.pressSmall}>
              <CaretLeft size={14} weight="bold" className="text-slate-400" />
            </button>
            <span className="text-sm font-bold text-slate-700 w-24 text-center">
              {viewYear} · {MONTH_NAMES[viewMonth - 1]}
            </span>
            <button onClick={nextMonth} className={clay.pressSmall}>
              <CaretRight size={14} weight="bold" className="text-slate-400" />
            </button>
          </div>
        )}

        {topTab === 'today' && (
          <span className="text-sm font-bold text-slate-700">
            {today.getMonth() + 1}月{today.getDate()}日 · {WEEKDAYS[today.getDay()]}
          </span>
        )}

        <button
          onClick={() => openRecord('workout')}
          className={`flex items-center gap-1 text-white text-xs font-bold px-3 py-2 ${clay.press}`}
          style={clay.btnPrimary}>
          <Plus size={13} weight="bold" />
          记录
        </button>
      </div>

      {/* ── Top tab bar (月历 / 今日) ── */}
      <div className="shrink-0 mx-4 mb-2 flex p-1"
        style={{ background: '#eae8e5', borderRadius: '10px', boxShadow: insetShadow }}>
        {([
          { id: 'calendar' as TopTab, label: '月历' },
          { id: 'today'    as TopTab, label: '今日' },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setTopTab(tab.id)}
            className={`flex-1 py-1.5 text-xs font-bold ${clay.pressSmall}`}
            style={{
              borderRadius: '8px',
              background: topTab === tab.id ? '#fff' : 'transparent',
              color: topTab === tab.id ? '#1e293b' : '#94a3b8',
              boxShadow: topTab === tab.id ? `${shadowS} #e0dcd8` : 'none',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════
          TAB: 月历
      ════════════════════════════════════════════════════ */}
      {topTab === 'calendar' && (
        <>
          {/* Cycle Status */}
          <div className="shrink-0 mx-4 mt-1 px-4 py-2.5 flex items-center justify-between"
            style={{ background: '#eae8e5', borderRadius: '14px', boxShadow: insetShadow }}>
            <div className="flex items-center gap-1.5">
              <Drop size={13} weight="fill" className="text-rose-400" />
              {cycleStatus.lastPeriodStart ? (
                <span className="text-sm text-slate-600">
                  周期第 <span className="font-bold text-rose-500">{cycleStatus.cycleDay}</span> 天
                  {cycleStatus.uncertain && <span className="text-xs text-slate-400 ml-1">（预测不确定）</span>}
                </span>
              ) : (
                <span className="text-sm text-slate-400">暂无经期数据</span>
              )}
            </div>
            {cycleStatus.lastPeriodStart && (
              <span className="text-xs text-slate-400">预计下次 {cycleStatus.nextRangeStr}</span>
            )}
          </div>

          {/* Legend */}
          <div className="shrink-0 mx-4 mt-2 flex items-center gap-3">
            {[
              { dot: 'bg-rose-400',    label: '经期' },
              { dot: 'bg-emerald-400', label: '训练' },
              { dot: 'bg-violet-400',  label: '症状' },
            ].map(({ dot, label }) => (
              <div key={label} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${dot}`} />
                <span className="text-[11px] text-slate-400">{label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1">
              <div className="w-3 h-2 rounded-sm bg-sky-200/60" />
              <span className="text-[11px] text-slate-400">排卵窗</span>
            </div>
            {isLoading && <div className="ml-auto"><ArrowClockwise size={12} className="text-slate-300 animate-spin" /></div>}
          </div>

          {/* Calendar */}
          <div className="shrink-0 px-4 mt-3">
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map(d => <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                if (day === null) return <div key={`e${idx}`} className="h-11" />;
                const dateStr  = toDateStr(viewYear, viewMonth, day);
                const events   = eventMap[dateStr] || [];
                const isToday  = dateStr === todayStr;
                const isSel    = dateStr === selectedDate;
                const isOvul   = ovulationSet.has(dateStr);
                const periodEv = events.find(e => e.type === 'period') as PeriodHealthEvent | undefined;
                const hasWorkout = events.some(e => e.type === 'workout');
                const hasSymptom = events.some(e => e.type === 'symptom');
                return (
                  <button key={dateStr} onClick={() => setSelectedDate(isSel ? null : dateStr)}
                    className={`flex flex-col items-center justify-center h-11 ${clay.pressSmall}`}
                    style={{
                      borderRadius: '10px',
                      background: isSel ? '#475569' : isOvul ? '#e8f4ff' : isToday ? '#f1f5f9' : 'transparent',
                      boxShadow: isSel ? `${shadowS} #d0ccc8` : isToday ? `${shadowS} #e0dcd8` : 'none',
                      border: isSel || isToday ? '1px solid rgba(0,0,0,0.03)' : 'none',
                    }}>
                    <span className={`text-sm leading-none mb-1 font-semibold ${isSel ? 'text-white' : isToday ? 'text-slate-900' : 'text-slate-700'}`}>{day}</span>
                    <div className="flex gap-0.5 items-center h-2">
                      {periodEv  && <div className={`w-2 h-2 rounded-full ${isSel ? 'bg-white/80' : FLOW_DOT[periodEv.flow]}`} />}
                      {hasWorkout && <div className={`w-2 h-2 rounded-full ${isSel ? 'bg-white/80' : 'bg-emerald-400'}`} />}
                      {hasSymptom && <div className={`w-2 h-2 rounded-full ${isSel ? 'bg-white/80' : 'bg-violet-400'}`} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 mx-4 mt-3 h-px" style={{ background: '#e0dcd8' }} />

          {/* Detail Section */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {!selectedDate ? (
              <div className="flex flex-col items-center mt-8 gap-2">
                <div className="w-12 h-12 flex items-center justify-center" style={{ ...clay.card, borderRadius: '12px' }}>
                  <CaretRight size={20} className="text-slate-300" />
                </div>
                <p className="text-slate-400 text-sm">点击日期查看详情</p>
              </div>
            ) : selectedEvents.length === 0 ? (
              <div className="flex flex-col items-center mt-8 gap-3">
                <p className="text-slate-400 text-sm">{viewMonth}月{parseInt(selectedDate.split('-')[2])}日 · 暂无记录</p>
                <button onClick={() => openRecord('workout')}
                  className={`flex items-center gap-1.5 text-white text-xs font-bold px-4 py-2 ${clay.press}`}
                  style={clay.btnPrimary}>
                  <Plus size={13} weight="bold" /> 记录
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs font-bold text-slate-400 mb-3 tracking-wider">
                  {viewMonth}月{parseInt(selectedDate.split('-')[2])}日
                </p>

                {selWorkout && (
                  <div className="mb-3 p-3.5" style={clay.cardGreen}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-bold text-emerald-700">
                        {selWorkout.parts.length > 0 ? selWorkout.parts.join(' + ') : '训练'}
                      </span>
                      <span className="text-xs text-emerald-500">{selWorkout.duration}min{selWorkout.calories ? ` · ${selWorkout.calories}kcal` : ''}</span>
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => startEditWorkout(selWorkout)} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '10px', background: '#d1fae5', boxShadow: `${shadowS} #98d4c0` }}>
                          <PencilSimple size={14} className="text-emerald-600" />
                        </button>
                        <button onClick={() => handleDelete(selWorkout.id, '训练记录')} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '10px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                          <Trash size={14} className="text-rose-500" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-emerald-600/70 leading-relaxed">{selWorkout.summary}</p>
                  </div>
                )}

                {selSleep && (
                  <div className="mb-3 p-3.5" style={clay.cardIndigo}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-indigo-700">睡眠</span>
                      <span className="text-xs text-indigo-500">
                        {selSleep.bedtime} → {selSleep.wakeTime} · {fmtDuration(selSleep.duration)} · {QUALITY_LABEL[selSleep.quality]}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => startEditSleep(selSleep)} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '10px', background: '#e0e7ff', boxShadow: `${shadowS} #a0b0f0` }}>
                          <PencilSimple size={14} className="text-indigo-600" />
                        </button>
                        <button onClick={() => handleDelete(selSleep.id, '睡眠记录')} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '10px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                          <Trash size={14} className="text-rose-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {selDiet.length > 0 && selDiet.map(d => (
                  <div key={d.id} className="mb-3 p-3.5" style={clay.cardAmber}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-amber-800">{d.note || '饮食'}</span>
                      <span className="text-xs text-amber-600">{d.calories}kcal</span>
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => startEditDiet(d)} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '10px', background: '#fef3c7', boxShadow: `${shadowS} #e0c080` }}>
                          <PencilSimple size={14} className="text-amber-700" />
                        </button>
                        <button onClick={() => handleDelete(d.id, '饮食记录')} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '10px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                          <Trash size={14} className="text-rose-500" />
                        </button>
                      </div>
                    </div>
                    {(d.protein || d.carbs || d.fat) && (
                      <p className="text-xs text-amber-600/70">
                        {d.protein ? `蛋白${d.protein}g` : ''}{d.carbs ? ` · 碳水${d.carbs}g` : ''}{d.fat ? ` · 脂肪${d.fat}g` : ''}
                      </p>
                    )}
                  </div>
                ))}

                {selPeriod && (
                  <div className="mb-3 p-3.5" style={clay.cardRose}>
                    <div className="flex items-center gap-3">
                      <Drop size={15} weight="fill" className="text-rose-400 shrink-0" />
                      <span className="text-sm font-bold text-rose-600">经期</span>
                      <span className="text-xs text-rose-400 px-2 py-0.5 rounded-full font-medium" style={{ background: '#ffd8de' }}>
                        {FLOW_LABEL[selPeriod.flow]}
                      </span>
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => startEditPeriod(selPeriod)} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '10px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                          <PencilSimple size={14} className="text-rose-500" />
                        </button>
                        <button onClick={() => handleDelete(selPeriod.id, '经期记录')} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '10px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                          <Trash size={14} className="text-rose-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {selSymptom && (
                  <div className="p-3.5" style={clay.cardViolet}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-bold text-violet-600">症状</span>
                      <div className="ml-auto flex gap-1">
                        <button onClick={() => startEditSymptom(selSymptom)} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '10px', background: '#ede9fe', boxShadow: `${shadowS} #baa8f0` }}>
                          <PencilSimple size={14} className="text-violet-500" />
                        </button>
                        <button onClick={() => handleDelete(selSymptom.id, '症状记录')} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '10px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                          <Trash size={14} className="text-rose-500" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selSymptom.symptoms.map(s => (
                        <span key={s} className="text-xs px-2.5 py-1 rounded-full font-semibold text-violet-600"
                          style={{ background: '#ede9fe', boxShadow: '0 2px 0 0 #c8b8f8' }}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick add */}
                <div className="mt-3">
                  <button onClick={() => openRecord('workout')}
                    className={`flex items-center gap-1 text-white text-xs font-bold px-3 py-1.5 ${clay.pressSmall}`}
                    style={clay.btnPrimary}>
                    <Plus size={12} weight="bold" /> 记录
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════
          TAB: 今日
      ════════════════════════════════════════════════════ */}
      {topTab === 'today' && (
        <div className="flex-1 overflow-y-auto px-4 pb-4">

          {/* Big nested clay donut ring */}
          <div className="relative mx-auto" style={{ width: 240, height: 240 }}>
            {/* Clay background ring — inset shadow gives the "groove" */}
            <div className="absolute inset-0 rounded-full"
              style={{ background: '#eae8e5', boxShadow: 'inset 3px 4px 8px rgba(0,0,0,0.12), inset -2px -3px 6px rgba(255,255,255,0.7)' }} />
            {/* Inner raised circle (creates donut hole) */}
            <div className="absolute rounded-full"
              style={{ top: 40, left: 40, width: 160, height: 160, background: clay.bg, boxShadow: `3px 5px 10px rgba(0,0,0,0.1), -2px -3px 8px rgba(255,255,255,0.8)` }} />
            {/* SVG data arcs */}
            <svg viewBox="0 0 240 240" width="240" height="240" className="absolute inset-0">
              {/* Sleep ring (outer, r=105) */}
              <circle cx="120" cy="120" r="105" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="14" />
              <circle cx="120" cy="120" r="105" fill="none"
                stroke="#6366f1" strokeWidth="14" strokeLinecap="round"
                {...ringArc(105, todaySleep ? todaySleep.duration / 480 : 0)}
                transform="rotate(-90 120 120)" />
              {/* Workout ring (mid, r=88) */}
              <circle cx="120" cy="120" r="88" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="14" />
              <circle cx="120" cy="120" r="88" fill="none"
                stroke="#10b981" strokeWidth="14" strokeLinecap="round"
                {...ringArc(88, todayWorkout?.calories ? todayWorkout.calories / 500 : 0)}
                transform="rotate(-90 120 120)" />
              {/* Diet ring (inner, r=71) */}
              <circle cx="120" cy="120" r="71" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="14" />
              <circle cx="120" cy="120" r="71" fill="none"
                stroke="#f59e0b" strokeWidth="14" strokeLinecap="round"
                {...ringArc(71, todayDietTotal ? todayDietTotal / 2000 : 0)}
                transform="rotate(-90 120 120)" />
            </svg>
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              <span className="text-[10px] text-slate-400">摄入</span>
              <span className="text-2xl font-bold text-slate-800">{todayDietTotal || '—'}</span>
              <span className="text-[10px] text-slate-400">{todayDietTotal ? 'kcal' : ''}</span>
            </div>
          </div>

          {/* Ring legend chips */}
          <div className="flex justify-center gap-2 mt-3 mb-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium"
              style={{ background: '#e0e7ff', borderRadius: '12px', color: '#3730a3', border: '1px solid #c7d2fe', boxShadow: `${shadowS} #e0dcd8` }}>
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              睡 <b>{todaySleep ? fmtDuration(todaySleep.duration) : '—'}</b>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium"
              style={{ background: '#d1fae5', borderRadius: '12px', color: '#065f46', border: '1px solid #a7f3d0', boxShadow: `${shadowS} #e0dcd8` }}>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              练 <b>{todayWorkout ? `${todayWorkout.calories ?? 0}k` : '—'}</b>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium"
              style={{ background: '#fef3c7', borderRadius: '12px', color: '#92400e', border: '1px solid #fde68a', boxShadow: `${shadowS} #e0dcd8` }}>
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              食 <b>{todayDietTotal ? `${todayDietTotal}k` : '—'}</b>
            </div>
          </div>

          {/* Today records */}
          <p className="text-xs font-bold text-slate-400 mb-2 tracking-wider">今日记录</p>

          {todayWorkout && (
            <div className="mb-2 p-3" style={clay.cardGreen}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: '#d1fae5', color: '#065f46' }}>训</span>
                <span className="text-sm font-bold text-emerald-700">{todayWorkout.parts.join(' + ') || '训练'}</span>
                <span className="text-xs text-emerald-500">{todayWorkout.duration}min · {todayWorkout.calories ?? '—'}kcal</span>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => startEditWorkout(todayWorkout)} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '8px', background: '#d1fae5', boxShadow: `${shadowS} #98d4c0` }}>
                    <PencilSimple size={12} className="text-emerald-600" />
                  </button>
                  <button onClick={() => handleDelete(todayWorkout.id, '训练记录')} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '8px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                    <Trash size={12} className="text-rose-500" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {todaySleep && (
            <div className="mb-2 p-3" style={clay.cardIndigo}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: '#e0e7ff', color: '#3730a3' }}>眠</span>
                <span className="text-sm font-bold text-indigo-700">{todaySleep.bedtime} → {todaySleep.wakeTime}</span>
                <span className="text-xs text-indigo-500">{fmtDuration(todaySleep.duration)} · {QUALITY_LABEL[todaySleep.quality]}</span>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => startEditSleep(todaySleep)} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '8px', background: '#e0e7ff', boxShadow: `${shadowS} #a0b0f0` }}>
                    <PencilSimple size={12} className="text-indigo-600" />
                  </button>
                  <button onClick={() => handleDelete(todaySleep.id, '睡眠记录')} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '8px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                    <Trash size={12} className="text-rose-500" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {todayDiets.map(d => (
            <div key={d.id} className="mb-2 p-3" style={clay.cardAmber}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: '#fef3c7', color: '#92400e' }}>食</span>
                <span className="text-sm font-bold text-amber-800">{d.note || '饮食'} {d.calories}kcal</span>
                {d.protein && <span className="text-xs text-amber-600">蛋白{d.protein}g</span>}
                <div className="ml-auto flex gap-1">
                  <button onClick={() => startEditDiet(d)} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '8px', background: '#fef3c7', boxShadow: `${shadowS} #e0c080` }}>
                    <PencilSimple size={12} className="text-amber-700" />
                  </button>
                  <button onClick={() => handleDelete(d.id, '饮食记录')} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '8px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                    <Trash size={12} className="text-rose-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {todayEvents.length === 0 && (
            <p className="text-center text-slate-400 text-sm mt-6">今日暂无记录</p>
          )}

          {/* Quick add — single button opens modal */}
          <div className="flex justify-center mt-4">
            <button onClick={() => openRecord('workout')}
              className={`flex items-center gap-1.5 text-white text-sm font-bold px-5 py-2.5 ${clay.press}`}
              style={clay.btnPrimary}>
              <Plus size={15} weight="bold" />
              记录
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          Record Modal
      ════════════════════════════════════════════════════ */}
      {recordMode && (
        <div className="absolute inset-0 bg-black/15 backdrop-blur-sm z-50 flex items-end"
          onClick={(e) => { if (e.target === e.currentTarget) closeRecord(); }}>
          <div className="w-full px-4 pt-5 pb-10 flex flex-col"
            style={{ background: clay.bg, borderRadius: '16px 16px 0 0', boxShadow: '0 -4px 0 1px #e0dcd8, 0 -8px 24px rgba(200,192,184,0.12)', height: '420px' }}>

            <div className="flex items-center justify-between mb-4 shrink-0">
              <span className="text-base font-bold text-slate-700">{editingId ? '编辑记录' : '新记录'}</span>
              <button onClick={closeRecord} className={`w-7 h-7 flex items-center justify-center ${clay.pressSmall}`}
                style={{ background: '#fff', borderRadius: '8px', boxShadow: `${shadowS} #e0dcd8`, border: '1px solid rgba(0,0,0,0.03)' }}>
                <X size={14} className="text-slate-400" />
              </button>
            </div>

            {/* 5-tab selector — category colored */}
            <div className="flex gap-1 mb-4 p-1 shrink-0"
              style={{ background: '#eae8e5', borderRadius: '12px', boxShadow: insetShadow }}>
              {TAB_ORDER.map(tab => {
                const c = CAT_COLORS[tab.id];
                const isActive = recordMode === tab.id;
                return (
                  <button key={tab.id}
                    onClick={() => { setRecordMode(tab.id); if (!editingId) { /* reset only when not editing */ } }}
                    className={`flex-1 py-2 text-xs font-bold transition-all duration-150`}
                    style={{
                      borderRadius: '8px',
                      background: isActive ? c.active : 'transparent',
                      color: isActive ? '#fff' : '#94a3b8',
                      boxShadow: isActive ? `1px 2px 0 1px ${c.shadow}` : 'none',
                    }}>
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Content — flex-1 fills remaining space, each tab uses flex with mt-auto on save btn */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Workout ── */}
              {recordMode === 'workout' && (
                <div className="flex flex-col h-full">
                  <textarea value={recordText} onChange={e => setRecordText(e.target.value)}
                    placeholder={"直接说就好～\n比如：刚练完背腿，杠铃划船三组、深蹲三组，消耗480kcal"}
                    className="w-full px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none leading-relaxed flex-1"
                    style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)', minHeight: '100px' }}
                    autoFocus />
                  {isSubmitting && <p className="text-xs text-slate-400 mt-2 text-center">AI 解析中…</p>}
                  <button onClick={handleSubmitWorkout} disabled={!recordText.trim() || isSubmitting}
                    className={`w-full text-white font-bold py-3.5 mt-auto disabled:opacity-50 ${clay.press}`}
                    style={{ background: CAT_COLORS.workout.active, borderRadius: '10px', boxShadow: `${shadowL} ${CAT_COLORS.workout.shadow}` }}>
                    {isSubmitting ? '解析中…' : '保存'}
                  </button>
                </div>
              )}

              {/* ── Sleep ── */}
              {recordMode === 'sleep' && (
                <div className="flex flex-col h-full">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">入睡 / 起床时间</span>
                  <div className="flex gap-3 mt-2 items-end">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400">入睡</label>
                      <input type="time" value={sleepBedtime} onChange={e => setSleepBedtime(e.target.value)}
                        className="w-full px-3 py-2.5 text-center text-base font-bold text-slate-700 focus:outline-none"
                        style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)' }} />
                    </div>
                    <span className="text-slate-400 pb-3">→</span>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400">起床</label>
                      <input type="time" value={sleepWakeTime} onChange={e => setSleepWakeTime(e.target.value)}
                        className="w-full px-3 py-2.5 text-center text-base font-bold text-slate-700 focus:outline-none"
                        style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)' }} />
                    </div>
                  </div>
                  <div className="text-center py-3">
                    <span className="text-2xl font-bold text-slate-800">{fmtDuration(calcSleepMinutes(sleepBedtime, sleepWakeTime))}</span>
                    <p className="text-[10px] text-slate-400 mt-1">睡眠时长</p>
                  </div>

                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-2">睡眠质量</span>
                  <div className="flex gap-2 mt-1.5">
                    {(['good','ok','poor'] as SleepQuality[]).map(q => (
                      <button key={q} onClick={() => setSleepQuality(q)}
                        className={`flex-1 py-2 text-xs font-bold ${clay.pressSmall}`}
                        style={{
                          borderRadius: '10px',
                          background: sleepQuality === q ? CAT_COLORS.sleep.active : '#fff',
                          color: sleepQuality === q ? '#fff' : '#64748b',
                          boxShadow: sleepQuality === q ? `${shadowS} ${CAT_COLORS.sleep.shadow}` : `${shadowS} #e0dcd8`,
                          border: '1px solid rgba(0,0,0,0.03)',
                        }}>
                        {QUALITY_LABEL[q]}
                      </button>
                    ))}
                  </div>

                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4">备注（可选）</span>
                  <input value={sleepNote} onChange={e => setSleepNote(e.target.value)} placeholder="做梦、失眠..."
                    className="mt-1.5 w-full px-4 py-2.5 text-sm text-slate-700 focus:outline-none"
                    style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)' }} />

                  <button onClick={handleSubmitSleep} disabled={isSubmitting}
                    className={`w-full text-white font-bold py-3.5 mt-auto disabled:opacity-50 ${clay.press}`}
                    style={{ background: CAT_COLORS.sleep.active, borderRadius: '10px', boxShadow: `${shadowL} ${CAT_COLORS.sleep.shadow}` }}>
                    保存
                  </button>
                </div>
              )}

              {/* ── Diet ── */}
              {recordMode === 'diet' && (
                <div className="flex flex-col h-full">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">描述今天吃了什么</span>
                  <textarea value={dietText} onChange={e => { setDietText(e.target.value); setDietParsed(false); }}
                    placeholder="午餐：红烧肉半份、白米饭一碗、清炒青菜..."
                    className="mt-1.5 w-full px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none leading-relaxed"
                    style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)', minHeight: '80px' }} />

                  <div className="flex gap-2 mt-2">
                    <button onClick={handleDietEstimate} disabled={!dietText.trim() || isSubmitting}
                      className={`flex-1 text-white font-bold py-2.5 text-sm disabled:opacity-50 ${clay.press}`}
                      style={{ background: CAT_COLORS.diet.active, borderRadius: '10px', boxShadow: `${shadowS} ${CAT_COLORS.diet.shadow}` }}>
                      {isSubmitting ? '估算中…' : 'AI 估算'}
                    </button>
                    <label className={`w-11 flex items-center justify-center cursor-pointer ${clay.pressSmall}`}
                      style={{ background: '#fef3c7', borderRadius: '10px', boxShadow: `${shadowS} #e0dcd8`, border: '1px solid #fde68a' }}>
                      <Camera size={18} weight="bold" className="text-amber-700" />
                      <input type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          addToast('拍照识图功能开发中', 'info');
                        }} />
                    </label>
                  </div>

                  {/* Macro result / manual input */}
                  {(dietParsed || editingId) && (
                    <div className="mt-3 p-3" style={clay.cardAmber}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-amber-800">
                          {dietParsed && !editingId ? '估算结果 · 可修改' : '营养数据'}
                        </span>
                        {dietParsed && !editingId && (
                          <button onClick={handleDietEstimate} className="text-[10px] text-amber-600">重新估算</button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { label: '总热量', val: dietCalories, set: setDietCalories, unit: 'kcal', color: '#92400e' },
                          { label: '蛋白质', val: dietProtein,  set: setDietProtein,  unit: 'g', color: '#0d9488' },
                          { label: '碳水',   val: dietCarbs,    set: setDietCarbs,    unit: 'g', color: '#d97706' },
                          { label: '脂肪',   val: dietFat,      set: setDietFat,      unit: 'g', color: '#e11d48' },
                        ] as const).map(f => (
                          <div key={f.label} className="flex items-baseline gap-1">
                            <span className="text-[10px] text-slate-400 w-10">{f.label}</span>
                            <input type="number" value={f.val} onChange={e => f.set(e.target.value ? Number(e.target.value) : '')}
                              className="w-14 text-sm font-bold text-right focus:outline-none"
                              style={{ background: 'transparent', color: f.color, border: 'none' }} />
                            <span className="text-[10px] text-slate-400">{f.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manual kcal if no parse yet */}
                  {!dietParsed && !editingId && (
                    <div className="mt-3">
                      <span className="text-xs font-bold text-slate-400">或直接输入热量</span>
                      <input type="number" value={dietCalories} onChange={e => setDietCalories(e.target.value ? Number(e.target.value) : '')}
                        placeholder="kcal"
                        className="mt-1.5 w-full px-4 py-2.5 text-sm text-slate-700 focus:outline-none"
                        style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)' }} />
                    </div>
                  )}

                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4">标签（可选）</span>
                  <input value={dietNote} onChange={e => setDietNote(e.target.value)} placeholder="早餐、午餐、晚餐..."
                    className="mt-1.5 w-full px-4 py-2.5 text-sm text-slate-700 focus:outline-none"
                    style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)' }} />

                  <button onClick={handleSubmitDiet} disabled={!dietCalories || isSubmitting}
                    className={`w-full text-white font-bold py-3.5 mt-auto disabled:opacity-40 ${clay.press}`}
                    style={{ background: CAT_COLORS.diet.active, borderRadius: '10px', boxShadow: `${shadowL} ${CAT_COLORS.diet.shadow}` }}>
                    保存
                  </button>
                </div>
              )}

              {/* ── Period ── */}
              {recordMode === 'period' && (
                <div className="flex flex-col h-full">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">经期量</span>
                  <div className="flex gap-2 mt-1.5">
                    {(['spotting','light','medium','heavy'] as PeriodFlow[]).map(f => (
                      <button key={f} onClick={() => setPeriodFlow(f)}
                        className={`flex-1 py-2 text-xs font-bold ${clay.pressSmall}`}
                        style={{
                          borderRadius: '10px',
                          background: periodFlow === f ? CAT_COLORS.period.active : '#fff',
                          color: periodFlow === f ? '#fff' : '#64748b',
                          boxShadow: periodFlow === f ? `${shadowS} ${CAT_COLORS.period.shadow}` : `${shadowS} #e0dcd8`,
                          border: '1px solid rgba(0,0,0,0.03)',
                        }}>
                        {FLOW_LABEL[f]}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleSubmitPeriod} disabled={!periodFlow || isSubmitting}
                    className={`w-full text-white font-bold py-3.5 mt-auto disabled:opacity-40 ${clay.press}`}
                    style={{ background: CAT_COLORS.period.active, borderRadius: '10px', boxShadow: `${shadowL} ${CAT_COLORS.period.shadow}` }}>
                    保存
                  </button>
                </div>
              )}

              {/* ── Symptom ── */}
              {recordMode === 'symptom' && (
                <div className="flex flex-col h-full">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">症状（可多选）</span>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {['痛经','腹胀','头痛','情绪低落','疲劳','PMS','腰痛','恶心','乳房胀痛'].map(sym => (
                      <button key={sym} onClick={() => toggleSymptom(sym)}
                        className={`px-3 py-1.5 text-xs font-semibold ${clay.pressSmall}`}
                        style={{
                          borderRadius: '10px',
                          background: periodSymptoms.includes(sym) ? CAT_COLORS.symptom.active : '#fff',
                          color: periodSymptoms.includes(sym) ? '#fff' : '#64748b',
                          boxShadow: periodSymptoms.includes(sym) ? `${shadowS} ${CAT_COLORS.symptom.shadow}` : `${shadowS} #e0dcd8`,
                          border: '1px solid rgba(0,0,0,0.03)',
                        }}>
                        {sym}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleSubmitSymptom} disabled={periodSymptoms.length === 0 || isSubmitting}
                    className={`w-full text-white font-bold py-3.5 mt-auto disabled:opacity-40 ${clay.press}`}
                    style={{ background: CAT_COLORS.symptom.active, borderRadius: '10px', boxShadow: `${shadowL} ${CAT_COLORS.symptom.shadow}` }}>
                    保存
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthApp;

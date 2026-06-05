import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { CaretLeft, CaretRight, Plus, X, Drop, PencilSimple, Trash, ArrowClockwise } from '@phosphor-icons/react';
import {
  HealthEvent, WorkoutHealthEvent, PeriodHealthEvent, SymptomHealthEvent,
  PeriodFlow, saveHealthEvent, deleteHealthEvent, getAllHealthEvents, buildEventMap,
  getEventsByType,
} from '../utils/healthDb';
import { calcCycleStatus } from '../utils/cycleCalc';

// ── Constants ──────────────────────────────────────────────────────────────────

const FLOW_DOT: Record<PeriodFlow, string> = {
  heavy:    'bg-red-500',
  medium:   'bg-red-400',
  light:    'bg-rose-300',
  spotting: 'bg-pink-300',
};
const FLOW_LABEL: Record<PeriodFlow, string> = {
  heavy: '量多', medium: '量中', light: '量少', spotting: '点滴',
};
const MONTH_NAMES = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
const WEEKDAYS    = ['日','一','二','三','四','五','六'];

const toDateStr = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ── LLM workout parser ─────────────────────────────────────────────────────────

interface ParsedWorkout {
  parts: string[];
  duration: number;
  calories?: number;
  summary: string;
}

async function parseWorkoutText(
  text: string,
  apiBase: string,
  apiKey: string,
  model: string,
): Promise<ParsedWorkout | null> {
  const systemPrompt = `你是一个健身数据提取助手。从用户的自然语言训练记录中，提取以下字段并以 JSON 格式返回：
- parts: 训练部位数组，从这些选项中选（可多选）：胸、臀、背、腿、肩、手臂、核心、全身。没有明确提及的不要猜。
- duration: 总时长（分钟，整数）。没有提及则填 60。
- calories: 消耗热量（数字，可选，没有明确数字则不填）。
- summary: 主要动作的简短摘要，格式如"杠铃划船×3 / 负重深蹲×3 / 高位下拉×3 + 跑步机30min"，最多50字。

只返回 JSON，不要解释。示例：
{"parts":["背","腿"],"duration":90,"calories":480,"summary":"杠铃划船×3 / 负重深蹲×3 / 高位下拉×3 + 跑步机30min"}`;

  try {
    const base = apiBase.replace(/\/+$/, '');
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || 'sk-none'}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: text },
        ],
        temperature: 0.2,
        max_tokens: 300,
        stream: false,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? '';
    // 提取 JSON（有时 LLM 会套上 ```json ... ```）
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as ParsedWorkout;
  } catch {
    return null;
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

const HealthApp: React.FC = () => {
  const { closeApp, addToast, apiConfig } = useOS();

  const today    = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate());

  // ── Calendar navigation ──
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // ── Data ──
  const [allEvents,   setAllEvents]   = useState<HealthEvent[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);

  // ── Record modal ──
  const [recordMode, setRecordMode] = useState<null | 'workout' | 'period' | 'symptom'>(null);
  const [recordText, setRecordText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Period / symptom form
  const [periodFlow,     setPeriodFlow]     = useState<PeriodFlow | null>(null);
  const [periodSymptoms, setPeriodSymptoms] = useState<string[]>([]);
  const [periodDate,     setPeriodDate]     = useState(todayStr);
  // Edit mode: store the id of the event being edited
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Load data ──
  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const events = await getAllHealthEvents();
      setAllEvents(events);
    } catch (err) {
      console.error('[HealthApp] Failed to load events:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Derived data ──
  const eventMap = useMemo(() => buildEventMap(allEvents), [allEvents]);

  const periodEvents = useMemo(
    () => allEvents.filter((e): e is PeriodHealthEvent => e.type === 'period'),
    [allEvents]
  );

  const cycleStatus = useMemo(() => calcCycleStatus(periodEvents), [periodEvents]);

  // Ovulation window set for O(1) lookup
  const ovulationSet = useMemo(
    () => new Set(cycleStatus.ovulationWindow),
    [cycleStatus.ovulationWindow]
  );

  // ── Calendar grid ──
  const calendarDays = useMemo(() => {
    const firstDay   = new Date(viewYear, viewMonth - 1, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  };

  // ── Selected day ──
  const selectedEvents = selectedDate ? (eventMap[selectedDate] || []) : [];
  const selWorkout = selectedEvents.find(e => e.type === 'workout') as WorkoutHealthEvent | undefined;
  const selPeriod  = selectedEvents.find(e => e.type === 'period')  as PeriodHealthEvent  | undefined;
  const selSymptom = selectedEvents.find(e => e.type === 'symptom') as SymptomHealthEvent | undefined;

  // ── Modal close / reset ──
  const closeRecord = () => {
    setRecordMode(null);
    setRecordText('');
    setPeriodFlow(null);
    setPeriodSymptoms([]);
    setPeriodDate(todayStr);
    setEditingId(null);
  };

  // ── Submit: Workout ──
  const handleSubmitWorkout = async () => {
    if (!recordText.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      let parsed: ParsedWorkout | null = null;

      // LLM 提取（需要有 apiConfig）
      if (apiConfig?.baseUrl && apiConfig?.model) {
        parsed = await parseWorkoutText(
          recordText,
          apiConfig.baseUrl,
          apiConfig.apiKey,
          apiConfig.model,
        );
      }

      // Fallback：LLM 失败时做最简 fallback
      const event: WorkoutHealthEvent = {
        id:       editingId ?? `workout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date:     selectedDate ?? todayStr,
        createdAt: Date.now(),
        type:     'workout',
        parts:    parsed?.parts    ?? [],
        duration: parsed?.duration ?? 60,
        calories: parsed?.calories,
        summary:  parsed?.summary  ?? recordText.slice(0, 80),
        rawInput: recordText,
      };

      await saveHealthEvent(event);
      await loadEvents();
      closeRecord();
      addToast(editingId ? '训练记录已更新 ✓' : '训练记录已保存 ✓', 'success');
    } catch (err) {
      console.error('[HealthApp] Save workout error:', err);
      addToast('保存失败，请重试', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Submit: Period ──
  const handleSubmitPeriod = async () => {
    if (!periodFlow) return;
    setIsSubmitting(true);
    try {
      const event: PeriodHealthEvent = {
        id:        editingId ?? `period_${periodDate}_${Math.random().toString(36).slice(2, 7)}`,
        date:      periodDate,
        createdAt: Date.now(),
        type:      'period',
        flow:      periodFlow,
      };
      await saveHealthEvent(event);
      await loadEvents();
      closeRecord();
      addToast(editingId ? '经期记录已更新 ✓' : '经期记录已保存 ✓', 'success');
    } catch (err) {
      console.error('[HealthApp] Save period error:', err);
      addToast('保存失败，请重试', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Submit: Symptom ──
  const handleSubmitSymptom = async () => {
    if (periodSymptoms.length === 0) return;
    setIsSubmitting(true);
    try {
      const event: SymptomHealthEvent = {
        id:        editingId ?? `symptom_${periodDate}_${Math.random().toString(36).slice(2, 7)}`,
        date:      periodDate,
        createdAt: Date.now(),
        type:      'symptom',
        symptoms:  periodSymptoms,
      };
      await saveHealthEvent(event);
      await loadEvents();
      closeRecord();
      addToast(editingId ? '症状记录已更新 ✓' : '症状已保存 ✓', 'success');
    } catch (err) {
      console.error('[HealthApp] Save symptom error:', err);
      addToast('保存失败，请重试', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Delete ──
  const handleDelete = async (id: string, label: string) => {
    try {
      await deleteHealthEvent(id);
      await loadEvents();
      addToast(`${label}已删除`, 'success');
    } catch {
      addToast('删除失败', 'error');
    }
  };

  // ── Edit helpers ──
  const startEditWorkout = (w: WorkoutHealthEvent) => {
    setEditingId(w.id);
    setRecordText(w.rawInput ?? w.summary);
    setSelectedDate(w.date);
    setRecordMode('workout');
  };

  const startEditPeriod = (p: PeriodHealthEvent) => {
    setEditingId(p.id);
    setPeriodFlow(p.flow);
    setPeriodDate(p.date);
    setRecordMode('period');
  };

  const startEditSymptom = (s: SymptomHealthEvent) => {
    setEditingId(s.id);
    setPeriodSymptoms(s.symptoms);
    setPeriodDate(s.date);
    setRecordMode('symptom');
  };

  const toggleSymptom = (sym: string) =>
    setPeriodSymptoms(prev => prev.includes(sym) ? prev.filter(x => x !== sym) : [...prev, sym]);

  // ── Open modal: + button ──
  const openRecord = (mode: 'workout' | 'period' | 'symptom') => {
    setPeriodDate(selectedDate ?? todayStr);
    setRecordMode(mode);
  };

  // ── Clay theme ────────────────────────────────────────────────────────────────
  const shadowL = '2px 4px 0 1px';
  const shadowS = '1px 3px 0 1px';
  const insetShadow = 'inset -2px -2px 4px rgba(255,255,255,0.7), inset 2px 2px 4px rgba(0,0,0,0.07)';
  const clay = {
    bg: '#f5f4f2',
    card:      { background: '#fff', borderRadius: '14px', boxShadow: `${shadowL} #e0dcd8`, border: '1px solid rgba(0,0,0,0.03)' },
    cardGreen: { background: '#f0fdf8', borderRadius: '14px', boxShadow: `${shadowL} #98d4c0`, border: '1px solid rgba(16,185,129,0.08)' },
    cardRose:  { background: '#fff5f6', borderRadius: '14px', boxShadow: `${shadowL} #f0b0b8`, border: '1px solid rgba(251,113,133,0.08)' },
    cardViolet:{ background: '#f5f3ff', borderRadius: '14px', boxShadow: `${shadowL} #baa8f0`, border: '1px solid rgba(167,139,250,0.08)' },
    btnPrimary:{ background: '#475569', borderRadius: '10px', boxShadow: `${shadowL} #d0ccc8` },
    press:      'active:translate-y-[3px] transition-transform duration-150',
    pressSmall: 'active:translate-y-[2px] transition-transform duration-150',
  } as const;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden relative" style={{ background: clay.bg }}>

      {/* ── Header ── */}
      <div className="shrink-0 pt-12 pb-3 px-4 flex items-center justify-between sticky top-0 z-20"
        style={{ background: clay.bg }}>
        <button onClick={closeApp}
          className={`w-9 h-9 flex items-center justify-center ${clay.pressSmall}`}
          style={{ background: '#fff', borderRadius: '10px', boxShadow: `${shadowS} #e0dcd8`, border: '1px solid rgba(0,0,0,0.03)' }}>
          <CaretLeft size={18} weight="bold" className="text-slate-500" />
        </button>

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

        <button
          onClick={() => openRecord('workout')}
          className={`flex items-center gap-1 text-white text-xs font-bold px-3 py-2 ${clay.press}`}
          style={clay.btnPrimary}>
          <Plus size={13} weight="bold" />
          记录
        </button>
      </div>

      {/* ── Cycle Status ── */}
      <div className="shrink-0 mx-4 mt-2 px-4 py-2.5 flex items-center justify-between" style={clay.card}>
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

      {/* ── Legend ── */}
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
        {isLoading && (
          <div className="ml-auto">
            <ArrowClockwise size={12} className="text-slate-300 animate-spin" />
          </div>
        )}
      </div>

      {/* ── Calendar ── */}
      <div className="shrink-0 px-4 mt-3">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-slate-400 py-1">{d}</div>
          ))}
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
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSel ? null : dateStr)}
                className={`flex flex-col items-center justify-center h-11 ${clay.pressSmall}`}
                style={{
                  borderRadius: '10px',
                  background: isSel ? '#475569' : isOvul ? '#e8f4ff' : isToday ? '#f1f5f9' : '#fff',
                  boxShadow:   isSel ? `${shadowS} #d0ccc8` : `${shadowS} #e0dcd8`,
                  border: '1px solid rgba(0,0,0,0.03)',
                }}>
                <span className={`text-sm leading-none mb-1 font-semibold ${
                  isSel ? 'text-white' : isToday ? 'text-slate-900' : 'text-slate-700'
                }`}>{day}</span>
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

      {/* ── Divider ── */}
      <div className="shrink-0 mx-4 mt-3 h-px" style={{ background: '#e0dcd8' }} />

      {/* ── Detail Section ── */}
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
            <p className="text-slate-400 text-sm">
              {viewMonth}月{parseInt(selectedDate.split('-')[2])}日 · 暂无记录
            </p>
            <div className="flex gap-2">
              {([
                { id: 'workout' as const, label: '+ 训练', bg: '#f0fdf8', color: '#10b981' },
                { id: 'period'  as const, label: '+ 经期', bg: '#fff5f6', color: '#fb7185' },
                { id: 'symptom' as const, label: '+ 症状', bg: '#f5f3ff', color: '#a78bfa' },
              ]).map(btn => (
                <button key={btn.id} onClick={() => openRecord(btn.id)}
                  className={`text-xs font-bold px-3 py-2 ${clay.pressSmall}`}
                  style={{ background: btn.bg, borderRadius: '10px', color: btn.color, boxShadow: `${shadowS} #e0dcd8` }}>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs font-bold text-slate-400 mb-3 tracking-wider">
              {viewMonth}月{parseInt(selectedDate.split('-')[2])}日
            </p>

            {selWorkout && (
              <div className="mb-3 p-3.5" style={clay.cardGreen}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">💪</span>
                  <span className="text-sm font-bold text-emerald-700">
                    {selWorkout.parts.length > 0 ? selWorkout.parts.join(' + ') : '训练'}
                  </span>
                  <span className="text-xs text-emerald-500">
                    {selWorkout.duration}min{selWorkout.calories ? ` · ${selWorkout.calories}kcal` : ''}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => startEditWorkout(selWorkout)}
                      className={`p-2 ${clay.pressSmall}`}
                      style={{ borderRadius: '10px', background: '#d1fae5', boxShadow: `${shadowS} #98d4c0` }}>
                      <PencilSimple size={14} className="text-emerald-600" />
                    </button>
                    <button onClick={() => handleDelete(selWorkout.id, '训练记录')}
                      className={`p-2 ${clay.pressSmall}`}
                      style={{ borderRadius: '10px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                      <Trash size={14} className="text-rose-500" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-emerald-600/70 leading-relaxed pl-6">{selWorkout.summary}</p>
              </div>
            )}

            {selPeriod && (
              <div className="mb-3 p-3.5" style={clay.cardRose}>
                <div className="flex items-center gap-3">
                  <Drop size={15} weight="fill" className="text-rose-400 shrink-0" />
                  <span className="text-sm font-bold text-rose-600">经期</span>
                  <span className="text-xs text-rose-400 px-2 py-0.5 rounded-full font-medium"
                    style={{ background: '#ffd8de' }}>
                    {FLOW_LABEL[selPeriod.flow]}
                  </span>
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => startEditPeriod(selPeriod)}
                      className={`p-2 ${clay.pressSmall}`}
                      style={{ borderRadius: '10px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                      <PencilSimple size={14} className="text-rose-500" />
                    </button>
                    <button onClick={() => handleDelete(selPeriod.id, '经期记录')}
                      className={`p-2 ${clay.pressSmall}`}
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
                  <span className="text-sm">⚡</span>
                  <span className="text-sm font-bold text-violet-600">症状</span>
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => startEditSymptom(selSymptom)}
                      className={`p-2 ${clay.pressSmall}`}
                      style={{ borderRadius: '10px', background: '#ede9fe', boxShadow: `${shadowS} #baa8f0` }}>
                      <PencilSimple size={14} className="text-violet-500" />
                    </button>
                    <button onClick={() => handleDelete(selSymptom.id, '症状记录')}
                      className={`p-2 ${clay.pressSmall}`}
                      style={{ borderRadius: '10px', background: '#ffe4e8', boxShadow: `${shadowS} #f0b0b8` }}>
                      <Trash size={14} className="text-rose-500" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-5">
                  {selSymptom.symptoms.map(s => (
                    <span key={s} className="text-xs px-2.5 py-1 rounded-full font-semibold text-violet-600"
                      style={{ background: '#ede9fe', boxShadow: '0 2px 0 0 #c8b8f8' }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 同一天还没有的类型——快速添加 */}
            <div className="flex gap-2 mt-3">
              {!selWorkout && (
                <button onClick={() => openRecord('workout')}
                  className={`text-xs font-bold px-3 py-1.5 ${clay.pressSmall}`}
                  style={{ background: '#f0fdf8', borderRadius: '10px', color: '#10b981', boxShadow: `${shadowS} #e0dcd8` }}>
                  + 训练
                </button>
              )}
              {!selPeriod && (
                <button onClick={() => openRecord('period')}
                  className={`text-xs font-bold px-3 py-1.5 ${clay.pressSmall}`}
                  style={{ background: '#fff5f6', borderRadius: '10px', color: '#fb7185', boxShadow: `${shadowS} #e0dcd8` }}>
                  + 经期
                </button>
              )}
              {!selSymptom && (
                <button onClick={() => openRecord('symptom')}
                  className={`text-xs font-bold px-3 py-1.5 ${clay.pressSmall}`}
                  style={{ background: '#f5f3ff', borderRadius: '10px', color: '#a78bfa', boxShadow: `${shadowS} #e0dcd8` }}>
                  + 症状
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Record Modal ── */}
      {recordMode && (
        <div className="absolute inset-0 bg-black/15 backdrop-blur-sm z-50 flex items-end"
          onClick={(e) => { if (e.target === e.currentTarget) closeRecord(); }}>
          <div className="w-full px-4 pt-5 pb-10" style={{ background: clay.bg, borderRadius: '16px 16px 0 0', boxShadow: `0 -4px 0 1px #e0dcd8, 0 -8px 24px rgba(200,192,184,0.12)` }}>

            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-bold text-slate-700">
                {editingId ? '编辑记录' : '新记录'}
              </span>
              <button onClick={closeRecord}
                className={`w-7 h-7 flex items-center justify-center ${clay.pressSmall}`}
                style={{ background: '#fff', borderRadius: '8px', boxShadow: `${shadowS} #e0dcd8`, border: '1px solid rgba(0,0,0,0.03)' }}>
                <X size={14} className="text-slate-400" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex mb-4 p-1.5"
              style={{ background: '#eae8e5', borderRadius: '12px', boxShadow: insetShadow }}>
              {([
                { id: 'workout' as const, icon: '💪', label: '训练', color: '#10b981' },
                { id: 'period'  as const, icon: '🩸', label: '经期', color: '#fb7185' },
                { id: 'symptom' as const, icon: '⚡', label: '症状', color: '#a78bfa' },
              ]).map(tab => (
                <button key={tab.id}
                  onClick={() => { setRecordMode(tab.id); setEditingId(null); }}
                  className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-bold transition-all duration-150"
                  style={{
                    borderRadius: '8px',
                    background: recordMode === tab.id ? tab.color : 'transparent',
                    color:      recordMode === tab.id ? '#fff' : '#94a3b8',
                    boxShadow:  recordMode === tab.id ? '1px 2px 0 1px #d0ccc8' : 'none',
                  }}>
                  <span>{tab.icon}</span> {tab.label}
                </button>
              ))}
            </div>

            {/* Content area */}
            <div className="flex flex-col" style={{ minHeight: '240px' }}>

              {/* Workout */}
              {recordMode === 'workout' && (
                <div className="flex flex-col flex-1">
                  <textarea
                    value={recordText}
                    onChange={e => setRecordText(e.target.value)}
                    placeholder={"直接说就好～\n比如：刚练完背腿，杠铃划船三组、深蹲三组，消耗480kcal"}
                    className="w-full flex-1 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none leading-relaxed"
                    style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)', minHeight: '128px' }}
                    autoFocus
                  />
                  {isSubmitting && (
                    <p className="text-xs text-slate-400 mt-2 text-center">AI 解析中…</p>
                  )}
                  <div className="mt-auto pt-3">
                    <button onClick={handleSubmitWorkout}
                      disabled={!recordText.trim() || isSubmitting}
                      className={`w-full text-white font-bold py-3.5 disabled:opacity-50 ${clay.press}`}
                      style={clay.btnPrimary}>
                      {isSubmitting ? '解析中…' : '保存'}
                    </button>
                  </div>
                </div>
              )}

              {/* Period */}
              {recordMode === 'period' && (
                <div className="flex flex-col flex-1">
                  <div className="mb-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">日期</span>
                    <input type="date" value={periodDate} onChange={e => setPeriodDate(e.target.value)}
                      className="mt-1.5 w-full px-4 py-2.5 text-sm text-slate-700 focus:outline-none"
                      style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)' }} />
                  </div>
                  <div className="mb-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">经期量</span>
                    <div className="flex gap-2 mt-1.5">
                      {(['spotting','light','medium','heavy'] as PeriodFlow[]).map(f => (
                        <button key={f} onClick={() => setPeriodFlow(f)}
                          className={`flex-1 py-2 text-xs font-bold ${clay.pressSmall}`}
                          style={{
                            borderRadius: '10px',
                            background: periodFlow === f ? '#fb7185' : '#fff',
                            color:      periodFlow === f ? '#fff' : '#64748b',
                            boxShadow:  periodFlow === f ? `${shadowS} #d0ccc8` : `${shadowS} #e0dcd8`,
                            border: '1px solid rgba(0,0,0,0.03)',
                          }}>
                          {FLOW_LABEL[f]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-auto pt-3">
                    <button onClick={handleSubmitPeriod} disabled={!periodFlow || isSubmitting}
                      className={`w-full text-white font-bold py-3.5 disabled:opacity-40 ${clay.press}`}
                      style={clay.btnPrimary}>
                      保存
                    </button>
                  </div>
                </div>
              )}

              {/* Symptom */}
              {recordMode === 'symptom' && (
                <div className="flex flex-col flex-1">
                  <div className="mb-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">日期</span>
                    <input type="date" value={periodDate} onChange={e => setPeriodDate(e.target.value)}
                      className="mt-1.5 w-full px-4 py-2.5 text-sm text-slate-700 focus:outline-none"
                      style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)' }} />
                  </div>
                  <div className="mb-4">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">症状（可多选）</span>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {['痛经','腹胀','头痛','情绪低落','疲劳','PMS','腰痛','恶心','乳房胀痛'].map(sym => (
                        <button key={sym} onClick={() => toggleSymptom(sym)}
                          className={`px-3 py-1.5 text-xs font-semibold ${clay.pressSmall}`}
                          style={{
                            borderRadius: '10px',
                            background: periodSymptoms.includes(sym) ? '#a78bfa' : '#fff',
                            color:      periodSymptoms.includes(sym) ? '#fff' : '#64748b',
                            boxShadow:  periodSymptoms.includes(sym) ? `${shadowS} #d0ccc8` : `${shadowS} #e0dcd8`,
                            border: '1px solid rgba(0,0,0,0.03)',
                          }}>
                          {sym}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-auto pt-3">
                    <button onClick={handleSubmitSymptom} disabled={periodSymptoms.length === 0 || isSubmitting}
                      className={`w-full text-white font-bold py-3.5 disabled:opacity-40 ${clay.press}`}
                      style={clay.btnPrimary}>
                      保存
                    </button>
                  </div>
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

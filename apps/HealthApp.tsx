import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { CaretLeft, CaretRight, Plus, X, Drop, PencilSimple, Trash, ArrowClockwise, Camera, Gear, TrendUp } from '@phosphor-icons/react';
import {
  HealthEvent, WorkoutHealthEvent, PeriodHealthEvent, SymptomHealthEvent,
  SleepHealthEvent, DietHealthEvent, WeightHealthEvent,
  PeriodFlow, SleepQuality,
  saveHealthEvent, deleteHealthEvent, getAllHealthEvents, buildEventMap,
} from '../utils/healthDb';
import { calcCycleStatus } from '../utils/cycleCalc';
import { HealthProfile, FitnessGoal, getHealthProfile, saveHealthProfile, calcBMR, calcTDEE, recommendCalories, calcDeficit } from '../utils/healthProfile';
import { safeFetchJson, extractJson } from '../utils/safeApi';

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
  workout: { bg: '#C6EDD8', fg: '#0D5C30', active: '#4CD964', border: '#C6EDD8', shadow: '#1A9455' },
  sleep:   { bg: '#C5D9F5', fg: '#0D3472', active: '#5AC8FA', border: '#C5D9F5', shadow: '#1A4FA8' },
  diet:    { bg: '#FAE5B0', fg: '#6B3D08', active: '#FFD60A', border: '#FAE5B0', shadow: '#D4860F' },
  period:  { bg: '#F9CEDE', fg: '#6B0E2E', active: '#FF6FA8', border: '#F9CEDE', shadow: '#C2185B' },
  symptom: { bg: '#E0D0F5', fg: '#3D1278', active: '#BF5AF2', border: '#E0D0F5', shadow: '#6B2FB5' },
} as const;

const MACRO_COLORS = {
  protein: '#0D9488',
  carbs:   '#D4860F',
  fat:     '#E07C5A',
} as const;

const TAB_ORDER: { id: RecordMode; label: string }[] = [
  { id: 'workout', label: '训练' },
  { id: 'sleep',   label: '睡眠' },
  { id: 'diet',    label: '饮食' },
  { id: 'period',  label: '经期' },
  { id: 'symptom', label: '症状' },
];

const WORKOUT_ACTIVITIES = ['力量', '跑步', '走路', '游泳', '骑行', '球类', '瑜伽/拉伸', '操课/有氧', '爬山', '其他'];
const WORKOUT_PARTS = ['胸', '背', '腿', '臀', '肩', '手臂', '核心', '全身'];

// 弹窗高度：默认 420px；训练/饮食可拖到屏幕 85%
const MODAL_BASE_H = 420;

// ── LLM parsers ───────────────────────────────────────────────────────────────

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
    const data = await safeFetchJson(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey || 'sk-none'}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }], temperature: 0.2, max_tokens: 300, stream: false }),
    });
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? '';
    return extractJson(raw) as ParsedDiet | null;
  } catch (err) { console.warn('[parseDietText]', err); return null; }
}

interface ParsedDietImage extends ParsedDiet {
  description?: string;
}

/** 拍照识图：base64 图片 → vision 模型估算营养（OpenAI 兼容 image_url 格式，Gemini 等支持） */
async function parseDietImage(imageDataUrl: string, apiBase: string, apiKey: string, model: string): Promise<ParsedDietImage | null> {
  const systemPrompt = `你是一个营养估算助手。识别图片中的食物，估算营养数据并以 JSON 格式返回：
- description: 食物清单简述（如"红烧肉半份、白米饭一碗"，最多50字）
- calories: 总热量 kcal（整数）
- protein: 蛋白质 g（整数）
- carbs: 碳水化合物 g（整数）
- fat: 脂肪 g（整数）
- fiber: 膳食纤维 g（整数）
根据图中份量尽可能准确估算，中国家常菜按常见做法估。只返回 JSON，不要解释。`;
  try {
    const base = apiBase.replace(/\/+$/, '');
    const data = await safeFetchJson(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey || 'sk-none'}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            { type: 'text', text: '识别这张图里的食物并估算营养。' },
          ] },
        ],
        temperature: 0.2, max_tokens: 500, stream: false,
      }),
    });
    const raw = data?.choices?.[0]?.message?.content?.trim() ?? '';
    return extractJson(raw) as ParsedDietImage | null;
  } catch (err) { console.warn('[parseDietImage]', err); return null; }
}

/** 压缩图片到最长边 1024px 的 JPEG data URL，控制 base64 体积 */
function compressImage(file: File, maxDim = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas unavailable')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
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
  const [todayViewOffset, setTodayViewOffset] = useState(0);

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
  // Workout direct input
  const [workoutCalories, setWorkoutCalories] = useState<number | ''>('');
  const [workoutDuration, setWorkoutDuration] = useState<number | ''>(60);
  const [workoutParts, setWorkoutParts] = useState<string[]>([]);
  const [workoutActivities, setWorkoutActivities] = useState<string[]>([]);
  // Camera menu
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  // Modal height drag（训练/饮食可拖高）
  const [modalHeight, setModalHeight] = useState(MODAL_BASE_H);
  const [isDraggingModal, setIsDraggingModal] = useState(false);
  const modalDragRef = React.useRef({ startY: 0, startH: MODAL_BASE_H, maxH: 700 });
  // Health profile + weight trend
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [showWeightTrend, setShowWeightTrend] = useState(false);
  // Profile form fields
  const [pfHeight, setPfHeight] = useState<number | ''>('');
  const [pfWeight, setPfWeight] = useState<number | ''>('');
  const [pfAge, setPfAge]       = useState<number | ''>('');
  const [pfSex, setPfSex]       = useState<'F' | 'M'>('F');
  const [pfBf, setPfBf]         = useState<number | ''>('');
  const [pfGoal, setPfGoal]     = useState<FitnessGoal>('maintain');
  const [pfCalTarget, setPfCalTarget]       = useState<number | ''>('');
  const [pfWorkoutTarget, setPfWorkoutTarget] = useState<number | ''>(500);
  const [pfSleepTarget, setPfSleepTarget]   = useState<number | ''>(8);

  // ── Load data ──
  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try { setAllEvents(await getAllHealthEvents()); }
    catch (err) { console.error('[HealthApp] Failed to load events:', err); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // ── Load profile ──
  useEffect(() => {
    const p = getHealthProfile();
    setProfile(p);
    if (!p) setShowProfileSetup(true); // 第一次打开时弹设置
  }, []);

  // ── Derived data ──
  const eventMap     = useMemo(() => buildEventMap(allEvents), [allEvents]);
  const periodEvents = useMemo(() => allEvents.filter((e): e is PeriodHealthEvent => e.type === 'period'), [allEvents]);
  const cycleStatus  = useMemo(() => calcCycleStatus(periodEvents), [periodEvents]);
  const ovulationSet = useMemo(() => new Set(cycleStatus.ovulationWindow), [cycleStatus.ovulationWindow]);

  // ── Today tab viewed date (arrow navigation) ──
  const viewDay = new Date(today);
  viewDay.setDate(viewDay.getDate() + todayViewOffset);
  const viewDayStr = toDateStr(viewDay.getFullYear(), viewDay.getMonth() + 1, viewDay.getDate());

  // ── Today's events (uses viewed date) ──
  const todayEvents = useMemo(() => eventMap[viewDayStr] || [], [eventMap, viewDayStr]);
  const todayWorkout = todayEvents.find(e => e.type === 'workout') as WorkoutHealthEvent | undefined;
  const todaySleep   = todayEvents.find(e => e.type === 'sleep')   as SleepHealthEvent   | undefined;
  const todayDiets   = todayEvents.filter(e => e.type === 'diet')  as DietHealthEvent[];
  const todayDietTotal = todayDiets.reduce((s, d) => s + d.calories, 0);
  const dietProteinKcal = todayDiets.reduce((s, d) => s + (d.protein ?? 0), 0) * 4;
  const dietCarbsKcal   = todayDiets.reduce((s, d) => s + (d.carbs ?? 0), 0) * 4;
  const dietFatKcal     = todayDiets.reduce((s, d) => s + (d.fat ?? 0), 0) * 9;
  const dietHasMacros   = dietProteinKcal + dietCarbsKcal + dietFatKcal > 0;
  const todayPeriod  = todayEvents.find(e => e.type === 'period')  as PeriodHealthEvent  | undefined;
  const todaySymptom = todayEvents.find(e => e.type === 'symptom') as SymptomHealthEvent | undefined;
  // Weight always uses actual today for recording
  const todayWeight = (eventMap[todayStr] || []).find(e => e.type === 'weight') as WeightHealthEvent | undefined;

  // ── BMR, targets & deficit ──
  const bmr = useMemo(() => profile ? calcBMR(profile) : 0, [profile]);
  const calTarget      = profile?.dailyCalorieTarget ?? (bmr ? calcTDEE(bmr) : 2000);
  const workoutTarget  = profile?.workoutCalorieTarget ?? 500;
  const sleepTarget    = profile?.sleepMinuteTarget ?? 480;
  const exerciseCal = todayWorkout?.calories ?? 0;
  const deficit = calTarget ? calcDeficit(calTarget, exerciseCal, todayDietTotal) : null;

  // ── Weight history (last 30 entries) ──
  const weightHistory = useMemo(() =>
    allEvents
      .filter((e): e is WeightHealthEvent => e.type === 'weight')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30),
    [allEvents]
  );

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
    setWorkoutCalories(''); setWorkoutDuration(60); setWorkoutParts([]); setWorkoutActivities([]);
    setShowCameraMenu(false);
    setModalHeight(MODAL_BASE_H);
  };

  // ── Submit: Workout ──
  const handleSubmitWorkout = async () => {
    if ((workoutActivities.length === 0 && !recordText.trim() && !workoutCalories) || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // summary 供角色读取："力量（背+腿）+跑步" 或备注摘要
      const actLabel = workoutActivities.map(a =>
        a === '力量' && workoutParts.length > 0 ? `力量（${workoutParts.join('+')}）` : a
      ).join('+');
      const event: WorkoutHealthEvent = {
        id: editingId ?? `workout_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: periodDate, createdAt: Date.now(), type: 'workout',
        activities: workoutActivities,
        parts: workoutParts, duration: workoutDuration ? Number(workoutDuration) : 60,
        calories: workoutCalories ? Number(workoutCalories) : undefined,
        summary: actLabel || (recordText.trim() ? recordText.slice(0, 80) : '训练'),
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
        date: periodDate, createdAt: Date.now(), type: 'sleep',
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
        date: periodDate, createdAt: Date.now(), type: 'diet',
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

  // ── Image input handler (camera menu) ──
  const handleImageInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一张图
    if (!file) return;
    setShowCameraMenu(false);
    if (!file.type.startsWith('image/')) { addToast('请选择图片文件', 'error'); return; }
    if (!apiConfig?.baseUrl || !apiConfig?.model) { addToast('请先配置 API', 'error'); return; }
    setIsSubmitting(true);
    try {
      const dataUrl = await compressImage(file);
      const parsed = await parseDietImage(dataUrl, apiConfig.baseUrl, apiConfig.apiKey, apiConfig.model);
      if (parsed) {
        if (parsed.description) setDietText(parsed.description);
        setDietCalories(parsed.calories);
        if (parsed.protein != null) setDietProtein(parsed.protein);
        if (parsed.carbs != null)   setDietCarbs(parsed.carbs);
        if (parsed.fat != null)     setDietFat(parsed.fat);
        if (parsed.fiber != null)   setDietFiber(parsed.fiber);
        setDietParsed(true);
      } else { addToast('识图失败，试试文字描述', 'error'); }
    } catch (err) { console.warn('[handleImageInput]', err); addToast('识图失败', 'error'); }
    finally { setIsSubmitting(false); }
  };

  // ── Save profile ──
  const handleSaveProfile = () => {
    if (!pfHeight || !pfWeight || !pfAge) { addToast('请填写身高体重年龄', 'error'); return; }
    const bmrVal = calcBMR({ heightCm: Number(pfHeight), weightKg: Number(pfWeight), age: Number(pfAge), sex: pfSex, bodyFatPct: pfBf ? Number(pfBf) : undefined });
    const autoTarget = recommendCalories(bmrVal, pfGoal);
    const p: HealthProfile = {
      heightCm: Number(pfHeight), weightKg: Number(pfWeight), age: Number(pfAge), sex: pfSex,
      bodyFatPct: pfBf ? Number(pfBf) : undefined,
      goal: pfGoal,
      dailyCalorieTarget: pfCalTarget ? Number(pfCalTarget) : autoTarget,
      workoutCalorieTarget: pfWorkoutTarget ? Number(pfWorkoutTarget) : 500,
      sleepMinuteTarget: pfSleepTarget ? Number(pfSleepTarget) * 60 : 480,
    };
    saveHealthProfile(p);
    setProfile(p);
    setShowProfileSetup(false);
    addToast(`BMR ${bmrVal} · 目标 ${p.dailyCalorieTarget} kcal/天`, 'success');
  };

  const openProfileSetup = () => {
    if (profile) {
      setPfHeight(profile.heightCm); setPfWeight(profile.weightKg); setPfAge(profile.age); setPfSex(profile.sex); setPfBf(profile.bodyFatPct ?? '');
      setPfGoal(profile.goal ?? 'maintain');
      setPfCalTarget(profile.dailyCalorieTarget ?? '');
      setPfWorkoutTarget(profile.workoutCalorieTarget ?? 500);
      setPfSleepTarget(profile.sleepMinuteTarget ? profile.sleepMinuteTarget / 60 : 8);
    }
    setShowProfileSetup(true);
  };

  // ── Quick weight save ──
  const handleSaveWeight = async (value: number) => {
    const existing = todayWeight;
    const event: WeightHealthEvent = {
      id: existing?.id ?? `weight_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: todayStr, createdAt: Date.now(), type: 'weight', value,
    };
    await saveHealthEvent(event);
    await loadEvents();
    addToast(`体重 ${value}kg 已记录`, 'success');
  };

  // ── Delete ──
  const handleDelete = async (id: string, label: string) => {
    try { await deleteHealthEvent(id); await loadEvents(); addToast(`${label}已删除`, 'success'); }
    catch { addToast('删除失败', 'error'); }
  };

  // ── Edit helpers ──
  const startEditWorkout = (w: WorkoutHealthEvent) => { setEditingId(w.id); setRecordText(w.rawInput ?? ''); setWorkoutCalories(w.calories ?? ''); setWorkoutDuration(w.duration); setWorkoutParts(w.parts); setWorkoutActivities(w.activities ?? []); setSelectedDate(w.date); setRecordMode('workout'); };
  const startEditPeriod  = (p: PeriodHealthEvent)  => { setEditingId(p.id); setPeriodFlow(p.flow); setPeriodDate(p.date); setRecordMode('period'); };
  const startEditSymptom = (s: SymptomHealthEvent) => { setEditingId(s.id); setPeriodSymptoms(s.symptoms); setPeriodDate(s.date); setRecordMode('symptom'); };
  const startEditSleep   = (s: SleepHealthEvent)   => { setEditingId(s.id); setSleepBedtime(s.bedtime); setSleepWakeTime(s.wakeTime); setSleepQuality(s.quality); setSleepNote(s.note ?? ''); setRecordMode('sleep'); };
  const startEditDiet    = (d: DietHealthEvent)     => { setEditingId(d.id); setDietCalories(d.calories); setDietProtein(d.protein ?? ''); setDietCarbs(d.carbs ?? ''); setDietFat(d.fat ?? ''); setDietFiber(d.fiber ?? ''); setDietText(d.rawInput ?? ''); setDietNote(d.note ?? ''); setDietParsed(true); setRecordMode('diet'); };

  const toggleSymptom = (sym: string) =>
    setPeriodSymptoms(prev => prev.includes(sym) ? prev.filter(x => x !== sym) : [...prev, sym]);

  const openRecord = (mode: RecordMode) => {
    // Reset all form fields first
    setEditingId(null);
    setRecordText(''); setWorkoutCalories(''); setWorkoutDuration(60); setWorkoutParts([]); setWorkoutActivities([]);
    // 简单类型固定 420 高；训练/饮食保留当前拖拽高度
    if (mode !== 'workout' && mode !== 'diet') setModalHeight(MODAL_BASE_H);
    setPeriodFlow(null); setPeriodSymptoms([]);
    setSleepBedtime('23:00'); setSleepWakeTime('07:30'); setSleepQuality('good'); setSleepNote('');
    setDietText(''); setDietCalories(''); setDietProtein(''); setDietCarbs(''); setDietFat(''); setDietFiber(''); setDietNote(''); setDietParsed(false);
    setShowCameraMenu(false);

    const dateStr = topTab === 'today' ? viewDayStr : (selectedDate ?? todayStr);
    setPeriodDate(dateStr);
    const dayEvents = eventMap[dateStr] || [];

    // Auto-load existing record for this day (+ and edit share the same entry)
    switch (mode) {
      case 'workout': {
        const w = dayEvents.find(e => e.type === 'workout') as WorkoutHealthEvent | undefined;
        if (w) { setEditingId(w.id); setRecordText(w.rawInput ?? w.summary); setWorkoutCalories(w.calories ?? ''); setWorkoutDuration(w.duration); setWorkoutParts(w.parts); }
        break;
      }
      case 'sleep': {
        const s = dayEvents.find(e => e.type === 'sleep') as SleepHealthEvent | undefined;
        if (s) { setEditingId(s.id); setSleepBedtime(s.bedtime); setSleepWakeTime(s.wakeTime); setSleepQuality(s.quality); setSleepNote(s.note ?? ''); }
        break;
      }
      case 'diet': {
        const d = dayEvents.find(e => e.type === 'diet') as DietHealthEvent | undefined;
        if (d) { setEditingId(d.id); setDietText(d.rawInput ?? ''); setDietCalories(d.calories); setDietProtein(d.protein ?? ''); setDietCarbs(d.carbs ?? ''); setDietFat(d.fat ?? ''); setDietFiber(d.fiber ?? ''); setDietNote(d.note ?? ''); setDietParsed(true); }
        break;
      }
      case 'period': {
        const p = dayEvents.find(e => e.type === 'period') as PeriodHealthEvent | undefined;
        if (p) { setEditingId(p.id); setPeriodFlow(p.flow); }
        break;
      }
      case 'symptom': {
        const s = dayEvents.find(e => e.type === 'symptom') as SymptomHealthEvent | undefined;
        if (s) { setEditingId(s.id); setPeriodSymptoms(s.symptoms); }
        break;
      }
    }

    setRecordMode(mode);
  };

  // ── Clay Design Tokens ──────────────────────────────────────────────────────
  // Shadows: clay style — hard offset + soft secondary, single direction
  const SH = {
    btn:   '3px 5px 0 rgba(0,0,0,0.10), 3px 5px 6px rgba(0,0,0,0.06)',
    card:  '3px 5px 0 rgba(0,0,0,0.08), 4px 6px 10px rgba(0,0,0,0.06)',
    ring:  'inset 4px 4px 12px rgba(0,0,0,0.10), inset -4px -4px 10px rgba(255,255,255,0.70)',
    pill:  '2px 3px 0 rgba(0,0,0,0.08), 2px 3px 6px rgba(0,0,0,0.05)',
    tab:   '2px 3px 0 rgba(0,0,0,0.08), 3px 4px 8px rgba(0,0,0,0.05)',
    input: 'inset 2px 2px 6px rgba(0,0,0,0.06), inset -1px -1px 4px rgba(255,255,255,0.50)',
  };
  // Backward compat aliases (used in ~40 places)
  const shadowL = SH.btn;
  const shadowS = SH.pill;
  const insetShadow = SH.input;
  const clay = {
    bg: '#F5F5F7',
    card:       { background: '#fff', borderRadius: '20px', boxShadow: SH.card },
    cardGreen:  { background: CAT_COLORS.workout.bg, borderRadius: '20px', boxShadow: SH.card, borderLeft: `4px solid ${CAT_COLORS.workout.shadow}` },
    cardRose:   { background: CAT_COLORS.period.bg,  borderRadius: '20px', boxShadow: SH.card, borderLeft: `4px solid ${CAT_COLORS.period.shadow}` },
    cardViolet: { background: CAT_COLORS.symptom.bg, borderRadius: '20px', boxShadow: SH.card, borderLeft: `4px solid ${CAT_COLORS.symptom.shadow}` },
    cardIndigo: { background: CAT_COLORS.sleep.bg,   borderRadius: '20px', boxShadow: SH.card, borderLeft: `4px solid ${CAT_COLORS.sleep.shadow}` },
    cardAmber:  { background: CAT_COLORS.diet.bg,    borderRadius: '20px', boxShadow: SH.card, borderLeft: `4px solid ${CAT_COLORS.diet.shadow}` },
    btnPrimary: { background: '#3A3A4A', borderRadius: '50px', boxShadow: SH.btn },
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
      <div className="shrink-0 pt-12 pb-3 px-5 flex items-center justify-between sticky top-0 z-20" style={{ background: clay.bg }}>
        <button onClick={closeApp}
          className={`w-9 h-9 flex items-center justify-center ${clay.pressSmall}`}
          style={{ background: '#fff', borderRadius: '50px', boxShadow: SH.pill }}>
          <CaretLeft size={18} weight="bold" className="text-slate-500" />
        </button>

        {topTab === 'calendar' && (
          <div className="flex items-center gap-2 px-4 py-1.5"
            style={{ background: '#fff', borderRadius: '50px', boxShadow: SH.pill, width: 192 }}>
            <button onClick={prevMonth} className={clay.pressSmall}>
              <CaretLeft size={14} weight="bold" className="text-slate-400" />
            </button>
            <span className="text-sm font-bold text-slate-700 flex-1 text-center">
              {viewYear} · {MONTH_NAMES[viewMonth - 1]}
            </span>
            <button onClick={nextMonth} className={clay.pressSmall}>
              <CaretRight size={14} weight="bold" className="text-slate-400" />
            </button>
          </div>
        )}

        {topTab === 'today' && (
          <div className="flex items-center gap-2 px-4 py-1.5"
            style={{ background: '#fff', borderRadius: '50px', boxShadow: SH.pill, width: 192 }}>
            <button onClick={() => setTodayViewOffset(o => o - 1)} className={clay.pressSmall}>
              <CaretLeft size={14} weight="bold" className="text-slate-400" />
            </button>
            <span className="text-sm font-bold text-slate-700 flex-1 text-center whitespace-nowrap">
              {viewDay.getMonth() + 1}月{viewDay.getDate()}日 · 周{WEEKDAYS[viewDay.getDay()]}
            </span>
            <button onClick={() => setTodayViewOffset(o => o + 1)} className={clay.pressSmall}>
              <CaretRight size={14} weight="bold" className="text-slate-400" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowWeightTrend(v => !v)}
            className={`w-9 h-9 flex items-center justify-center ${clay.pressSmall}`}
            style={{ background: showWeightTrend ? CAT_COLORS.sleep.bg : '#fff', borderRadius: '50px', boxShadow: SH.pill }}>
            <TrendUp size={16} weight="bold" className={showWeightTrend ? 'text-indigo-500' : 'text-slate-400'} />
          </button>
          <button onClick={openProfileSetup}
            className={`w-9 h-9 flex items-center justify-center ${clay.pressSmall}`}
            style={{ background: '#fff', borderRadius: '50px', boxShadow: SH.pill }}>
            <Gear size={16} weight="bold" className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* ── Top tab bar (月历 / 今日) ── */}
      <div className="shrink-0 mx-5 mb-2 flex p-1"
        style={{ background: '#EBEBEB', borderRadius: '28px' }}>
        {([
          { id: 'calendar' as TopTab, label: '月历' },
          { id: 'today'    as TopTab, label: '今日' },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setTopTab(tab.id)}
            className={`flex-1 py-2 text-[13px] ${clay.pressSmall}`}
            style={{
              borderRadius: '24px',
              background: topTab === tab.id ? '#fff' : 'transparent',
              color: topTab === tab.id ? '#1d1d1f' : 'rgba(0,0,0,0.35)',
              fontWeight: topTab === tab.id ? 600 : 400,
              boxShadow: topTab === tab.id ? SH.tab : 'none',
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
          <div className="shrink-0 mx-5 mt-1 px-4 py-3.5 flex items-center justify-between"
            style={{
              background: cycleStatus.lastPeriodStart ? CAT_COLORS.period.bg : '#EBEBEB',
              borderRadius: '20px',
              boxShadow: cycleStatus.lastPeriodStart ? SH.card : SH.input,
            }}>
            <div className="flex items-center gap-1.5">
              <Drop size={13} weight="fill" style={{ color: cycleStatus.lastPeriodStart ? CAT_COLORS.period.shadow : '#aaa' }} />
              {cycleStatus.lastPeriodStart ? (
                <span className="text-[13px]" style={{ color: CAT_COLORS.period.fg }}>
                  周期第 <span className="font-bold" style={{ color: CAT_COLORS.period.shadow }}>{cycleStatus.cycleDay}</span> 天
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

          {/* Legend — pills for range fills, dots for event markers */}
          <div className="shrink-0 mx-5 mt-2 flex items-center gap-3 flex-wrap">
            {/* Range legends (pill = calendar background fill) */}
            <span className="text-[12px]" style={{
              background: CAT_COLORS.period.bg, color: CAT_COLORS.period.fg, fontWeight: 500,
              borderRadius: '9999px', padding: '4px 10px', boxShadow: SH.pill,
            }}>经期</span>
            <span className="text-[12px]" style={{
              background: CAT_COLORS.sleep.bg, color: CAT_COLORS.sleep.fg, fontWeight: 500,
              borderRadius: '9999px', padding: '4px 10px', boxShadow: SH.pill,
              border: `1.5px dashed ${CAT_COLORS.sleep.shadow}`,
            }}>排卵窗</span>
            {/* Dot legends (dot = calendar event dot) */}
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: CAT_COLORS.workout.fg, fontWeight: 500 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: CAT_COLORS.workout.shadow, flexShrink: 0 }} />训练
            </span>
            <span className="flex items-center gap-1.5 text-[12px]" style={{ color: CAT_COLORS.symptom.fg, fontWeight: 500 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: CAT_COLORS.symptom.shadow, flexShrink: 0 }} />症状
            </span>
            {isLoading && <div className="ml-auto"><ArrowClockwise size={12} className="text-slate-300 animate-spin" /></div>}
          </div>

          {/* Calendar */}
          <div className="shrink-0 px-5 mt-3">
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
                      borderRadius: '12px',
                      background: isSel ? '#CCCCD2'
                        : periodEv ? 'rgba(249,206,222,0.5)'
                        : isOvul ? 'rgba(197,217,245,0.5)'
                        : isToday ? '#E4E4E7'
                        : 'transparent',
                      boxShadow: isSel
                        ? 'inset 2px 2px 6px rgba(0,0,0,0.15), inset -1px -1px 4px rgba(255,255,255,0.50)'
                        : isToday
                        ? 'inset 2px 2px 6px rgba(0,0,0,0.10), inset -1px -1px 4px rgba(255,255,255,0.50)'
                        : 'none',
                    }}>
                    <span style={{
                      fontSize: '16px', lineHeight: 1, marginBottom: 2,
                      fontWeight: (isSel || isToday) ? 700 : 400,
                      color: (isSel || isToday) ? '#3A3A4A' : '#1d1d1f',
                    }}>{day}</span>
                    <div className="flex gap-0.5 items-center h-2">
                      {periodEv  && <div style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLORS.period.shadow }} />}
                      {hasWorkout && <div style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLORS.workout.shadow }} />}
                      {hasSymptom && <div style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLORS.symptom.shadow }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 mx-5 mt-3 h-px" style={{ background: '#EDECEA' }} />

          {/* Detail Section */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!selectedDate ? (
              <div className="flex flex-col items-center mt-8 gap-2">
                <div className="w-12 h-12 flex items-center justify-center" style={{ ...clay.card, borderRadius: '12px' }}>
                  <CaretRight size={20} className="text-slate-300" />
                </div>
                <p className="text-slate-400 text-sm">点击日期查看详情</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 tracking-wider">
                    {viewMonth}月{parseInt(selectedDate.split('-')[2])}日
                  </span>
                  <button onClick={() => openRecord('workout')}
                    className={`flex items-center gap-1 text-white text-[11px] font-bold px-2.5 py-1.5 ${clay.pressSmall}`}
                    style={clay.btnPrimary}>
                    <Plus size={11} weight="bold" /> 记录
                  </button>
                </div>

                {selectedEvents.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center mt-4">暂无记录</p>
                ) : (
                  <>

                {selWorkout && (
                  <div className="mb-3" style={{ ...clay.cardGreen, padding: '14px 16px' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 36, height: 36, borderRadius: '10px', background: CAT_COLORS.workout.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>训</div>
                      <div className="flex-1 min-w-0">
                        <span style={{ fontSize: '15px', fontWeight: 600, color: CAT_COLORS.workout.fg }}>训练</span>
                        <span className="ml-2" style={{ fontSize: '13px', fontWeight: 400, color: `${CAT_COLORS.workout.fg}99` }}>{selWorkout.duration}min{selWorkout.calories ? ` · ${selWorkout.calories}kcal` : ''}</span>
                      </div>
                      <div className="ml-auto flex gap-1 shrink-0">
                        <button onClick={() => startEditWorkout(selWorkout)} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '50px', background: CAT_COLORS.workout.bg, boxShadow: SH.pill }}>
                          <PencilSimple size={14} style={{ color: CAT_COLORS.workout.shadow }} />
                        </button>
                        <button onClick={() => handleDelete(selWorkout.id, '训练记录')} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                          <Trash size={14} style={{ color: CAT_COLORS.period.shadow }} />
                        </button>
                      </div>
                    </div>
                    {selWorkout.summary && selWorkout.summary !== '训练' && (
                      <p className="mt-1 ml-12" style={{ fontSize: '13px', color: `${CAT_COLORS.workout.fg}99`, lineHeight: 1.5 }}>{selWorkout.summary}</p>
                    )}
                  </div>
                )}

                {selSleep && (
                  <div className="mb-3" style={{ ...clay.cardIndigo, padding: '14px 16px' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 36, height: 36, borderRadius: '10px', background: CAT_COLORS.sleep.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>眠</div>
                      <div className="flex-1 min-w-0">
                        <span style={{ fontSize: '15px', fontWeight: 600, color: CAT_COLORS.sleep.fg }}>睡眠</span>
                        <span className="ml-2" style={{ fontSize: '13px', fontWeight: 400, color: `${CAT_COLORS.sleep.fg}99` }}>
                          {selSleep.bedtime} → {selSleep.wakeTime} · {fmtDuration(selSleep.duration)} · {QUALITY_LABEL[selSleep.quality]}
                        </span>
                      </div>
                      <div className="ml-auto flex gap-1 shrink-0">
                        <button onClick={() => startEditSleep(selSleep)} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '50px', background: CAT_COLORS.sleep.bg, boxShadow: SH.pill }}>
                          <PencilSimple size={14} style={{ color: CAT_COLORS.sleep.shadow }} />
                        </button>
                        <button onClick={() => handleDelete(selSleep.id, '睡眠记录')} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                          <Trash size={14} style={{ color: CAT_COLORS.period.shadow }} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {selDiet.length > 0 && selDiet.map(d => (
                  <div key={d.id} className="mb-3" style={{ ...clay.cardAmber, padding: '14px 16px' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 36, height: 36, borderRadius: '10px', background: CAT_COLORS.diet.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>食</div>
                      <div className="flex-1 min-w-0">
                        <span style={{ fontSize: '15px', fontWeight: 600, color: CAT_COLORS.diet.fg }}>{d.note || '饮食'}</span>
                        <span className="ml-2" style={{ fontSize: '13px', fontWeight: 400, color: `${CAT_COLORS.diet.fg}99` }}>{d.calories}kcal{d.protein ? ` · 蛋白${d.protein}g` : ''}</span>
                      </div>
                      <div className="ml-auto flex gap-1 shrink-0">
                        <button onClick={() => startEditDiet(d)} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '50px', background: CAT_COLORS.diet.bg, boxShadow: SH.pill }}>
                          <PencilSimple size={14} style={{ color: CAT_COLORS.diet.shadow }} />
                        </button>
                        <button onClick={() => handleDelete(d.id, '饮食记录')} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                          <Trash size={14} style={{ color: CAT_COLORS.period.shadow }} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {selPeriod && (
                  <div className="mb-3" style={{ ...clay.cardRose, padding: '14px 16px' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 36, height: 36, borderRadius: '10px', background: CAT_COLORS.period.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Drop size={16} weight="fill" color="#fff" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span style={{ fontSize: '15px', fontWeight: 600, color: CAT_COLORS.period.fg }}>经期</span>
                        <span className="ml-2" style={{ fontSize: '13px', fontWeight: 400, color: `${CAT_COLORS.period.fg}99` }}>{FLOW_LABEL[selPeriod.flow]}</span>
                      </div>
                      <div className="ml-auto flex gap-1 shrink-0">
                        <button onClick={() => startEditPeriod(selPeriod)} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                          <PencilSimple size={14} style={{ color: CAT_COLORS.period.shadow }} />
                        </button>
                        <button onClick={() => handleDelete(selPeriod.id, '经期记录')} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                          <Trash size={14} style={{ color: CAT_COLORS.period.shadow }} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {selSymptom && (
                  <div style={{ ...clay.cardViolet, padding: '14px 16px' }}>
                    <div className="flex items-center gap-3">
                      <div style={{ width: 36, height: 36, borderRadius: '10px', background: CAT_COLORS.symptom.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>症</div>
                      <div className="flex-1 min-w-0">
                        <span style={{ fontSize: '15px', fontWeight: 600, color: CAT_COLORS.symptom.fg }}>症状</span>
                        <span className="ml-2" style={{ fontSize: '13px', fontWeight: 400, color: `${CAT_COLORS.symptom.fg}99` }}>{selSymptom.symptoms.join('、')}</span>
                      </div>
                      <div className="ml-auto flex gap-1 shrink-0">
                        <button onClick={() => startEditSymptom(selSymptom)} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '50px', background: CAT_COLORS.symptom.bg, boxShadow: SH.pill }}>
                          <PencilSimple size={14} style={{ color: CAT_COLORS.symptom.shadow }} />
                        </button>
                        <button onClick={() => handleDelete(selSymptom.id, '症状记录')} className={`p-2 ${clay.pressSmall}`}
                          style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                          <Trash size={14} style={{ color: CAT_COLORS.period.shadow }} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════
          TAB: 今日
      ════════════════════════════════════════════════════ */}
      {topTab === 'today' && (
        <div className="flex-1 overflow-y-auto px-5 pb-4">

          {/* Big nested clay donut ring */}
          <div className="relative mx-auto" style={{ width: 248, height: 248 }}>
            {/* Outer raised rim — the "floating" feel comes from here */}
            <div className="absolute inset-0 rounded-full" style={{
              background: 'linear-gradient(145deg, #f0f0f3, #d8d8dc)',
              boxShadow: '8px 8px 20px rgba(0,0,0,0.12), -6px -6px 16px rgba(255,255,255,0.9)',
            }} />
            {/* Track groove — recessed channel where arcs sit */}
            <div className="absolute rounded-full" style={{
              top: 10, left: 10, right: 10, bottom: 10,
              background: '#DCDCE0',
              boxShadow: 'inset 3px 3px 8px rgba(0,0,0,0.18), inset -2px -2px 6px rgba(255,255,255,0.7)',
            }} />
            {/* Inner raised circle (donut hole) */}
            <div className="absolute rounded-full" style={{
              top: 46, left: 46, width: 156, height: 156,
              background: 'linear-gradient(145deg, #fafafa, #eeeef0)',
              boxShadow: '4px 4px 10px rgba(0,0,0,0.10), -3px -3px 8px rgba(255,255,255,0.9), inset 1px 1px 3px rgba(255,255,255,0.8)',
            }} />
            {/* SVG data arcs */}
            <svg viewBox="0 0 248 248" width="248" height="248" className="absolute inset-0">
              <defs>
                <linearGradient id="sleepOF" gradientUnits="userSpaceOnUse" x1="124" y1="17" x2="231" y2="124">
                  <stop offset="0%" stopColor={CAT_COLORS.sleep.shadow} />
                  <stop offset="100%" stopColor={CAT_COLORS.sleep.active} />
                </linearGradient>
                <linearGradient id="workoutOF" gradientUnits="userSpaceOnUse" x1="124" y1="36" x2="212" y2="124">
                  <stop offset="0%" stopColor={CAT_COLORS.workout.shadow} />
                  <stop offset="100%" stopColor={CAT_COLORS.workout.active} />
                </linearGradient>
                <linearGradient id="dietOF" gradientUnits="userSpaceOnUse" x1="124" y1="55" x2="193" y2="124">
                  <stop offset="0%" stopColor={CAT_COLORS.diet.shadow} />
                  <stop offset="100%" stopColor={CAT_COLORS.diet.active} />
                </linearGradient>
              </defs>
              {/* Sleep ring (outer, r=107): track → arc shadow → arc → overflow */}
              <circle cx="124" cy="124" r="107" fill="none" stroke="#D8D8DD" strokeWidth="20" />
              <circle cx="126" cy="127" r="107" fill="none"
                stroke="rgba(0,0,0,0.12)" strokeWidth="16" strokeLinecap="round"
                {...ringArc(107, todaySleep ? todaySleep.duration / sleepTarget : 0)}
                transform="rotate(-90 126 127)" />
              <circle cx="124" cy="124" r="107" fill="none"
                stroke={CAT_COLORS.sleep.shadow} strokeWidth="16" strokeLinecap="round"
                {...ringArc(107, todaySleep ? todaySleep.duration / sleepTarget : 0)}
                transform="rotate(-90 124 124)" />
              {todaySleep && todaySleep.duration / sleepTarget > 1 && (<>
                <circle cx="126" cy="127" r="107" fill="none"
                  stroke="rgba(0,0,0,0.10)" strokeWidth="16" strokeLinecap="round"
                  {...ringArc(107, todaySleep.duration / sleepTarget - 1)}
                  transform="rotate(-90 126 127)" />
                <circle cx="124" cy="124" r="107" fill="none"
                  stroke="url(#sleepOF)" strokeWidth="16" strokeLinecap="round"
                  {...ringArc(107, todaySleep.duration / sleepTarget - 1)}
                  transform="rotate(-90 124 124)" />
              </>)}
              {/* Workout ring (mid, r=88) */}
              <circle cx="124" cy="124" r="88" fill="none" stroke="#D8D8DD" strokeWidth="20" />
              <circle cx="126" cy="127" r="88" fill="none"
                stroke="rgba(0,0,0,0.12)" strokeWidth="16" strokeLinecap="round"
                {...ringArc(88, todayWorkout?.calories ? todayWorkout.calories / workoutTarget : 0)}
                transform="rotate(-90 126 127)" />
              <circle cx="124" cy="124" r="88" fill="none"
                stroke={CAT_COLORS.workout.shadow} strokeWidth="16" strokeLinecap="round"
                {...ringArc(88, todayWorkout?.calories ? todayWorkout.calories / workoutTarget : 0)}
                transform="rotate(-90 124 124)" />
              {todayWorkout?.calories && todayWorkout.calories / workoutTarget > 1 && (<>
                <circle cx="126" cy="127" r="88" fill="none"
                  stroke="rgba(0,0,0,0.10)" strokeWidth="16" strokeLinecap="round"
                  {...ringArc(88, todayWorkout.calories / workoutTarget - 1)}
                  transform="rotate(-90 126 127)" />
                <circle cx="124" cy="124" r="88" fill="none"
                  stroke="url(#workoutOF)" strokeWidth="16" strokeLinecap="round"
                  {...ringArc(88, todayWorkout.calories / workoutTarget - 1)}
                  transform="rotate(-90 124 124)" />
              </>)}
              {/* Diet ring (inner, r=69) — split by macronutrient when available */}
              <circle cx="124" cy="124" r="69" fill="none" stroke="#D8D8DD" strokeWidth="20" />
              {dietHasMacros ? (
                <>
                  {dietProteinKcal > 0 && (<>
                    <circle cx="126" cy="127" r="69" fill="none"
                      stroke="rgba(0,0,0,0.12)" strokeWidth="16" strokeLinecap="round"
                      {...ringArc(69, dietProteinKcal / calTarget)}
                      transform="rotate(-90 126 127)" />
                    <circle cx="124" cy="124" r="69" fill="none"
                      stroke={MACRO_COLORS.protein} strokeWidth="16" strokeLinecap="round"
                      {...ringArc(69, dietProteinKcal / calTarget)}
                      transform="rotate(-90 124 124)" />
                  </>)}
                  {dietCarbsKcal > 0 && (<>
                    <circle cx="126" cy="127" r="69" fill="none"
                      stroke="rgba(0,0,0,0.12)" strokeWidth="16" strokeLinecap="round"
                      {...ringArc(69, dietCarbsKcal / calTarget)}
                      transform={`rotate(${-90 + (dietProteinKcal / calTarget) * 360} 126 127)`} />
                    <circle cx="124" cy="124" r="69" fill="none"
                      stroke={MACRO_COLORS.carbs} strokeWidth="16" strokeLinecap="round"
                      {...ringArc(69, dietCarbsKcal / calTarget)}
                      transform={`rotate(${-90 + (dietProteinKcal / calTarget) * 360} 124 124)`} />
                  </>)}
                  {dietFatKcal > 0 && (<>
                    <circle cx="126" cy="127" r="69" fill="none"
                      stroke="rgba(0,0,0,0.12)" strokeWidth="16" strokeLinecap="round"
                      {...ringArc(69, dietFatKcal / calTarget)}
                      transform={`rotate(${-90 + ((dietProteinKcal + dietCarbsKcal) / calTarget) * 360} 126 127)`} />
                    <circle cx="124" cy="124" r="69" fill="none"
                      stroke={MACRO_COLORS.fat} strokeWidth="16" strokeLinecap="round"
                      {...ringArc(69, dietFatKcal / calTarget)}
                      transform={`rotate(${-90 + ((dietProteinKcal + dietCarbsKcal) / calTarget) * 360} 124 124)`} />
                  </>)}
                </>
              ) : todayDietTotal > 0 ? (
                <>
                  <circle cx="126" cy="127" r="69" fill="none"
                    stroke="rgba(0,0,0,0.12)" strokeWidth="16" strokeLinecap="round"
                    {...ringArc(69, todayDietTotal / calTarget)}
                    transform="rotate(-90 126 127)" />
                  <circle cx="124" cy="124" r="69" fill="none"
                    stroke={CAT_COLORS.diet.shadow} strokeWidth="16" strokeLinecap="round"
                    {...ringArc(69, todayDietTotal / calTarget)}
                    transform="rotate(-90 124 124)" />
                  {todayDietTotal / calTarget > 1 && (<>
                    <circle cx="126" cy="127" r="69" fill="none"
                      stroke="rgba(0,0,0,0.10)" strokeWidth="16" strokeLinecap="round"
                      {...ringArc(69, todayDietTotal / calTarget - 1)}
                      transform="rotate(-90 126 127)" />
                    <circle cx="124" cy="124" r="69" fill="none"
                      stroke="url(#dietOF)" strokeWidth="16" strokeLinecap="round"
                      {...ringArc(69, todayDietTotal / calTarget - 1)}
                      transform="rotate(-90 124 124)" />
                  </>)}
                </>
              ) : null}
            </svg>
            {/* Center text — caloric deficit */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10">
              {deficit != null ? (
                <>
                  <span style={{ fontSize: '11px', color: '#6B6760' }}>热量缺口</span>
                  <span style={{ fontSize: '28px', fontWeight: 700, color: deficit >= 0 ? CAT_COLORS.workout.shadow : CAT_COLORS.diet.shadow }}>
                    {deficit >= 0 ? `+${deficit}` : deficit}
                  </span>
                  <span style={{ fontSize: '11px', color: '#6B6760' }}>kcal</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '11px', color: '#6B6760' }}>摄入</span>
                  <span style={{ fontSize: '28px', fontWeight: 700, color: '#1d1d1f' }}>{todayDietTotal || '—'}</span>
                  <span style={{ fontSize: '11px', color: '#6B6760' }}>{todayDietTotal ? 'kcal' : ''}</span>
                </>
              )}
            </div>
          </div>

          {/* Ring legend pills */}
          <div className="flex justify-center gap-2 mt-3 mb-4">
            <span style={{ fontSize: '12px', fontWeight: 500, color: CAT_COLORS.sleep.fg, background: CAT_COLORS.sleep.bg, borderRadius: '9999px', padding: '5px 12px', boxShadow: SH.pill }}>
              睡 <b>{todaySleep ? fmtDuration(todaySleep.duration) : '—'}</b>
            </span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: CAT_COLORS.workout.fg, background: CAT_COLORS.workout.bg, borderRadius: '9999px', padding: '5px 12px', boxShadow: SH.pill }}>
              练 <b>{todayWorkout ? `${todayWorkout.calories ?? 0}k` : '—'}</b>
            </span>
            <span style={{ fontSize: '12px', fontWeight: 500, color: CAT_COLORS.diet.fg, background: CAT_COLORS.diet.bg, borderRadius: '9999px', padding: '5px 12px', boxShadow: SH.pill }}>
              食 <b>{todayDietTotal ? `${todayDietTotal}k` : '—'}</b>
            </span>
          </div>
          {dietHasMacros && (
            <div className="flex justify-center gap-4 -mt-2 mb-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: MACRO_COLORS.protein }} />蛋白
              </span>
              <span className="flex items-center gap-1">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: MACRO_COLORS.carbs }} />碳水
              </span>
              <span className="flex items-center gap-1">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: MACRO_COLORS.fat }} />脂肪
              </span>
            </div>
          )}

          {/* Weight row */}
          <div className="mb-3">
            <div className="flex items-center gap-2 px-3 py-2"
              style={{ background: '#fff', borderRadius: '20px', boxShadow: SH.card }}>
              <span className="text-xs font-bold text-slate-500">体重</span>
              <input type="number" step="0.1"
                defaultValue={todayWeight?.value ?? profile?.weightKg ?? ''}
                placeholder="kg"
                className="w-14 text-sm font-bold text-slate-700 text-right focus:outline-none bg-transparent"
                onBlur={e => {
                  const v = parseFloat(e.target.value);
                  if (v > 0 && v !== todayWeight?.value) handleSaveWeight(v);
                }} />
              <span className="text-[10px] text-slate-400">kg</span>
            </div>
          </div>

          {/* BMR info line */}
          {bmr > 0 && (
            <div className="flex items-center gap-3 mb-3 text-[11px] text-slate-400">
              <span>目标 <b className="text-slate-600">{calTarget}</b></span>
              <span>运动 <b className="text-emerald-600">+{exerciseCal}</b></span>
              <span>摄入 <b className="text-amber-600">-{todayDietTotal}</b></span>
            </div>
          )}

          {/* Weight trend chart */}
          {showWeightTrend && weightHistory.length > 1 && (() => {
            const vals = weightHistory.map(w => w.value);
            const min = Math.min(...vals) - 0.5;
            const max = Math.max(...vals) + 0.5;
            const range = max - min || 1;
            const W = 280, H = 80;
            const points = vals.map((v, i) => {
              const x = vals.length === 1 ? W / 2 : (i / (vals.length - 1)) * W;
              const y = H - ((v - min) / range) * H;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            return (
              <div className="mb-3 p-3" style={{ ...clay.card }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500">体重趋势</span>
                  <span className="text-[10px] text-slate-400">
                    {weightHistory[0].date.slice(5)} → {weightHistory[weightHistory.length - 1].date.slice(5)}
                  </span>
                </div>
                <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} width="100%" height={H + 8}>
                  <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {vals.map((v, i) => {
                    const x = vals.length === 1 ? W / 2 : (i / (vals.length - 1)) * W;
                    const y = H - ((v - min) / range) * H;
                    return <circle key={i} cx={x} cy={y} r="3" fill="#6366f1" />;
                  })}
                </svg>
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                  <span>{vals[0]}kg</span>
                  <span>最新 <b className="text-slate-600">{vals[vals.length - 1]}kg</b></span>
                </div>
              </div>
            );
          })()}

          {showWeightTrend && weightHistory.length <= 1 && (
            <div className="mb-3 p-3 text-center text-xs text-slate-400" style={clay.card}>
              记录 2 天以上体重后显示趋势
            </div>
          )}

          {/* Today records */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 tracking-wider">
              {todayViewOffset === 0 ? '今日记录' : `${viewDay.getMonth() + 1}月${viewDay.getDate()}日记录`}
            </span>
            <button onClick={() => openRecord('workout')}
              className={`flex items-center gap-1 text-white text-[11px] font-bold px-2.5 py-1.5 ${clay.pressSmall}`}
              style={clay.btnPrimary}>
              <Plus size={11} weight="bold" /> 记录
            </button>
          </div>

          {todayWorkout && (
            <div className="mb-3" style={{ ...clay.cardGreen, padding: '14px 16px' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 36, height: 36, borderRadius: '10px', background: CAT_COLORS.workout.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>训</div>
                <div className="flex-1 min-w-0">
                  <span style={{ fontSize: '14px', fontWeight: 600, color: CAT_COLORS.workout.fg }}>训练</span>
                  <span className="ml-1" style={{ fontSize: '13px', fontWeight: 400, color: `${CAT_COLORS.workout.fg}99` }}>{todayWorkout.duration}min · {todayWorkout.calories ?? '—'}kcal</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEditWorkout(todayWorkout)} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '50px', background: CAT_COLORS.workout.bg, boxShadow: SH.pill }}>
                    <PencilSimple size={12} style={{ color: CAT_COLORS.workout.shadow }} />
                  </button>
                  <button onClick={() => handleDelete(todayWorkout.id, '训练记录')} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                    <Trash size={12} style={{ color: CAT_COLORS.period.shadow }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {todaySleep && (
            <div className="mb-3" style={{ ...clay.cardIndigo, padding: '14px 16px' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 36, height: 36, borderRadius: '10px', background: CAT_COLORS.sleep.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>眠</div>
                <div className="flex-1 min-w-0">
                  <span style={{ fontSize: '14px', fontWeight: 600, color: CAT_COLORS.sleep.fg }}>睡眠</span>
                  <span className="ml-1" style={{ fontSize: '13px', fontWeight: 400, color: `${CAT_COLORS.sleep.fg}99` }}>{todaySleep.bedtime} → {todaySleep.wakeTime} · {fmtDuration(todaySleep.duration)} · {QUALITY_LABEL[todaySleep.quality]}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEditSleep(todaySleep)} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '50px', background: CAT_COLORS.sleep.bg, boxShadow: SH.pill }}>
                    <PencilSimple size={12} style={{ color: CAT_COLORS.sleep.shadow }} />
                  </button>
                  <button onClick={() => handleDelete(todaySleep.id, '睡眠记录')} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                    <Trash size={12} style={{ color: CAT_COLORS.period.shadow }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {todayDiets.map(d => (
            <div key={d.id} className="mb-3" style={{ ...clay.cardAmber, padding: '14px 16px' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 36, height: 36, borderRadius: '10px', background: CAT_COLORS.diet.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>食</div>
                <div className="flex-1 min-w-0">
                  <span style={{ fontSize: '14px', fontWeight: 600, color: CAT_COLORS.diet.fg }}>{d.note || '饮食'}</span>
                  <span className="ml-1" style={{ fontSize: '13px', fontWeight: 400, color: `${CAT_COLORS.diet.fg}99` }}>{d.calories}kcal{d.protein ? ` · 蛋白${d.protein}g` : ''}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEditDiet(d)} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '50px', background: CAT_COLORS.diet.bg, boxShadow: SH.pill }}>
                    <PencilSimple size={12} style={{ color: CAT_COLORS.diet.shadow }} />
                  </button>
                  <button onClick={() => handleDelete(d.id, '饮食记录')} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                    <Trash size={12} style={{ color: CAT_COLORS.period.shadow }} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {todayPeriod && (
            <div className="mb-3" style={{ ...clay.cardRose, padding: '14px 16px' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 36, height: 36, borderRadius: '10px', background: CAT_COLORS.period.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Drop size={16} weight="fill" color="#fff" />
                </div>
                <div className="flex-1 min-w-0">
                  <span style={{ fontSize: '14px', fontWeight: 600, color: CAT_COLORS.period.fg }}>经期</span>
                  <span className="ml-1" style={{ fontSize: '13px', fontWeight: 400, color: `${CAT_COLORS.period.fg}99` }}>{FLOW_LABEL[todayPeriod.flow]}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEditPeriod(todayPeriod)} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                    <PencilSimple size={12} style={{ color: CAT_COLORS.period.shadow }} />
                  </button>
                  <button onClick={() => handleDelete(todayPeriod.id, '经期记录')} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                    <Trash size={12} style={{ color: CAT_COLORS.period.shadow }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {todaySymptom && (
            <div className="mb-3" style={{ ...clay.cardViolet, padding: '14px 16px' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 36, height: 36, borderRadius: '10px', background: CAT_COLORS.symptom.shadow, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>症</div>
                <div className="flex-1 min-w-0">
                  <span style={{ fontSize: '14px', fontWeight: 600, color: CAT_COLORS.symptom.fg }}>症状</span>
                  <span className="ml-1" style={{ fontSize: '13px', fontWeight: 400, color: `${CAT_COLORS.symptom.fg}99` }}>{todaySymptom.symptoms.join('、')}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEditSymptom(todaySymptom)} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '50px', background: CAT_COLORS.symptom.bg, boxShadow: SH.pill }}>
                    <PencilSimple size={12} style={{ color: CAT_COLORS.symptom.shadow }} />
                  </button>
                  <button onClick={() => handleDelete(todaySymptom.id, '症状记录')} className={`p-1.5 ${clay.pressSmall}`}
                    style={{ borderRadius: '50px', background: CAT_COLORS.period.bg, boxShadow: SH.pill }}>
                    <Trash size={12} style={{ color: CAT_COLORS.period.shadow }} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {todayEvents.length === 0 && (
            <p className="text-center text-slate-400 text-sm mt-6">
              {todayViewOffset === 0 ? '今日暂无记录' : '当日暂无记录'}
            </p>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          Record Modal
      ════════════════════════════════════════════════════ */}
      {recordMode && (
        <div className="absolute inset-0 bg-black/15 backdrop-blur-sm z-50 flex items-end"
          onClick={(e) => { if (e.target === e.currentTarget) closeRecord(); }}>
          <div className="w-full px-5 pt-2 pb-10 flex flex-col"
            style={{
              background: clay.bg, borderRadius: '28px 28px 0 0',
              boxShadow: '0 -6px 16px rgba(0,0,0,0.10), 0 3px 10px rgba(255,255,255,0.70)',
              height: `${modalHeight}px`,
              transition: isDraggingModal ? 'none' : 'height 0.25s ease',
            }}>

            {/* 拖拽把手 — 仅训练/饮食可拖高 */}
            {(recordMode === 'workout' || recordMode === 'diet') ? (
              <div className="shrink-0 py-1.5 -mx-5 px-5 flex justify-center cursor-grab active:cursor-grabbing"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => {
                  const overlay = (e.currentTarget.closest('.absolute.inset-0') as HTMLElement);
                  modalDragRef.current = {
                    startY: e.clientY, startH: modalHeight,
                    maxH: overlay ? Math.round(overlay.clientHeight * 0.85) : 700,
                  };
                  setIsDraggingModal(true);
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!isDraggingModal) return;
                  const { startY, startH, maxH } = modalDragRef.current;
                  setModalHeight(Math.min(maxH, Math.max(MODAL_BASE_H, startH + (startY - e.clientY))));
                }}
                onPointerUp={() => {
                  setIsDraggingModal(false);
                  // 松手吸附到最近的档位（默认高 / 85%）
                  const { maxH } = modalDragRef.current;
                  setModalHeight(h => (h - MODAL_BASE_H < (maxH - MODAL_BASE_H) / 2 ? MODAL_BASE_H : maxH));
                }}>
                <div className="w-10 h-1 rounded-full bg-slate-300" />
              </div>
            ) : (
              <div className="shrink-0 h-3" />
            )}

            <div className="flex items-center justify-between mb-4 shrink-0">
              <span className="text-base font-bold text-slate-700">{editingId ? '编辑记录' : '新记录'}</span>
              <button onClick={closeRecord} className={`w-7 h-7 flex items-center justify-center ${clay.pressSmall}`}
                style={{ background: '#fff', borderRadius: '50px', boxShadow: SH.pill }}>
                <X size={14} className="text-slate-400" />
              </button>
            </div>

            {/* 5-tab selector — category colored */}
            <div className="flex gap-1 mb-4 p-1 shrink-0"
              style={{ background: '#EBEBEB', borderRadius: '28px' }}>
              {TAB_ORDER.map(tab => {
                const c = CAT_COLORS[tab.id];
                const isActive = recordMode === tab.id;
                return (
                  <button key={tab.id}
                    onClick={() => openRecord(tab.id)}
                    className={`flex-1 py-2 text-xs transition-all duration-150`}
                    style={{
                      borderRadius: '50px',
                      background: isActive ? c.active : 'transparent',
                      color: isActive ? '#fff' : 'rgba(0,0,0,0.35)',
                      fontWeight: isActive ? 600 : 400,
                      boxShadow: isActive ? SH.btn : 'none',
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
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">运动项目</span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {WORKOUT_ACTIVITIES.map(act => {
                      const on = workoutActivities.includes(act);
                      return (
                        <button key={act}
                          onClick={() => setWorkoutActivities(prev => on ? prev.filter(x => x !== act) : [...prev, act])}
                          className={`px-3 py-1.5 text-xs transition-all duration-150 ${clay.pressSmall}`}
                          style={{
                            borderRadius: '50px',
                            background: on ? CAT_COLORS.workout.active : '#fff',
                            color: on ? '#fff' : 'rgba(0,0,0,0.45)',
                            fontWeight: on ? 600 : 400,
                            boxShadow: on ? SH.btn : SH.pill,
                          }}>
                          {act}
                        </button>
                      );
                    })}
                  </div>

                  {workoutActivities.includes('力量') && (
                    <>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-3">训练部位</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {WORKOUT_PARTS.map(part => {
                          const on = workoutParts.includes(part);
                          return (
                            <button key={part}
                              onClick={() => setWorkoutParts(prev => on ? prev.filter(x => x !== part) : [...prev, part])}
                              className={`px-3 py-1.5 text-xs transition-all duration-150 ${clay.pressSmall}`}
                              style={{
                                borderRadius: '50px',
                                background: on ? CAT_COLORS.workout.bg : '#fff',
                                color: on ? CAT_COLORS.workout.fg : 'rgba(0,0,0,0.45)',
                                fontWeight: on ? 600 : 400,
                                boxShadow: SH.pill,
                              }}>
                              {part}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div className="flex gap-3 mt-3">
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-400">消耗热量</span>
                      <input type="number" value={workoutCalories} onChange={e => setWorkoutCalories(e.target.value ? Number(e.target.value) : '')}
                        placeholder="kcal"
                        className="mt-1 w-full px-4 py-2.5 text-sm text-slate-700 focus:outline-none"
                        style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-400">时长（分钟）</span>
                      <input type="number" value={workoutDuration} onChange={e => setWorkoutDuration(e.target.value ? Number(e.target.value) : '')}
                        placeholder="60"
                        className="mt-1 w-full px-4 py-2.5 text-sm text-slate-700 focus:outline-none"
                        style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
                    </div>
                  </div>

                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-3">备注（可选）</span>
                  <textarea value={recordText} onChange={e => setRecordText(e.target.value)}
                    placeholder="杠铃划船三组、深蹲三组..."
                    className="mt-1.5 w-full px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none leading-relaxed"
                    style={{ background: '#f8f7f5', borderRadius: '10px', boxShadow: insetShadow, border: '1px solid rgba(0,0,0,0.03)', minHeight: '60px' }} />

                  <button onClick={handleSubmitWorkout} disabled={(workoutActivities.length === 0 && !recordText.trim() && !workoutCalories) || isSubmitting}
                    className={`w-full shrink-0 text-white font-bold py-3.5 mt-auto disabled:opacity-40 ${clay.press}`}
                    style={{ background: CAT_COLORS.workout.active, borderRadius: '50px', boxShadow: SH.btn }}>
                    保存
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
                        style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
                    </div>
                    <span className="text-slate-400 pb-3">→</span>
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-400">起床</label>
                      <input type="time" value={sleepWakeTime} onChange={e => setSleepWakeTime(e.target.value)}
                        className="w-full px-3 py-2.5 text-center text-base font-bold text-slate-700 focus:outline-none"
                        style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
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
                          borderRadius: '50px',
                          background: sleepQuality === q ? CAT_COLORS.sleep.active : '#fff',
                          color: sleepQuality === q ? '#fff' : '#6B6760',
                          fontWeight: sleepQuality === q ? 600 : 400,
                          boxShadow: sleepQuality === q ? SH.btn : SH.pill,
                        }}>
                        {QUALITY_LABEL[q]}
                      </button>
                    ))}
                  </div>

                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4">备注（可选）</span>
                  <input value={sleepNote} onChange={e => setSleepNote(e.target.value)} placeholder="做梦、失眠..."
                    className="mt-1.5 w-full px-4 py-2.5 text-sm text-slate-700 focus:outline-none"
                    style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />

                  <button onClick={handleSubmitSleep} disabled={isSubmitting}
                    className={`w-full text-white font-bold py-3.5 mt-auto disabled:opacity-50 ${clay.press}`}
                    style={{ background: CAT_COLORS.sleep.active, borderRadius: '50px', boxShadow: SH.btn }}>
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
                      style={{ background: CAT_COLORS.diet.active, borderRadius: '50px', boxShadow: SH.btn }}>
                      {isSubmitting ? '估算中…' : 'AI 估算'}
                    </button>
                    <div className="relative">
                      <button onClick={() => setShowCameraMenu(!showCameraMenu)}
                        className={`w-11 h-[42px] flex items-center justify-center ${clay.pressSmall}`}
                        style={{ background: CAT_COLORS.diet.bg, borderRadius: '50px', boxShadow: SH.pill }}>
                        <Camera size={18} weight="bold" className="text-amber-700" />
                      </button>
                      {showCameraMenu && (
                        <div className="absolute bottom-full right-0 mb-2 py-1 w-32 z-10"
                          style={{ background: '#fff', borderRadius: '20px', boxShadow: SH.card }}>
                          <label className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                            拍照
                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageInput} />
                          </label>
                          <label className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                            从相册选择
                            <input type="file" accept="image/*" className="hidden" onChange={handleImageInput} />
                          </label>
                          <label className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
                            上传文件
                            <input type="file" className="hidden" onChange={handleImageInput} />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Macro panel — 常驻可手填，AI 估算后自动填充 */}
                  <div className="mt-3 p-3" style={clay.cardAmber}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-amber-800">
                        {dietParsed && !editingId ? '估算结果 · 可修改' : '营养数据（可手填）'}
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
                            placeholder="—"
                            className="w-14 text-sm font-bold text-right focus:outline-none"
                            style={{ background: 'transparent', color: f.color, border: 'none' }} />
                          <span className="text-[10px] text-slate-400">{f.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4">标签（可选）</span>
                  <input value={dietNote} onChange={e => setDietNote(e.target.value)} placeholder="早餐、午餐、晚餐..."
                    className="mt-1.5 w-full px-4 py-2.5 text-sm text-slate-700 focus:outline-none"
                    style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />

                  <button onClick={handleSubmitDiet} disabled={!dietCalories || isSubmitting}
                    className={`w-full text-white font-bold py-3.5 mt-auto disabled:opacity-40 ${clay.press}`}
                    style={{ background: CAT_COLORS.diet.active, borderRadius: '50px', boxShadow: SH.btn }}>
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
                          borderRadius: '50px',
                          background: periodFlow === f ? CAT_COLORS.period.active : '#fff',
                          color: periodFlow === f ? '#fff' : '#6B6760',
                          fontWeight: periodFlow === f ? 600 : 400,
                          boxShadow: periodFlow === f ? SH.btn : SH.pill,
                        }}>
                        {FLOW_LABEL[f]}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleSubmitPeriod} disabled={!periodFlow || isSubmitting}
                    className={`w-full text-white font-bold py-3.5 mt-auto disabled:opacity-40 ${clay.press}`}
                    style={{ background: CAT_COLORS.period.active, borderRadius: '50px', boxShadow: SH.btn }}>
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
                          borderRadius: '50px',
                          background: periodSymptoms.includes(sym) ? CAT_COLORS.symptom.active : '#fff',
                          color: periodSymptoms.includes(sym) ? '#fff' : '#6B6760',
                          fontWeight: periodSymptoms.includes(sym) ? 600 : 400,
                          boxShadow: periodSymptoms.includes(sym) ? SH.btn : SH.pill,
                        }}>
                        {sym}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleSubmitSymptom} disabled={periodSymptoms.length === 0 || isSubmitting}
                    className={`w-full text-white font-bold py-3.5 mt-auto disabled:opacity-40 ${clay.press}`}
                    style={{ background: CAT_COLORS.symptom.active, borderRadius: '50px', boxShadow: SH.btn }}>
                    保存
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
      {/* ════════════════════════════════════════════════════
          Profile Setup Modal
      ════════════════════════════════════════════════════ */}
      {showProfileSetup && (
        <div className="absolute inset-0 bg-black/15 backdrop-blur-sm z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget && profile) setShowProfileSetup(false); }}>
          <div className="w-[85%] max-w-xs p-5 flex flex-col gap-3 max-h-[80vh] overflow-y-auto"
            style={{ background: clay.bg, borderRadius: '28px', boxShadow: SH.card }}>

            <span className="text-base font-bold text-slate-700">健康档案</span>
            <p className="text-[11px] text-slate-400 -mt-1">用于计算基础代谢率(BMR)，数据仅存本地</p>

            <div className="flex gap-3">
              <div className="flex-1">
                <span className="text-[10px] text-slate-400">身高(cm)</span>
                <input type="number" value={pfHeight} onChange={e => setPfHeight(e.target.value ? Number(e.target.value) : '')}
                  placeholder="165" className="mt-1 w-full px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none"
                  style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
              </div>
              <div className="flex-1">
                <span className="text-[10px] text-slate-400">体重(kg)</span>
                <input type="number" step="0.1" value={pfWeight} onChange={e => setPfWeight(e.target.value ? Number(e.target.value) : '')}
                  placeholder="55" className="mt-1 w-full px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none"
                  style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <span className="text-[10px] text-slate-400">年龄</span>
                <input type="number" value={pfAge} onChange={e => setPfAge(e.target.value ? Number(e.target.value) : '')}
                  placeholder="24" className="mt-1 w-full px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none"
                  style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
              </div>
              <div className="flex-1">
                <span className="text-[10px] text-slate-400">性别</span>
                <div className="flex gap-1.5 mt-1">
                  {(['F', 'M'] as const).map(s => (
                    <button key={s} onClick={() => setPfSex(s)}
                      className={`flex-1 py-2 text-xs font-bold ${clay.pressSmall}`}
                      style={{
                        borderRadius: '50px',
                        background: pfSex === s ? CAT_COLORS.sleep.shadow : '#fff',
                        color: pfSex === s ? '#fff' : '#6B6760',
                        boxShadow: pfSex === s ? SH.btn : SH.pill,
                      }}>
                      {s === 'F' ? '女' : '男'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-slate-400">体脂率 %（可选，有的话 BMR 更准）</span>
              <input type="number" step="0.1" value={pfBf} onChange={e => setPfBf(e.target.value ? Number(e.target.value) : '')}
                placeholder="如 22.5" className="mt-1 w-full px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none"
                style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
            </div>

            <div className="h-px" style={{ background: '#EDECEA' }} />

            <div>
              <span className="text-[10px] text-slate-400">目标</span>
              <div className="flex gap-1.5 mt-1">
                {([
                  { id: 'maintain' as FitnessGoal, label: '维持' },
                  { id: 'cut'      as FitnessGoal, label: '减脂' },
                  { id: 'bulk'     as FitnessGoal, label: '增肌' },
                ]).map(g => (
                  <button key={g.id} onClick={() => {
                    setPfGoal(g.id);
                    if (pfHeight && pfWeight && pfAge) {
                      const b = calcBMR({ heightCm: Number(pfHeight), weightKg: Number(pfWeight), age: Number(pfAge), sex: pfSex, bodyFatPct: pfBf ? Number(pfBf) : undefined });
                      setPfCalTarget(recommendCalories(b, g.id));
                    }
                  }}
                    className={`flex-1 py-2 text-xs font-bold ${clay.pressSmall}`}
                    style={{
                      borderRadius: '50px',
                      background: pfGoal === g.id ? CAT_COLORS.workout.shadow : '#fff',
                      color: pfGoal === g.id ? '#fff' : '#6B6760',
                      boxShadow: pfGoal === g.id ? SH.btn : SH.pill,
                    }}>
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <span className="text-[10px] text-slate-400">每日摄入目标(kcal)</span>
                <input type="number" value={pfCalTarget} onChange={e => setPfCalTarget(e.target.value ? Number(e.target.value) : '')}
                  placeholder={pfHeight && pfWeight && pfAge ? String(recommendCalories(calcBMR({ heightCm: Number(pfHeight), weightKg: Number(pfWeight), age: Number(pfAge), sex: pfSex, bodyFatPct: pfBf ? Number(pfBf) : undefined }), pfGoal)) : '1800'}
                  className="mt-1 w-full px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none"
                  style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <span className="text-[10px] text-slate-400">训练目标(kcal)</span>
                <input type="number" value={pfWorkoutTarget} onChange={e => setPfWorkoutTarget(e.target.value ? Number(e.target.value) : '')}
                  placeholder="500"
                  className="mt-1 w-full px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none"
                  style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
              </div>
              <div className="flex-1">
                <span className="text-[10px] text-slate-400">睡眠目标(小时)</span>
                <input type="number" step="0.5" value={pfSleepTarget} onChange={e => setPfSleepTarget(e.target.value ? Number(e.target.value) : '')}
                  placeholder="8"
                  className="mt-1 w-full px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none"
                  style={{ background: '#F5F5F7', borderRadius: '20px', boxShadow: SH.input }} />
              </div>
            </div>

            <button onClick={handleSaveProfile} disabled={!pfHeight || !pfWeight || !pfAge}
              className={`w-full text-white font-bold py-3 mt-1 disabled:opacity-40 ${clay.press}`}
              style={{ background: CAT_COLORS.sleep.shadow, borderRadius: '50px', boxShadow: SH.btn }}>
              保存
            </button>

            <div className="h-px mt-2" style={{ background: '#EDECEA' }} />

            <button onClick={() => { addToast('导入功能开发中', 'info'); }}
              className={`w-full text-slate-500 font-medium py-2.5 text-xs ${clay.pressSmall}`}
              style={{ background: '#fff', borderRadius: '50px', boxShadow: SH.pill }}>
              导入 Apple Health 数据
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthApp;

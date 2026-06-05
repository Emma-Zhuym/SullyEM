/**
 * healthContextBuilder.ts — 为角色对话构建健康感知摘要
 *
 * 第一层（常驻轻量）：每次对话 system prompt 末尾注入一行，
 * 让角色能自然说出 "今天练完了吧" 或 "你好像没睡好"。
 *
 * 格式示例：
 *   【今日】训练日（背+腿）｜周期第17天
 *   【今日】休息日｜周期第3天（经期）
 *   【今日】训练日（胸+臀）
 */

import { getAllHealthEvents, WorkoutHealthEvent, PeriodHealthEvent, SleepHealthEvent, DietHealthEvent } from './healthDb';
import { calcCycleStatus } from './cycleCalc';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 读取今日健康数据，返回轻量注入字符串。
 * 没有任何健康记录时返回 null（不注入，不污染 prompt）。
 */
export async function buildTodayHealthSummary(): Promise<string | null> {
  try {
    const allEvents = await getAllHealthEvents();
    if (allEvents.length === 0) return null;

    const today = todayStr();
    const todayEvents = allEvents.filter(e => e.date === today);
    const periodEvents = allEvents.filter((e): e is PeriodHealthEvent => e.type === 'period');

    const parts: string[] = [];

    // ── 训练 or 休息 ─────────────────────────────────────────
    const workout = todayEvents.find(e => e.type === 'workout') as WorkoutHealthEvent | undefined;
    if (workout) {
      const label = workout.parts.length > 0
        ? `训练日（${workout.parts.join('+')}）`
        : '训练日';
      const extra = workout.calories ? `·消耗${workout.calories}kcal` : '';
      parts.push(label + extra);
    } else {
      parts.push('休息日');
    }

    // ── 周期状态 ─────────────────────────────────────────────
    if (periodEvents.length > 0) {
      const cs = calcCycleStatus(periodEvents);
      // 今日有经期记录 → 标注经期
      const todayPeriod = todayEvents.find(e => e.type === 'period');
      if (todayPeriod) {
        parts.push(`周期第${cs.cycleDay}天（经期）`);
      } else {
        parts.push(`周期第${cs.cycleDay}天`);
      }
    }

    // ── 睡眠 ─────────────────────────────────────────────────
    const sleep = todayEvents.find(e => e.type === 'sleep') as SleepHealthEvent | undefined;
    if (sleep) {
      const qLabel = sleep.quality === 'good' ? '良好' : sleep.quality === 'ok' ? '一般' : '差';
      const hrs = (sleep.duration / 60).toFixed(1).replace(/\.0$/, '');
      parts.push(`睡${hrs}h(${qLabel})`);
    }

    // ── 饮食 ─────────────────────────────────────────────────
    const diets = todayEvents.filter(e => e.type === 'diet') as DietHealthEvent[];
    if (diets.length > 0) {
      const totalKcal = diets.reduce((s, d) => s + d.calories, 0);
      parts.push(`摄入${totalKcal}kcal`);
    }

    // ── 症状提示 ─────────────────────────────────────────────
    const todaySymptom = todayEvents.find(e => e.type === 'symptom');
    if (todaySymptom && 'symptoms' in todaySymptom && todaySymptom.symptoms.length > 0) {
      parts.push(`有${todaySymptom.symptoms.slice(0, 2).join('/')}症状`);
    }

    if (parts.length === 0) return null;
    return `【今日健康】${parts.join('｜')}`;
  } catch (err) {
    // 读 DB 失败不能让整个对话崩
    console.warn('[healthContextBuilder] Failed to build summary:', err);
    return null;
  }
}

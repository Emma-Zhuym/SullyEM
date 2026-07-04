/**
 * 设备运动感知 — 通过加速度计判断用户当前运动状态
 * iOS PWA 支持 DeviceMotion API（需用户授权）
 */

export type MotionState = 'still' | 'walking' | 'running' | 'shaking';

interface MotionSnapshot {
  state: MotionState;
  magnitude: number;
  timestamp: number;
}

const WINDOW_SIZE = 40;
const SAMPLE_INTERVAL = 100;

let samples: number[] = [];
let currentSnapshot: MotionSnapshot = { state: 'still', magnitude: 0, timestamp: Date.now() };
let listening = false;
let sampleTimer: ReturnType<typeof setInterval> | null = null;
let latestMag = 0;

const THRESHOLDS = {
  still: 0.8,
  walking: 3.5,
  running: 8,
};

function classifyState(avgMag: number): MotionState {
  if (avgMag < THRESHOLDS.still) return 'still';
  if (avgMag < THRESHOLDS.walking) return 'walking';
  if (avgMag < THRESHOLDS.running) return 'running';
  return 'shaking';
}

function onMotionEvent(e: DeviceMotionEvent) {
  const acc = e.accelerationIncludingGravity;
  if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
  const g = 9.81;
  const mag = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2) - g;
  latestMag = Math.abs(mag);
}

function tick() {
  samples.push(latestMag);
  if (samples.length > WINDOW_SIZE) samples = samples.slice(-WINDOW_SIZE);
  if (samples.length < 10) return;
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  currentSnapshot = { state: classifyState(avg), magnitude: Math.round(avg * 100) / 100, timestamp: Date.now() };
}

export async function requestMotionPermission(): Promise<boolean> {
  const DME = DeviceMotionEvent as any;
  if (typeof DME.requestPermission === 'function') {
    try {
      const result = await DME.requestPermission();
      return result === 'granted';
    } catch {
      return false;
    }
  }
  return typeof DeviceMotionEvent !== 'undefined';
}

export function startMotionListening() {
  if (listening) return;
  if (typeof DeviceMotionEvent === 'undefined') return;
  window.addEventListener('devicemotion', onMotionEvent);
  sampleTimer = setInterval(tick, SAMPLE_INTERVAL);
  listening = true;
}

export function stopMotionListening() {
  if (!listening) return;
  window.removeEventListener('devicemotion', onMotionEvent);
  if (sampleTimer) clearInterval(sampleTimer);
  sampleTimer = null;
  listening = false;
  samples = [];
}

export function getMotionSnapshot(): MotionSnapshot {
  return { ...currentSnapshot };
}

export function isMotionListening(): boolean {
  return listening;
}

const STATE_LABELS: Record<MotionState, string> = {
  still: '静止（可能坐着或躺着）',
  walking: '在走路',
  running: '在跑步或剧烈运动',
  shaking: '手机在剧烈晃动',
};

export function getMotionContextLine(): string | null {
  if (!listening) return null;
  const snap = getMotionSnapshot();
  const age = Date.now() - snap.timestamp;
  if (age > 30_000) return null;
  return `🏃 用户当前运动状态: ${STATE_LABELS[snap.state]}`;
}

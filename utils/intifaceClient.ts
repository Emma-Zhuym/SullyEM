/**
 * intifaceClient.ts — Intiface Central WebSocket 连接管理
 *
 * EM 独有功能。单例模式，全局复用同一个连接。
 * 基于 buttplug v4 API（runOutput + DeviceOutput）。
 *
 * 用法：
 *   import { intifaceClient } from './intifaceClient';
 *   await intifaceClient.connect();
 *   await intifaceClient.vibrate(75);
 *   await intifaceClient.stopAll();
 */

import {
  ButtplugClient,
  ButtplugBrowserWebsocketClientConnector,
  ButtplugClientDevice,
  DeviceOutput,
  OutputType,
} from 'buttplug';

export type IntifaceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

type DeviceListener = (devices: ButtplugClientDevice[]) => void;
type StatusListener = (status: IntifaceStatus, error?: string) => void;

class IntifaceClientSingleton {
  private client: ButtplugClient | null = null;
  private _status: IntifaceStatus = 'disconnected';
  private _devices: ButtplugClientDevice[] = [];
  private _currentIntensity = 0;
  private patternTimer: ReturnType<typeof setTimeout> | null = null;
  private durationTimer: ReturnType<typeof setTimeout> | null = null;

  private deviceListeners = new Set<DeviceListener>();
  private statusListeners = new Set<StatusListener>();

  // ── 状态查询 ─────────────────────────────────────────────────────────────

  get status(): IntifaceStatus { return this._status; }
  get connected(): boolean { return this._status === 'connected'; }
  get devices(): ButtplugClientDevice[] { return [...this._devices]; }
  get currentIntensity(): number { return this._currentIntensity; }

  // ── 事件监听 ─────────────────────────────────────────────────────────────

  onDevicesChange(cb: DeviceListener): () => void {
    this.deviceListeners.add(cb);
    return () => this.deviceListeners.delete(cb);
  }

  onStatusChange(cb: StatusListener): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  private emitDevices() {
    this.deviceListeners.forEach(cb => cb(this._devices));
  }

  private setStatus(s: IntifaceStatus, error?: string) {
    this._status = s;
    this.statusListeners.forEach(cb => cb(s, error));
  }

  // ── 连接 / 断开 ──────────────────────────────────────────────────────────

  async connect(url = 'ws://localhost:12345'): Promise<void> {
    if (this._status === 'connecting' || this._status === 'connected') return;
    this.setStatus('connecting');

    try {
      this.client = new ButtplugClient('SullyEM');

      this.client.addListener('deviceadded', (device: ButtplugClientDevice) => {
        this._devices = [...this._devices, device];
        this.emitDevices();
      });

      this.client.addListener('deviceremoved', (device: ButtplugClientDevice) => {
        this._devices = this._devices.filter(d => d.index !== device.index);
        this.emitDevices();
      });

      this.client.addListener('disconnect', () => {
        this._devices = [];
        this._currentIntensity = 0;
        this.setStatus('disconnected');
        this.emitDevices();
      });

      const connector = new ButtplugBrowserWebsocketClientConnector(url);
      await this.client.connect(connector);
      await this.client.startScanning();
      this.setStatus('connected');
    } catch (e) {
      this.client = null;
      this.setStatus('error', e instanceof Error ? e.message : String(e));
    }
  }

  async disconnect(): Promise<void> {
    this.stopPattern();
    await this.stopAll();
    try { await this.client?.disconnect(); } catch { /* ignore */ }
    this.client = null;
    this._devices = [];
    this._currentIntensity = 0;
    this.setStatus('disconnected');
    this.emitDevices();
  }

  async rescan(): Promise<void> {
    if (!this.client?.connected) return;
    try { await this.client.startScanning(); } catch { /* ignore */ }
  }

  // ── 控制命令 ─────────────────────────────────────────────────────────────

  /** 震动，强度 0–100（0 = 停止） */
  async vibrate(intensity: number): Promise<void> {
    if (!this.connected || this._devices.length === 0) return;
    const clamped = Math.max(0, Math.min(100, Math.round(intensity)));
    this._currentIntensity = clamped;

    const pct = clamped / 100;
    for (const device of this._devices) {
      if (device.hasOutput(OutputType.Vibrate)) {
        try { await device.runOutput(DeviceOutput.Vibrate.percent(pct)); } catch { /* disconnected */ }
      } else if (device.hasOutput(OutputType.Oscillate)) {
        try { await device.runOutput(DeviceOutput.Oscillate.percent(pct)); } catch { /* disconnected */ }
      }
    }
  }

  /** 立即停止所有设备，清除 pattern */
  async stopAll(): Promise<void> {
    this.stopPattern();
    this._currentIntensity = 0;
    for (const device of this._devices) {
      try { await device.stop(); } catch { /* ignore */ }
    }
  }

  // ── Pattern 执行器 ────────────────────────────────────────────────────────

  private stopPattern() {
    if (this.patternTimer) {
      clearTimeout(this.patternTimer);
      this.patternTimer = null;
    }
    if (this.durationTimer) {
      clearTimeout(this.durationTimer);
      this.durationTimer = null;
    }
  }

  /**
   * 执行震动模式
   * @param intensity   目标强度 0–100
   * @param pattern     'steady' | 'pulse' | 'wave'
   * @param duration_ms 持续毫秒，省略则持续到下次调用
   */
  async runPattern(
    intensity: number,
    pattern: 'steady' | 'pulse' | 'wave' = 'steady',
    duration_ms?: number,
  ): Promise<void> {
    this.stopPattern();
    if (intensity === 0) { await this.stopAll(); return; }

    switch (pattern) {
      case 'steady':
        await this.vibrate(intensity);
        break;
      case 'pulse':
        await this._runPulse(intensity);
        break;
      case 'wave':
        await this._runWave(intensity);
        break;
    }

    if (duration_ms && duration_ms > 0) {
      this.durationTimer = setTimeout(() => this.stopAll(), duration_ms);
    }
  }

  // pulse：每 350ms 在 intensity ↔ 0 交替
  private async _runPulse(intensity: number) {
    let on = true;
    const tick = async () => {
      await this.vibrate(on ? intensity : 0);
      on = !on;
      this.patternTimer = setTimeout(tick, 350);
    };
    await tick();
  }

  // wave：sin 波，4 秒一周期
  private async _runWave(intensity: number) {
    const period = 4000;
    const steps = 50;
    const stepMs = period / steps;
    let step = 0;
    const tick = async () => {
      const t = (step % steps) / steps;
      const v = Math.round(intensity * Math.sin(Math.PI * t));
      await this.vibrate(v);
      step++;
      this.patternTimer = setTimeout(tick, stepMs);
    };
    await tick();
  }
}

// ── 全局单例 ─────────────────────────────────────────────────────────────────

export const intifaceClient = new IntifaceClientSingleton();

// 页面隐藏时自动停止（安全措施）
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      intifaceClient.stopAll();
    }
  });
}

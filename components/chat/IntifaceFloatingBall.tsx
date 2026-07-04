/**
 * IntifaceFloatingBall.tsx — Intiface 实时悬浮球 + 展开面板
 *
 * EM 独有。设备连接时自动出现，可自由拖动。
 * - 小圆球：强度颜色（绿/琥珀/红），脉冲动效
 * - 展开面板：强度条 + 模式 + 手动滑块覆盖 + 停止按钮
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stop, CaretRight } from '@phosphor-icons/react';
import { intifaceClient } from '../../utils/intifaceClient';

const STORAGE_KEY = 'intiface-ball-pos';
const DEFAULT_POS = { right: 12, bottom: 160 };

function loadPos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { right: number; bottom: number };
  } catch { /* ignore */ }
  return DEFAULT_POS;
}

const IntifaceFloatingBall: React.FC = () => {
  const [intensity, setIntensity] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [pos, setPos] = useState(loadPos);
  const sliderRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    startX: number; startY: number;
    startRight: number; startBottom: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setIntensity(intifaceClient.currentIntensity);
    }, 100);
    return () => clearInterval(id);
  }, []);

  const shouldShow =
    intifaceClient.connected &&
    intifaceClient.devices.length > 0;

  useEffect(() => {
    if (!shouldShow) { setExpanded(false); setOverriding(false); }
  }, [shouldShow]);

  const handleStop = useCallback(async () => {
    setOverriding(false);
    await intifaceClient.stopAll();
  }, []);

  const handleSlider = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    setOverriding(true);
    await intifaceClient.runPattern(v, 'steady');
  }, []);

  // ── 拖动逻辑 ──
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: pos.right,
      startBottom: pos.bottom,
      moved: false,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    d.moved = true;
    const maxR = window.innerWidth - 48;
    const maxB = window.innerHeight - 48;
    setPos({
      right: Math.max(4, Math.min(maxR, d.startRight - dx)),
      bottom: Math.max(4, Math.min(maxB, d.startBottom - dy)),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    if (d.moved) {
      setPos(p => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
        return p;
      });
    } else {
      setExpanded(prev => !prev);
    }
    dragRef.current = null;
  }, []);

  if (!shouldShow) return null;

  const color =
    intensity === 0  ? { bg: 'bg-slate-400', bar: 'bg-slate-400' } :
    intensity <= 35   ? { bg: 'bg-emerald-400', bar: 'bg-emerald-400' } :
    intensity <= 70   ? { bg: 'bg-amber-400', bar: 'bg-amber-400' } :
                        { bg: 'bg-red-400', bar: 'bg-red-400' };

  return (
    <div
      className="fixed z-50 flex flex-col items-end gap-2"
      style={{ right: pos.right, bottom: pos.bottom }}
    >
      {/* 展开面板 */}
      {expanded && (
        <div
          className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-lg border border-slate-200/60 p-4 w-56 animate-in fade-in slide-in-from-right-2 duration-200"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${color.bg}`} />
              <span className="text-xs font-bold text-slate-700">
                {intensity === 0 ? '待机' : `${intensity}%`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <CaretRight className="w-3.5 h-3.5" weight="bold" />
            </button>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all duration-150 ${color.bar}`}
              style={{ width: `${intensity}%` }}
            />
          </div>

          <div className="mb-3">
            <label className="text-[10px] text-slate-400 font-medium mb-1 block">
              {overriding ? '手动覆盖中' : '拖动覆盖'}
            </label>
            <input
              ref={sliderRef}
              type="range"
              min={0}
              max={100}
              value={intensity}
              onChange={handleSlider}
              className="w-full h-1.5 appearance-none bg-slate-100 rounded-full outline-none
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:shadow-md
                [&::-webkit-slider-thumb]:cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={handleStop}
            className="w-full py-2 rounded-xl text-xs font-bold text-red-600 bg-red-50 border border-red-100 active:scale-95 transition-all flex items-center justify-center gap-1.5"
          >
            <Stop className="w-3.5 h-3.5" weight="bold" />
            紧急停止
          </button>

          {overriding && (
            <p className="text-[9px] text-slate-400 text-center mt-2">
              角色下次调用时会覆盖回来
            </p>
          )}
        </div>
      )}

      {/* 悬浮球 — 拖动 + 点击 */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`w-10 h-10 rounded-full shadow-lg border-2 border-white flex items-center justify-center transition-colors select-none touch-none ${color.bg} ${
          intensity > 0 ? 'animate-pulse' : ''
        }`}
        style={{
          cursor: 'grab',
          boxShadow: intensity > 0
            ? `0 0 ${Math.max(8, intensity / 5)}px ${
                intensity <= 35 ? '#4ade80' : intensity <= 70 ? '#fbbf24' : '#f87171'
              }`
            : '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <span className="text-white text-[10px] font-black pointer-events-none">
          {intensity === 0 ? '●' : intensity}
        </span>
      </div>
    </div>
  );
};

export default IntifaceFloatingBall;

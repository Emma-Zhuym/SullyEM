/**
 * IntifaceFloatingBall.tsx — Intiface 实时悬浮球 + 展开面板
 *
 * EM 独有。设备连接且 Chat 模式开启时自动出现在聊天右侧。
 * - 小圆球：强度颜色（绿/琥珀/红），脉冲动效
 * - 展开面板：强度条 + 模式 + 手动滑块覆盖 + 停止按钮
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Stop, CaretRight } from '@phosphor-icons/react';
import { intifaceClient } from '../../utils/intifaceClient';

const PATTERN_LABELS: Record<string, string> = {
  steady: '恒定',
  pulse: '脉冲',
  wave: '波浪',
};

const IntifaceFloatingBall: React.FC = () => {
  const [intensity, setIntensity] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);

  // 轮询当前强度（100ms）
  useEffect(() => {
    const id = setInterval(() => {
      setIntensity(intifaceClient.currentIntensity);
    }, 100);
    return () => clearInterval(id);
  }, []);

  // 设备连接 + Chat 模式开启才显示
  const shouldShow =
    intifaceClient.connected &&
    intifaceClient.devices.length > 0 &&
    localStorage.getItem('intiface-chat-enabled') === 'true';

  // 不显示时自动收起
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

  if (!shouldShow) return null;

  // 强度 → 颜色
  const color =
    intensity === 0  ? { bg: 'bg-slate-400', ring: 'ring-slate-300', bar: 'bg-slate-400', text: 'text-slate-500' } :
    intensity <= 35   ? { bg: 'bg-emerald-400', ring: 'ring-emerald-300', bar: 'bg-emerald-400', text: 'text-emerald-600' } :
    intensity <= 70   ? { bg: 'bg-amber-400', ring: 'ring-amber-300', bar: 'bg-amber-400', text: 'text-amber-600' } :
                        { bg: 'bg-red-400', ring: 'ring-red-300', bar: 'bg-red-400', text: 'text-red-600' };

  return (
    <div className="fixed right-3 bottom-28 z-50 flex flex-col items-end gap-2">
      {/* 展开面板 */}
      {expanded && (
        <div
          className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-lg border border-slate-200/60 p-4 w-56 animate-in fade-in slide-in-from-right-2 duration-200"
          onClick={e => e.stopPropagation()}
        >
          {/* 标题行 */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${color.bg}`} />
              <span className="text-xs font-bold text-slate-700">
                {intensity === 0 ? '待机' : `${intensity}%`}
              </span>
              {intensity > 0 && (
                <span className="text-[10px] text-slate-400 font-medium">
                  {PATTERN_LABELS['steady']}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <CaretRight className="w-3.5 h-3.5" weight="bold" />
            </button>
          </div>

          {/* 强度条 */}
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full transition-all duration-150 ${color.bar}`}
              style={{ width: `${intensity}%` }}
            />
          </div>

          {/* 手动覆盖滑块 */}
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

          {/* 停止按钮 */}
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

      {/* 悬浮球 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`w-10 h-10 rounded-full shadow-lg border-2 border-white flex items-center justify-center transition-all active:scale-90 ${color.bg} ${
          intensity > 0 ? 'animate-pulse' : ''
        }`}
        style={{
          boxShadow: intensity > 0
            ? `0 0 ${Math.max(8, intensity / 5)}px ${
                intensity <= 35 ? '#4ade80' : intensity <= 70 ? '#fbbf24' : '#f87171'
              }`
            : '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <span className="text-white text-[10px] font-black">
          {intensity === 0 ? '●' : intensity}
        </span>
      </button>
    </div>
  );
};

export default IntifaceFloatingBall;

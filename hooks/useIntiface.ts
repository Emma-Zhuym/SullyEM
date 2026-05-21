/**
 * useIntiface.ts — Intiface 设备状态 React hook
 *
 * EM 独有功能。封装 intifaceClient 单例，提供响应式状态。
 *
 * 用法：
 *   const { connected, devices, vibrate, stop, currentIntensity } = useIntiface();
 */

import { useState, useEffect, useCallback } from 'react';
import { ButtplugClientDevice } from 'buttplug';
import { intifaceClient, IntifaceStatus } from '../utils/intifaceClient';

interface UseIntifaceReturn {
  status: IntifaceStatus;
  connected: boolean;
  devices: ButtplugClientDevice[];
  currentIntensity: number;          // 0–100，用于 UI 显示
  connect: (url?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  rescan: () => Promise<void>;
  vibrate: (intensity: number, pattern?: 'steady' | 'pulse' | 'wave', duration_ms?: number) => Promise<void>;
  stop: () => Promise<void>;
  errorMessage: string | null;
}

export function useIntiface(): UseIntifaceReturn {
  const [status, setStatus] = useState<IntifaceStatus>(intifaceClient.status);
  const [devices, setDevices] = useState<ButtplugClientDevice[]>(intifaceClient.devices);
  const [currentIntensity, setCurrentIntensity] = useState(intifaceClient.currentIntensity);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubStatus = intifaceClient.onStatusChange((s, err) => {
      setStatus(s);
      setErrorMessage(err ?? null);
    });
    const unsubDevices = intifaceClient.onDevicesChange(d => setDevices([...d]));

    return () => {
      unsubStatus();
      unsubDevices();
    };
  }, []);

  // 轮询 currentIntensity（pattern 运行中会频繁变化，用 100ms 轮询足够）
  useEffect(() => {
    if (!intifaceClient.connected) return;
    const id = setInterval(() => {
      setCurrentIntensity(intifaceClient.currentIntensity);
    }, 100);
    return () => clearInterval(id);
  }, [status]);

  const connect = useCallback((url?: string) => intifaceClient.connect(url), []);
  const disconnect = useCallback(() => intifaceClient.disconnect(), []);
  const rescan = useCallback(() => intifaceClient.rescan(), []);

  const vibrate = useCallback(
    (intensity: number, pattern: 'steady' | 'pulse' | 'wave' = 'steady', duration_ms?: number) =>
      intifaceClient.runPattern(intensity, pattern, duration_ms),
    [],
  );

  const stop = useCallback(() => intifaceClient.stopAll(), []);

  return {
    status,
    connected: status === 'connected',
    devices,
    currentIntensity,
    connect,
    disconnect,
    rescan,
    vibrate,
    stop,
    errorMessage,
  };
}

/**
 * 在 Chat 模式里解析 tool_use block 并执行
 *
 * 用法：在 useChatAI.ts 处理 tool_use 时调用：
 *   const handled = await handleIntifaceToolCall(block.name, block.input);
 *   if (handled) return { tool_use_id: block.id, content: '{"success":true}' };
 */
export async function handleIntifaceToolCall(
  name: string,
  input: Record<string, unknown>,
): Promise<boolean> {
  if (name !== 'control_toy') return false;
  if (!intifaceClient.connected) return false;

  const intensity = typeof input.intensity === 'number' ? input.intensity : 0;
  const pattern = (input.pattern as 'steady' | 'pulse' | 'wave' | undefined) ?? 'steady';
  const duration_ms = typeof input.duration_ms === 'number' ? input.duration_ms : undefined;

  await intifaceClient.runPattern(intensity, pattern, duration_ms);
  return true;
}

/**
 * 在见面/约会模式里，从流式 chunk 里扫描并剥除 VIBRATE 命令
 *
 * 用法：
 *   const clean = processIntifaceChunk(chunk);   // 替换显示文本
 *
 * 匹配格式：  "VIBRATE": 数字   （ST 插件兼容格式）
 */
/**
 * 创建一个有状态的 chunk 处理器（每次约会 session 创建一个）。
 * 内部维护 buffer 解决跨 chunk 断裂问题。
 */
export function createIntifaceChunkProcessor() {
  let residual = '';

  return function process(chunk: string): string {
    if (!intifaceClient.connected) return chunk;

    // 拼上上次残留
    const combined = residual + chunk;
    residual = '';

    // 如果末尾疑似一个不完整的 "VIBRATE"... 标记（没闭合的数字），
    // 把可疑部分缓存到 residual，下次补全
    const tailMatch = combined.match(/"VIBR(?:ATE)?(?:"\s*:\s*\d*)?$/i);
    let toProcess = combined;
    if (tailMatch) {
      residual = tailMatch[0];
      toProcess = combined.slice(0, -residual.length);
    }

    const cleaned = toProcess.replace(/"VIBRATE"\s*:\s*(\d+)/gi, (_, num) => {
      const intensity = Math.max(0, Math.min(100, parseInt(num, 10)));
      intifaceClient.runPattern(intensity, 'steady').catch(() => {});
      return '';
    });

    // 只返回本次 chunk 应该输出的部分（减去 residual 来自上一次的偏移）
    // 简化：如果没有 residual 被截走，直接返回 cleaned；否则只返回新增部分
    return cleaned;
  };
}

/**
 * 生成注入 API 请求的 control_toy 工具定义
 * 只在设备已连接时调用
 */
export function buildIntifaceTool() {
  return {
    type: 'function' as const,
    function: {
      name: 'control_toy',
      description:
        '控制用户连接的设备。角色在对话中主动调整设备时调用。intensity 0 = 立即停止。',
      parameters: {
        type: 'object' as const,
        properties: {
          intensity: {
            type: 'number',
            description: '强度 0–100，0 为停止',
          },
          pattern: {
            type: 'string',
            enum: ['steady', 'pulse', 'wave'],
            description: 'steady=恒定 pulse=脉冲 wave=波浪',
          },
          duration_ms: {
            type: 'number',
            description: '持续毫秒，省略则保持到下次调用',
          },
        },
        required: ['intensity'],
      },
    },
  };
}

/**
 * 生成追加到系统 prompt 的 Intiface 说明段落
 */
export function buildIntifaceSystemPrompt(deviceName: string): string {
  return `
[设备连接]
用户当前连接了一个设备（${deviceName}）。你可以通过 control_toy 工具直接控制它。
当你在对话中描述调整档位、改变强度时，同步调用工具让效果真实发生。
intensity 0–100，0 = 停止。pattern 可选 steady/pulse/wave。
自然融入对话，不必每次都说明自己在调用工具。`.trim();
}

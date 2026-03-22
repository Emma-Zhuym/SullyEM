
import React, { useState } from 'react';
import { CaretLeft, House, Lightning, X } from '@phosphor-icons/react';
import { CharacterProfile } from '../../types';
import type { ContextComposition } from '../../hooks/useChatAI';

interface TokenBreakdown {
    prompt: number;
    completion: number;
    total: number;
    msgCount: number;
    pass: string;
}

interface ChatHeaderProps {
    selectionMode: boolean;
    selectedCount: number;
    onCancelSelection: () => void;
    activeCharacter: CharacterProfile;
    isTyping: boolean;
    isSummarizing: boolean;
    lastTokenUsage: number | null;
    tokenBreakdown?: TokenBreakdown | null;
    /** 上次请求前的字符级构成（悬停 ⚡ 可看）；详见控制台 📊 [Context Breakdown] */
    contextComposition?: ContextComposition | null;
    onClose: () => void;
    onTriggerAI: () => void;
    onShowCharsPanel: () => void;
    /** 返回通讯录列表（任务 6）；左侧箭头绑定此项，小房子绑定 onClose 回桌面 */
    onOpenContacts?: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
    selectionMode,
    selectedCount,
    onCancelSelection,
    activeCharacter,
    isTyping,
    isSummarizing,
    lastTokenUsage,
    tokenBreakdown,
    contextComposition,
    onClose,
    onTriggerAI,
    onShowCharsPanel,
    onOpenContacts
}) => {
    const [showTokenPanel, setShowTokenPanel] = useState(false);

    return (
        <div className="h-24 bg-white/80 backdrop-blur-xl px-5 flex items-end pb-4 border-b border-slate-200/60 shrink-0 z-30 sticky top-0 shadow-sm relative">
            {selectionMode ? (
                <div className="flex items-center justify-between w-full">
                    <button onClick={onCancelSelection} className="text-sm font-bold text-slate-500 px-2 py-1">取消</button>
                    <span className="text-sm font-bold text-slate-800">已选 {selectedCount} 项</span>
                    <div className="w-10"></div>
                </div>
            ) : (
                <div className="flex items-center gap-3 w-full">
                    <button
                        type="button"
                        onClick={onOpenContacts ?? onClose}
                        className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full"
                        title={onOpenContacts ? '返回通讯录' : '返回'}
                        aria-label={onOpenContacts ? '返回通讯录' : '返回'}
                    >
                        <CaretLeft className="w-5 h-5" weight="bold" />
                    </button>
                    {onOpenContacts && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 -ml-1 text-slate-500 hover:bg-slate-100 rounded-full shrink-0"
                            title="主页"
                            aria-label="返回桌面主页"
                        >
                            <House className="w-5 h-5" weight="bold" />
                        </button>
                    )}
                    <div onClick={onShowCharsPanel} className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer">
                        <img src={activeCharacter.avatar} className="w-10 h-10 rounded-xl object-cover shadow-sm" alt="avatar" />
                        <div>
                            <div className="font-bold text-slate-800">{activeCharacter.name}</div>
                            <div className="flex items-center gap-2">
                                <div className="text-[10px] text-slate-400 uppercase">Online</div>
                                {lastTokenUsage && (
                                    <button
                                        type="button"
                                        className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-md font-mono border border-slate-200 active:scale-95"
                                        title={
                                            typeof window !== 'undefined' && 'ontouchstart' in window
                                                ? '点击查看上下文构成（手机无悬停）'
                                                : [
                                                      tokenBreakdown ? `API prompt: ${tokenBreakdown.prompt} | completion: ${tokenBreakdown.completion} | pass: ${tokenBreakdown.pass}` : '',
                                                      contextComposition
                                                          ? `构成(字符): 核心 ${contextComposition.coreContextChars} + 系统附加 ${contextComposition.systemInjectedChars} + 双语 ${contextComposition.bilingualAddonChars} | 历史 ${contextComposition.historyMessageCount} 条约 ${contextComposition.historyCharsApprox} 字 | 图 ${contextComposition.historyImageTurns} | limit ${contextComposition.contextLimit}`
                                                          : ''
                                                  ]
                                                      .filter(Boolean)
                                                      .join(' · ')
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowTokenPanel((v) => !v);
                                        }}
                                    >
                                        ⚡ {lastTokenUsage}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={onTriggerAI} 
                        disabled={isTyping} 
                        className={`p-2 rounded-full ${isTyping ? 'bg-slate-100' : 'bg-primary/10 text-primary'}`}
                    >
                        <Lightning className="w-5 h-5" weight="bold" />
                    </button>
                </div>
            )}
            
            {isSummarizing && (
                <div className="absolute top-full left-0 w-full bg-indigo-50 border-b border-indigo-100 p-2 flex items-center justify-center gap-2">
                    <div className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
                    <span className="text-xs text-indigo-600 font-medium">正在整理记忆档案，请稍候...</span>
                </div>
            )}

            {/* 手机无 hover：点 ⚡ 数字查看；电脑也可点，比 title 更完整 */}
            {showTokenPanel && lastTokenUsage != null && (
                <div
                    className="absolute left-3 right-3 top-full mt-1 z-50 rounded-xl border border-slate-200 bg-white/95 backdrop-blur-md shadow-lg p-3 text-left max-h-[55vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-bold text-slate-700">本次请求 · Token</span>
                        <button type="button" className="p-1 rounded-full text-slate-400 hover:bg-slate-100" onClick={() => setShowTokenPanel(false)} aria-label="关闭">
                            <X className="w-4 h-4" weight="bold" />
                        </button>
                    </div>
                    <div className="text-[11px] text-slate-600 space-y-1.5 font-mono leading-relaxed">
                        <div>
                            <span className="text-slate-400">API total（⚡ 旁数字）:</span> {lastTokenUsage}
                        </div>
                        {tokenBreakdown && (
                            <>
                                <div>
                                    <span className="text-slate-400">prompt:</span> {tokenBreakdown.prompt}　<span className="text-slate-400">completion:</span> {tokenBreakdown.completion}
                                </div>
                                <div>
                                    <span className="text-slate-400">pass:</span> {tokenBreakdown.pass}　<span className="text-slate-400">历史条数(参考):</span> {tokenBreakdown.msgCount}
                                </div>
                            </>
                        )}
                        {contextComposition ? (
                            <>
                                <div className="border-t border-slate-100 pt-2 mt-2 text-slate-500 font-sans text-[10px]">以下为发送前估算（字符数，非 token）</div>
                                <div>核心人设: {contextComposition.coreContextChars}</div>
                                <div>系统附加: {contextComposition.systemInjectedChars}</div>
                                <div>双语附加: {contextComposition.bilingualAddonChars}</div>
                                <div>历史消息: {contextComposition.historyMessageCount} 条 · 文本约 {contextComposition.historyCharsApprox} 字 · 含图 {contextComposition.historyImageTurns} 条</div>
                                <div>contextLimit: {contextComposition.contextLimit}</div>
                            </>
                        ) : (
                            <div className="text-[10px] text-amber-600 font-sans pt-1">暂无字符级构成（需走主聊天 triggerAI 一轮后才会更新）</div>
                        )}
                        <div className="border-t border-slate-100 pt-2 mt-2 text-[10px] text-slate-400 font-sans leading-snug">
                            电脑可在开发者工具 Console 搜 <code className="bg-slate-100 px-1 rounded">Context Breakdown</code> 看完整对象。手机请用 Safari 连接 Mac 调试或远程调试。
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChatHeader;

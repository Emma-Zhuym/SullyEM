
import React from 'react';
import { CharacterProfile } from '../../types';

interface ChatHeaderProps {
    selectionMode: boolean;
    selectedCount: number;
    onCancelSelection: () => void;
    activeCharacter: CharacterProfile;
    isTyping: boolean;
    isSummarizing: boolean;
    lastTokenUsage: number | null;
    onClose: () => void;
    onTriggerAI: () => void;
    onShowCharsPanel: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
    selectionMode,
    selectedCount,
    onCancelSelection,
    activeCharacter,
    isTyping,
    isSummarizing,
    lastTokenUsage,
    onClose,
    onTriggerAI,
    onShowCharsPanel
}) => {
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
                    <button onClick={onClose} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                        </svg>
                    </button>
                    
                    <div onClick={onShowCharsPanel} className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer">
                        <img src={activeCharacter.avatar} className="w-10 h-10 rounded-xl object-cover shadow-sm" alt="avatar" />
                        <div>
                            <div className="font-bold text-slate-800">{activeCharacter.name}</div>
                            <div className="flex items-center gap-2">
                                <div className="text-[10px] text-slate-400 uppercase">Online</div>
                                {lastTokenUsage && (
                                    <div className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded-md font-mono border border-slate-200">
                                        ⚡ {lastTokenUsage}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <button 
                        onClick={onTriggerAI} 
                        disabled={isTyping} 
                        className={`p-2 rounded-full ${isTyping ? 'bg-slate-100' : 'bg-primary/10 text-primary'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                        </svg>
                    </button>
                </div>
            )}
            
            {isSummarizing && (
                <div className="absolute top-full left-0 w-full bg-indigo-50 border-b border-indigo-100 p-2 flex items-center justify-center gap-2">
                    <div className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
                    <span className="text-xs text-indigo-600 font-medium">正在整理记忆档案，请稍候...</span>
                </div>
            )}
        </div>
    );
};

export default ChatHeader;


import React, { useRef } from 'react';
import { CharacterProfile, ChatTheme, EmojiCategory, Emoji } from '../../types';
import { PRESET_THEMES } from './ChatConstants';

interface ChatInputAreaProps {
    input: string;
    setInput: (v: string) => void;
    isTyping: boolean;
    selectionMode: boolean;
    showPanel: 'none' | 'actions' | 'emojis' | 'chars';
    setShowPanel: (v: 'none' | 'actions' | 'emojis' | 'chars') => void;
    onSend: () => void;
    onDeleteSelected: () => void;
    selectedCount: number;
    emojis: Emoji[];
    characters: CharacterProfile[];
    activeCharacterId: string;
    onCharSelect: (id: string) => void;
    customThemes: ChatTheme[];
    onUpdateTheme: (id: string) => void;
    onRemoveTheme: (id: string) => void;
    activeThemeId: string;
    onPanelAction: (type: string, payload?: any) => void;
    onImageSelect: (file: File) => void;
    isSummarizing: boolean;
    // Categories Support
    categories?: EmojiCategory[];
    activeCategory?: string;
    // Reroll Support
    onReroll: () => void;
    canReroll: boolean;
}

const ChatInputArea: React.FC<ChatInputAreaProps> = ({
    input, setInput, isTyping, selectionMode,
    showPanel, setShowPanel, onSend, onDeleteSelected, selectedCount,
    emojis, characters, activeCharacterId, onCharSelect,
    customThemes, onUpdateTheme, onRemoveTheme, activeThemeId,
    onPanelAction, onImageSelect, isSummarizing,
    categories = [], activeCategory = 'default',
    onReroll, canReroll
}) => {
    const chatImageInputRef = useRef<HTMLInputElement>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'chat' | 'bg') => {
        const file = e.target.files?.[0];
        if (file) {
            onImageSelect(file);
        }
        if (e.target) e.target.value = ''; // Reset
    };

    // Category Long Press (Delete)
    const handleCategoryTouchStart = (cat: EmojiCategory) => {
        if (cat.isSystem || cat.id === 'default') return;
        longPressTimer.current = setTimeout(() => {
            onPanelAction('delete-category-req', cat);
        }, 600);
    };

    const handleCategoryTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    return (
        <div className="bg-white/90 backdrop-blur-2xl border-t border-slate-200/50 pb-safe shrink-0 z-40 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] relative">
            
            {selectionMode ? (
                <div className="p-3 flex justify-center bg-white/50 backdrop-blur-md">
                    <button 
                        onClick={onDeleteSelected} 
                        className="w-full py-3 bg-red-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        删除选中 ({selectedCount})
                    </button>
                </div>
            ) : (
                <div className="p-3 px-4 flex gap-3 items-end">
                    <button onClick={() => setShowPanel(showPanel === 'actions' ? 'none' : 'actions')} className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    </button>
                    <div className="flex-1 bg-slate-100 rounded-[24px] flex items-center px-1 border border-transparent focus-within:bg-white focus-within:border-primary/30 transition-all">
                        <textarea 
                            rows={1} 
                            value={input} 
                            onChange={(e) => setInput(e.target.value)} 
                            onKeyDown={handleKeyDown} 
                            className="flex-1 bg-transparent px-4 py-3 text-[15px] resize-none max-h-24 no-scrollbar" 
                            placeholder="Message..." 
                            style={{ height: 'auto' }} 
                        />
                        <button onClick={() => setShowPanel(showPanel === 'emojis' ? 'none' : 'emojis')} className="p-2 text-slate-400 hover:text-primary">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" /></svg>
                        </button>
                    </div>
                    <button 
                        onClick={onSend} 
                        disabled={!input.trim()} 
                        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${input.trim() ? 'bg-primary text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>
                    </button>
                </div>
            )}

            {/* Panels */}
            {showPanel !== 'none' && !selectionMode && (
                <div className="bg-slate-50 h-72 border-t border-slate-200/60 overflow-hidden relative z-0 flex flex-col">
                    
                    {/* Emojis Panel with Categories */}
                    {showPanel === 'emojis' && (
                        <>
                            {/* Categories Bar */}
                            <div className="h-10 bg-white border-b border-slate-100 flex items-center px-2 gap-2 overflow-x-auto no-scrollbar shrink-0">
                                {categories.map(cat => (
                                    <button 
                                        key={cat.id} 
                                        onClick={() => onPanelAction('select-category', cat.id)}
                                        // Long press handlers
                                        onTouchStart={() => handleCategoryTouchStart(cat)}
                                        onTouchEnd={handleCategoryTouchEnd}
                                        onMouseDown={() => handleCategoryTouchStart(cat)}
                                        onMouseUp={handleCategoryTouchEnd}
                                        onMouseLeave={handleCategoryTouchEnd}
                                        onContextMenu={(e) => { e.preventDefault(); if (!cat.isSystem && cat.id !== 'default') onPanelAction('delete-category-req', cat); }}
                                        className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-all select-none ${activeCategory === cat.id ? 'bg-primary text-white font-bold shadow-sm' : 'bg-slate-100 text-slate-500'}`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                                <button onClick={() => onPanelAction('add-category')} className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 hover:bg-slate-200">+</button>
                            </div>

                            <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                                <div className="grid grid-cols-4 gap-3">
                                    <button onClick={() => onPanelAction('emoji-import')} className="aspect-square bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center text-2xl text-slate-400">+</button>
                                    {emojis.map((e, i) => (
                                        <button 
                                            key={i} 
                                            onClick={() => onPanelAction('send-emoji', e)}
                                            onContextMenu={(ev) => { ev.preventDefault(); onPanelAction('delete-emoji-req', e); }}
                                            className="aspect-square bg-white rounded-2xl p-2 shadow-sm relative active:scale-95 transition-transform"
                                        >
                                            <img src={e.url} className="w-full h-full object-contain pointer-events-none" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Actions Panel */}
                    {showPanel === 'actions' && (
                        <div className="p-6 grid grid-cols-4 gap-8 overflow-y-auto">
                            <button onClick={() => onPanelAction('transfer')} className="flex flex-col items-center gap-2 text-slate-600 active:scale-95 transition-transform">
                                <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center shadow-sm text-orange-400 border border-orange-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 7.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" /><path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 0 1 1.5 14.625v-9.75ZM8.25 9.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM18.75 9a.75.75 0 0 0-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 0 0 .75-.75V9.75a.75.75 0 0 0-.75-.75h-.008ZM4.5 9.75A.75.75 0 0 1 5.25 9h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75-.75H5.25a.75.75 0 0 1-.75-.75V9.75Z" clipRule="evenodd" /><path d="M2.25 18a.75.75 0 0 0 0 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 0 0-.75-.75H2.25Z" /></svg>
                                </div>
                                <span className="text-xs font-bold">转账</span>
                            </button>
                            
                            <button onClick={() => onPanelAction('poke')} className="flex flex-col items-center gap-2 text-slate-600 active:scale-95 transition-transform">
                                <div className="w-14 h-14 bg-sky-50 rounded-2xl flex items-center justify-center shadow-sm text-2xl border border-sky-100">👉</div>
                                <span className="text-xs font-bold">戳一戳</span>
                            </button>
                            
                            <button onClick={() => onPanelAction('archive')} className="flex flex-col items-center gap-2 text-slate-600 active:scale-95 transition-transform">
                                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center shadow-sm text-indigo-400 border border-indigo-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                                </div>
                                <span className="text-xs font-bold">{isSummarizing ? '归档中...' : '记忆归档'}</span>
                            </button>
                            
                            <button onClick={() => onPanelAction('settings')} className="flex flex-col items-center gap-2 text-slate-600 active:scale-95 transition-transform">
                                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center shadow-sm text-slate-500 border border-slate-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 2.555c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.212 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-2.555c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg></div>
                                <span className="text-xs font-bold">设置</span>
                            </button>
                            
                            <button onClick={() => chatImageInputRef.current?.click()} className="flex flex-col items-center gap-2 text-slate-600 active:scale-95 transition-transform">
                                <div className="w-14 h-14 bg-pink-50 rounded-2xl flex items-center justify-center shadow-sm text-pink-400 border border-pink-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                        <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <span className="text-xs font-bold">相册</span>
                            </button>
                            <input type="file" ref={chatImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageChange(e, 'chat')} />

                            {/* Regenerate Button */}
                            <button onClick={onReroll} disabled={!canReroll} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${canReroll ? 'text-slate-600' : 'text-slate-300 opacity-50'}`}>
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border ${canReroll ? 'bg-emerald-50 text-emerald-400 border-emerald-100' : 'bg-slate-50 text-slate-300 border-slate-100'}`}>
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                    </svg>
                                </div>
                                <span className="text-xs font-bold">重新生成</span>
                            </button>

                         </div>
                     )}
                     {showPanel === 'chars' && (
                        <div className="p-5 space-y-6 overflow-y-auto no-scrollbar">
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 px-1 tracking-wider uppercase mb-3">气泡样式</h3>
                                <div className="flex gap-3 px-1 overflow-x-auto no-scrollbar pb-2">
                                    {Object.values(PRESET_THEMES).map(t => (
                                        <button key={t.id} onClick={() => onUpdateTheme(t.id)} className={`px-6 py-3 rounded-2xl text-xs font-bold border shrink-0 transition-all ${activeThemeId === t.id ? 'bg-primary text-white border-primary' : 'bg-white border-slate-200 text-slate-600'}`}>{t.name}</button>
                                    ))}
                                    {customThemes.map(t => (
                                        <div key={t.id} className="relative group shrink-0">
                                            <button onClick={() => onUpdateTheme(t.id)} className={`px-6 py-3 rounded-2xl text-xs font-bold border transition-all ${activeThemeId === t.id ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-indigo-50 border-indigo-100 text-indigo-600'}`}>
                                                {t.name} (DIY)
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); onRemoveTheme(t.id); }} className="absolute -top-2 -right-2 bg-red-400 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 px-1 tracking-wider uppercase mb-3">切换会话</h3>
                                <div className="space-y-3">
                                    {characters.map(c => (
                                        <div key={c.id} onClick={() => onCharSelect(c.id)} className={`flex items-center gap-4 p-3 rounded-[20px] border cursor-pointer ${c.id === activeCharacterId ? 'bg-white border-primary/30 shadow-md' : 'bg-white/50 border-transparent'}`}>
                                            <img src={c.avatar} className="w-12 h-12 rounded-2xl object-cover" />
                                            <div className="flex-1"><div className="font-bold text-sm text-slate-700">{c.name}</div><div className="text-xs text-slate-400 truncate">{c.description}</div></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ChatInputArea;

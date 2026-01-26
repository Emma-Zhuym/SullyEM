

import React, { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { RoomItem, CharacterProfile, RoomTodo, RoomNote } from '../types';
import { ContextBuilder } from '../utils/context';
import { processImage } from '../utils/file';
import Modal from '../components/os/Modal';

// --- 1. 免版权贴纸素材库 (Sticker Library) ---
const ASSET_LIBRARY = {
    // Sully专属家具 (默认大小已根据你的布局调整)
    sully_special: [
        { name: 'Sully床', image: 'https://sharkpan.xyz/f/A3XeUZ/BED.png', defaultScale: 2.4 },
        { name: 'Sully电脑桌', image: 'https://sharkpan.xyz/f/G5n3Ul/DNZ.png', defaultScale: 2.4 },
        { name: 'Sully书柜', image: 'https://sharkpan.xyz/f/zlpWS5/SG.png', defaultScale: 2.0 },
        { name: 'Sully洞洞板', image: 'https://sharkpan.xyz/f/85K5ij/DDB.png', defaultScale: 2.6 },
        { name: 'Sully垃圾桶', image: 'https://sharkpan.xyz/f/75Nvsj/LJT.png', defaultScale: 0.9 },
    ],
    furniture: [
        { name: '床', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6cf.png', defaultScale: 1.5 },
        { name: '沙发', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6cb.png', defaultScale: 1.4 },
        { name: '椅子', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1fa91.png', defaultScale: 1.0 },
        { name: '马桶', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6bd.png', defaultScale: 1.0 },
        { name: '浴缸', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6c1.png', defaultScale: 1.5 },
    ],
    decor: [
        { name: '盆栽', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1fab4.png', defaultScale: 0.8 },
        { name: '电脑', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f5a5.png', defaultScale: 0.8 },
        { name: '游戏机', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3ae.png', defaultScale: 0.6 },
        { name: '吉他', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3b8.png', defaultScale: 1.0 },
        { name: '画', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f5bc.png', defaultScale: 1.2 },
        { name: '书堆', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4da.png', defaultScale: 0.8 },
        { name: '台灯', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3db.png', defaultScale: 0.8 },
        { name: '垃圾桶', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f5d1.png', defaultScale: 0.7 },
    ],
    food: [
        { name: '咖啡', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2615.png', defaultScale: 0.5 },
        { name: '蛋糕', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f370.png', defaultScale: 0.6 },
        { name: '披萨', image: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f355.png', defaultScale: 0.8 },
    ]
};

// 预设背景图
const WALLPAPER_PRESETS = [
    { name: '温馨暖白', value: 'radial-gradient(circle at 50% 50%, #fdfbf7 0%, #e2e8f0 100%)' },
    { name: '深夜蓝调', value: 'linear-gradient(to bottom, #1e293b 0%, #0f172a 100%)' },
    { name: '少女粉', value: 'radial-gradient(circle at 50% 50%, #fff1f2 0%, #ffe4e6 100%)' },
    { name: '极简灰', value: 'linear-gradient(135deg, #f3f4f6 0%, #d1d5db 100%)' },
    { name: '木质感', value: 'repeating-linear-gradient(45deg, #f7fee7 0px, #f7fee7 10px, #ecfccb 10px, #ecfccb 20px)' },
];

const FLOOR_PRESETS = [
    { name: '浅色木板', value: 'repeating-linear-gradient(90deg, #e7e5e4 0px, #e7e5e4 20px, #d6d3d1 21px)' },
    { name: '深色木板', value: 'repeating-linear-gradient(90deg, #78350f 0px, #78350f 20px, #451a03 21px)' },
    { name: '格纹地砖', value: 'conic-gradient(from 90deg at 2px 2px, #0000 90deg, #cbd5e1 0) 0 0/30px 30px' },
    { name: '素色地毯', value: '#d1d5db' },
];

const DEFAULT_FURNITURE: RoomItem[] = [
    { id: 'desk', name: '书桌', type: 'furniture', image: ASSET_LIBRARY.furniture[1].image, x: 20, y: 55, scale: 1.2, rotation: 0, isInteractive: true, descriptionPrompt: '这里是书桌，可能乱糟糟的，也可能整整齐齐。' },
    { id: 'plant', name: '盆栽', type: 'decor', image: ASSET_LIBRARY.decor[0].image, x: 85, y: 40, scale: 0.8, rotation: 0, isInteractive: true, descriptionPrompt: '角落里的植物。' },
];

// User-provided layout (Perfectly aligned!)
const SULLY_FURNITURE: RoomItem[] = [
  {
    id: "item-1768927221380",
    name: "Sully床",
    type: "furniture",
    image: "https://sharkpan.xyz/f/A3XeUZ/BED.png",
    x: 78.45852578067732,
    y: 97.38889754570907,
    scale: 2.4,
    rotation: 0,
    isInteractive: true,
    descriptionPrompt: "看起来很好睡的猫窝（确信）。"
  },
  {
    id: "item-1768927255102",
    name: "Sully电脑桌",
    type: "furniture",
    image: "https://sharkpan.xyz/f/G5n3Ul/DNZ.png",
    x: 28.853756791175588,
    y: 69.9444485439727,
    scale: 2.4,
    rotation: 0,
    isInteractive: true,
    descriptionPrompt: "硬核的电脑桌，上面大概运行着什么毁灭世界的程序。"
  },
  {
    id: "item-1768927271632",
    name: "Sully垃圾桶",
    type: "furniture",
    image: "https://sharkpan.xyz/f/75Nvsj/LJT.png",
    x: 10.276680026943646,
    y: 80.49999880981437,
    scale: 0.9,
    rotation: 0,
    isInteractive: true,
    descriptionPrompt: "不要乱翻垃圾桶！"
  },
  {
    id: "item-1768927286526",
    name: "Sully洞洞板",
    type: "furniture",
    image: "https://sharkpan.xyz/f/85K5ij/DDB.png",
    x: 32.608697687684455,
    y: 48.72222587415929,
    scale: 2.6,
    rotation: 0,
    isInteractive: true,
    descriptionPrompt: "收纳着各种奇奇怪怪的黑客工具和猫咪周边的洞洞板。"
  },
  {
    id: "item-1768927303472",
    name: "Sully书柜",
    type: "furniture",
    image: "https://sharkpan.xyz/f/zlpWS5/SG.png",
    x: 79.84189945375853,
    y: 68.94444543117953,
    scale: 2,
    rotation: 0,
    isInteractive: true,
    descriptionPrompt: "塞满了技术书籍和漫画书的柜子。"
  }
];

const FLOOR_HORIZON = 65; // Floor starts at 65% from top

interface ItemInteraction {
    description: string;
    reaction: string;
}

// --- Helper: Enhanced Markdown Renderer for Notebook ---
const renderInlineStyle = (text: string) => {
    // Regular Expression to match:
    // 1. **bold**
    // 2. ~~strikethrough~~
    // 3. *italic*
    // 4. `code`
    const parts = text.split(/(\*\*.*?\*\*|~~.*?~~|\*.*?\*|`.*?`)/g);
    
    return parts.map((part, i) => {
        // Bold
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} className="font-bold text-slate-800 bg-yellow-100/50 px-0.5 rounded">{part.slice(2, -2)}</strong>;
        }
        // Strikethrough
        if (part.startsWith('~~') && part.endsWith('~~')) {
            return <span key={i} className="line-through text-slate-400 opacity-80">{part.slice(2, -2)}</span>;
        }
        // Italic (single asterisk)
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
            return <em key={i} className="italic text-slate-600">{part.slice(1, -1)}</em>;
        }
        // Inline Code
        if (part.startsWith('`') && part.endsWith('`')) {
             return <code key={i} className="bg-slate-200 text-slate-600 px-1 rounded text-xs font-mono break-all">{part.slice(1, -1)}</code>;
        }
        return part;
    });
};

const renderNotebookContent = (text: string) => {
    // Simple Markdown-ish parser
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
            // Remove code block markers
            const firstLineBreak = part.indexOf('\n');
            let codeContent = part;
            if (firstLineBreak > -1 && firstLineBreak < 10) {
                 codeContent = part.substring(firstLineBreak + 1, part.length - 3);
            } else {
                 codeContent = part.substring(3, part.length - 3);
            }
            
            return (
                <div key={index} className="my-3 w-full max-w-full">
                    {/* Keep horizontal scroll for code blocks, don't wrap */}
                    <pre className="bg-slate-800 text-green-400 p-3 rounded-xl text-[10px] font-mono overflow-x-auto border-l-4 border-green-600 shadow-sm whitespace-pre">
                        {codeContent}
                    </pre>
                </div>
            );
        }
        return (
            <div key={index} className="w-full">
                {part.split('\n').map((line, lineIdx) => {
                    const key = `${index}-${lineIdx}`;
                    const trimLine = line.trim();
                    
                    if (!trimLine) return <div key={key} className="h-2"></div>;

                    if (trimLine.startsWith('# ')) {
                        return <h3 key={key} className="text-lg font-bold text-slate-800 mt-4 mb-2 pb-1 border-b-2 border-slate-200 break-words">{trimLine.substring(2)}</h3>;
                    }
                    if (trimLine.startsWith('## ')) {
                        return <h4 key={key} className="text-sm font-bold text-slate-700 mt-3 mb-1 border-l-4 border-slate-300 pl-2 break-words">{trimLine.substring(3)}</h4>;
                    }
                    if (trimLine.startsWith('> ')) {
                        return <div key={key} className="pl-3 border-l-4 border-slate-300 text-slate-500 italic my-2 py-1 bg-slate-100 rounded-r-lg text-xs break-words">{trimLine.substring(2)}</div>;
                    }
                    if (trimLine.startsWith('- ') || trimLine.startsWith('• ')) {
                        return <div key={key} className="flex gap-2 my-1 pl-1 items-start"><span className="text-slate-400 mt-1 shrink-0">•</span><span className="flex-1 break-words">{renderInlineStyle(trimLine.substring(2))}</span></div>;
                    }
                    
                    if (trimLine.match(/^\[[ x]\]/)) {
                         const isChecked = trimLine.includes('[x]');
                         return (
                             <div key={key} className="flex gap-2 my-1 pl-1 items-center">
                                 <div className={`w-3 h-3 border rounded-sm flex items-center justify-center shrink-0 ${isChecked ? 'bg-slate-600 border-slate-600' : 'border-slate-400'}`}>
                                     {isChecked && <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>}
                                 </div>
                                 <span className={`flex-1 break-words ${isChecked ? 'line-through text-slate-400' : 'text-slate-700'}`}>{renderInlineStyle(trimLine.substring(3))}</span>
                             </div>
                         );
                    }

                    return <div key={key} className="min-h-[1.5em] my-0.5 leading-relaxed break-words text-justify">{renderInlineStyle(line)}</div>;
                })}
            </div>
        );
    });
};

const RoomApp: React.FC = () => {
    const { closeApp, characters, activeCharacterId, setActiveCharacterId, updateCharacter, apiConfig, addToast, userProfile } = useOS();
    
    // Core State
    const [viewState, setViewState] = useState<'select' | 'room'>('select');
    const [mode, setMode] = useState<'view' | 'edit'>('view');
    const [items, setItems] = useState<RoomItem[]>([]);
    
    // Extended State
    const [todaysTodo, setTodaysTodo] = useState<RoomTodo | null>(null);
    const [notebookEntries, setNotebookEntries] = useState<RoomNote[]>([]);
    const [showSidebar, setShowSidebar] = useState(false);
    const [activePanel, setActivePanel] = useState<'todo' | 'notebook'>('todo');
    const [notebookPage, setNotebookPage] = useState(0);

    // UI State
    const [isInitializing, setIsInitializing] = useState(false);
    const [initStatusText, setInitStatusText] = useState('正在推开房门...');
    const [showLibrary, setShowLibrary] = useState(false);
    const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
    const [showDevModal, setShowDevModal] = useState(false); // Developer Mode
    const [showSettingsModal, setShowSettingsModal] = useState(false); // New: Room Settings
    const [lastPrompt, setLastPrompt] = useState<string>(''); // Debug: Store last sent prompt
    
    // Actor & Room State
    const [actorState, setActorState] = useState({ x: 50, y: 75, action: 'idle' });
    const [aiBubble, setAiBubble] = useState<{text: string, visible: boolean}>({ text: '', visible: false });
    const [observationText, setObservationText] = useState('');
    const [roomDescriptions, setRoomDescriptions] = useState<Record<string, ItemInteraction>>({});
    
    // Edit Mode State
    const [draggingId, setDraggingId] = useState<string | null>(null);
    // Use Ref to store drag offset context
    const dragStartRef = useRef<{ startX: number, startY: number, initialItemX: number, initialItemY: number, width: number, height: number } | null>(null);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
    const roomRef = useRef<HTMLDivElement>(null);
    
    // File Inputs
    const wallInputRef = useRef<HTMLInputElement>(null);
    const floorInputRef = useRef<HTMLInputElement>(null);
    const actorInputRef = useRef<HTMLInputElement>(null); 
    const customItemInputRef = useRef<HTMLInputElement>(null);

    // Custom Item Library State
    const [customAssets, setCustomAssets] = useState<{name: string, image: string, defaultScale: number, description?: string}[]>([]);
    const [showCustomModal, setShowCustomModal] = useState(false);
    const [customItemName, setCustomItemName] = useState('');
    const [customItemImage, setCustomItemImage] = useState('');
    const [customItemUrl, setCustomItemUrl] = useState(''); // New: Support URL input
    const [customItemDescription, setCustomItemDescription] = useState(''); // New: Description input

    // Deletion State
    const [deletingAsset, setDeletingAsset] = useState<{name: string, image: string} | null>(null);
    const assetLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const char = characters.find(c => c.id === activeCharacterId);

    // Load custom assets on mount
    useEffect(() => {
        const saved = localStorage.getItem('room_custom_assets');
        if (saved) {
            try {
                setCustomAssets(JSON.parse(saved));
            } catch (e) { console.error("Failed to load custom assets", e); }
        }
    }, []);

    // Helper: Get Virtual "Day" (Reset at 6 AM)
    const getVirtualDay = (): string => {
        const now = new Date();
        if (now.getHours() < 6) {
            now.setDate(now.getDate() - 1);
        }
        return now.toISOString().split('T')[0]; // YYYY-MM-DD
    };

    // Calculate Time Gap - Duplicated logic from other apps for self-containment
    const getTimeGapHint = (lastMsgTimestamp: number | undefined): string => {
        if (!lastMsgTimestamp) return '这是初次见面。';
        const now = Date.now();
        const diffMs = now - lastMsgTimestamp;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 5) return '你们刚刚还在聊天。';
        if (diffMins < 60) return `距离上次互动只有 ${diffMins} 分钟。`;
        if (diffHours < 24) return `距离上次互动已经过了 ${diffHours} 小时。`;
        return `距离上次互动已经过了 ${diffDays} 天。`;
    };

    // --- 1. Selection & Initialization ---

    const handleEnterRoom = async (c: CharacterProfile) => {
        setActiveCharacterId(c.id);
        setViewState('room');
        
        // Load Items: Priority -> Character Config > Sully Defaults > Generic Defaults
        let loadedItems = c.roomConfig?.items;
        
        if (!loadedItems || loadedItems.length === 0) {
            // Check if it's Sully (Preset ID or Name fallback)
            if (c.id === 'preset-sully-v2' || c.name === 'Sully') {
                loadedItems = SULLY_FURNITURE; 
                // Auto-save Sully's furniture to persist it
                updateCharacter(c.id, { roomConfig: { ...c.roomConfig, items: SULLY_FURNITURE } });
            } else {
                loadedItems = DEFAULT_FURNITURE;
            }
        }
        
        setItems(loadedItems || []);
        
        const today = getVirtualDay();
        const hasCache = c.lastRoomDate === today && c.savedRoomState;

        if (hasCache && c.savedRoomState) {
            setRoomDescriptions(c.savedRoomState.items || {});
            setAiBubble({ text: c.savedRoomState.welcomeMessage || "...", visible: true });
            
            const existingTodo = await DB.getRoomTodo(c.id, today);
            const existingNotes = await DB.getRoomNotes(c.id);
            setTodaysTodo(existingTodo);
            setNotebookEntries(existingNotes.sort((a, b) => b.timestamp - a.timestamp));
            
            addToast('已恢复今日房间状态', 'info');
        } else {
            initializeRoomState(c, loadedItems || []);
        }
    };

    const handleForceRefresh = () => {
        setShowRefreshConfirm(false);
        if (char) {
            initializeRoomState(char, items, true);
        }
    };

    // 🔴 Fallback Initialization: Used when main generation fails due to Safety Block
    const initializeFallback = async (c: CharacterProfile) => {
        try {
            console.warn("Triggering Room Fallback Initialization");
            const baseContext = ContextBuilder.buildCoreContext(c, userProfile, false);
            const fallbackPrompt = `${baseContext}\n\nTask: User entered your room. Just say hello. JSON: { "welcomeMessage": "..." }`;
            
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ 
                    model: apiConfig.model, 
                    messages: [{ role: "user", content: fallbackPrompt }], 
                    temperature: 0.5,
                    max_tokens: 8000 // Keep it tiny
                })
            });

            if (response.ok) {
                const data = await response.json();
                let content = data.choices?.[0]?.message?.content || '{"welcomeMessage": "..."}';
                content = content.replace(/```json/g, '').replace(/```/g, '').trim();
                
                try {
                    const res = JSON.parse(content);
                    const todayStr = getVirtualDay();
                    
                    setAiBubble({ text: res.welcomeMessage || "...", visible: true });
                    // Use generic descriptions for items in fallback mode
                    const fallbackItems: Record<string, any> = {};
                    items.forEach(i => { fallbackItems[i.id] = { description: `This is a ${i.name}.`, reaction: "..." }; });
                    setRoomDescriptions(fallbackItems);

                    updateCharacter(c.id, {
                        lastRoomDate: todayStr,
                        savedRoomState: {
                            actorStatus: "Idling...",
                            welcomeMessage: res.welcomeMessage || "...",
                            items: fallbackItems,
                            actorAction: 'idle'
                        }
                    });
                    addToast("已启动安全模式 (Safety Fallback)", "info");
                } catch (e) {
                    throw new Error("Fallback Parse Error");
                }
            }
        } catch (e) {
            console.error("Fallback Failed", e);
            setAiBubble({ text: "(...)", visible: true });
        } finally {
            setIsInitializing(false);
        }
    };

    const initializeRoomState = async (c: CharacterProfile, currentItems: RoomItem[], force: boolean = false) => {
        if (!apiConfig.apiKey) return;

        setIsInitializing(true);
        const loadingTexts = [`正在打扫${c.name}的房间...`, "正在整理思绪...", "正在擦拭家具...", "正在生成全部物品记忆..."];
        let textIdx = 0;
        const textInterval = setInterval(() => {
            setInitStatusText(loadingTexts[textIdx % loadingTexts.length]);
            textIdx++;
        }, 1200);

        try {
            const todayStr = getVirtualDay();
            const now = new Date();
            const nowTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const nowDateStr = now.toLocaleDateString();
            
            let existingTodo = await DB.getRoomTodo(c.id, todayStr);
            const existingNotes = await DB.getRoomNotes(c.id);
            setNotebookEntries(existingNotes.sort((a, b) => b.timestamp - a.timestamp));
            
            const shouldGenerateTodo = !existingTodo;
            if (existingTodo) {
                setTodaysTodo(existingTodo);
            }

            const recentMsgs = await DB.getMessagesByCharId(c.id);
            // Increased context from 20 to 50
            const chatContext = recentMsgs.slice(-50).map(m => {
                const role = m.role === 'user' ? '用户' : c.name;
                return `${role}: ${m.content.substring(0, 50)}`; 
            }).join('\n');

            // Time Gap Calculation
            const lastMsg = recentMsgs[recentMsgs.length - 1];
            const timeGapHint = getTimeGapHint(lastMsg?.timestamp);

            const baseContext = ContextBuilder.buildCoreContext(c, userProfile, true); // Keep Full Context
            
            // DEBUG FIX: Sanitize and truncate interactables context to prevent huge Base64 leakage
            const interactables = currentItems.filter(i => i.isInteractive).map(i => ({ 
                id: i.id, 
                name: i.name, 
                context: (i.descriptionPrompt || '').substring(0, 200) 
            }));

            let prompt = `${baseContext}

### [Environment Context - Critical]
**当前现实时间**: ${nowDateStr} ${nowTimeStr}
**与用户上次互动距离现在**: ${timeGapHint}
**最近互动记录 (Latest 50)**:
${chatContext}

### [Room Initialization - Batch Generation]
用户进入了**你的**房间。请一次性生成房间的状态、物品交互文本，以及（如果需要）你今天的计划和随笔。

### 1. 房间状态 (Status)
- **ActorStatus**: 你现在在房间里做什么？(请严格基于当前时间${nowTimeStr}和时间差${timeGapHint}来推断。如果是深夜可能在睡觉，如果很久没见可能在发呆。)
- **Welcome**: 看到用户进来，你第一句话说什么？(请结合时间差：如果很久没见，是惊讶、想念还是生气？)

### 2. 物品交互 (Items)
房间里有以下物品：
${JSON.stringify(interactables)}

请为**每一个**物品生成：
- **Description**: 旁白视角的物品外观/状态描写。
- **Reaction**: 当用户查看这个物品时，你(角色)的吐槽或反应。

### 3. [OPTIONAL] 今日待办清单 (Daily To-Do)
${!shouldGenerateTodo ? `(系统: 今日待办已存在，无需生成，请忽略此项)` : `(系统: 请生成 3-5 条你今天打算做的事。)`}

### 4. 记事簿随笔 (Notebook Entry)
请在你的私密记事簿上写点什么。
**要求**：
1. **风格多变**：可以是刚写的歌词、随笔感悟、心情记录、或者是一首短诗、一份购物清单。
2. **严禁代码**：**严禁**生成代码块(Code Blocks)或伪代码，除非你的核心设定明确是程序员。请像正常人写日记一样自然。
3. **格式丰富**：请积极使用 **Markdown** 格式让排版更有趣。
4. **内容新颖**：必须是新的内容，展示你作为独立个体的思考。

### 输出格式 (Strict JSON)
{
  "actorStatus": "...",
  "welcomeMessage": "...",
  "items": {
    "item_id": { "description": "...", "reaction": "..." }
  },
  ${shouldGenerateTodo ? `"todoList": ["task 1", "task 2"],` : ''}
  "notebookEntry": { "content": "markdown string...", "type": "thought" }
}
`;
            // DEBUG: Save prompt for inspection
            setLastPrompt(prompt);
            // CONSOLE LOG REMOVED FOR PRODUCTION CLEANUP

            // FIX: Add Safety Settings & Lower Temperature
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ 
                    model: apiConfig.model, 
                    messages: [{ role: "user", content: prompt }], 
                    temperature: 0.5, // Lower temp for stability
                    max_tokens: 8000,
                    // Safety Settings injection for Gemini-based proxies
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                })
            });

            if (response.ok) {
                const data = await response.json();
                let content = data.choices?.[0]?.message?.content || "";
                
                // CRITICAL FIX: Empty content check triggers fallback
                if (!content) {
                    throw new Error("AI returned empty response (Safety Block suspected).");
                }

                content = content.replace(/```json/g, '').replace(/```/g, '').trim();
                const firstBrace = content.indexOf('{');
                const lastBrace = content.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) content = content.substring(firstBrace, lastBrace + 1);
                
                let result;
                try { result = JSON.parse(content); } catch (e) { throw new Error("JSON Parse Failed"); }
                
                setAiBubble({ text: result.welcomeMessage || "Welcome!", visible: true });
                if (result.items) setRoomDescriptions(result.items);

                updateCharacter(c.id, {
                    lastRoomDate: todayStr,
                    savedRoomState: {
                        actorStatus: result.actorStatus,
                        welcomeMessage: result.welcomeMessage,
                        items: result.items || {},
                        actorAction: 'idle'
                    }
                });

                // 2. Handle To-Do (Only if we requested it)
                if (shouldGenerateTodo && result.todoList && Array.isArray(result.todoList)) {
                    const newTodo: RoomTodo = {
                        id: `${c.id}_${todayStr}`,
                        charId: c.id,
                        date: todayStr,
                        items: result.todoList.map((t: string) => ({ text: t, done: false })),
                        generatedAt: Date.now()
                    };
                    await DB.saveRoomTodo(newTodo);
                    setTodaysTodo(newTodo);
                    
                    await DB.saveMessage({
                        charId: c.id,
                        role: 'system',
                        type: 'text',
                        content: `[系统: ${c.name} 制定了今日计划: ${result.todoList.join(', ')}]`
                    });
                }

                // 3. Handle Notebook
                if (result.notebookEntry) {
                    // Create message first to get ID
                    const msgContent = `[系统: ${c.name} 在记事本上写道: \n"${result.notebookEntry.content}"]`;
                    
                    const msgId = await DB.saveMessage({
                        charId: c.id,
                        role: 'system',
                        type: 'text',
                        content: msgContent
                    });

                    const newNote: RoomNote = {
                        id: `note-${Date.now()}`,
                        charId: c.id,
                        timestamp: Date.now(),
                        content: result.notebookEntry.content,
                        type: result.notebookEntry.type || 'thought',
                        relatedMessageId: msgId
                    };
                    await DB.saveRoomNote(newNote);
                    setNotebookEntries(prev => [newNote, ...prev]);
                }

            } else { throw new Error(`API Error ${response.status}`); }

        } catch (e: any) { 
            console.error("Room Init Failed, switching to Fallback", e); 
            // Trigger Fallback
            await initializeFallback(c);
        } finally { 
            clearInterval(textInterval); 
            setIsInitializing(false); 
        }
    };

    const handleLookAt = async (item: RoomItem, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (mode === 'edit') { setSelectedItemId(item.id); return; }
        if (!char) return;
        
        // Character Movement Constraint: Keep feet below horizon line
        // FIX: Place actor visually "In Front" of furniture (lower Y = closer to camera in 2.5D top-down)
        const targetY = Math.max(FLOOR_HORIZON, item.y + 5); 
        
        setActorState({ x: item.x, y: targetY, action: 'walk' });
        setTimeout(() => setActorState(prev => ({ ...prev, action: 'interact' })), 600);
        
        const cached = roomDescriptions[item.id] || roomDescriptions[item.name];
        if (cached) {
            setObservationText(cached.description);
            setAiBubble({ text: cached.reaction, visible: true });
            
            const contentToCheck = `[${userProfile.name}]在[${char.name}]的${item.name}上看到了：${cached.description}。[${char.name}]表示：${cached.reaction}`;
            const recentMsgs = await DB.getMessagesByCharId(char.id);
            const isDuplicate = recentMsgs.slice(-50).some(m => m.role === 'system' && m.content === contentToCheck);

            if (!isDuplicate) {
                try { 
                    await DB.saveMessage({ charId: char.id, role: 'system', type: 'text', content: contentToCheck }); 
                } catch (err) {}
            }
        } else {
            setObservationText(`${item.name}静静地摆放在那里。`);
            setAiBubble({ text: "(盯...)", visible: true });
        }
    };

    const handlePokeActor = () => {
        if (mode === 'edit') { actorInputRef.current?.click(); return; }
        setActorState(prev => ({ ...prev, action: 'bounce' }));
        setTimeout(() => setActorState(prev => ({ ...prev, action: 'idle' })), 500);
        const thoughts = ["嗯？", "别闹...", "我在呢。", "盯着我看干嘛...", "(发呆)"];
        setAiBubble({ text: thoughts[Math.floor(Math.random() * thoughts.length)], visible: true });
    };

    const handleToggleTodo = async (index: number) => {
        if (!todaysTodo) return;
        const newItems = [...todaysTodo.items];
        newItems[index].done = !newItems[index].done;
        const newTodo = { ...todaysTodo, items: newItems };
        setTodaysTodo(newTodo);
        await DB.saveRoomTodo(newTodo);
    };

    // --- Deletion Handlers (Point 5) ---
    const handleDeleteTodo = async (index: number) => {
        if (!todaysTodo) return;
        const newItems = todaysTodo.items.filter((_, i) => i !== index);
        const newTodo = { ...todaysTodo, items: newItems };
        setTodaysTodo(newTodo);
        await DB.saveRoomTodo(newTodo);
        addToast('条目已删除', 'success');
    };

    const handleDeleteNote = async (id: string) => {
        const note = notebookEntries.find(n => n.id === id);
        if (note && note.relatedMessageId) {
            await DB.deleteMessage(note.relatedMessageId);
        }
        await DB.deleteRoomNote(id);
        setNotebookEntries(prev => prev.filter(n => n.id !== id));
        addToast('笔记已彻底粉碎 (相关记录已清除)', 'success');
    };

    const handleStageClick = (e: React.MouseEvent) => {
        if (mode === 'edit') {
            setSelectedItemId(null);
            return;
        }
        // View mode: Move actor
        if (!roomRef.current) return;
        const rect = roomRef.current.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        // Constrain to floor: allow climbing a bit, but mostly keep below horizon
        const targetY = Math.max(FLOOR_HORIZON - 5, y);
        
        setActorState({
            x,
            y: targetY,
            action: 'walk'
        });
        setTimeout(() => setActorState(prev => ({ ...prev, action: 'idle' })), 600);
        
        // Clear bubbles
        setAiBubble({ text: '', visible: false });
        setObservationText('');
    };

    // --- Edit Logic ---
    const saveRoom = (newItems: RoomItem[]) => { setItems(newItems); if (char) { updateCharacter(char.id, { roomConfig: { ...char.roomConfig, items: newItems } }); } };
    
    // Updated addItem to accept description
    const addItem = (asset: {name: string, image: string, defaultScale: number, description?: string}, type: 'furniture' | 'decor') => { 
        const newItem: RoomItem = { 
            id: `item-${Date.now()}`, 
            name: asset.name, 
            type: type, 
            image: asset.image, 
            x: 50, 
            y: 50, 
            scale: asset.defaultScale, 
            rotation: 0, 
            isInteractive: true,
            descriptionPrompt: asset.description // New Field
        }; 
        saveRoom([...items, newItem]); 
        setShowLibrary(false); 
        addToast(`已添加: ${asset.name}`, 'success'); 
    };

    const updateSelectedItem = (updates: Partial<RoomItem>) => { if (!selectedItemId) return; const newItems = items.map(i => i.id === selectedItemId ? { ...i, ...updates } : i); saveRoom(newItems); };
    const deleteSelectedItem = () => { if (!selectedItemId) return; saveRoom(items.filter(i => i.id !== selectedItemId)); setSelectedItemId(null); };
    const handleWallChange = (bg: string) => { if (char) updateCharacter(char.id, { roomConfig: { ...char.roomConfig, items, wallImage: bg } }); };
    const handleFloorChange = (bg: string) => { if (char) updateCharacter(char.id, { roomConfig: { ...char.roomConfig, items, floorImage: bg } }); };
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'wall' | 'floor' | 'actor' | 'custom_item') => { 
        const file = e.target.files?.[0]; 
        if (file) { 
            try { 
                // Force high quality for custom item uploads
                const processOptions = target === 'custom_item' ? { quality: 1.0, maxWidth: 2048 } : undefined;
                const base64 = await processImage(file, processOptions); 
                
                if (target === 'wall') handleWallChange(base64); 
                if (target === 'floor') handleFloorChange(base64); 
                if (target === 'actor') { 
                    if (char) { 
                        const newSprites = { ...(char.sprites || {}), 'chibi': base64 }; 
                        updateCharacter(char.id, { sprites: newSprites }); 
                        addToast('角色房间立绘已更新', 'success'); 
                    } 
                } 
                if (target === 'custom_item') { 
                    setCustomItemImage(base64); 
                } 
            } catch (err: any) { 
                addToast(err.message, 'error'); 
            } 
        } 
    };
    
    // Custom Item Save
    const saveCustomItem = () => { 
        const imageToUse = customItemUrl || customItemImage;
        if(!customItemName.trim() || !imageToUse) { addToast('请填写完整信息', 'error'); return; } 
        
        // 1. Add to Room (as current logic)
        addItem({ 
            name: customItemName, 
            image: imageToUse, 
            defaultScale: 1.0,
            description: customItemDescription || undefined
        }, 'furniture');
        
        // 2. Add to Custom Asset Library and Persist
        const newAsset = { 
            name: customItemName, 
            image: imageToUse, 
            defaultScale: 1.0,
            description: customItemDescription || undefined
        };
        const updatedLibrary = [...customAssets, newAsset];
        setCustomAssets(updatedLibrary);
        localStorage.setItem('room_custom_assets', JSON.stringify(updatedLibrary));
        
        setShowCustomModal(false); 
        setCustomItemName(''); 
        setCustomItemImage(''); 
        setCustomItemUrl('');
        setCustomItemDescription('');
    };

    // New Handlers for Deleting Custom Assets
    const handleAssetTouchStart = (asset: {name: string, image: string, defaultScale: number}) => {
        assetLongPressTimer.current = setTimeout(() => {
            setDeletingAsset(asset);
        }, 600);
    };

    const handleAssetTouchEnd = () => {
        if (assetLongPressTimer.current) {
            clearTimeout(assetLongPressTimer.current);
            assetLongPressTimer.current = null;
        }
    };

    const confirmDeleteAsset = () => {
        if (!deletingAsset) return;
        const newAssets = customAssets.filter(a => a.name !== deletingAsset.name || a.image !== deletingAsset.image);
        setCustomAssets(newAssets);
        localStorage.setItem('room_custom_assets', JSON.stringify(newAssets));
        setDeletingAsset(null);
        addToast('素材已删除', 'success');
    };

    // New: Handle Background Config Update
    const updateBgConfig = (updates: Partial<CharacterProfile['roomConfig']>) => {
        if (!char) return;
        updateCharacter(char.id, {
            roomConfig: { ...char.roomConfig, ...updates, items } // Ensure items are preserved
        });
    };

    // New: Reset Sully
    const resetSullyRoom = () => {
        if (!char) return;
        saveRoom(SULLY_FURNITURE);
        setShowSettingsModal(false);
        addToast('Sully 的房间已还原', 'success');
    };

    // --- FIX: Smooth Dragging Implementation ---
    // Instead of snapping anchor to mouse, calculate relative offset on drag start.
    const handlePointerDown = (e: React.PointerEvent, id: string) => { 
        if (mode !== 'edit') return; 
        e.preventDefault(); // Stop native drag behavior
        e.stopPropagation(); 
        e.currentTarget.setPointerCapture(e.pointerId); 
        
        const item = items.find(i => i.id === id);
        if (!item || !roomRef.current) return;

        const rect = roomRef.current.getBoundingClientRect();
        
        dragStartRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialItemX: item.x,
            initialItemY: item.y,
            width: rect.width,
            height: rect.height
        };

        setDraggingId(id); 
        setSelectedItemId(id); 
    };

    const handlePointerMove = (e: React.PointerEvent) => { 
        if (!draggingId || !dragStartRef.current) return; 
        
        const { startX, startY, initialItemX, initialItemY, width, height } = dragStartRef.current;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        
        // Convert px delta to percentage delta
        const nextX = initialItemX + (deltaX / width) * 100;
        const nextY = initialItemY + (deltaY / height) * 100;

        setItems(prev => prev.map(item => item.id === draggingId ? { 
            ...item, 
            x: Math.max(0, Math.min(100, nextX)), 
            y: Math.max(0, Math.min(100, nextY)) 
        } : item)); 
    };

    const handlePointerUp = (e: React.PointerEvent) => { 
        if (draggingId) { 
            saveRoom(items); 
            setDraggingId(null); 
            dragStartRef.current = null; // Clear ref
            e.currentTarget.releasePointerCapture(e.pointerId); 
        } 
    };

    // --- Renderers ---

    // SELECT SCREEN
    if (viewState === 'select') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-light">
                <div className="pt-12 pb-4 px-6 border-b border-slate-200 bg-white sticky top-0 z-20 flex items-center justify-between shrink-0 h-24 box-border">
                    <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-slate-100 active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="font-bold text-slate-700 text-lg tracking-wide">拜访谁的房间?</span>
                    <div className="w-8"></div>
                </div>
                <div className="p-6 grid grid-cols-2 gap-5 overflow-y-auto pb-20 no-scrollbar">
                    {characters.map(c => (
                        <div key={c.id} onClick={() => handleEnterRoom(c)} className="aspect-[3/4] bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-col items-center justify-center gap-4 cursor-pointer active:scale-95 transition-all relative overflow-hidden group hover:shadow-md">
                            <div className="w-20 h-20 rounded-full p-1 border-2 border-slate-100 relative">
                                <img src={c.avatar} className="w-full h-full rounded-full object-cover" />
                                <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-400 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white">🏠</div>
                            </div>
                            <span className="font-bold text-slate-700 text-sm">{c.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ROOM SCREEN
    // Use chibi sprite if available, else avatar. Fallback for Sully is injected via OSContext now.
    const actorImage = char?.sprites?.['chibi'] || char?.avatar;
    const stickerClass = "filter drop-shadow-[0_0_1px_#fff] drop-shadow-[0_0_2px_#fff] drop-shadow-[0_4px_6px_rgba(0,0,0,0.2)]";
    
    // Background Style Construction (Logic 1: Legacy String vs New Config)
    const getBgStyle = (img: string | undefined, scale: number | undefined, repeat: boolean | undefined) => {
        if (!img) return '';
        const isUrl = img.startsWith('http') || img.startsWith('data');
        const url = isUrl ? `url(${img})` : img; // If it's a CSS gradient, use it directly
        
        // If it's a gradient string (not URL), ignore scale params as they apply to background-size which works on gradients too, but repeat usually doesn't apply the same way.
        // Let's assume adjustments are mostly for Images.
        if (!isUrl) return url;

        // Apply Config
        const size = scale && scale > 0 ? `${scale}%` : 'cover'; // 0 = Cover
        const rep = repeat ? 'repeat' : 'no-repeat';
        const pos = 'center center';
        
        return `${url} ${pos} / ${size} ${rep}`;
    };

    const wallStyle = getBgStyle(char?.roomConfig?.wallImage, char?.roomConfig?.wallScale, char?.roomConfig?.wallRepeat) || WALLPAPER_PRESETS[0].value;
    const floorStyle = getBgStyle(char?.roomConfig?.floorImage, char?.roomConfig?.floorScale, char?.roomConfig?.floorRepeat) || FLOOR_PRESETS[0].value;

    // Merge Asset Libraries for Modal
    const displayLibrary = {
        ...ASSET_LIBRARY,
        custom: customAssets
    };

    // Sully Check
    const isSully = char?.id === 'preset-sully-v2' || char?.name === 'Sully';

    return (
        <div className="h-full w-full bg-[#f8fafc] flex flex-col relative overflow-hidden font-sans select-none">
            
            {isInitializing && (
                <div className="absolute inset-0 z-[500] bg-white flex flex-col items-center justify-center animate-fade-in">
                    <div className="text-4xl mb-4 animate-bounce">🚪</div>
                    <p className="text-sm font-bold text-slate-500">{initStatusText}</p>
                </div>
            )}

            {/* Room Stage */}
            <div ref={roomRef} className="flex-1 relative overflow-hidden transition-all duration-500 touch-none" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onClick={handleStageClick}>
                <div className="absolute top-0 left-0 w-full h-[65%] bg-center transition-all duration-500 z-0" style={{ background: wallStyle }}></div>
                <div className="absolute bottom-0 left-0 w-full h-[35%] bg-center transition-all duration-500 z-0" style={{ background: floorStyle }}></div>
                <div className="absolute top-[65%] w-full h-8 bg-gradient-to-b from-black/10 to-transparent pointer-events-none z-0"></div>
                {items.map(item => {
                    const isDragging = draggingId === item.id;
                    return (
                        <div 
                            key={item.id} 
                            onPointerDown={(e) => handlePointerDown(e, item.id)} 
                            onClick={(e) => handleLookAt(item, e)} 
                            className={`absolute origin-bottom-center ${stickerClass} ${mode === 'edit' ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : (item.isInteractive ? 'cursor-pointer hover:scale-105 active:scale-95' : '')} ${selectedItemId === item.id ? 'ring-2 ring-blue-400 rounded-lg ring-offset-4' : ''} touch-none select-none`} 
                            style={{ 
                                left: `${item.x}%`, 
                                top: `${item.y}%`, 
                                width: `${80 * item.scale}px`, 
                                transform: `translate(-50%, -100%) rotate(${item.rotation}deg)`, 
                                zIndex: isDragging ? 100 : Math.floor(item.y), // Pop to top when dragging
                                transition: isDragging ? 'none' : 'transform 0.3s ease-out' // Disable transition when dragging
                            }}
                        >
                            <img src={item.image} className="w-full h-auto object-contain pointer-events-none select-none" draggable={false} />
                            {mode === 'edit' && selectedItemId === item.id && <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap">选中</div>}
                        </div>
                    );
                })}
                
                {/* Character Actor - Z Index Boosted to simulate standing in front */}
                <div onClick={(e) => { e.stopPropagation(); handlePokeActor(); }} className={`absolute transition-all duration-[1000ms] ease-in-out origin-bottom-center ${stickerClass} cursor-pointer active:scale-95 group`} style={{ left: `${actorState.x}%`, top: `${actorState.y}%`, width: '120px', transform: `translate(-50%, -100%) scale(${actorState.action === 'walk' ? 1.05 : (actorState.action === 'bounce' ? 1.1 : 1)})`, zIndex: Math.floor(actorState.y) + 20 }}>
                    <img src={actorImage} className={`w-full h-full object-contain ${actorState.action === 'walk' ? 'animate-bounce' : ''}`} />
                    {mode === 'edit' && <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[9px] px-2 py-1 rounded backdrop-blur-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">📷 换装</div>}
                    {/* Fixed: Wider bubble width */}
                    {aiBubble.visible && <div className="absolute bottom-[105%] left-1/2 -translate-x-1/2 bg-white px-4 py-3 rounded-[20px] rounded-bl-none shadow-lg border-2 border-black/5 min-w-[120px] max-w-[300px] animate-pop-in z-50"><p className="text-xs font-bold text-slate-700 leading-tight text-center break-words">{aiBubble.text}</p><button onClick={(e) => { e.stopPropagation(); setAiBubble({ ...aiBubble, visible: false }); }} className="absolute -top-2 -right-2 bg-slate-200 text-slate-500 rounded-full w-4 h-4 flex items-center justify-center text-[8px]">×</button></div>}
                </div>
            </div>

            {/* Sidebar Toggle Button */}
            <button onClick={() => setShowSidebar(true)} className={`absolute right-0 top-1/2 -translate-y-1/2 bg-white/80 backdrop-blur-sm p-3 rounded-l-2xl shadow-lg border border-r-0 border-white/20 transition-transform duration-300 z-[300] ${showSidebar ? 'translate-x-full' : 'translate-x-0'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-slate-500"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            </button>
            {showSidebar && <div className="absolute inset-0 z-[290] bg-black/20 backdrop-blur-[1px]" onClick={() => setShowSidebar(false)}></div>}
            <div className={`absolute right-0 top-0 bottom-0 w-3/4 max-w-sm bg-white shadow-2xl z-[300] transition-transform duration-300 ease-out flex flex-col ${showSidebar ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="p-6 pb-2 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-700 tracking-tight">生活碎片</h3>
                    <button onClick={() => setShowSidebar(false)} className="p-2 -mr-2 text-slate-400 hover:text-slate-600"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="flex p-2 bg-slate-50 border-b border-slate-100">
                    <button onClick={() => setActivePanel('todo')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${activePanel === 'todo' ? 'bg-white shadow text-primary' : 'text-slate-400 hover:bg-white/50'}`}>今日计划</button>
                    <button onClick={() => setActivePanel('notebook')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${activePanel === 'notebook' ? 'bg-white shadow text-primary' : 'text-slate-400 hover:bg-white/50'}`}>私密记事</button>
                </div>
                
                {/* Fixed: Add no-scrollbar class to hide scrollbar */}
                <div className="flex-1 overflow-y-auto p-6 bg-[#fcfcfc] no-scrollbar">
                    {activePanel === 'todo' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{todaysTodo?.date || 'Today'}</span><span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">完成度: {todaysTodo ? Math.round((todaysTodo.items.filter(i=>i.done).length / todaysTodo.items.length)*100) : 0}%</span></div>
                            {todaysTodo ? <ul className="space-y-3">{todaysTodo.items.map((item, idx) => (
                                <li key={idx} className="flex items-start gap-3 group">
                                    <div onClick={() => handleToggleTodo(idx)} className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${item.done ? 'bg-green-400 border-green-400' : 'border-slate-300 group-hover:border-primary'}`}>
                                        {item.done && <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>}
                                    </div>
                                    <span onClick={() => handleToggleTodo(idx)} className={`text-sm leading-relaxed transition-all flex-1 cursor-pointer ${item.done ? 'text-slate-300 line-through decoration-slate-300' : 'text-slate-700 font-medium'}`}>{item.text}</span>
                                    <button onClick={() => handleDeleteTodo(idx)} className="text-slate-300 hover:text-red-400 px-1 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                                </li>
                            ))}</ul> : <div className="text-center py-10 text-slate-400 text-xs">生成中...</div>}
                            <div className="mt-8 p-4 bg-yellow-50 rounded-xl border border-yellow-100 text-xs text-yellow-800 leading-relaxed italic relative"><span className="absolute -top-3 left-4 text-2xl">📌</span>这是 {char?.name} 今天的自动行程表。虽然你不能帮TA做，但可以监督TA哦。</div>
                        </div>
                    )}
                    {activePanel === 'notebook' && (
                        <div className="flex flex-col pb-4">
                            {notebookEntries.length > 0 ? (
                                <div 
                                    className="relative bg-white shadow-md border border-slate-200 p-6 min-h-[400px] flex flex-col rounded-xl" 
                                    style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}
                                >
                                    {/* Spiral Binding Visual - Adaptive Height */}
                                    <div className="absolute left-4 top-4 bottom-4 w-px border-l-2 border-dotted border-slate-300 pointer-events-none"></div>

                                    <div className="mb-4 ml-6 flex justify-between items-center text-[10px] text-slate-400 font-mono border-b border-slate-100 pb-2">
                                        <span>#{notebookEntries.length - notebookPage}</span>
                                        <div className="flex gap-2 items-center">
                                            <span>{new Date(notebookEntries[notebookPage].timestamp).toLocaleString()}</span>
                                            <button onClick={() => handleDeleteNote(notebookEntries[notebookPage].id)} className="text-red-300 hover:text-red-500 font-bold px-1" title="删除此页">×</button>
                                        </div>
                                    </div>
                                    <div className="flex-1 ml-6 text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{renderNotebookContent(notebookEntries[notebookPage].content)}</div>
                                    <div className="mt-6 ml-6 flex justify-between items-center pt-4 border-t border-slate-100"><button disabled={notebookPage >= notebookEntries.length - 1} onClick={() => setNotebookPage(p => p + 1)} className="text-slate-400 hover:text-primary disabled:opacity-30">← 旧的</button><span className="text-[10px] text-slate-300">{notebookPage + 1} / {notebookEntries.length}</span><button disabled={notebookPage <= 0} onClick={() => setNotebookPage(p => p - 1)} className="text-slate-400 hover:text-primary disabled:opacity-30">新的 →</button></div>
                                </div>
                            ) : <div className="text-center py-10 text-slate-400 text-xs">记事本是空的...</div>}
                        </div>
                    )}
                </div>
            </div>

            {/* UI Overlay */}
            <div className="absolute top-0 w-full pt-12 px-4 pb-2 flex justify-between z-30 pointer-events-none">
                <button onClick={() => setViewState('select')} className="bg-white/90 p-2 rounded-full shadow-md pointer-events-auto active:scale-90 transition-transform text-slate-600"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
                <div className="flex gap-2 pointer-events-auto">
                    {/* REFRESH BUTTON */}
                    {mode === 'view' && (
                        <button onClick={() => setShowRefreshConfirm(true)} className="p-2 bg-white/90 rounded-full shadow-md text-slate-500 hover:text-primary active:scale-90 transition-transform" title="强制刷新今日">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        </button>
                    )}
                    <button onClick={() => { setMode(mode === 'view' ? 'edit' : 'view'); setSelectedItemId(null); }} className={`px-4 py-2 rounded-full font-bold text-xs shadow-md transition-all ${mode === 'edit' ? 'bg-blue-500 text-white' : 'bg-white text-slate-600'}`}>{mode === 'edit' ? '完成' : '装修'}</button>
                </div>
            </div>

            {/* Observation Card (Bottom) */}
            {observationText && mode === 'view' && <div className="absolute bottom-6 left-4 right-4 bg-white/95 backdrop-blur-xl p-5 rounded-2xl shadow-2xl border border-white/50 z-[150] animate-slide-up"><div className="flex justify-between items-start mb-2"><span className="text-xs font-bold text-blue-500 uppercase tracking-widest">OBSERVATION</span><button onClick={() => setObservationText('')} className="text-slate-400 hover:text-slate-600">×</button></div><p className="text-sm text-slate-700 leading-relaxed font-medium text-justify">{observationText}</p></div>}

            {/* Edit Mode Toolbar - Collapsible */}
            {mode === 'edit' && (
                <div className={`absolute bottom-0 w-full bg-white border-t border-slate-200 z-[150] transition-transform duration-300 flex flex-col ${isToolbarCollapsed ? 'translate-y-[calc(100%-2.5rem)]' : ''}`} style={{ maxHeight: isToolbarCollapsed ? 'auto' : '45vh' }}>
                    <div className="h-10 w-full flex items-center justify-center cursor-pointer bg-white active:bg-slate-50 border-b border-slate-100" onClick={() => setIsToolbarCollapsed(!isToolbarCollapsed)}><div className="w-10 h-1 bg-slate-200 rounded-full"></div></div>
                    <div className="p-4 overflow-y-auto flex-1">
                        {selectedItemId ? (
                            <div className="flex flex-col gap-3">
                                <div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-500">调整家具</span><button onClick={deleteSelectedItem} className="text-xs text-red-500 font-bold bg-red-50 px-3 py-1 rounded-full">删除</button></div>
                                <div className="flex gap-4">
                                    <div className="flex-1"><label className="text-[10px] text-slate-400 block mb-1">缩放</label><input type="range" min="0.5" max="3" step="0.1" value={items.find(i => i.id === selectedItemId)?.scale || 1} onChange={(e) => updateSelectedItem({ scale: parseFloat(e.target.value) })} className="w-full h-1 bg-slate-200 rounded-full" /></div>
                                    <div className="flex-1"><label className="text-[10px] text-slate-400 block mb-1">旋转</label><input type="range" min="-180" max="180" step="5" value={items.find(i => i.id === selectedItemId)?.rotation || 0} onChange={(e) => updateSelectedItem({ rotation: parseInt(e.target.value) })} className="w-full h-1 bg-slate-200 rounded-full" /></div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                                    <button onClick={() => setShowLibrary(true)} className="flex flex-col items-center gap-1 shrink-0"><div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white shadow-md text-xl">+</div><span className="text-[10px] font-bold text-slate-500">家具库</span></button>
                                    <button onClick={() => setShowCustomModal(true)} className="flex flex-col items-center gap-1 shrink-0"><div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center text-white shadow-md text-xl">✨</div><span className="text-[10px] font-bold text-slate-500">自定义</span></button>
                                    <button onClick={() => wallInputRef.current?.click()} className="flex flex-col items-center gap-1 shrink-0"><div className="w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center text-slate-500 shadow-sm border border-slate-300">🖼️</div><span className="text-[10px] font-bold text-slate-500">换墙纸</span></button>
                                    <button onClick={() => floorInputRef.current?.click()} className="flex flex-col items-center gap-1 shrink-0"><div className="w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center text-slate-500 shadow-sm border border-slate-300">🧱</div><span className="text-[10px] font-bold text-slate-500">换地板</span></button>
                                    {/* Settings Button */}
                                    <button onClick={() => setShowSettingsModal(true)} className="flex flex-col items-center gap-1 shrink-0"><div className="w-12 h-12 bg-slate-200 rounded-xl flex items-center justify-center text-slate-600 shadow-sm border border-slate-300">⚙️</div><span className="text-[10px] font-bold text-slate-500">设置</span></button>
                                    {/* Developer Export Button */}
                                    <button onClick={() => setShowDevModal(true)} className="flex flex-col items-center gap-1 shrink-0"><div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-white shadow-sm border border-slate-600">{'{}'}</div><span className="text-[10px] font-bold text-slate-500">Dev</span></button>
                                    
                                    <input type="file" ref={wallInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'wall')} />
                                    <input type="file" ref={floorInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'floor')} />
                                    <input type="file" ref={actorInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'actor')} />
                                </div>
                                <div><h4 className="text-[10px] font-bold text-slate-400 mb-2 uppercase">墙面预设</h4><div className="flex gap-2 overflow-x-auto no-scrollbar">{WALLPAPER_PRESETS.map((wp, i) => <button key={i} onClick={() => handleWallChange(wp.value)} className="w-10 h-10 rounded-lg shadow-sm border border-slate-200 shrink-0" style={{ background: wp.value }}></button>)}</div></div>
                                <div><h4 className="text-[10px] font-bold text-slate-400 mb-2 uppercase">地板预设</h4><div className="flex gap-2 overflow-x-auto no-scrollbar">{FLOOR_PRESETS.map((fp, i) => <button key={i} onClick={() => handleFloorChange(fp.value)} className="w-10 h-10 rounded-lg shadow-sm border border-slate-200 shrink-0" style={{ background: fp.value }}></button>)}</div></div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Asset Library Modal */}
            <Modal isOpen={showLibrary} title="家具超市" onClose={() => setShowLibrary(false)}>
                <div className="h-96 overflow-y-auto no-scrollbar">
                    {Object.entries(displayLibrary).map(([category, assets]) => (
                        assets && assets.length > 0 && (
                            <div key={category} className="mb-6">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 sticky top-0 bg-white/95 backdrop-blur py-2 z-10 flex justify-between">
                                    {category === 'sully_special' ? 'Sully 专属 (Special)' : (category === 'custom' ? '自定义 (Custom)' : category)}
                                    <span className="text-[9px] bg-slate-100 px-2 rounded-full">{assets.length}</span>
                                </h4>
                                <div className="grid grid-cols-4 gap-4">
                                    {assets.map((asset, i) => {
                                        const isCustom = category === 'custom';
                                        const handlers = isCustom ? {
                                            onTouchStart: () => handleAssetTouchStart(asset),
                                            onTouchEnd: handleAssetTouchEnd,
                                            onMouseDown: () => handleAssetTouchStart(asset),
                                            onMouseUp: handleAssetTouchEnd,
                                            onMouseLeave: handleAssetTouchEnd,
                                            onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setDeletingAsset(asset); }
                                        } : {};

                                        return (
                                            <button 
                                                key={i} 
                                                onClick={() => addItem(asset, category === 'custom' || category === 'sully_special' ? 'furniture' : category as any)} 
                                                className="flex flex-col items-center gap-2 group relative active:scale-95 transition-transform"
                                                {...handlers}
                                            >
                                                <div className="w-14 h-14 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 group-hover:border-blue-300 transition-colors overflow-hidden relative">
                                                    <img src={asset.image} className="w-full h-full object-contain" />
                                                    {isCustom && <div className="absolute inset-0 bg-red-500/10 opacity-0 group-active:opacity-100 transition-opacity"></div>}
                                                </div>
                                                <span className="text-[10px] text-slate-500 truncate w-full text-center">{asset.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    ))}
                </div>
            </Modal>

            {/* Custom Asset Delete Confirmation Modal */}
            <Modal 
                isOpen={!!deletingAsset} title="删除自定义家具" onClose={() => setDeletingAsset(null)}
                footer={<div className="flex gap-2 w-full"><button onClick={() => setDeletingAsset(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-2xl font-bold">取消</button><button onClick={confirmDeleteAsset} className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-bold">删除</button></div>}
            >
                <div className="flex flex-col items-center gap-3 py-2">
                    {deletingAsset && <img src={deletingAsset.image} className="w-16 h-16 object-contain rounded-lg bg-slate-100 border" />}
                    <p className="text-sm text-slate-600 text-center">确定要从库中永久删除 <br/><span className="font-bold">"{deletingAsset?.name}"</span> 吗？<br/><span className="text-[10px] text-slate-400">(房间里已摆放的不受影响)</span></p>
                </div>
            </Modal>

            {/* Custom Item Modal */}
            <Modal isOpen={showCustomModal} title="自定义家具" onClose={() => setShowCustomModal(false)} footer={<button onClick={saveCustomItem} className="w-full py-3 bg-purple-500 text-white font-bold rounded-2xl">添加到房间</button>}>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div onClick={() => customItemInputRef.current?.click()} className="aspect-square w-24 bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-purple-400 relative overflow-hidden shrink-0">
                            {customItemImage ? <img src={customItemImage} className="w-full h-full object-contain" /> : <span className="text-slate-400 text-xs">+ 上传</span>}
                            <input type="file" ref={customItemInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'custom_item')} />
                        </div>
                        <div className="flex-1 space-y-2">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">图片 URL (推荐图床)</label>
                                <input value={customItemUrl} onChange={e => setCustomItemUrl(e.target.value)} placeholder="https://..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-purple-500" />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">物品名称</label>
                                <input value={customItemName} onChange={e => setCustomItemName(e.target.value)} placeholder="例如: 懒人沙发" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-purple-500 font-bold" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">物品描述 (Context)</label>
                        <input value={customItemDescription} onChange={e => setCustomItemDescription(e.target.value)} placeholder="例如: 一个很软的沙发，坐上去就陷进去了。" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-purple-500" />
                        <p className="text-[9px] text-slate-400 mt-1">这段描述会告诉 AI 这是什么，以及如何互动。</p>
                    </div>
                </div>
            </Modal>

            {/* Room Settings Modal */}
            <Modal isOpen={showSettingsModal} title="装修设置" onClose={() => setShowSettingsModal(false)}>
                <div className="space-y-6">
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">背景调整</h4>
                        <div>
                            <div className="flex justify-between mb-1"><label className="text-xs font-bold text-slate-600">墙纸缩放 ({char?.roomConfig?.wallScale || 0}%)</label><span className="text-[10px] text-slate-400">{char?.roomConfig?.wallScale ? `${char.roomConfig.wallScale}%` : 'Cover (Default)'}</span></div>
                            <input type="range" min="0" max="200" step="10" value={char?.roomConfig?.wallScale || 0} onChange={e => updateBgConfig({ wallScale: parseInt(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                            <div className="flex items-center gap-2 mt-2">
                                <input type="checkbox" id="wallRepeat" checked={char?.roomConfig?.wallRepeat || false} onChange={e => updateBgConfig({ wallRepeat: e.target.checked })} className="accent-blue-500" />
                                <label htmlFor="wallRepeat" className="text-xs text-slate-600">平铺模式 (Tile)</label>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between mb-1"><label className="text-xs font-bold text-slate-600">地板缩放 ({char?.roomConfig?.floorScale || 0}%)</label><span className="text-[10px] text-slate-400">{char?.roomConfig?.floorScale ? `${char.roomConfig.floorScale}%` : 'Cover (Default)'}</span></div>
                            <input type="range" min="0" max="200" step="10" value={char?.roomConfig?.floorScale || 0} onChange={e => updateBgConfig({ floorScale: parseInt(e.target.value) })} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                            <div className="flex items-center gap-2 mt-2">
                                <input type="checkbox" id="floorRepeat" checked={char?.roomConfig?.floorRepeat || false} onChange={e => updateBgConfig({ floorRepeat: e.target.checked })} className="accent-blue-500" />
                                <label htmlFor="floorRepeat" className="text-xs text-slate-600">平铺模式 (Tile)</label>
                            </div>
                        </div>
                    </div>

                    {isSully && (
                        <div className="pt-4 border-t border-slate-100">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Sully 专属维护</h4>
                            <button onClick={resetSullyRoom} className="w-full py-3 bg-red-50 text-red-500 font-bold rounded-2xl border border-red-100 flex items-center justify-center gap-2 active:scale-95 transition-transform">
                                <span className="text-lg">🧹</span> 还原初始样板房
                            </button>
                            <p className="text-[9px] text-slate-400 mt-2 text-center">如果不小心弄乱了房间，点此可一键恢复默认布局。</p>
                        </div>
                    )}
                </div>
            </Modal>

            {/* Refresh Confirmation Modal */}
            <Modal isOpen={showRefreshConfirm} title="强制刷新?" onClose={() => setShowRefreshConfirm(false)} footer={<div className="flex gap-2 w-full"><button onClick={() => setShowRefreshConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-2xl font-bold">取消</button><button onClick={handleForceRefresh} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl">少管我!</button></div>}>
                <div className="text-center py-4 space-y-2">
                    <div className="text-4xl">🕰️</div>
                    <p className="text-sm text-slate-600 font-bold">每天早上 6:00 自动刷新</p>
                    <p className="text-xs text-slate-400">还没到时间哦，确定要消耗算力强制重新生成今天的房间状态吗？</p>
                </div>
            </Modal>

            {/* Dev Export Modal */}
            <Modal 
                isOpen={showDevModal} 
                title="开发者工具 (Dev Tools)" 
                onClose={() => setShowDevModal(false)} 
                footer={<button onClick={() => setShowDevModal(false)} className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">关闭</button>}
            >
                <div className="space-y-4">
                    <div>
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">布局数据 (Layout JSON)</h4>
                        <div className="bg-slate-100 rounded-xl p-3 border border-slate-200 mb-2">
                            <pre className="text-[10px] text-slate-600 font-mono h-20 overflow-y-auto whitespace-pre-wrap select-all">
                                {JSON.stringify(items, null, 2)}
                            </pre>
                        </div>
                        <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(items, null, 2)); addToast('Layout Copied', 'success'); }} className="w-full py-2 bg-slate-800 text-white text-xs font-bold rounded-xl">复制布局 JSON</button>
                    </div>

                    <div>
                        <h4 className="text-[10px] font-bold text-red-400 uppercase mb-2">Prompt 调试 (Debugger)</h4>
                        <div className="bg-slate-100 rounded-xl p-3 border border-slate-200 mb-2">
                            <pre className="text-[10px] text-slate-600 font-mono h-20 overflow-y-auto whitespace-pre-wrap select-all">
                                {lastPrompt || "(暂无数据，请先尝试进入房间)"}
                            </pre>
                        </div>
                        <button onClick={() => { if(lastPrompt) { navigator.clipboard.writeText(lastPrompt); addToast('Prompt Copied', 'success'); } else addToast('No prompt yet', 'error'); }} className="w-full py-2 bg-red-500 text-white text-xs font-bold rounded-xl">复制 Prompt 到剪贴板</button>
                        <p className="text-[9px] text-slate-400 mt-2 text-center">如果 AI 回复为空，请复制此 Prompt 检查是否有乱码/Base64 混入。</p>
                    </div>
                </div>
            </Modal>

        </div>
    );
};

export default RoomApp;

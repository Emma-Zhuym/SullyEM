
import React, { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { GameSession, GameTheme, CharacterProfile, GameLog, GameActionOption } from '../types';
import { ContextBuilder } from '../utils/context';
import Modal from '../components/os/Modal';

// --- Themes Configuration (Enhanced) ---
const GAME_THEMES: Record<GameTheme, { bg: string, text: string, accent: string, font: string, border: string, cardBg: string, gradient: string }> = {
    fantasy: {
        bg: 'bg-[#1a120b]',
        text: 'text-[#e5e5e5]',
        accent: 'text-[#fbbf24]',
        font: 'font-serif',
        border: 'border-[#78350f]',
        cardBg: 'bg-[#2a2018]',
        gradient: 'from-[#451a03] to-[#1a120b]'
    },
    cyber: {
        bg: 'bg-[#020617]',
        text: 'text-[#94a3b8]',
        accent: 'text-[#22d3ee]',
        font: 'font-mono',
        border: 'border-[#1e293b]',
        cardBg: 'bg-[#0f172a]/80',
        gradient: 'from-[#0f172a] to-[#020617]'
    },
    horror: {
        bg: 'bg-[#0f0000]',
        text: 'text-[#d4d4d8]',
        accent: 'text-[#ef4444]',
        font: 'font-serif',
        border: 'border-[#450a0a]',
        cardBg: 'bg-[#2b0e0e]',
        gradient: 'from-[#450a0a] to-[#000000]'
    },
    modern: {
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        accent: 'text-blue-600',
        font: 'font-sans',
        border: 'border-slate-200',
        cardBg: 'bg-white',
        gradient: 'from-slate-100 to-white'
    }
};

// --- Markdown Renderer Component ---
const GameMarkdown: React.FC<{ content: string, theme: any, customStyle?: { fontSize: number, color: string } }> = ({ content, theme, customStyle }) => {
    // Helper: Parse Inline Styles (**bold**, *italic*, `code`)
    const parseInline = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className={`font-bold ${theme.accent}`}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={i} className="italic opacity-70 text-[95%] mx-0.5">{part.slice(1, -1)}</em>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={i} className="bg-black/20 px-1 py-0.5 rounded font-mono text-[0.9em] opacity-90 mx-0.5">{part.slice(1, -1)}</code>;
            }
            return <span key={i}>{part}</span>;
        });
    };

    // Split by newlines to handle blocks
    const lines = content.split('\n');
    
    // Dynamic Style Object
    const styleObj = {
        fontSize: customStyle ? `${customStyle.fontSize}px` : undefined,
        color: customStyle?.color || undefined
    };

    return (
        <div className="space-y-[0.5em] text-justify leading-relaxed" style={styleObj}>
            {lines.map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} className="h-[0.5em]"></div>;
                
                // Headers (Relative sizing)
                if (trimmed.startsWith('### ')) return <h3 key={i} className={`text-[1.1em] font-bold uppercase tracking-wider mt-[0.5em] mb-[0.2em] opacity-90 ${theme.accent}`}>{trimmed.slice(4)}</h3>;
                if (trimmed.startsWith('## ')) return <h3 key={i} className="text-[1.25em] font-bold mt-[0.6em] mb-[0.3em] opacity-95">{trimmed.slice(3)}</h3>;
                if (trimmed.startsWith('# ')) return <h3 key={i} className="text-[1.5em] font-black mt-[0.8em] mb-[0.5em] text-center border-b border-current pb-2 opacity-90">{trimmed.slice(2)}</h3>;
                
                // Blockquotes
                if (trimmed.startsWith('> ')) return <div key={i} className="border-l-2 border-current pl-3 py-1 my-2 italic opacity-70 text-[0.9em] bg-black/5 rounded-r">{parseInline(trimmed.slice(2))}</div>;
                
                // Lists
                if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
                    return <div key={i} className="flex gap-2 pl-1"><span className={`opacity-50 ${theme.accent}`}>•</span><span>{parseInline(trimmed.slice(2))}</span></div>;
                }

                // Numbered list
                const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
                if (numMatch) {
                    return <div key={i} className="flex gap-2 pl-1"><span className={`font-mono opacity-60 ${theme.accent}`}>{numMatch[1]}.</span><span>{parseInline(numMatch[2])}</span></div>;
                }

                // Separator
                if (trimmed === '---' || trimmed === '***') {
                    return <div key={i} className="h-px bg-current opacity-20 my-[1em]"></div>;
                }

                // Standard Paragraph
                return <div key={i}>{parseInline(trimmed)}</div>;
            })}
        </div>
    );
};

const GameApp: React.FC = () => {
    const { closeApp, characters, userProfile, apiConfig, addToast, updateCharacter } = useOS();
    const [view, setView] = useState<'lobby' | 'create' | 'play'>('lobby');
    const [games, setGames] = useState<GameSession[]>([]);
    const [activeGame, setActiveGame] = useState<GameSession | null>(null);
    
    // Creation State
    const [newTitle, setNewTitle] = useState('');
    const [newWorld, setNewWorld] = useState('');
    const [newTheme, setNewTheme] = useState<GameTheme>('fantasy');
    const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
    const [isCreating, setIsCreating] = useState(false);

    // Play State
    const [userInput, setUserInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [diceResult, setDiceResult] = useState<number | null>(null);
    const [isRolling, setIsRolling] = useState(false);
    
    // [FIX] Use Container Ref instead of Element Ref for safer scrolling
    const logsContainerRef = useRef<HTMLDivElement>(null);

    // UI Toggles
    const [showSystemMenu, setShowSystemMenu] = useState(false);
    const [isArchiving, setIsArchiving] = useState(false);
    const [showTools, setShowTools] = useState(false); // Default hidden
    const [showParty, setShowParty] = useState(true);  // Default visible
    const [uiSettings, setUiSettings] = useState<{fontSize: number, color: string}>({ fontSize: 14, color: '' });

    useEffect(() => {
        loadGames();
    }, []);

    // [FIX] Updated Auto-scroll logic: Use scrollTop on container
    useEffect(() => {
        if (view === 'play' && logsContainerRef.current) {
            // Use setTimeout to ensure render is complete, allowing smooth scroll to new bottom
            setTimeout(() => {
                if (logsContainerRef.current) {
                    logsContainerRef.current.scrollTo({
                        top: logsContainerRef.current.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }
    }, [activeGame?.logs, view, isTyping]);

    const loadGames = async () => {
        const list = await DB.getAllGames();
        setGames(list.sort((a,b) => b.lastPlayedAt - a.lastPlayedAt));
    };

    // --- Helper: Robust API Call ---
    // Handles non-standard responses like SSE data prefixes in non-stream mode
    const fetchGameAPI = async (prompt: string, maxTokens: number = 8000) => {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.9, 
                max_tokens: maxTokens,
                stream: false
            })
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const text = await response.text();
        try {
            // 1. Try standard JSON parse
            return JSON.parse(text);
        } catch (e) {
            // 2. If failed, try stripping "data: " prefix (common in proxy misconfigurations)
            // Some proxies return `data: { ... }` even for non-stream requests
            const cleaned = text.replace(/^data: /, '').trim();
            try {
                return JSON.parse(cleaned);
            } catch (e2) {
                console.error("Failed to parse API response", text);
                throw new Error("Invalid API Response Format (Not JSON)");
            }
        }
    };

    // --- Creation Logic ---
    const handleCreateGame = async () => {
        if (!newTitle.trim() || !newWorld.trim() || selectedPlayers.size === 0) {
            addToast('请填写完整信息并选择至少一名角色', 'error');
            return;
        }
        
        if (!apiConfig.apiKey) {
            addToast('请先配置 API Key 以生成序章', 'error');
            return;
        }

        setIsCreating(true);

        try {
            // Create initial game object
            const tempId = `game-${Date.now()}`;
            const players = characters.filter(c => selectedPlayers.has(c.id));
            
            let playerContext = "";
            for (const p of players) {
                playerContext += `\n<<< 角色档案: ${p.name} (ID: ${p.id}) >>>\n${ContextBuilder.buildCoreContext(p, userProfile, true)}\n`;
            }

            // Generate Prologue Prompt
            const prompt = `### 🎲 TRPG 序章生成 (Game Start)
**剧本标题**: ${newTitle}
**世界观设定**: ${newWorld}
**玩家**: ${userProfile.name}
**队友**: ${players.map(p => p.name).join(', ')}

### 任务
你现在是 **Game Master (GM)**。请为这个冒险故事生成一个**精彩的开场 (Prologue)**。
1. **剧情描述**: 描述玩家和队友们现在的处境。是在酒馆里接任务？还是在飞船上醒来？或者被怪物包围？（必须基于世界观设定）
2. **角色反应**: 简要描述队友们的初始状态或第一句话。
3. **初始选项**: 给出三个玩家可以采取的行动选项。

### 输出格式 (Strict JSON)
{
  "gm_narrative": "序章剧情描述...",
  "characters": [
    { "charId": "角色ID", "action": "初始动作", "dialogue": "第一句台词" }
  ],
  "startLocation": "起始地点名称",
  "suggested_actions": [
    { "label": "选项1 (中立/正直/推进剧情)", "type": "neutral" },
    { "label": "选项2 (乐子人/搞怪/出其不意)", "type": "chaotic" },
    { "label": "选项3 (邪恶/激进/贪婪)", "type": "evil" }
  ]
}`;

            const data = await fetchGameAPI(prompt);
            let content = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const res = JSON.parse(content);

            const initialLogs: GameLog[] = [];
            
            // GM Log
            initialLogs.push({
                id: 'init-gm',
                role: 'gm',
                content: `### 📖 序章: ${newTitle}\n\n${res.gm_narrative || '冒险开始了...'}`,
                timestamp: Date.now()
            });

            // Character Logs
            if (res.characters && Array.isArray(res.characters)) {
                for (const charAct of res.characters) {
                    const char = players.find(p => p.id === charAct.charId);
                    if (char) {
                        initialLogs.push({
                            id: `init-char-${char.id}`,
                            role: 'character',
                            speakerName: char.name,
                            content: `*${charAct.action}* \n“${charAct.dialogue}”`,
                            timestamp: Date.now()
                        });
                    }
                }
            }

            const newGame: GameSession = {
                id: tempId,
                title: newTitle,
                theme: newTheme,
                worldSetting: newWorld,
                playerCharIds: Array.from(selectedPlayers),
                logs: initialLogs,
                status: {
                    location: res.startLocation || 'Unknown',
                    health: 100,
                    sanity: 100,
                    gold: 0,
                    inventory: []
                },
                suggestedActions: res.suggested_actions || [],
                createdAt: Date.now(),
                lastPlayedAt: Date.now()
            };

            await DB.saveGame(newGame);
            setGames(prev => [newGame, ...prev]);
            setActiveGame(newGame);
            setView('play');
            
            // Reset form
            setNewTitle('');
            setNewWorld('');
            setSelectedPlayers(new Set());

        } catch (e: any) {
            addToast(`创建失败: ${e.message}`, 'error');
        } finally {
            setIsCreating(false);
        }
    };

    // --- Gameplay Logic ---
    const rollDice = () => {
        if (isRolling || isTyping) return;
        setIsRolling(true);
        const duration = 1000;
        const start = Date.now();
        
        const animate = () => {
            const now = Date.now();
            if (now - start > duration) {
                const final = Math.floor(Math.random() * 20) + 1;
                setDiceResult(final);
                setIsRolling(false);
                handleAction(`[System: 投掷了 D20 骰子，结果: ${final}]`);
            } else {
                setDiceResult(Math.floor(Math.random() * 20) + 1);
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    };

    const handleAction = async (actionText: string, isReroll: boolean = false) => {
        if (!activeGame || !apiConfig.apiKey) return;
        
        let contextLogs = activeGame.logs;
        let updatedGame = activeGame;

        if (!isReroll) {
            // Standard Action: Append user log
            const userLog: GameLog = {
                id: `log-${Date.now()}`,
                role: actionText.startsWith('[System') ? 'system' : 'player',
                speakerName: userProfile.name,
                content: actionText,
                timestamp: Date.now(),
                diceRoll: diceResult ? { result: diceResult, max: 20 } : undefined
            };
            
            const updatedLogs = [...activeGame.logs, userLog];
            updatedGame = { ...activeGame, logs: updatedLogs, lastPlayedAt: Date.now(), suggestedActions: [] }; // Clear options while thinking
            setActiveGame(updatedGame);
            await DB.saveGame(updatedGame);
            contextLogs = updatedLogs;
        } else {
            // Reroll: Context logs are already prepared by handleReroll
            // Basically contextLogs = logs up to last user message
        }
        
        setUserInput('');
        setDiceResult(null);
        setIsTyping(true);

        try {
            // 2. Build Context WITH MEMORY
            const players = characters.filter(c => activeGame.playerCharIds.includes(c.id));
            let playerContext = "";
            for (const p of players) {
                playerContext += `\n<<< 角色档案: ${p.name} (ID: ${p.id}) >>>\n${ContextBuilder.buildCoreContext(p, userProfile, true)}\n`;
            }

            const prompt = `### 🎲 TRPG 跑团模式: ${activeGame.title}
**当前剧本**: ${activeGame.worldSetting}
**当前场景**: ${activeGame.status.location}
**队伍资源**: 
- ❤️ HP: ${activeGame.status.health}% 
- 🧠 SAN: ${activeGame.status.sanity || 100}%
- 💰 GOLD: ${activeGame.status.gold || 0}
- 🎒 物品: ${activeGame.status.inventory.join(', ') || '空'}

### 👥 冒险小队 (The Party)
1. **${userProfile.name}** (玩家/User)
${players.map(p => `2. **${p.name}** (ID: ${p.id}) - 你的队友`).join('\n')}

### 📜 角色档案 (Character Sheets)
${playerContext}

### 📝 冒险记录 (Log)
${contextLogs.slice(-15).map(l => `[${l.role === 'gm' ? 'GM' : (l.speakerName || 'System')}]: ${l.content}`).join('\n')}

### 🎲 GM 指令 (Game Master Instructions)
你现在是这场跑团游戏的 **主持人 (GM)**。
**现在的状态**：这不是一个"AI服务玩家"的场景，而是一群性格各异的伙伴（${players.map(p => p.name).join(', ')}）正和玩家(${userProfile.name})一起在这个疯狂的世界里冒险。

**请遵循以下法则**：
1. **全员「入戏」 (Roleplay First)**: 
   - 队友们是活生生的冒险者，不是客服。
   - **拒绝机械感**: 他们应该主动观察环境、吐槽现状、互相开玩笑、或者在危机时大喊大叫。
   - **性格驱动**: 如果角色设定是胆小的，遇到怪物就要想逃跑；如果是贪财的，看到宝箱就要眼红。请让他们的反应**极其真实**。
   - **队内互动**: 队友之间也可以有互动（比如A吐槽B的计划），不仅仅是和玩家说话。

2. **硬核 GM 风格**: 
   - **制造冲突**: 不要让旅途一帆风顺。安排陷阱、突发战斗、尴尬的社交场面、或者道德困境。
   - **环境描写**: 描述光影、气味、声音，营造沉浸感。
   - **Markdown 排版**: 请在 \`gm_narrative\` 和 \`dialogue\` 中**积极使用 Markdown**。例如：使用 **加粗** 强调重点，使用 *斜体* 描述动作，使用列表描述环境物品。

3. **生成选项 (Action Options)**:
   - 请根据当前局势，为玩家提供 3 个可选的行动建议。
   - 选项 1 (neutral): 中立、正直、常规推进剧情。
   - 选项 2 (chaotic): 乐子人、搞怪、出其不意、脱线。
   - 选项 3 (evil): 邪恶、激进、贪婪、暴力。

### 📤 输出格式 (Strict JSON)
请仅输出 JSON，不要包含 Markdown 代码块。
{
  "gm_narrative": "GM的剧情描述 (支持Markdown)...",
  "characters": [
    { 
      "charId": "角色ID (必须对应上方列表)", 
      "action": "动作描述", 
      "dialogue": "台词" 
    }
  ],
  "newLocation": "新地点 (可选)",
  "hpChange": 0,
  "sanityChange": 0,
  "goldChange": 0,
  "newItem": "获得物品 (可选)",
  "suggested_actions": [
    { "label": "选项1文本", "type": "neutral" },
    { "label": "选项2文本", "type": "chaotic" },
    { "label": "选项3文本", "type": "evil" }
  ]
}`;

            const data = await fetchGameAPI(prompt);
            let content = data.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
            const res = JSON.parse(content);

            const newLogs: GameLog[] = [];
            
            // 1. GM Narrative Log
            if (res.gm_narrative) {
                newLogs.push({
                    id: `gm-${Date.now()}`,
                    role: 'gm',
                    content: res.gm_narrative,
                    timestamp: Date.now()
                });
            }

            // 2. Character Reaction Logs
            if (res.characters && Array.isArray(res.characters)) {
                for (const charAct of res.characters) {
                    const char = players.find(p => p.id === charAct.charId);
                    if (char) {
                        // Format: "*Action* \n“Dialogue”"
                        const combinedContent = `*${charAct.action}* \n“${charAct.dialogue}”`;
                        
                        newLogs.push({
                            id: `char-${Date.now()}-${Math.random()}`,
                            role: 'character',
                            speakerName: char.name, // Link name for UI lookup
                            content: combinedContent,
                            timestamp: Date.now()
                        });
                    }
                }
            }

            // Update State (Stats)
            const newStatus = { ...updatedGame.status };
            if (res.newLocation) newStatus.location = res.newLocation;
            
            // Stat Updates
            if (res.hpChange) newStatus.health = Math.max(0, Math.min(100, (newStatus.health || 100) + res.hpChange));
            if (res.sanityChange) newStatus.sanity = Math.max(0, Math.min(100, (newStatus.sanity || 100) + res.sanityChange));
            if (res.goldChange) newStatus.gold = Math.max(0, (newStatus.gold || 0) + res.goldChange);
            
            if (res.newItem) newStatus.inventory = [...newStatus.inventory, res.newItem];

            const finalGame = {
                ...updatedGame,
                logs: [...contextLogs, ...newLogs], // Append to correct context
                status: newStatus,
                suggestedActions: res.suggested_actions || []
            };
            
            setActiveGame(finalGame);
            await DB.saveGame(finalGame);

        } catch (e: any) {
            addToast(`GM 掉线了: ${e.message}`, 'error');
        } finally {
            setIsTyping(false);
        }
    };

    const handleReroll = async () => {
        if (!activeGame || isTyping) return;
        
        // Find index of last user/system action
        const logs = activeGame.logs;
        let lastUserIndex = -1;
        for (let i = logs.length - 1; i >= 0; i--) {
            if (logs[i].role === 'player' || logs[i].role === 'system') {
                lastUserIndex = i;
                break;
            }
        }

        if (lastUserIndex === -1) {
            addToast('没有可供重生的上下文', 'info');
            return;
        }

        // Keep logs up to and including the last user input
        const contextLogs = logs.slice(0, lastUserIndex + 1);
        
        // Optimistic Update
        const rolledBackGame = { ...activeGame, logs: contextLogs };
        setActiveGame(rolledBackGame);
        
        await handleAction("", true); // isReroll = true
        addToast('正在重新推演命运...', 'info');
    };

    const handleRestart = async () => {
        if (!activeGame) return;
        if (!confirm('确定要重置当前游戏吗？所有进度将丢失。')) return;

        const initialLog: GameLog = {
            id: 'init',
            role: 'gm',
            content: `欢迎来到 "${activeGame.title}"。\n世界观载入中...\n${activeGame.worldSetting}`,
            timestamp: Date.now()
        };

        const resetGame: GameSession = {
            ...activeGame,
            logs: [initialLog],
            status: {
                location: 'Start Point',
                health: 100,
                sanity: 100,
                gold: 0,
                inventory: []
            },
            suggestedActions: [],
            lastPlayedAt: Date.now()
        };

        await DB.saveGame(resetGame);
        setActiveGame(resetGame);
        setShowSystemMenu(false);
        addToast('游戏已重置', 'success');
    };

    // "Leave" just goes back to lobby (Auto-save is handled by DB calls in handleAction)
    const handleLeave = () => {
        setActiveGame(null);
        setView('lobby');
        setShowSystemMenu(false);
    };

    const handleArchiveAndQuit = async () => {
        if (!activeGame) return;
        setIsArchiving(true);
        setShowSystemMenu(false);
        
        try {
            const players = characters.filter(c => activeGame.playerCharIds.includes(c.id));
            const playerNames = players.map(p => p.name).join('、');
            // Increase log context for summary
            const logText = activeGame.logs.slice(-30).map(l => `${l.role}: ${l.content}`).join('\n');
            
            const prompt = `Task: Summarize the key events of this TRPG session into a short clause (what happened).
Game: ${activeGame.title}
Logs:
${logText}
Output: A concise summary in Chinese (e.g. "探索了地牢并击败了史莱姆"). No preamble.`;

            const data = await fetchGameAPI(prompt);
            let summary = data.choices[0].message.content.trim();
            summary = summary.replace(/[。\.]$/, ''); // Remove trailing dot

            // Format: 【角色名们】和【用户名】一起玩了xxx，发生了xxxx
            const memoryContent = `【${playerNames}】和【${userProfile.name}】一起玩了《${activeGame.title}》，发生了${summary}`;
            
            // Format: YYYY-MM-DD
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            for (const p of players) {
                const mem = {
                    id: `mem-${Date.now()}-${Math.random()}`,
                    date: dateStr,
                    summary: memoryContent,
                    mood: 'fun'
                };
                updateCharacter(p.id, { memories: [...(p.memories || []), mem] });
            }
            addToast('记忆传递完成', 'success');
        } catch (e) {
            console.error(e);
            addToast('归档失败', 'error');
        } finally {
            setIsArchiving(false);
            setView('lobby'); 
            setActiveGame(null);
        }
    };

    const handleDeleteGame = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (window.confirm('确定要删除这个存档吗？')) {
            await DB.deleteGame(id);
            setGames(prev => prev.filter(g => g.id !== id));
            addToast('存档已删除', 'success');
        }
    };

    // --- Renderers ---

    // 1. Lobby View (Redesigned)
    if (view === 'lobby') {
        return (
            <div className="h-full w-full bg-[#0a0a0a] flex flex-col font-sans relative overflow-hidden">
                {/* Ambient Background */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-900/50 to-black z-0"></div>
                <div className="absolute inset-0 z-0 opacity-20" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/stardust.png")' }}></div>

                {/* Header */}
                <div className="h-20 flex items-end justify-between px-6 pb-4 shrink-0 z-10">
                    <button onClick={closeApp} className="p-2 -ml-2 hover:bg-white/10 rounded-full text-white/70 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="font-black tracking-[0.2em] text-xl text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">TRPG ADVENTURE</span>
                    <button onClick={() => setView('create')} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/10 shadow-lg active:scale-95 transition-all hover:bg-white/20">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                    </button>
                </div>

                {/* Games Grid */}
                <div className="p-6 flex-1 overflow-y-auto no-scrollbar z-10 space-y-4">
                    {games.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-4">
                            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-4xl border border-white/5 animate-pulse">🌌</div>
                            <p className="text-xs tracking-widest uppercase">No Active Adventures</p>
                        </div>
                    )}
                    {games.map(g => {
                        const themeStyle = GAME_THEMES[g.theme] || GAME_THEMES.fantasy;
                        return (
                            <div 
                                key={g.id} 
                                onClick={() => { setActiveGame(g); setView('play'); }} 
                                className={`relative overflow-hidden rounded-2xl p-5 cursor-pointer group active:scale-[0.98] transition-all border border-white/5 hover:border-white/20 shadow-lg`}
                            >
                                {/* Card Background */}
                                <div className={`absolute inset-0 bg-gradient-to-br ${themeStyle.gradient} opacity-80 group-hover:opacity-100 transition-opacity`}></div>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                                
                                <div className="relative z-10 flex flex-col gap-2">
                                    <div className="flex justify-between items-start">
                                        <h3 className={`font-bold text-lg text-white leading-tight drop-shadow-md font-serif`}>{g.title}</h3>
                                        <span className={`text-[10px] px-2 py-0.5 rounded border border-white/20 text-white/80 uppercase font-mono tracking-wider bg-black/20`}>{g.theme}</span>
                                    </div>
                                    
                                    <p className="text-xs text-white/60 line-clamp-2 leading-relaxed italic font-serif border-l-2 border-white/20 pl-2">
                                        "{g.worldSetting}"
                                    </p>
                                    
                                    <div className="flex justify-between items-end mt-2 pt-2 border-t border-white/10">
                                        <div className="flex -space-x-2">
                                            {characters.filter(c => g.playerCharIds.includes(c.id)).map(c => (
                                                <img key={c.id} src={c.avatar} className="w-8 h-8 rounded-full border-2 border-black/50 object-cover shadow-sm" />
                                            ))}
                                        </div>
                                        <div className="text-[10px] text-white/40 font-mono">
                                            {new Date(g.lastPlayedAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>

                                {/* Delete Button */}
                                <button onClick={(e) => handleDeleteGame(e, g.id)} className="absolute top-2 right-2 p-2 text-white/20 hover:text-red-400 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // 2. Create View
    if (view === 'create') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-sans">
                <div className="h-20 flex items-end px-4 pb-3 border-b border-slate-200 bg-white shrink-0 sticky top-0 z-10">
                    <button onClick={() => setView('lobby')} className="p-2 -ml-2 text-slate-500"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
                    <span className="font-bold text-slate-700 ml-2 mb-1.5">创建世界</span>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">剧本标题</label>
                        <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-orange-500 outline-none transition-colors" placeholder="例如：勇者斗恶龙" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">世界观设定 (Lore)</label>
                        <textarea value={newWorld} onChange={e => setNewWorld(e.target.value)} className="w-full h-32 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-orange-500 outline-none resize-none transition-colors" placeholder="这是一个魔法与科技共存的世界..." />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">画风主题</label>
                        <div className="flex gap-2 flex-wrap">
                            {(['fantasy', 'cyber', 'horror', 'modern'] as GameTheme[]).map(t => (
                                <button key={t} onClick={() => setNewTheme(t)} className={`px-4 py-2 rounded-xl text-xs font-bold capitalize border transition-all active:scale-95 ${newTheme === t ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}>{t}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-2">邀请玩家</label>
                        <div className="grid grid-cols-4 gap-3">
                            {characters.map(c => (
                                <div key={c.id} onClick={() => { const s = new Set(selectedPlayers); if(s.has(c.id)) s.delete(c.id); else s.add(c.id); setSelectedPlayers(s); }} className={`flex flex-col items-center p-2 rounded-xl border cursor-pointer transition-all active:scale-95 ${selectedPlayers.has(c.id) ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500' : 'border-transparent hover:bg-slate-100'}`}>
                                    <img src={c.avatar} className="w-12 h-12 rounded-full object-cover shadow-sm" />
                                    <span className={`text-[9px] mt-2 truncate w-full text-center font-medium ${selectedPlayers.has(c.id) ? 'text-orange-600' : 'text-slate-600'}`}>{c.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-200 bg-white">
                    <button 
                        onClick={handleCreateGame} 
                        disabled={isCreating}
                        className="w-full py-3 bg-slate-800 text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2"
                    >
                        {isCreating ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 生成序章...</> : <><span>🚀</span> 开始冒险</>}
                    </button>
                </div>
            </div>
        );
    }

    // 3. Play View
    if (!activeGame) return null;
    const theme = GAME_THEMES[activeGame.theme];
    const activePlayers = characters.filter(c => activeGame.playerCharIds.includes(c.id));

    // [FIX] Changed from absolute inset-0 to h-full relative to fix overscroll and height layout issues
    return (
        <div className={`h-full w-full relative flex flex-col ${theme.bg} ${theme.text} ${theme.font} transition-colors duration-500 overflow-hidden`}>
            
            {/* Header */}
            <div className={`h-20 flex items-end justify-between px-4 pb-3 border-b ${theme.border} shrink-0 bg-opacity-90 backdrop-blur z-20 relative`}>
                <div className="flex items-center gap-2">
                    <button onClick={handleLeave} className={`p-2 -ml-2 rounded hover:bg-white/10 active:scale-95 transition-transform`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <div className="flex flex-col mb-0.5">
                        <span className="font-bold text-sm tracking-wide line-clamp-1 max-w-[150px]">{activeGame.title}</span>
                        <span className="text-[9px] opacity-60 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            {activeGame.status.location}
                        </span>
                    </div>
                </div>
                
                <div className="flex gap-1 mb-1">
                    {/* Toggle Party HUD */}
                    <button onClick={() => setShowParty(!showParty)} className={`p-2 rounded hover:bg-white/10 active:scale-95 transition-transform ${showParty ? theme.accent : 'opacity-50'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>
                    </button>
                    <button onClick={() => setShowSystemMenu(true)} className={`p-2 -mr-2 rounded hover:bg-white/10 active:scale-95 transition-transform`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
                    </button>
                </div>
            </div>

            {/* --- NEW: Party HUD (Collapsible) --- */}
            {showParty && (
                <div className={`flex gap-4 p-3 overflow-x-auto no-scrollbar border-b ${theme.border} bg-black/20 backdrop-blur-sm z-10 shrink-0 animate-slide-down`}>
                    {/* User Avatar */}
                    <div className="relative group shrink-0">
                        <img src={userProfile.avatar} className="w-10 h-10 rounded-full border-2 border-white/20 object-cover shadow-sm" />
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[8px] px-1.5 rounded-full backdrop-blur-sm whitespace-nowrap">YOU</div>
                    </div>
                    {/* Teammates */}
                    {activePlayers.map(p => (
                        <div key={p.id} className="relative group shrink-0 cursor-pointer active:scale-95 transition-transform">
                            <img src={p.avatar} className="w-10 h-10 rounded-full border-2 border-white/20 object-cover shadow-sm group-hover:border-white/50 transition-colors" />
                            <div className="absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-green-400/50 transition-all"></div>
                            {/* Simple Status Indicator (Green Dot) */}
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black/50 shadow-sm animate-pulse"></div>
                        </div>
                    ))}
                </div>
            )}

            {/* Stats HUD */}
            <div className={`px-4 py-2 border-b ${theme.border} bg-black/10 backdrop-blur-sm z-10 grid grid-cols-3 gap-2 shrink-0`}>
                <div className="flex flex-col items-center bg-red-500/20 rounded p-1 border border-red-500/30">
                    <span className="text-[8px] text-red-300 font-bold uppercase">HP (生命)</span>
                    <span className="text-xs font-mono font-bold text-red-100">{activeGame.status.health || 100}</span>
                </div>
                <div className="flex flex-col items-center bg-blue-500/20 rounded p-1 border border-blue-500/30">
                    <span className="text-[8px] text-blue-300 font-bold uppercase">SAN (理智)</span>
                    <span className="text-xs font-mono font-bold text-blue-100">{activeGame.status.sanity || 100}</span>
                </div>
                <div className="flex flex-col items-center bg-yellow-500/20 rounded p-1 border border-yellow-500/30">
                    <span className="text-[8px] text-yellow-300 font-bold uppercase">GOLD (金币)</span>
                    <span className="text-xs font-mono font-bold text-yellow-100">{activeGame.status.gold || 0}</span>
                </div>
            </div>

            {/* Stage / Log Area */}
            <div 
                ref={logsContainerRef} // [FIX] Attach Ref to scrollable container
                className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar relative animate-fade-in"
            >
                {activeGame.logs.map((log, i) => {
                    const isGM = log.role === 'gm';
                    const isSystem = log.role === 'system';
                    const isCharacter = log.role === 'character';
                    const charInfo = isCharacter ? activePlayers.find(p => p.name === log.speakerName) : null;

                    if (isSystem) {
                        return (
                            <div key={log.id || i} className="flex justify-center my-4 animate-fade-in">
                                <span className="text-[10px] opacity-50 border-b border-dashed border-current pb-0.5 font-mono">{log.content}</span>
                            </div>
                        );
                    }

                    if (isGM) {
                        return (
                            <div key={log.id || i} className="animate-fade-in my-4">
                                <div className={`p-5 rounded-lg border-2 ${theme.border} ${theme.cardBg} shadow-sm relative mx-auto w-full text-sm`}>
                                    <div className="absolute -top-3 left-4 bg-inherit px-2 text-[10px] font-bold uppercase tracking-widest opacity-80 border border-inherit rounded">Game Master</div>
                                    <GameMarkdown content={log.content} theme={theme} customStyle={uiSettings} />
                                </div>
                            </div>
                        );
                    }

                    // Character Log
                    if (isCharacter && charInfo) {
                        return (
                            <div key={log.id || i} className="flex gap-3 animate-slide-up">
                                <img src={charInfo.avatar} className={`w-10 h-10 rounded-full object-cover border ${theme.border} shrink-0 mt-1`} />
                                <div className="flex flex-col max-w-[85%]">
                                    <span className="text-[10px] font-bold opacity-60 mb-1 ml-1">{charInfo.name}</span>
                                    <div className={`px-4 py-2 rounded-2xl rounded-tl-none text-sm ${theme.cardBg} border ${theme.border} shadow-sm`}>
                                        <GameMarkdown content={log.content} theme={theme} customStyle={uiSettings} />
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // Player (User) Log
                    return (
                        <div key={log.id || i} className="flex flex-col items-end animate-slide-up">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-bold opacity-60`}>{log.speakerName}</span>
                                {log.diceRoll && (
                                    <span className="text-[10px] bg-white/20 px-1.5 rounded text-yellow-500 font-mono">
                                        🎲 {log.diceRoll.result}
                                    </span>
                                )}
                            </div>
                            <div className={`px-4 py-2 rounded-2xl rounded-tr-none text-sm bg-orange-600 text-white shadow-md max-w-[85%]`}>
                                {log.content}
                            </div>
                        </div>
                    );
                })}
                {isTyping && <div className="text-xs opacity-50 animate-pulse pl-2 font-mono">GM 正在计算结果...</div>}
                
                {/* [FIX] Removed logsEndRef usage */}
            </div>

            {/* Controls */}
            {/* Added pb-[env(safe-area-inset-bottom)] to ensure content clears home bar on full screen devices */}
            <div className={`p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t ${theme.border} bg-opacity-90 backdrop-blur shrink-0 z-20 transition-colors duration-500`}>
                
                {/* AI Suggested Options Area */}
                {activeGame.suggestedActions && activeGame.suggestedActions.length > 0 && !isTyping && (
                    <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
                        {activeGame.suggestedActions.map((opt, idx) => {
                            let styleClass = "bg-white/10 border-white/20 text-slate-200";
                            if (opt.type === 'neutral') styleClass = "bg-slate-200/20 border-slate-400/30 text-slate-300";
                            if (opt.type === 'chaotic') styleClass = "bg-yellow-500/20 border-yellow-500/30 text-yellow-200";
                            if (opt.type === 'evil') styleClass = "bg-red-500/20 border-red-500/30 text-red-200";
                            
                            return (
                                <button 
                                    key={idx} 
                                    onClick={() => handleAction(opt.label)}
                                    className={`flex-1 min-w-[100px] text-[10px] p-2 rounded-lg border ${styleClass} hover:bg-white/20 active:scale-95 transition-all text-left leading-tight shadow-sm`}
                                >
                                    <span className="block font-bold opacity-70 uppercase text-[8px] mb-0.5 tracking-wider">{opt.type}</span>
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Collapsible Action Toolbar */}
                {showTools && (
                    <div className="flex gap-2 mb-3 animate-fade-in">
                        <button 
                            onClick={rollDice} 
                            disabled={isRolling}
                            className={`flex-1 py-2 rounded border ${theme.border} hover:bg-white/10 active:scale-95 transition-transform flex items-center justify-center gap-2 font-bold text-sm`}
                        >
                            <span className="text-xl">🎲</span> {isRolling ? 'Rolling...' : (diceResult || 'Roll D20')}
                        </button>
                        {['调查', '攻击', '交涉'].map(action => (
                            <button key={action} onClick={() => handleAction(action)} className={`px-4 py-2 rounded border ${theme.border} hover:bg-white/10 text-xs font-bold transition-colors active:scale-95`}>{action}</button>
                        ))}
                    </div>
                )}

                <div className="flex gap-2 items-end">
                    {/* Toggle Tools Button */}
                    <button 
                        onClick={() => setShowTools(!showTools)}
                        className={`p-3 h-12 rounded-xl border ${theme.border} hover:bg-white/10 active:scale-95 transition-transform flex items-center justify-center ${showTools ? 'bg-white/20' : ''}`}
                    >
                        <span className="text-lg">🧰</span>
                    </button>

                    {/* Reroll Button (Context Sensitive) */}
                    {!isTyping && activeGame.logs.length > 0 && (
                        <button 
                            onClick={handleReroll}
                            className={`p-3 h-12 rounded-xl border ${theme.border} hover:bg-white/10 active:scale-95 transition-transform flex items-center justify-center`}
                            title="重新生成上一轮"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        </button>
                    )}

                    <textarea 
                        value={userInput} 
                        onChange={e => setUserInput(e.target.value)} 
                        // Removed onKeyDown Enter submission
                        placeholder="你打算做什么..." 
                        className={`flex-1 bg-black/20 border ${theme.border} rounded-xl px-3 py-3 outline-none text-sm placeholder-opacity-30 placeholder-current resize-none h-12 leading-tight focus:bg-black/40 transition-colors`}
                    />
                    <button onClick={() => handleAction(userInput)} className={`${theme.accent} font-bold text-sm px-4 h-12 bg-white/10 rounded-xl hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                    </button>
                </div>
            </div>

            {/* System Menu Modal */}
            <Modal isOpen={showSystemMenu} title="系统菜单" onClose={() => setShowSystemMenu(false)}>
                <div className="space-y-4">
                    {/* UI Settings */}
                    <div className="bg-slate-100 p-3 rounded-xl">
                        <label className="text-xs text-slate-500 font-bold mb-3 block border-b border-slate-200 pb-1">阅读设置 (Display)</label>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400 w-8">字号</span>
                                <input 
                                    type="range" 
                                    min="12" 
                                    max="24" 
                                    step="1"
                                    value={uiSettings.fontSize} 
                                    onChange={e => setUiSettings({...uiSettings, fontSize: parseInt(e.target.value)})} 
                                    className="flex-1 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-orange-500" 
                                />
                                <span className="text-xs font-mono text-slate-600 w-6 text-right">{uiSettings.fontSize}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400 w-8">颜色</span>
                                <input 
                                    type="color" 
                                    value={uiSettings.color || '#e5e5e5'} 
                                    onChange={e => setUiSettings({...uiSettings, color: e.target.value})} 
                                    className="w-full h-8 rounded cursor-pointer bg-white border border-slate-200 p-0.5" 
                                />
                            </div>
                            <button onClick={() => setUiSettings({ fontSize: 14, color: '' })} className="w-full py-1.5 bg-white border border-slate-200 text-slate-500 text-xs rounded-lg active:scale-95 transition-transform">恢复默认</button>
                        </div>
                    </div>

                    <button onClick={handleArchiveAndQuit} className="w-full py-3 bg-emerald-500 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2">
                        <span>💾</span> 归档记忆并退出
                    </button>
                    <button onClick={handleRestart} className="w-full py-3 bg-orange-500 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2">
                        <span>🔄</span> 重置当前游戏
                    </button>
                    <button onClick={handleLeave} className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl flex items-center justify-center gap-2">
                        <span>🚪</span> 暂时离开 (不归档)
                    </button>
                </div>
            </Modal>

            {/* Archive Overlay */}
            {isArchiving && (
                <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center text-white flex-col gap-4 animate-fade-in">
                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs tracking-widest font-mono">正在传递记忆...</span>
                </div>
            )}
        </div>
    );
};

export default GameApp;

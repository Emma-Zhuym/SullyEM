




import React, { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { processImage } from '../utils/file';
import { CharacterProfile, SpriteConfig, Message, DateState, DialogueItem } from '../types';
import { ContextBuilder } from '../utils/context';
import Modal from '../components/os/Modal';

// 标准情绪列表 (Key必须是小写)
const REQUIRED_EMOTIONS = ['normal', 'happy', 'angry', 'sad', 'shy'];

const DEFAULT_SPRITE_CONFIG: SpriteConfig = { scale: 1, x: 0, y: 0 };

const DateApp: React.FC = () => {
    const { closeApp, characters, activeCharacterId, setActiveCharacterId, apiConfig, addToast, updateCharacter, virtualTime, userProfile } = useOS();
    
    // Modes: 'select' -> 'peek' -> 'vn' | 'settings' | 'history'
    const [mode, setMode] = useState<'select' | 'peek' | 'vn' | 'settings' | 'history'>('select');
    const [lastMode, setLastMode] = useState<'peek' | 'vn'>('peek');
    
    const [isNovelMode, setIsNovelMode] = useState(false); 
    const [peekStatus, setPeekStatus] = useState<string>('');
    const [peekLoading, setPeekLoading] = useState(false);
    
    const [bgImage, setBgImage] = useState<string>('');
    const [currentSprite, setCurrentSprite] = useState<string>('');
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    
    // Queue now holds objects with emotion data
    const [dialogueQueue, setDialogueQueue] = useState<DialogueItem[]>([]); 
    const [dialogueBatch, setDialogueBatch] = useState<DialogueItem[]>([]); // For Looping
    
    const [currentText, setCurrentText] = useState<string>(''); 
    const [displayedText, setDisplayedText] = useState<string>(''); 
    const [isTextAnimating, setIsTextAnimating] = useState(false);
    const [showInputBox, setShowInputBox] = useState(false);
    
    // History State
    const [historySessions, setHistorySessions] = useState<{date: string, msgs: Message[]}[]>([]);
    
    // Exit Confirmation State
    const [showExitModal, setShowExitModal] = useState(false);

    // Resume Logic State
    const [pendingSessionChar, setPendingSessionChar] = useState<CharacterProfile | null>(null);

    // Logic State
    const [hasSavedOpening, setHasSavedOpening] = useState(false); // Track if opening is saved
    const [lastAiText, setLastAiText] = useState(''); // Track last AI response for reroll UI rollback

    // --- NEW: Editing State ---
    const [dateMessages, setDateMessages] = useState<Message[]>([]);
    const [modalType, setModalType] = useState<'none' | 'message-options' | 'edit-message'>('none');
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [editContent, setEditContent] = useState('');
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const novelScrollRef = useRef<HTMLDivElement>(null);
    const [uploadTarget, setUploadTarget] = useState<'bg' | 'sprite'>('bg');
    const [targetEmotionKey, setTargetEmotionKey] = useState<string>(''); 
    const [customEmotionName, setCustomEmotionName] = useState(''); 
    const [tempSpriteConfig, setTempSpriteConfig] = useState<SpriteConfig>(DEFAULT_SPRITE_CONFIG);

    const char = characters.find(c => c.id === activeCharacterId);

    useEffect(() => {
        if (char) {
            setTempSpriteConfig(char.spriteConfig || DEFAULT_SPRITE_CONFIG);
            // Load messages for Novel Mode
            loadDateMessages();
        }
    }, [char, mode]); // Reload on mode switch to keep fresh

    const loadDateMessages = async () => {
        if (char) {
            const msgs = await DB.getMessagesByCharId(char.id);
            const filtered = msgs.filter(m => m.metadata?.source === 'date').sort((a,b) => a.timestamp - b.timestamp);
            setDateMessages(filtered);
            
            // Check if opening is already saved
            if (filtered.length > 0) {
                setHasSavedOpening(true);
            }
        }
    };

    useEffect(() => {
        if (isNovelMode && novelScrollRef.current) {
            novelScrollRef.current.scrollTop = novelScrollRef.current.scrollHeight;
        }
    }, [dateMessages.length, isNovelMode, showInputBox]);

    useEffect(() => {
        if (!currentText || isNovelMode) {
            if (isNovelMode) setDisplayedText(currentText); 
            return;
        }

        setIsTextAnimating(true);
        setDisplayedText('');
        let i = 0;
        const timer = setInterval(() => {
            setDisplayedText(currentText.substring(0, i + 1));
            i++;
            if (i >= currentText.length) {
                clearInterval(timer);
                setIsTextAnimating(false);
            }
        }, 20); // Faster speed

        return () => clearInterval(timer);
    }, [currentText, isNovelMode]);

    // --- Helpers ---

    const handleBack = () => {
        if (mode === 'settings') {
            setMode(lastMode);
        } else if (mode === 'vn') {
             setShowExitModal(true); // Open custom modal instead of window.confirm
        } else if (mode === 'peek') {
            setMode('select');
            setPeekStatus('');
        } else if (mode === 'history') {
            setMode('select');
        }
        else closeApp();
    };

    // Modified Exit Logic: Save State instead of Clearing
    const handleSaveAndExit = () => {
        setShowExitModal(false);
        if (char) {
            // Persist current state to character profile
            const currentState: DateState = {
                dialogueQueue,
                dialogueBatch,
                currentText,
                bgImage,
                currentSprite,
                isNovelMode,
                timestamp: Date.now(),
                peekStatus: peekStatus // Save the peek text context
            };
            updateCharacter(char.id, { savedDateState: currentState });
            addToast('进度已保存，下次可继续', 'success');
        }
        
        // Reset local state for safety (though component might unmount)
        setMode('select');
        setDialogueQueue([]);
        setDialogueBatch([]);
        setCurrentText('');
        setInput('');
        setIsNovelMode(false);
        setHasSavedOpening(false);
        setPeekStatus('');
    };

    const openSettings = (from: 'peek' | 'vn') => {
        setLastMode(from);
        setMode('settings');
    };

    const openHistory = async (c: CharacterProfile) => {
        setActiveCharacterId(c.id);
        const msgs = await DB.getMessagesByCharId(c.id);
        
        // Filter only DateApp messages and sort by time (Newest first for the list)
        const dateMsgs = msgs
            .filter(m => m.metadata?.source === 'date')
            .sort((a, b) => b.timestamp - a.timestamp); 

        // Group by session (gap > 1 hour)
        const sessions: {date: string, msgs: Message[]}[] = [];
        
        if (dateMsgs.length > 0) {
            let currentSession: Message[] = [dateMsgs[0]];
            
            for (let i = 1; i < dateMsgs.length; i++) {
                const prev = dateMsgs[i-1]; // Newer message
                const curr = dateMsgs[i];   // Older message
                
                // Gap check: prev (newer) - curr (older) > 1 hour
                if (Math.abs(prev.timestamp - curr.timestamp) > 60 * 60 * 1000) {
                    // Gap detected, finalize current session
                    sessions.push({
                        date: new Date(prev.timestamp).toLocaleString(),
                        msgs: currentSession.reverse() // Reverse back to chronological order for reading
                    });
                    currentSession = [curr];
                } else {
                    currentSession.push(curr);
                }
            }
            // Push last session
            sessions.push({
                date: new Date(currentSession[0].timestamp).toLocaleString(),
                msgs: currentSession.reverse()
            });
        }
        
        setHistorySessions(sessions);
        setMode('history');
    };

    const handleSaveSettings = () => {
        if (char) {
            updateCharacter(char.id, { spriteConfig: tempSpriteConfig });
            addToast('配置已保存', 'success');
        }
        setMode(lastMode);
    };

    const formatTime = () => `${virtualTime.hours.toString().padStart(2, '0')}:${virtualTime.minutes.toString().padStart(2, '0')}`;

    // Improved Time Gap Logic (Synced with Chat.tsx)
    const getTimeGapHint = (lastMsgTimestamp: number | undefined): string => {
        if (!lastMsgTimestamp) return '这是你们的初次互动。';
        
        const now = Date.now();
        const diffMs = now - lastMsgTimestamp;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        
        const currentHour = new Date().getHours();
        const isNight = currentHour >= 23 || currentHour <= 6;

        if (diffMins < 5) return ''; // No gap context needed for immediate replies
        if (diffMins < 60) return `[系统提示: 距离上次互动: ${diffMins} 分钟。短暂的停顿。]`;
        
        if (diffHours < 6) {
            if (isNight) return `[系统提示: 距离上次互动: ${diffHours} 小时。现在是深夜/清晨。沉默是正常的。]`;
            return `[系统提示: 距离上次互动: ${diffHours} 小时。用户离开了一会儿。]`;
        }
        
        if (diffHours < 24) return `[系统提示: 距离上次互动: ${diffHours} 小时。比较长的间隔。]`;
        
        const days = Math.floor(diffHours / 24);
        return `[系统提示: 距离上次互动: ${days} 天。用户消失了很久。请根据你们的关系做出反应（想念、生气、担心或冷漠）。]`;
    };

    // Helper to identify noise lines
    const isContextNoise = (line: string) => {
        const l = line.trim().toLowerCase();
        // Check for specific context leaks
        if (l.startsWith('(') && l.endsWith(')')) {
            if (l.includes('in person') || l.includes('face-to-face') || l.includes('location') || l.includes('time')) return true;
        }
        // Strict system note blocking
        if (l.startsWith('[system') || l.startsWith('(system')) return true;
        return false;
    };

    // --- Optimized Visual Novel Parser (Line-based State Machine) ---
    const parseDialogue = (fullText: string, initialEmotion: string = 'normal'): DialogueItem[] => {
        if (!fullText) return [];
        
        // 1. Split by newlines. Filter empty lines.
        const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        const results: DialogueItem[] = [];
        let currentEmotion = initialEmotion;

        for (const line of lines) {
            // --- FILTER: Block Common Context Leaks ---
            if (isContextNoise(line)) continue;
            // ------------------------------------------

            // 2. Check for [emotion] tag at the very start of the line
            const tagMatch = line.match(/^\[([a-zA-Z0-9_\-]+)\]\s*(.*)/);
            
            let content = line;
            
            if (tagMatch) {
                // Found a tag, update state
                currentEmotion = tagMatch[1].toLowerCase();
                content = tagMatch[2]; // The rest of the line
            } else {
                // Check if the line is JUST a tag
                const standaloneTag = line.match(/^\[([a-zA-Z0-9_\-]+)\]$/);
                if (standaloneTag) {
                    currentEmotion = standaloneTag[1].toLowerCase();
                    continue; 
                }
            }

            // 3. Push the content as a bubble if not empty
            if (content) {
                results.push({
                    text: content,
                    emotion: currentEmotion
                });
            }
        }

        return results;
    };

    // --- Select Logic (New: Resume Check) ---
    const handleCharClick = (c: CharacterProfile) => {
        if (c.savedDateState) {
            setPendingSessionChar(c); // Show resume modal
        } else {
            startPeek(c); // Normal start
        }
    };

    const handleResumeSession = () => {
        if (!pendingSessionChar || !pendingSessionChar.savedDateState) return;
        
        const s = pendingSessionChar.savedDateState;
        setActiveCharacterId(pendingSessionChar.id);
        
        // Restore State
        setBgImage(s.bgImage);
        setCurrentSprite(s.currentSprite);
        setCurrentText(s.currentText);
        setDisplayedText(s.currentText); // Show text immediately, no type animation
        setDialogueQueue(s.dialogueQueue);
        setDialogueBatch(s.dialogueBatch);
        setIsNovelMode(s.isNovelMode);
        setPeekStatus(s.peekStatus || '');
        
        setMode('vn');
        setPendingSessionChar(null);
        addToast('已恢复上次进度', 'success');
    };

    const handleStartNewSession = () => {
        if (!pendingSessionChar) return;
        
        // Clear saved state
        updateCharacter(pendingSessionChar.id, { savedDateState: undefined });
        
        // Start fresh
        startPeek(pendingSessionChar);
        setPendingSessionChar(null);
    };

    // --- Logic: Peek (Sense Presence) ---
    
    const startPeek = async (c: CharacterProfile) => {
        setActiveCharacterId(c.id);
        setMode('peek');
        setPeekLoading(true);
        setPeekStatus('');
        setHasSavedOpening(false); // Reset saved status on new peek

        try {
            const msgs = await DB.getMessagesByCharId(c.id);
            const limit = c.contextLimit || 500; 
            const peekLimit = Math.min(limit, 50); 
            
            const lastMsg = msgs[msgs.length - 1];
            // Calculate gap specifically for Peek context
            const gapHint = getTimeGapHint(lastMsg?.timestamp);

            const recentMsgs = msgs.slice(-peekLimit).map(m => {
                const content = m.type === 'image' ? '[User sent an image]' : m.content;
                return `${m.role}: ${content}`;
            }).join('\n');
            
            const timeStr = `${virtualTime.day} ${formatTime()}`;

            // 1. Build Standardized Core Context (Identity, Worldview, etc.)
            const baseContext = ContextBuilder.buildCoreContext(c, userProfile, false); 

            // 2. Peek Instructions
            const peekInstructions = `
### 场景：感知 (Sense Presence)
当前时间: ${timeStr}
时间上下文: ${gapHint}

### 任务
你现在并不在和用户直接对话。用户正在悄悄靠近你所在的地点（或者是通过摄像头/感知模组观察你）。
请用**第三人称**描写一段话。
描述：${c.name} 此时此刻正在做什么？周围环境是怎样的？状态如何？

### 逻辑检查
1. **地点一致性**: 如果聊天记录中约定了地点，请在该地点。否则根据时间和人设推断。
2. **状态一致性**: ${gapHint.includes('很久') ? '因为很久没见，可能在发呆、忙碌或者有点落寞。' : '根据之前的聊天状态决定。'}
3. **描写风格**: 电影感，沉浸式，细节丰富。不要输出任何前缀，直接输出描写内容。`;

            // 3. User Message acts as trigger + recent log context
            const userTrigger = `[最近的聊天记录 (Last ${peekLimit} messages)]:
${recentMsgs}

(Start sensing...)`;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [
                        { role: "system", content: baseContext },
                        { role: "user", content: peekInstructions + "\n\n" + userTrigger }
                    ],
                    temperature: 0.85
                })
            });

            if (!response.ok) throw new Error('Failed to sense presence');
            const data = await response.json();
            const content = data.choices[0].message.content;
            setPeekStatus(content);

        } catch (e: any) {
            setPeekStatus(`(无法感知状态: ${e.message})`);
        } finally {
            setPeekLoading(false);
        }
    };

    // --- Logic: Visual Novel Engine ---

    const enterDate = () => {
        if (!char) return;
        setMode('vn');
        setBgImage(char.dateBackground || '');
        
        const s = char.sprites;
        const initialSprite = s?.['normal'] || s?.['default'] || (s && Object.values(s)[0]) || char.avatar;
        setCurrentSprite(initialSprite);
        setTempSpriteConfig(char.spriteConfig || DEFAULT_SPRITE_CONFIG);
        
        // Initial queue parsing from Local Preview if not saved
        const startText = peekStatus || "Waiting for connection...";
        
        // IMPORTANT: Ensure messages are loaded from DB to support editing
        loadDateMessages().then(() => {
            // If we have messages, the last AI message sets the stage
            // We use effect dependencies to handle this actually
        });
        
        const items = parseDialogue(startText, 'normal');
        setDialogueBatch(items); 
        setDialogueQueue(items);
        
        if (items.length > 0) {
            processNextDialogue(items[0], items.slice(1));
            setShowInputBox(false);
        }
    };

    // Helper to update state based on a dialogue item
    const processNextDialogue = (item: DialogueItem, remainingQueue: DialogueItem[]) => {
        setCurrentText(item.text);
        if (item.emotion && char) {
            // Find sprite for this emotion
            let nextSprite = char.sprites?.[item.emotion];
            if (!nextSprite) {
                 const keys = Object.keys(char.sprites || {});
                 const found = keys.find(k => item.emotion!.includes(k));
                 nextSprite = found ? char.sprites?.[found] : (char.sprites?.['normal'] || char.sprites?.['default'] || char.avatar);
            }
            if (nextSprite) setCurrentSprite(nextSprite);
        }
        setDialogueQueue(remainingQueue);
    };

    const handleScreenClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button, input, textarea, .control-panel')) return;

        // Novel Mode Logic
        if (isNovelMode) return;

        // Galgame Mode Logic
        if (isTextAnimating) {
            setDisplayedText(currentText);
            setIsTextAnimating(false);
            return;
        }

        if (dialogueQueue.length > 0) {
            const next = dialogueQueue[0];
            processNextDialogue(next, dialogueQueue.slice(1));
            return;
        }

        // Loop Logic
        if (dialogueBatch.length > 0) {
            addToast('↺ 重播对话', 'info');
            const next = dialogueBatch[0];
            processNextDialogue(next, dialogueBatch.slice(1));
            return;
        }
    };
    
    const callDateAPI = async (msgs: Message[], userMsg: string) => {
        const msgsToUse = msgs;
        const previousMsg = msgsToUse.length >= 2 ? msgsToUse[msgsToUse.length - 2] : null;
        const gapHint = getTimeGapHint(previousMsg?.timestamp);

        // ENSURE CONSISTENCY: Same logic as Chat App
        // Use user-defined limit or default 500
        const limit = char!.contextLimit || 500;
        
        const historyMsgs = msgsToUse.slice(-limit, -1).map(m => {
            let content = m.content;
            if (m.type === 'image') content = '[User sent an image]';
            return { role: m.role, content: content };
        });

        const availableSprites = Object.keys(char!.sprites || {});
        const validEmotions = availableSprites.length > 0 ? availableSprites : REQUIRED_EMOTIONS;
        
        // ENSURE CONSISTENCY: Use central ContextBuilder
        let systemPrompt = ContextBuilder.buildCoreContext(char!, userProfile);

        systemPrompt += `### [Visual Novel Mode: 视觉小说脚本模式]
你正在与用户进行**面对面**的互动。

### 核心规则：一行一念 (One Line per Beat)
前端解析器基于**换行符**来分割气泡。为了保证演出效果，请严格遵守以下规则：

1. **绝对禁止混写**:
   - ❌ **严重错误**: \`他叹了口气说：“好吧。”\` (严禁在同一行里既写动作又写带引号的台词)
   - ❌ **严重错误**: \`“行吧。”他无奈地摊手。\`
   - ✅ **正确**:
     \`他叹了口气。\` (第一行：动作)
     \`“好吧。”\` (第二行：台词)

2. **情绪标签 (Emotion Tags)**:
   - 格式: \`[emotion]\` (放在行首)。
   - **状态机逻辑**: 如果某一行没有标签，它将**继承**上一行的情绪。
   - 为了防止情绪状态错误，建议在每一句台词前都确认一下标签，或者在情绪变化时务必打上标签。
   - 可用标签: ${validEmotions.join(', ')}

3. **写作格式**:
   - **台词**: 必须用双引号 **“...”** 包裹。
   - **动作/心理/旁白**: 直接写，不要加引号。

### 示例 (Example Output)
[surprised] “欸？你怎么突然来了？”
[surprised] Sully手忙脚乱地把桌上的零食扫进抽屉里。
[shy] “咳……那个，我刚才可没有在偷懒哦。”
[shy] 他看起来有点心虚，眼神游离，不敢直视你。
[shy] “……大概吧。”
[happy] “不过既然来了，要不要看看我刚写的代码？”

### 场景上下文
1. **Location**: 你们现在**面对面**。
2. **Time**: ${gapHint}
`;

        const apiMessages = [
            { role: 'system', content: systemPrompt },
            ...historyMsgs,
            { 
                role: 'user', 
                content: `${userMsg}\n\n(System Note: 请严格遵守 VN 脚本格式。严禁一行内混写动作和台词。)` 
            }
        ];

        return await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: apiMessages,
                temperature: 0.85
            })
        });
    }

    const handleSend = async () => {
        if (!input.trim() || !char || isTyping) return;
        
        const userMsg = input.trim();
        setInput('');
        setShowInputBox(false);
        
        // 1. CONDITIONAL SAVE: OPENING
        if (!hasSavedOpening && peekStatus) {
            await DB.saveMessage({
                charId: char.id,
                role: 'assistant', 
                type: 'text',
                content: peekStatus,
                metadata: { source: 'date' }
            });
            setHasSavedOpening(true);
        }

        // 2. Save User Message
        await DB.saveMessage({ 
            charId: char.id, 
            role: 'user', 
            type: 'text', 
            content: userMsg,
            metadata: { source: 'date' } // HIDDEN IN CHAT APP
        });
        
        // Update Local State for rendering immediately
        const newMsgUser = { 
            id: Date.now(), 
            charId: char.id, 
            role: 'user', 
            type: 'text', 
            content: userMsg, 
            metadata: { source: 'date' }, 
            timestamp: Date.now() 
        } as Message;
        setDateMessages(prev => [...prev, newMsgUser]);

        setIsTyping(true);
        
        try {
            const msgs = await DB.getMessagesByCharId(char.id);
            const response = await callDateAPI(msgs, userMsg);

            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            const content = data.choices[0].message.content;

            setLastAiText(content); // Store for potential reroll

            // 4. Save AI Response
            const aiMsgId = await DB.saveMessage({ 
                charId: char.id, 
                role: 'assistant', 
                type: 'text', 
                content: content, 
                metadata: { source: 'date' }
            });
            
            // Update Local State
            const newMsgAI = { 
                id: aiMsgId, 
                charId: char.id, 
                role: 'assistant', 
                type: 'text', 
                content: content, 
                metadata: { source: 'date' }, 
                timestamp: Date.now() 
            } as Message;
            setDateMessages(prev => [...prev, newMsgAI]);
            
            // 5. Update VN View
            const items = parseDialogue(content, 'normal'); 
            setDialogueBatch(items);
            setDialogueQueue(items);
            
            if (items.length > 0) {
                processNextDialogue(items[0], items.slice(1));
            }

        } catch (e: any) {
            addToast(e.message, 'error');
            setCurrentText("(连接中断)");
            setShowInputBox(true);
        } finally {
            setIsTyping(false);
        }
    };

    const handleRerollDate = async () => {
        if(isTyping || !char) return;
        
        // 1. Get history
        const msgs = await DB.getMessagesByCharId(char.id);
        if(msgs.length === 0) return;

        const lastMsg = msgs[msgs.length - 1];

        // 2. Check validity: Must be Assistant response in Date mode
        if(lastMsg.role !== 'assistant' || lastMsg.metadata?.source !== 'date') {
            addToast('只能重随最后一条AI回复', 'info');
            return;
        }

        // 3. Optimistic UI update
        setIsTyping(true);
        addToast('正在重随...', 'info');

        try {
            // Delete DB record
            await DB.deleteMessage(lastMsg.id);
            
            // Update Local State
            setDateMessages(prev => prev.filter(m => m.id !== lastMsg.id));

            // 4. Re-call API using the PREVIOUS message (User input)
            const userMsgObj = msgs[msgs.length - 2];
            if (!userMsgObj) throw new Error("No context found");

            const newMsgsContext = msgs.slice(0, msgs.length - 1); 
            const response = await callDateAPI(newMsgsContext, userMsgObj.content);

            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            const content = data.choices[0].message.content;

            setLastAiText(content);

            // 5. Save New AI Response
            const newId = await DB.saveMessage({ 
                charId: char.id, 
                role: 'assistant', 
                type: 'text', 
                content: content, 
                metadata: { source: 'date' }
            });

            // Update Local State
            const newMsgAI = { 
                id: newId, 
                charId: char.id, 
                role: 'assistant', 
                type: 'text', 
                content: content, 
                metadata: { source: 'date' }, 
                timestamp: Date.now() 
            } as Message;
            setDateMessages(prev => [...prev, newMsgAI]);

            // 6. Update UI
            const items = parseDialogue(content, 'normal'); 
            setDialogueBatch(items);
            setDialogueQueue(items);
            
            if (items.length > 0) {
                processNextDialogue(items[0], items.slice(1));
            }

        } catch (e: any) {
            addToast(e.message, 'error');
        } finally {
            setIsTyping(false);
        }
    };

    // --- Logic: Settings ---

    const triggerUpload = (target: 'bg' | 'sprite', emotionKey?: string) => {
        setUploadTarget(target);
        if (emotionKey) setTargetEmotionKey(emotionKey);
        fileInputRef.current?.click();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !char) return;

        try {
            const base64 = await processImage(file);
            if (uploadTarget === 'bg') {
                updateCharacter(char.id, { dateBackground: base64 });
                addToast('背景已更新', 'success');
            } else {
                const key = targetEmotionKey || customEmotionName.trim().toLowerCase();
                if (!key) { addToast('请输入情绪名称', 'error'); return; }
                const newSprites = { ...(char.sprites || {}), [key]: base64 };
                updateCharacter(char.id, { sprites: newSprites });
                addToast(`立绘 [${key}] 已保存`, 'success');
                setCustomEmotionName('');
                setTargetEmotionKey('');
            }
        } catch (e: any) {
            addToast(e.message, 'error');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // --- EDITING HANDLERS ---
    const handleTouchStart = (msg: Message) => {
        longPressTimer.current = setTimeout(() => {
            setSelectedMessage(msg);
            setModalType('message-options');
        }, 600);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleDeleteMessage = async () => {
        if (!selectedMessage) return;
        await DB.deleteMessage(selectedMessage.id);
        setDateMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
        setModalType('none');
        addToast('记录已删除', 'success');
    };

    const handleStartEdit = () => {
        if (!selectedMessage) return;
        setEditContent(selectedMessage.content);
        setModalType('edit-message');
    };

    const handleConfirmEdit = async () => {
        if (!selectedMessage) return;
        await DB.updateMessage(selectedMessage.id, editContent);
        setDateMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, content: editContent } : m));
        setModalType('none');
        addToast('已修改', 'success');
        
        // If editing the very last AI message, update the Visual Novel view too
        if (dateMessages.length > 0 && selectedMessage.id === dateMessages[dateMessages.length - 1].id && selectedMessage.role === 'assistant') {
             const items = parseDialogue(editContent);
             setDialogueBatch(items);
             setDialogueQueue(items);
             if (items.length > 0) processNextDialogue(items[0], items.slice(1));
        }
    };

    // --- History Deletion Logic ---
    const handleDeleteMessageInHistory = async (id: number) => {
        await DB.deleteMessage(id);
        // Update history sessions locally
        setHistorySessions(prev => prev.map(session => ({
            ...session,
            msgs: session.msgs.filter(m => m.id !== id)
        })).filter(s => s.msgs.length > 0)); 
        addToast('记录已删除', 'success');
    };

    // --- Renderers ---

    if (mode === 'select' || !char) {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-light">
                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-white sticky top-0 z-10">
                    <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="font-bold text-slate-700">选择见面对象</span>
                    <div className="w-8"></div>
                </div>
                <div className="p-4 grid grid-cols-2 gap-4 overflow-y-auto">
                    {characters.map(c => (
                        <div key={c.id} onClick={() => handleCharClick(c)} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 active:scale-95 transition-transform flex flex-col items-center gap-3 relative group">
                            {/* History Icon in Top Right - Clickable independently */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); openHistory(c); }}
                                className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-20 active:scale-90"
                                title="查看见面记录"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                                </svg>
                            </button>
                            <img src={c.avatar} className="w-16 h-16 rounded-full object-cover" />
                            <span className="font-bold text-slate-700">{c.name}</span>
                            {c.savedDateState && <div className="absolute top-2 left-2 w-2 h-2 bg-green-500 rounded-full animate-pulse" title="有存档"></div>}
                        </div>
                    ))}
                </div>

                {/* Resume Modal */}
                <Modal 
                    isOpen={!!pendingSessionChar} 
                    title="发现进度" 
                    onClose={() => setPendingSessionChar(null)}
                    footer={
                        <div className="flex gap-3 w-full">
                            <button onClick={handleStartNewSession} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold">新的见面</button>
                            <button onClick={handleResumeSession} className="flex-1 py-3 bg-green-500 text-white rounded-2xl font-bold shadow-lg shadow-green-200">继续上次</button>
                        </div>
                    }
                >
                    <div className="text-center text-slate-500 text-sm py-4">
                        检测到 {pendingSessionChar?.name} 有未结束的见面。
                        <br/>
                        <span className="text-xs text-slate-400 mt-2 block">
                            (存档时间: {pendingSessionChar?.savedDateState?.timestamp ? new Date(pendingSessionChar.savedDateState.timestamp).toLocaleString() : 'Unknown'})
                        </span>
                    </div>
                </Modal>
            </div>
        );
    }

    if (mode === 'history') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-light">
                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-white sticky top-0 z-10">
                    <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="font-bold text-slate-700">见面记录</span>
                    <div className="w-8"></div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
                    {historySessions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                            <span className="text-4xl opacity-50">📖</span>
                            <span className="text-xs">暂无见面记录</span>
                        </div>
                    ) : (
                        historySessions.map((session, idx) => (
                            <div key={idx} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                                <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{session.date}</span>
                                    <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{session.msgs.length} 句</span>
                                </div>
                                <div className="p-4 space-y-4">
                                    {session.msgs.map(m => {
                                        const rawContent = m.content || ''; // Safe guard against null
                                        // Truncate for safety in rendering list if super long
                                        const safeContent = rawContent.length > 500 ? rawContent.substring(0, 500) + '...' : rawContent;
                                        // Clean up visual tags for better readability in history (e.g. [happy])
                                        let text = safeContent.replace(/\[.*?\]/g, '').trim();
                                        
                                        return (
                                            <div key={m.id} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} relative group`}>
                                                <div className={`max-w-[90%] text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'user' ? 'text-slate-500 text-right italic' : 'text-slate-800'}`}>
                                                    {m.role === 'user' ? (
                                                        <span className="bg-slate-100 px-3 py-2 rounded-xl rounded-tr-none inline-block">{text}</span>
                                                    ) : (
                                                        <span>{text || '(无内容)'}</span>
                                                    )}
                                                </div>
                                                {/* DELETE BUTTON for History Items */}
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteMessageInHistory(m.id); }}
                                                    className="text-[10px] text-red-300 hover:text-red-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity px-2"
                                                >
                                                    删除此条
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    if (mode === 'peek') {
        return (
            <div className="h-full w-full bg-black relative flex flex-col font-sans overflow-hidden">
                {/* 1. Header */}
                <div className="pt-24 flex flex-col items-center z-10 shrink-0">
                     <div className="text-xs font-mono text-neutral-500 mb-2 tracking-[0.2em] font-medium">
                        {virtualTime.day.toUpperCase()} {formatTime()}
                     </div>
                     <h2 className="text-4xl font-light text-white tracking-[0.3em] uppercase">
                        {char.name}
                     </h2>
                </div>

                {/* 2. Loading State */}
                {peekLoading && (
                    <div className="flex-1 flex flex-col items-center justify-center -mt-20 z-10">
                        <div className="w-12 h-[1px] bg-neutral-800 mb-12"></div>
                        <div className="w-[1px] h-12 bg-gradient-to-b from-transparent via-white to-transparent animate-pulse mb-6"></div>
                        <p className="text-sm font-light text-neutral-500 italic tracking-widest">
                            正在感知...
                        </p>
                    </div>
                )}

                {/* 3. Result State */}
                {!peekLoading && peekStatus && (
                    <div className="flex-1 min-h-0 flex flex-col px-8 pb-10 z-10 animate-fade-in">
                        <div className="flex-1 overflow-y-auto no-scrollbar mb-8 mask-image-gradient pt-8">
                            <div className="min-h-full flex flex-col justify-center">
                                <p className="text-neutral-300 text-[15px] leading-8 tracking-wide text-justify font-light select-none whitespace-pre-wrap">
                                    {peekStatus}
                                </p>
                            </div>
                        </div>

                        <div className="shrink-0 flex flex-col items-center gap-6">
                             <div className="w-full flex gap-3">
                                 <button 
                                    onClick={enterDate} 
                                    className="flex-1 h-14 bg-white text-black rounded-full font-bold tracking-[0.1em] text-sm shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-95 transition-transform hover:bg-neutral-200"
                                 >
                                    走过去 (Approach)
                                 </button>
                                 <button
                                    onClick={() => startPeek(char)}
                                    className="w-14 h-14 bg-neutral-800 text-white rounded-full flex items-center justify-center border border-neutral-700 shadow-lg active:scale-90 transition-transform"
                                    title="重随开场白"
                                 >
                                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                                 </button>
                             </div>
                             
                             <div className="flex flex-col items-center gap-3 text-[10px] text-neutral-600 font-medium tracking-wider">
                                 <button onClick={() => openSettings('peek')} className="hover:text-neutral-400 transition-colors">
                                    布置场景 / 设定立绘
                                 </button>
                                 <button onClick={handleBack} className="hover:text-neutral-400 transition-colors">
                                    悄悄离开
                                 </button>
                             </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (mode === 'settings') {
        const sprites = char.sprites || {};
        const currentSpriteImg = sprites['normal'] || sprites['default'] || Object.values(sprites)[0] || char.avatar;

        return (
            <div className="h-full w-full bg-slate-50 flex flex-col">
                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-white shrink-0 z-20">
                    <button onClick={handleBack} className="p-2 -ml-2 text-slate-600 active:scale-95 transition-transform"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
                    <span className="font-bold text-slate-700">场景布置</span>
                    {/* OLD Header Save Button REMOVED */}
                    <div className="w-8"></div>
                </div>
                
                {/* Live Preview Area */}
                <div className="h-64 bg-black relative overflow-hidden shrink-0 border-b border-slate-200">
                     <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: char.dateBackground ? `url(${char.dateBackground})` : 'none' }}></div>
                     <div className="absolute inset-0 flex items-end justify-center pointer-events-none">
                         <img 
                            src={currentSpriteImg}
                            className="max-h-[90%] object-contain transition-transform"
                            style={{ 
                                transform: `translate(${tempSpriteConfig.x}%, ${tempSpriteConfig.y}%) scale(${tempSpriteConfig.scale})`
                            }}
                         />
                     </div>
                     <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded backdrop-blur-sm">预览 (Preview)</div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-8 pb-20">
                    <section className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-400 uppercase mb-4">立绘位置调整</h3>
                        <div className="space-y-6">
                            <div>
                                <div className="flex justify-between text-[10px] text-slate-500 mb-2"><span>大小缩放 (Scale)</span><span>{tempSpriteConfig.scale.toFixed(1)}x</span></div>
                                <input type="range" min="0.5" max="2.0" step="0.1" value={tempSpriteConfig.scale} onChange={e => setTempSpriteConfig({...tempSpriteConfig, scale: parseFloat(e.target.value)})} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary" />
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] text-slate-500 mb-2"><span>左右偏移 (X)</span><span>{tempSpriteConfig.x}%</span></div>
                                <input type="range" min="-100" max="100" step="5" value={tempSpriteConfig.x} onChange={e => setTempSpriteConfig({...tempSpriteConfig, x: parseInt(e.target.value)})} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary" />
                            </div>
                             <div>
                                <div className="flex justify-between text-[10px] text-slate-500 mb-2"><span>上下偏移 (Y)</span><span>{tempSpriteConfig.y}%</span></div>
                                <input type="range" min="-50" max="50" step="5" value={tempSpriteConfig.y} onChange={e => setTempSpriteConfig({...tempSpriteConfig, y: parseInt(e.target.value)})} className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary" />
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">背景 (Background)</h3>
                        <div 
                            onClick={() => triggerUpload('bg')}
                            className="aspect-video bg-slate-200 rounded-xl overflow-hidden relative border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-primary group"
                        >
                            {char.dateBackground ? (
                                <>
                                    <img src={char.dateBackground} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-white text-xs font-bold">更换背景</span></div>
                                </>
                            ) : <span className="text-slate-400 text-xs">+ 上传背景图</span>}
                        </div>
                    </section>
                    
                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">立绘管理</h3>
                        <div className="grid grid-cols-3 gap-3">
                            {REQUIRED_EMOTIONS.map(key => (
                                <div key={key} onClick={() => triggerUpload('sprite', key)} className="flex flex-col gap-2 group cursor-pointer">
                                    <div className={`aspect-[3/4] rounded-xl overflow-hidden relative border ${sprites[key] ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-100'} shadow-sm flex items-center justify-center transition-all group-hover:border-primary`}>
                                        {sprites[key] ? (
                                            <>
                                                <img src={sprites[key]} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-white text-[10px]">更换</span></div>
                                            </>
                                        ) : <span className="text-slate-300 text-2xl">+</span>}
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs font-bold text-slate-600 capitalize">{key}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
                </div>

                {/* NEW Bottom Fixed Save Button */}
                <div className="p-4 border-t border-slate-200 bg-white/90 backdrop-blur-sm sticky bottom-0 z-20">
                    <button onClick={handleSaveSettings} className="w-full py-3 bg-primary text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-transform">
                        保存当前布置
                    </button>
                </div>
            </div>
        );
    }

    // --- Visual Novel Mode Render ---

    return (
        <div className="h-full w-full relative bg-black overflow-hidden font-sans select-none" onClick={handleScreenClick}>
            
            {/* 1. Background Layer */}
            <div 
                className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ${isNovelMode ? 'blur-xl opacity-30' : 'opacity-80'}`} 
                style={{ backgroundImage: bgImage ? `url(${bgImage})` : 'none' }}
            ></div>
         
            
            {/* 2. Menu Layer (Fixed Top Right) */}
            <div className="absolute top-0 right-0 p-4 pt-12 z-[100] flex justify-end gap-3 pointer-events-auto">
                {/* Reroll Button (New) */}
                {!isTyping && lastAiText && !isNovelMode && (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleRerollDate(); }}
                        className="bg-black/30 backdrop-blur-md text-white w-10 h-10 rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-all shadow-lg active:scale-95"
                        title="重随回复"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                    </button>
                )}

                <button 
                    onClick={(e) => { e.stopPropagation(); setShowInputBox(!showInputBox); }} 
                    className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all shadow-lg active:scale-95 ${showInputBox ? 'bg-primary border-primary text-white' : 'bg-black/30 backdrop-blur-md border-white/20 text-white hover:bg-white/20'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
                </button>

                <button 
                    onClick={(e) => { e.stopPropagation(); openSettings('vn'); }} 
                    className="bg-black/30 backdrop-blur-md text-white w-10 h-10 rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-all shadow-lg active:scale-95"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 2.555c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.212 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-2.555c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                </button>

                <button 
                    onClick={(e) => { e.stopPropagation(); setIsNovelMode(!isNovelMode); }} 
                    className="bg-black/30 backdrop-blur-md text-white w-10 h-10 rounded-full flex items-center justify-center border border-white/20 hover:bg-white/20 transition-all shadow-lg active:scale-95"
                >
                    {isNovelMode ? (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                    )}
                </button>
                
                <button 
                    onClick={(e) => { e.stopPropagation(); handleBack(); }} 
                    className="bg-red-500/80 backdrop-blur-md text-white px-4 h-10 rounded-full flex items-center justify-center gap-1 border border-white/20 hover:bg-red-600 transition-colors shadow-lg active:scale-95"
                >
                    <span className="text-xs font-bold mr-1">离开</span>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>
                </button>
            </div>

            {/* 3. Content Layers */}
            
            {/* 3a. Novel Mode Layer (Immersive Text - UPDATED) */}
            {isNovelMode && (
                <div 
                    ref={novelScrollRef}
                    className="absolute inset-0 z-20 overflow-y-auto no-scrollbar pt-24 pb-32 px-8 mask-image-gradient bg-black/90 backdrop-blur-sm overscroll-contain"
                    onClick={(e) => { e.stopPropagation(); setShowInputBox(true); }}
                >
                    <div className="min-h-full flex flex-col justify-end">
                        <div className="max-w-2xl mx-auto animate-fade-in space-y-6">
                             {/* Render Peek Status if no messages yet */}
                             {dateMessages.length === 0 && !hasSavedOpening && peekStatus && (
                                <div className="text-slate-200/50 italic text-center text-sm mb-8 px-4">
                                    {peekStatus.split('\n').map((line, idx) => line.trim() && (
                                        <p key={idx} className="whitespace-pre-wrap leading-relaxed tracking-wide my-2">
                                            {line}
                                        </p>
                                    ))}
                                </div>
                             )}

                             {/* Render Interactive Messages */}
                             {dateMessages.map((msg) => (
                                 <div 
                                    key={msg.id} 
                                    className="group relative rounded-xl transition-colors -mx-4 px-4 py-2 active:bg-white/5"
                                    onTouchStart={() => handleTouchStart(msg)}
                                    onTouchEnd={handleTouchEnd}
                                    onMouseDown={() => handleTouchStart(msg)}
                                    onMouseUp={handleTouchEnd}
                                    onMouseLeave={handleTouchEnd}
                                    onContextMenu={(e) => { e.preventDefault(); setSelectedMessage(msg); setModalType('message-options'); }}
                                >
                                     {msg.role === 'user' ? (
                                         <p className="whitespace-pre-wrap font-serif text-[16px] text-slate-400 text-right leading-loose tracking-wide italic border-r-2 border-slate-600/50 pr-4">
                                             {msg.content} <span className="text-[10px] uppercase font-sans not-italic ml-2 opacity-50">{userProfile.name}</span>
                                         </p>
                                     ) : (
                                         <div>
                                             {(msg.content || '').split('\n').map((line, idx) => line.trim() && (
                                                 <p key={idx} className="whitespace-pre-wrap font-serif text-[18px] text-slate-200 text-justify leading-loose tracking-wide drop-shadow-md border-l-2 border-white/10 pl-4 mb-4 last:mb-0">
                                                     {line.length > 1000 ? line.substring(0, 1000) + '...(过长截断)' : line}
                                                 </p>
                                             ))}
                                         </div>
                                     )}
                                 </div>
                             ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 3b. Visual Novel Mode Layer (Sprite + Bubble) */}
            {!isNovelMode && (
                <>
                    {/* Sprite */}
                    <div className="absolute inset-x-0 bottom-0 h-[90%] flex items-end justify-center pointer-events-none z-10 overflow-hidden">
                        {currentSprite && (
                            <img 
                                src={currentSprite} 
                                className="max-h-full max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-all duration-300 origin-bottom" 
                                style={{ 
                                    filter: showInputBox ? 'brightness(1)' : (isTextAnimating ? 'brightness(1.05)' : 'brightness(1)'),
                                    transform: `translate(${tempSpriteConfig.x}%, ${tempSpriteConfig.y}%) scale(${isTextAnimating ? tempSpriteConfig.scale * 1.02 : tempSpriteConfig.scale})`
                                }}
                            />
                        )}
                    </div>
                    
                    {/* Text Bubble */}
                    {!isTyping && (
                        <div className="absolute inset-x-0 bottom-8 z-30 flex justify-center">
                            <div className="w-[90%] max-w-lg bg-black/60 backdrop-blur-xl rounded-2xl border border-white/10 p-6 min-h-[140px] shadow-2xl animate-slide-up hover:bg-black/70 cursor-pointer">
                                <div className="absolute -top-3 left-6">
                                     <div className="bg-white/90 text-black px-4 py-1 rounded-sm text-xs font-bold tracking-widest uppercase shadow-[0_4px_10px_rgba(0,0,0,0.3)] transform -skew-x-12">
                                         {char.name}
                                     </div>
                                </div>
                                <p className="text-white/90 text-[16px] leading-relaxed font-light tracking-wide drop-shadow-md mt-2">
                                    {displayedText}
                                    {isTextAnimating && <span className="inline-block w-2 h-4 bg-white/70 ml-1 animate-pulse align-middle"></span>}
                                </p>
                                {!isTextAnimating && dialogueQueue.length > 0 && (
                                    <div className="absolute bottom-3 right-4 animate-bounce opacity-70">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white"><path fillRule="evenodd" d="M12.53 16.28a.75.75 0 0 1-1.06 0l-7.5-7.5a.75.75 0 0 1 1.06-1.06L12 14.69l6.97-6.97a.75.75 0 1 1 1.06 1.06l-7.5 7.5Z" clipRule="evenodd" /></svg>
                                    </div>
                                )}
                                {!isTextAnimating && dialogueQueue.length === 0 && dialogueBatch.length > 0 && (
                                    <div className="absolute bottom-3 right-4 opacity-50 text-[10px] text-white flex items-center gap-1 animate-pulse">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                                        Loop
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* 4. Common Input Layer (Floating) */}
            <div className={`absolute inset-x-0 bottom-0 z-40 flex justify-center pointer-events-none transition-all duration-300 ${isTyping ? 'opacity-100' : (showInputBox ? 'opacity-100' : 'opacity-0')}`}>
                
                {isTyping && (
                    <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 pointer-events-auto">
                        <div className="bg-black/80 backdrop-blur-md px-6 py-3 rounded-full border border-white/20 shadow-2xl animate-pulse flex items-center gap-3">
                             <div className="flex gap-1.5">
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-75"></div>
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-150"></div>
                             </div>
                             <span className="text-xs text-white font-bold tracking-widest uppercase">Opposite is typing...</span>
                        </div>
                    </div>
                )}

                {showInputBox && (
                    <div className="w-[90%] max-w-lg bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-2 flex gap-2 shadow-2xl animate-fade-in mb-8 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
                        <textarea 
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={isTyping ? "等待回应..." : "输入对话..."}
                            disabled={isTyping}
                            className="flex-1 bg-transparent px-4 py-3 text-white placeholder:text-white/30 outline-none font-light resize-none h-14 no-scrollbar leading-tight"
                            autoFocus
                        />
                        <button 
                            onClick={handleSend}
                            disabled={!input.trim() || isTyping}
                            className="px-6 bg-white text-black rounded-xl font-bold text-sm hover:bg-slate-200 disabled:opacity-50 transition-colors h-14 flex items-center justify-center"
                        >
                            SEND
                        </button>
                    </div>
                )}
            </div>

            {/* 5. Custom Modal for Exit Confirmation */}
            <Modal
                isOpen={showExitModal}
                title="暂时离开?"
                onClose={() => setShowExitModal(false)}
                footer={
                    <div className="flex gap-3 w-full">
                        <button onClick={() => setShowExitModal(false)} className="flex-1 py-3 bg-slate-100 rounded-2xl text-slate-600 font-bold">留在这里</button>
                        <button onClick={handleSaveAndExit} className="flex-1 py-3 bg-slate-800 text-white rounded-2xl font-bold">保存并退出</button>
                    </div>
                }
            >
                <div className="text-center text-slate-500 text-sm py-2 leading-relaxed">
                    选择“保存并退出”将保留当前对话进度。<br/>下次见面时，你可以选择继续话题。
                </div>
            </Modal>

            {/* 6. Message Options Modal (Edit/Delete) */}
            <Modal
                isOpen={modalType === 'message-options'} title="消息操作" onClose={() => setModalType('none')}
            >
                <div className="space-y-3">
                    {selectedMessage?.type === 'text' && (
                        <button onClick={handleStartEdit} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors flex items-center justify-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                            编辑内容
                        </button>
                    )}
                    <button onClick={handleDeleteMessage} className="w-full py-3 bg-red-50 text-red-500 font-medium rounded-2xl active:bg-red-100 transition-colors flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        删除消息
                    </button>
                </div>
            </Modal>

            {/* 7. Edit Message Modal */}
            <Modal
                isOpen={modalType === 'edit-message'} title="编辑内容" onClose={() => setModalType('none')}
                footer={<><button onClick={() => setModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={handleConfirmEdit} className="flex-1 py-3 bg-primary text-white font-bold rounded-2xl">保存</button></>}
            >
                <textarea 
                    value={editContent} 
                    onChange={e => setEditContent(e.target.value)} 
                    className="w-full h-32 bg-slate-100 rounded-2xl p-4 resize-none focus:ring-1 focus:ring-primary/20 transition-all text-sm leading-relaxed" 
                />
            </Modal>

        </div>
    );
};

export default DateApp;
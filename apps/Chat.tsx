import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { Message, MessageType, MemoryFragment, Emoji, EmojiCategory } from '../types';
import { processImage } from '../utils/file';
import { safeResponseJson } from '../utils/safeApi';
import MessageItem from '../components/chat/MessageItem';
import { PRESET_THEMES, DEFAULT_ARCHIVE_PROMPTS } from '../components/chat/ChatConstants';
import ChatHeader from '../components/chat/ChatHeader';
import ChatInputArea from '../components/chat/ChatInputArea';
import ChatModals from '../components/chat/ChatModals';
import Modal from '../components/os/Modal';
import { useChatAI } from '../hooks/useChatAI';

const Chat: React.FC = () => {
    const { characters, activeCharacterId, setActiveCharacterId, updateCharacter, apiConfig, closeApp, customThemes, removeCustomTheme, addToast, userProfile, lastMsgTimestamp, groups, clearUnread, realtimeConfig } = useOS();
    const [messages, setMessages] = useState<Message[]>([]);
    const [totalMsgCount, setTotalMsgCount] = useState(0);
    const [visibleCount, setVisibleCount] = useState(30);
    const [input, setInput] = useState('');
    const [showPanel, setShowPanel] = useState<'none' | 'actions' | 'emojis' | 'chars'>('none');
    
    // Emoji State
    const [emojis, setEmojis] = useState<Emoji[]>([]);
    const [categories, setCategories] = useState<EmojiCategory[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>('default');
    const [newCategoryName, setNewCategoryName] = useState('');

    const scrollRef = useRef<HTMLDivElement>(null);
    const lastMsgIdRef = useRef<number | null>(null);
    const scrollThrottleRef = useRef(0);
    const visibleCountRef = useRef(30);

    // Reply Logic
    const [replyTarget, setReplyTarget] = useState<Message | null>(null);

    const [modalType, setModalType] = useState<'none' | 'transfer' | 'emoji-import' | 'chat-settings' | 'message-options' | 'edit-message' | 'delete-emoji' | 'delete-category' | 'add-category' | 'history-manager' | 'archive-settings' | 'prompt-editor' | 'category-options' | 'category-visibility'>('none');
    const [allHistoryMessages, setAllHistoryMessages] = useState<Message[]>([]);
    const [transferAmt, setTransferAmt] = useState('');
    const [emojiImportText, setEmojiImportText] = useState('');
    const [settingsContextLimit, setSettingsContextLimit] = useState(500);
    const [settingsHideSysLogs, setSettingsHideSysLogs] = useState(false);
    const [preserveContext, setPreserveContext] = useState(true); 
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [selectedEmoji, setSelectedEmoji] = useState<Emoji | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<EmojiCategory | null>(null); // For deletion modal
    const [editContent, setEditContent] = useState('');
    const [isSummarizing, setIsSummarizing] = useState(false);

    // Archive Prompts State
    const [archivePrompts, setArchivePrompts] = useState<{id: string, name: string, content: string}[]>(DEFAULT_ARCHIVE_PROMPTS);
    const [selectedPromptId, setSelectedPromptId] = useState<string>('preset_rational');
    const [editingPrompt, setEditingPrompt] = useState<{id: string, name: string, content: string} | null>(null);

    // --- Multi-Select State ---
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<Set<number>>(new Set());

    // --- Translation State (per-character toggle, global language settings) ---
    const [translationEnabled, setTranslationEnabled] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`chat_translate_enabled_${activeCharacterId}`) || 'false'); } catch { return false; }
    });
    const [translateSourceLang, setTranslateSourceLang] = useState(() => {
        return localStorage.getItem('chat_translate_source_lang') || '日本語';
    });
    const [translateTargetLang, setTranslateTargetLang] = useState(() => {
        return localStorage.getItem('chat_translate_lang') || '中文';
    });
    // Which messages are currently showing "译" version (toggle state only, no API calls)
    const [showingTargetIds, setShowingTargetIds] = useState<Set<number>>(new Set());

    const char = characters.find(c => c.id === activeCharacterId) || characters[0];
    const currentThemeId = char?.bubbleStyle || 'default';
    const activeTheme = useMemo(() => customThemes.find(t => t.id === currentThemeId) || PRESET_THEMES[currentThemeId] || PRESET_THEMES.default, [currentThemeId, customThemes]);
    const draftKey = `chat_draft_${activeCharacterId}`;

    // Filter categories and emojis by active character's visibility (used for both AI prompt and UI)
    const visibleCategories = useMemo(() => categories.filter(cat => {
        if (!cat.allowedCharacterIds || cat.allowedCharacterIds.length === 0) return true;
        return cat.allowedCharacterIds.includes(activeCharacterId);
    }), [categories, activeCharacterId]);

    const aiVisibleEmojis = useMemo(() => {
        const hiddenIds = new Set(categories.filter(c => !visibleCategories.some(vc => vc.id === c.id)).map(c => c.id));
        if (hiddenIds.size === 0) return emojis;
        return emojis.filter(e => !e.categoryId || !hiddenIds.has(e.categoryId));
    }, [emojis, categories, visibleCategories]);

    // --- Initialize Hook ---
    const { isTyping, recallStatus, searchStatus, diaryStatus, lastTokenUsage, tokenBreakdown, setLastTokenUsage, triggerAI } = useChatAI({
        char,
        userProfile,
        apiConfig,
        groups,
        emojis: aiVisibleEmojis,
        categories: visibleCategories,
        addToast,
        setMessages,
        realtimeConfig,
        translationConfig: translationEnabled
            ? { enabled: true, sourceLang: translateSourceLang, targetLang: translateTargetLang }
            : undefined
    });

    const canReroll = !isTyping && messages.length > 0 && messages[messages.length - 1].role === 'assistant';

    // --- Translation: pure frontend toggle (no API calls, bilingual data is already in message content) ---
    const handleTranslateToggle = useCallback((msgId: number) => {
        setShowingTargetIds(prev => {
            const next = new Set(prev);
            if (next.has(msgId)) next.delete(msgId);
            else next.add(msgId);
            return next;
        });
    }, []);

    const loadEmojiData = async () => {
        await DB.initializeEmojiData();
        const [es, cats] = await Promise.all([DB.getEmojis(), DB.getEmojiCategories()]);
        setEmojis(es);
        setCategories(cats);
        if (activeCategory !== 'default' && !cats.some(c => c.id === activeCategory)) {
            setActiveCategory('default');
        }
    };

    // How many messages to load per batch (initial load + each "load more" click)
    const LOAD_BATCH_SIZE = 30;

    const reloadMessages = useCallback(async (requestedVisibleCount: number) => {
        if (!activeCharacterId) return;

        const allMsgs = await DB.getMessagesByCharId(activeCharacterId);
        const chatScopeMsgs = allMsgs
            .filter(m => m.metadata?.source !== 'date')
            .filter(m => !char?.hideBeforeMessageId || m.id >= char.hideBeforeMessageId)
            .filter(m => !(char?.hideSystemLogs && m.role === 'system'));

        setTotalMsgCount(chatScopeMsgs.length);
        setMessages(chatScopeMsgs.slice(-requestedVisibleCount));
    }, [activeCharacterId, char?.hideBeforeMessageId, char?.hideSystemLogs]);

    useEffect(() => {
        if (activeCharacterId) {
            reloadMessages(LOAD_BATCH_SIZE);
            loadEmojiData();
            const savedDraft = localStorage.getItem(draftKey);
            setInput(savedDraft || '');
            if (char) {
                setSettingsContextLimit(char.contextLimit || 500);
                setSettingsHideSysLogs(char.hideSystemLogs || false);
                clearUnread(char.id);
            }
            // Per-character translation toggle
            try {
                setTranslationEnabled(JSON.parse(localStorage.getItem(`chat_translate_enabled_${activeCharacterId}`) || 'false'));
            } catch { setTranslationEnabled(false); }
            setVisibleCount(30);
            visibleCountRef.current = 30;
            lastMsgIdRef.current = null;
            scrollThrottleRef.current = 0;
            setLastTokenUsage(null);
            setReplyTarget(null);
            setSelectionMode(false);
            setSelectedMsgIds(new Set());
            setShowingTargetIds(new Set());
        }
    }, [activeCharacterId, reloadMessages]);

    // Load all messages when history-manager modal opens
    useEffect(() => {
        if (modalType === 'history-manager' && activeCharacterId) {
            DB.getMessagesByCharId(activeCharacterId).then(allMsgs => {
                const filtered = allMsgs
                    .filter(m => m.metadata?.source !== 'date')
                    .filter(m => !(char?.hideSystemLogs && m.role === 'system'));
                setAllHistoryMessages(filtered);
            });
        }
    }, [modalType, activeCharacterId, char?.hideSystemLogs]);

    useEffect(() => {
        const savedPrompts = localStorage.getItem('chat_archive_prompts');
        if (savedPrompts) {
            try {
                const parsed = JSON.parse(savedPrompts);
                const merged = [...DEFAULT_ARCHIVE_PROMPTS, ...parsed.filter((p: any) => !p.id.startsWith('preset_'))];
                setArchivePrompts(merged);
            } catch(e) {}
        }
        const savedId = localStorage.getItem('chat_active_archive_prompt_id');
        if (savedId && archivePrompts.some(p => p.id === savedId)) setSelectedPromptId(savedId);
    }, []);

    useEffect(() => {
        if (activeCharacterId && lastMsgTimestamp > 0) {
            reloadMessages(visibleCountRef.current);
            clearUnread(activeCharacterId);
        }
    }, [lastMsgTimestamp, activeCharacterId, reloadMessages, clearUnread]);

    useEffect(() => {
        visibleCountRef.current = visibleCount;
    }, [visibleCount]);

    const handleInputChange = (val: string) => {
        setInput(val);
        if (val.trim()) localStorage.setItem(draftKey, val);
        else localStorage.removeItem(draftKey);
    };

    useLayoutEffect(() => {
        if (!scrollRef.current || selectionMode) return;
        const currentLastId = messages.length > 0 ? messages[messages.length - 1].id : null;
        // Only auto-scroll when a new message is appended (ID changes),
        // not when loading older history or updating existing messages in-place
        if (currentLastId !== lastMsgIdRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            lastMsgIdRef.current = currentLastId;
        }
    }, [messages, activeCharacterId, selectionMode]);

    useEffect(() => {
        if (isTyping && scrollRef.current && !selectionMode) {
            const now = Date.now();
            if (now - scrollThrottleRef.current > 150) {
                scrollThrottleRef.current = now;
                scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            }
        }
    }, [messages, isTyping, recallStatus, searchStatus, diaryStatus, selectionMode]);

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    // --- Actions ---

    const handleSendText = async (customContent?: string, customType?: MessageType, metadata?: any) => {
        if (!char || (!input.trim() && !customContent)) return;
        const text = customContent || input.trim();
        const type = customType || 'text';

        if (!customContent) { setInput(''); localStorage.removeItem(draftKey); }
        
        if (type === 'image') {
            const recentChat = messages.slice(-10).map(m => {
                const sender = m.role === 'user' ? userProfile.name : char.name;
                return `${sender}: ${m.content.substring(0, 100)}`;
            });
            await DB.saveGalleryImage({
                id: `img-${Date.now()}-${Math.random()}`,
                charId: char.id,
                url: text,
                timestamp: Date.now(),
                savedDate: new Date().toISOString().split('T')[0],
                chatContext: recentChat
            });
            addToast('图片已保存至相册', 'info');
        }

        const msgPayload: any = { charId: char.id, role: 'user', type, content: text, metadata };
        
        if (replyTarget) {
            msgPayload.replyTo = {
                id: replyTarget.id,
                content: replyTarget.content,
                name: replyTarget.role === 'user' ? '我' : char.name
            };
            setReplyTarget(null);
        }

        await DB.saveMessage(msgPayload);
        await reloadMessages(visibleCountRef.current);
        setShowPanel('none');
        
        // Manual trigger only: Removed auto triggerAI call
    };

    const handleReroll = async () => {
        if (isTyping || messages.length === 0) return;

        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role !== 'assistant') return;

        const toDeleteIds: number[] = [];
        let index = messages.length - 1;
        while (index >= 0 && messages[index].role === 'assistant') {
            toDeleteIds.push(messages[index].id);
            index--;
        }

        if (toDeleteIds.length === 0) return;

        await DB.deleteMessages(toDeleteIds);
        const newHistory = messages.slice(0, index + 1);
        setMessages(newHistory);
        addToast('回溯对话中...', 'info');

        triggerAI(newHistory);
    };

    const handleImageSelect = async (file: File) => {
        try {
            const base64 = await processImage(file, { maxWidth: 600, quality: 0.6, forceJpeg: true });
            setShowPanel('none');
            await handleSendText(base64, 'image');
        } catch (err: any) {
            addToast(err.message || '图片处理失败', 'error');
        }
    };

    const handlePanelAction = (type: string, payload?: any) => {
        switch (type) {
            case 'transfer': setModalType('transfer'); break;
            case 'poke': handleSendText('[戳一戳]', 'interaction'); break;
            case 'archive': setModalType('archive-settings'); break;
            case 'settings': setModalType('chat-settings'); break;
            case 'emoji-import': setModalType('emoji-import'); break;
            case 'send-emoji': if (payload) handleSendText(payload.url, 'emoji'); break;
            case 'delete-emoji-req': setSelectedEmoji(payload); setModalType('delete-emoji'); break;
            case 'add-category': setModalType('add-category'); break;
            case 'select-category': setActiveCategory(payload); break;
            case 'category-options': setSelectedCategory(payload); setModalType('category-options'); break;
            case 'delete-category-req': setSelectedCategory(payload); setModalType('delete-category'); break;
        }
    };

    // --- Modal Handlers ---

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) {
             addToast('请输入分类名称', 'error');
             return;
        }
        const newCat = { id: `cat-${Date.now()}`, name: newCategoryName.trim() };
        await DB.saveEmojiCategory(newCat);
        await loadEmojiData();
        setActiveCategory(newCat.id);
        setModalType('none');
        setNewCategoryName('');
        addToast('分类创建成功', 'success');
    };

    const handleImportEmoji = async () => {
        if (!emojiImportText.trim()) return;
        const lines = emojiImportText.split('\n');
        const targetCatId = activeCategory === 'default' ? undefined : activeCategory;

        for (const line of lines) {
            const parts = line.split('--');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const url = parts.slice(1).join('--').trim();
                if (name && url) {
                    await DB.saveEmoji(name, url, targetCatId);
                }
            }
        }
        await loadEmojiData();
        setModalType('none');
        setEmojiImportText('');
        addToast('表情包导入成功', 'success');
    };

    const handleDeleteCategory = async () => {
        if (!selectedCategory) return;
        await DB.deleteEmojiCategory(selectedCategory.id);
        await loadEmojiData();
        setActiveCategory('default');
        setModalType('none');
        setSelectedCategory(null);
        addToast('分类及包含表情已删除', 'success');
    };

    const handleSaveCategoryVisibility = async (categoryId: string, allowedCharacterIds: string[] | undefined) => {
        const cat = categories.find(c => c.id === categoryId);
        if (!cat) return;
        await DB.saveEmojiCategory({ ...cat, allowedCharacterIds });
        await loadEmojiData();
        setSelectedCategory(null);
        addToast(allowedCharacterIds ? `已设置 ${allowedCharacterIds.length} 个角色可见` : '已设为所有角色可见', 'success');
    };

    const handleSavePrompt = () => {
        if (!editingPrompt || !editingPrompt.name.trim() || !editingPrompt.content.trim()) {
            addToast('请填写完整', 'error');
            return;
        }
        setArchivePrompts(prev => {
            let next;
            if (prev.some(p => p.id === editingPrompt.id)) {
                next = prev.map(p => p.id === editingPrompt.id ? editingPrompt : p);
            } else {
                next = [...prev, editingPrompt];
            }
            const customOnly = next.filter(p => !p.id.startsWith('preset_'));
            localStorage.setItem('chat_archive_prompts', JSON.stringify(customOnly));
            return next;
        });
        setSelectedPromptId(editingPrompt.id);
        setModalType('archive-settings');
        setEditingPrompt(null);
    };

    const handleDeletePrompt = (id: string) => {
        if (id.startsWith('preset_')) {
            addToast('默认预设不可删除', 'error');
            return;
        }
        setArchivePrompts(prev => {
            const next = prev.filter(p => p.id !== id);
            const customOnly = next.filter(p => !p.id.startsWith('preset_'));
            localStorage.setItem('chat_archive_prompts', JSON.stringify(customOnly));
            return next;
        });
        if (selectedPromptId === id) setSelectedPromptId('preset_rational');
        addToast('预设已删除', 'success');
    };

    const createNewPrompt = () => {
        setEditingPrompt({ id: `custom_${Date.now()}`, name: '新预设', content: DEFAULT_ARCHIVE_PROMPTS[0].content });
        setModalType('prompt-editor');
    };

    const editSelectedPrompt = () => {
        const p = archivePrompts.find(a => a.id === selectedPromptId);
        if (!p) return;
        if (p.id.startsWith('preset_')) {
            setEditingPrompt({ id: `custom_${Date.now()}`, name: `${p.name} (Copy)`, content: p.content });
        } else {
            setEditingPrompt({ ...p });
        }
        setModalType('prompt-editor');
    };

    const handleBgUpload = async (file: File) => {
        try {
            const dataUrl = await processImage(file, { skipCompression: true });
            updateCharacter(char.id, { chatBackground: dataUrl });
            addToast('聊天背景已更新', 'success');
        } catch(err: any) {
            addToast(err.message, 'error');
        }
    };

    const saveSettings = () => {
        updateCharacter(char.id, { 
            contextLimit: settingsContextLimit,
            hideSystemLogs: settingsHideSysLogs
        });
        setModalType('none');
        addToast('设置已保存', 'success');
    };

    const handleClearHistory = async () => {
        if (!char) return;
        if (preserveContext) {
            const allMessages = await DB.getMessagesByCharId(char.id);
            const toKeep = allMessages.slice(-10);
            const toKeepIds = new Set(toKeep.map(m => m.id));
            const toDelete = allMessages.filter(m => !toKeepIds.has(m.id));
            if (toDelete.length === 0) {
                addToast('消息太少，无需清理', 'info');
                return;
            }
            await DB.deleteMessages(toDelete.map(m => m.id));
            setMessages(toKeep);
            setTotalMsgCount(toKeep.length);
            setVisibleCount(LOAD_BATCH_SIZE);
            visibleCountRef.current = LOAD_BATCH_SIZE;
            addToast(`已清理 ${toDelete.length} 条历史，保留最近10条`, 'success');
        } else {
            await DB.clearMessages(char.id);
            setMessages([]);
            setTotalMsgCount(0);
            setVisibleCount(LOAD_BATCH_SIZE);
            visibleCountRef.current = LOAD_BATCH_SIZE;
            addToast('已清空', 'success');
        }
        setModalType('none');
    };

    const handleSetHistoryStart = (messageId: number | undefined) => {
        updateCharacter(char.id, { hideBeforeMessageId: messageId });
        setModalType('none');
        addToast(messageId ? '已隐藏历史消息' : '已恢复全部历史记录', 'success');
    };

    const handleFullArchive = async () => {
        if (!apiConfig.apiKey || !char) {
            addToast('请先配置 API Key', 'error');
            return;
        }
        const allMessages = await DB.getMessagesByCharId(char.id);
        const msgsByDate: Record<string, Message[]> = {};
        allMessages
        .filter(m => !char.hideBeforeMessageId || m.id >= char.hideBeforeMessageId)
        .forEach(m => {
            const d = new Date(m.timestamp);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (!msgsByDate[dateStr]) msgsByDate[dateStr] = [];
            msgsByDate[dateStr].push(m);
        });

        const datesToProcess = Object.keys(msgsByDate).sort();
        if (datesToProcess.length === 0) {
            addToast('聊天记录为空，无法归档', 'info');
            return;
        }

        setIsSummarizing(true);
        setShowPanel('none');
        setModalType('none');
        
        try {
            let processedCount = 0;
            const newMemories: MemoryFragment[] = [];
            const templateObj = archivePrompts.find(p => p.id === selectedPromptId) || DEFAULT_ARCHIVE_PROMPTS[0];
            const template = templateObj.content;

            for (const dateStr of datesToProcess) {
                const dayMsgs = msgsByDate[dateStr];
                const rawLog = dayMsgs.map(m => `[${formatTime(m.timestamp)}] ${m.role === 'user' ? userProfile.name : char.name}: ${m.type === 'image' ? '[Image]' : m.content}`).join('\n');
                
                let prompt = template;
                prompt = prompt.replace(/\$\{dateStr\}/g, dateStr);
                prompt = prompt.replace(/\$\{char\.name\}/g, char.name);
                prompt = prompt.replace(/\$\{userProfile\.name\}/g, userProfile.name);
                prompt = prompt.replace(/\$\{rawLog.*?\}/g, rawLog.substring(0, 200000));

                const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                    body: JSON.stringify({
                        model: apiConfig.model,
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.5,
                        max_tokens: 8000 
                    })
                });

                if (!response.ok) throw new Error(`API Error on ${dateStr}`);
                const data = await safeResponseJson(response);
                let summary = data.choices?.[0]?.message?.content || '';
                summary = summary.trim().replace(/^["']|["']$/g, ''); 

                if (summary) {
                    newMemories.push({ id: `mem-${Date.now()}`, date: dateStr, summary: summary, mood: 'archive' });
                    processedCount++;
                }
                await new Promise(r => setTimeout(r, 500));
            }

            const finalMemories = [...(char.memories || []), ...newMemories];
            updateCharacter(char.id, { memories: finalMemories });
            addToast(`成功归档 ${processedCount} 天`, 'success');

        } catch (e: any) {
            addToast(`归档中断: ${e.message}`, 'error');
        } finally {
            setIsSummarizing(false);
        }
    };

    // --- Message Management ---
    const handleDeleteMessage = async () => {
        if (!selectedMessage) return;
        await DB.deleteMessage(selectedMessage.id);
        setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
        setTotalMsgCount(prev => Math.max(0, prev - 1));
        setModalType('none');
        setSelectedMessage(null);
        addToast('消息已删除', 'success');
    };

    const confirmEditMessage = async () => {
        if (!selectedMessage) return;
        await DB.updateMessage(selectedMessage.id, editContent);
        setMessages(prev => prev.map(m => m.id === selectedMessage.id ? { ...m, content: editContent } : m));
        setModalType('none');
        setSelectedMessage(null);
        addToast('消息已修改', 'success');
    };

    const handleReplyMessage = () => {
        if (!selectedMessage) return;
        setReplyTarget({
            ...selectedMessage,
            metadata: { ...selectedMessage.metadata, senderName: selectedMessage.role === 'user' ? '我' : char.name }
        });
        setModalType('none');
    };

    const handleCopyMessage = () => {
        if (!selectedMessage) return;
        navigator.clipboard.writeText(selectedMessage.content);
        setModalType('none');
        setSelectedMessage(null);
        addToast('已复制到剪贴板', 'success');
    };

    const handleDeleteEmoji = async () => {
        if (!selectedEmoji) return;
        await DB.deleteEmoji(selectedEmoji.name);
        await loadEmojiData();
        setModalType('none');
        setSelectedEmoji(null);
        addToast('表情包已删除', 'success');
    };

    // --- Batch Selection ---
    const handleEnterSelectionMode = () => {
        if (selectedMessage) {
            setSelectedMsgIds(new Set([selectedMessage.id]));
            setSelectionMode(true);
            setModalType('none');
            setSelectedMessage(null);
        }
    };

    const toggleMessageSelection = useCallback((id: number) => {
        setSelectedMsgIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    // Memoized callbacks for MessageItem to avoid busting React.memo
    const handleMessageLongPress = useCallback((msg: Message) => {
        setSelectedMessage(msg);
        setModalType('message-options');
    }, []);

    const handleBatchDelete = async () => {
        if (selectedMsgIds.size === 0) return;
        const deleteCount = selectedMsgIds.size;
        await DB.deleteMessages(Array.from(selectedMsgIds));
        setMessages(prev => prev.filter(m => !selectedMsgIds.has(m.id)));
        setTotalMsgCount(prev => Math.max(0, prev - deleteCount));
        addToast(`已删除 ${deleteCount} 条消息`, 'success');
        setSelectionMode(false);
        setSelectedMsgIds(new Set());
    };

    // --- Forward Chat Records ---
    const [showForwardModal, setShowForwardModal] = useState(false);

    const handleForwardSelected = () => {
        if (selectedMsgIds.size === 0) return;
        setShowForwardModal(true);
    };

    const handleForwardToCharacter = async (targetCharId: string) => {
        if (!char) return;
        const selectedMsgs = messages
            .filter(m => selectedMsgIds.has(m.id))
            .sort((a, b) => a.id - b.id);

        if (selectedMsgs.length === 0) return;

        // Build preview text (first few messages)
        const previewLines = selectedMsgs.slice(0, 4).map(m => {
            const sender = m.role === 'user' ? userProfile.name : char.name;
            const text = m.type === 'text' ? m.content.slice(0, 30) : `[${m.type === 'image' ? '图片' : m.type === 'emoji' ? '表情' : m.type}]`;
            return `${sender}: ${text}`;
        });
        if (selectedMsgs.length > 4) previewLines.push(`... 共 ${selectedMsgs.length} 条消息`);

        const forwardData = {
            fromUserName: userProfile.name,
            fromCharName: char.name,
            count: selectedMsgs.length,
            preview: previewLines,
            messages: selectedMsgs.map(m => ({
                role: m.role,
                type: m.type,
                content: m.content,
                timestamp: m.timestamp || Date.now()
            }))
        };

        // Save forward card to target character's chat
        await DB.saveMessage({
            charId: targetCharId,
            role: 'user',
            type: 'chat_forward' as MessageType,
            content: JSON.stringify(forwardData),
        });

        // Also save a copy in the current chat so the user can see what they forwarded
        const targetChar = characters.find(c => c.id === targetCharId);
        if (char.id !== targetCharId) {
            await DB.saveMessage({
                charId: char.id,
                role: 'system',
                type: 'text' as MessageType,
                content: `[转发了 ${selectedMsgs.length} 条聊天记录给 ${targetChar?.name || ''}]`,
            });
            // Refresh messages to show the forwarding system message
            reloadMessages(visibleCountRef.current);
        }

        addToast(`已转发 ${selectedMsgs.length} 条记录给 ${targetChar?.name || ''}`, 'success');
        setShowForwardModal(false);
        setSelectionMode(false);
        setSelectedMsgIds(new Set());
    };

    const displayMessages = useMemo(() => messages
        .filter(m => m.metadata?.source !== 'date')
        .filter(m => !char.hideBeforeMessageId || m.id >= char.hideBeforeMessageId)
        .filter(m => { if (char.hideSystemLogs && m.role === 'system') return false; return true; })
        .slice(-visibleCount),
        [messages, char?.hideBeforeMessageId, char?.hideSystemLogs, visibleCount]);

    const collapsedCount = Math.max(0, totalMsgCount - displayMessages.length);

    // Reset active category if it becomes invisible for the current character
    useEffect(() => {
        if (activeCategory !== 'default' && visibleCategories.length > 0 && !visibleCategories.some(c => c.id === activeCategory)) {
            setActiveCategory('default');
        }
    }, [visibleCategories, activeCategory]);

    // Build a set of hidden category IDs for quick lookup
    const hiddenCategoryIds = useMemo(() => {
        const visible = new Set(visibleCategories.map(c => c.id));
        return new Set(categories.filter(c => !visible.has(c.id)).map(c => c.id));
    }, [categories, visibleCategories]);

    // Memoize filtered emojis for ChatInputArea
    const filteredEmojis = useMemo(() => emojis.filter(e => {
        // Exclude emojis from hidden categories
        if (e.categoryId && hiddenCategoryIds.has(e.categoryId)) return false;
        if (activeCategory === 'default') return !e.categoryId || e.categoryId === 'default';
        return e.categoryId === activeCategory;
    }), [emojis, activeCategory, hiddenCategoryIds]);

    // Memoize ChatInputArea callbacks
    const handleSendCallback = useCallback(() => handleSendText(), [char, input, replyTarget]);
    const handleCharSelectCallback = useCallback((id: string) => { setActiveCharacterId(id); setShowPanel('none'); }, []);

    return (
        <div 
            className="flex flex-col h-full bg-[#f1f5f9] overflow-hidden relative font-sans transition-[background-image] duration-500"
            style={{ 
                backgroundImage: char.chatBackground ? `url(${char.chatBackground})` : 'none',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        >
             {activeTheme.customCss && <style>{activeTheme.customCss}</style>}

             <ChatModals 
                modalType={modalType} setModalType={setModalType}
                transferAmt={transferAmt} setTransferAmt={setTransferAmt}
                emojiImportText={emojiImportText} setEmojiImportText={setEmojiImportText}
                settingsContextLimit={settingsContextLimit} setSettingsContextLimit={setSettingsContextLimit}
                settingsHideSysLogs={settingsHideSysLogs} setSettingsHideSysLogs={setSettingsHideSysLogs}
                preserveContext={preserveContext} setPreserveContext={setPreserveContext}
                editContent={editContent} setEditContent={setEditContent}
                archivePrompts={archivePrompts} selectedPromptId={selectedPromptId} setSelectedPromptId={setSelectedPromptId}
                editingPrompt={editingPrompt} setEditingPrompt={setEditingPrompt} isSummarizing={isSummarizing}
                selectedMessage={selectedMessage} selectedEmoji={selectedEmoji} activeCharacter={char} messages={messages}
                allHistoryMessages={allHistoryMessages}
                
                newCategoryName={newCategoryName} setNewCategoryName={setNewCategoryName} onAddCategory={handleAddCategory}
                selectedCategory={selectedCategory}

                onTransfer={() => { if(transferAmt) handleSendText(`[转账]`, 'transfer', { amount: transferAmt }); setModalType('none'); }}
                onImportEmoji={handleImportEmoji}
                onSaveSettings={saveSettings} onBgUpload={handleBgUpload} onRemoveBg={() => updateCharacter(char.id, { chatBackground: undefined })}
                onClearHistory={handleClearHistory} onArchive={handleFullArchive}
                onCreatePrompt={createNewPrompt} onEditPrompt={editSelectedPrompt} onSavePrompt={handleSavePrompt} onDeletePrompt={handleDeletePrompt}
                onSetHistoryStart={handleSetHistoryStart} onEnterSelectionMode={handleEnterSelectionMode}
                onReplyMessage={handleReplyMessage} onEditMessageStart={() => { if (selectedMessage) { setEditContent(selectedMessage.content); setModalType('edit-message'); } }}
                onConfirmEditMessage={confirmEditMessage} onDeleteMessage={handleDeleteMessage} onCopyMessage={handleCopyMessage} onDeleteEmoji={handleDeleteEmoji} onDeleteCategory={handleDeleteCategory}
                allCharacters={characters} onSaveCategoryVisibility={handleSaveCategoryVisibility}
                translationEnabled={translationEnabled}
                onToggleTranslation={() => { const next = !translationEnabled; setTranslationEnabled(next); localStorage.setItem(`chat_translate_enabled_${activeCharacterId}`, JSON.stringify(next)); if (!next) { setShowingTargetIds(new Set()); } }}
                translateSourceLang={translateSourceLang}
                translateTargetLang={translateTargetLang}
                onSetTranslateSourceLang={(lang: string) => { setTranslateSourceLang(lang); localStorage.setItem('chat_translate_source_lang', lang); setShowingTargetIds(new Set()); }}
                onSetTranslateLang={(lang: string) => { setTranslateTargetLang(lang); localStorage.setItem('chat_translate_lang', lang); setShowingTargetIds(new Set()); }}
             />
             
             <ChatHeader 
                selectionMode={selectionMode}
                selectedCount={selectedMsgIds.size}
                onCancelSelection={() => { setSelectionMode(false); setSelectedMsgIds(new Set()); }}
                activeCharacter={char}
                isTyping={isTyping}
                isSummarizing={isSummarizing}
                lastTokenUsage={lastTokenUsage}
                tokenBreakdown={tokenBreakdown}
                onClose={closeApp}
                onTriggerAI={() => triggerAI(messages)}
                onShowCharsPanel={() => setShowPanel('chars')}
             />

            <div ref={scrollRef} className="flex-1 overflow-y-auto pt-6 pb-6 no-scrollbar" style={{ backgroundImage: activeTheme.type === 'custom' && activeTheme.user.backgroundImage ? 'none' : undefined }}>
                {collapsedCount > 0 && (
                    <div className="flex justify-center mb-6">
                        <button onClick={async () => {
                            const nextVisibleCount = visibleCount + LOAD_BATCH_SIZE;
                            visibleCountRef.current = nextVisibleCount;
                            setVisibleCount(nextVisibleCount);
                            await reloadMessages(nextVisibleCount);
                        }} className="px-4 py-2 bg-white/50 backdrop-blur-sm rounded-full text-xs text-slate-500 shadow-sm border border-white hover:bg-white transition-colors">加载历史消息 ({collapsedCount})</button>
                    </div>
                )}

                {displayMessages.map((m, i) => {
                    const prevRole = i > 0 ? displayMessages[i - 1].role : null;
                    const nextRole = i < displayMessages.length - 1 ? displayMessages[i + 1].role : null;
                    return (
                        <MessageItem
                            key={m.id || i}
                            msg={m}
                            isFirstInGroup={prevRole !== m.role}
                            isLastInGroup={nextRole !== m.role}
                            activeTheme={activeTheme}
                            charAvatar={char.avatar}
                            charName={char.name}
                            userAvatar={userProfile.avatar}
                            onLongPress={handleMessageLongPress}
                            selectionMode={selectionMode}
                            isSelected={selectedMsgIds.has(m.id)}
                            onToggleSelect={toggleMessageSelection}
                            translationEnabled={translationEnabled && m.type === 'text' && m.role === 'assistant'}
                            isShowingTarget={showingTargetIds.has(m.id)}
                            onTranslateToggle={handleTranslateToggle}
                        />
                    );
                })}
                
                {(isTyping || recallStatus || searchStatus || diaryStatus) && !selectionMode && (
                    <div className="flex items-end gap-3 px-3 mb-6 animate-fade-in">
                        <img src={char.avatar} className="w-9 h-9 rounded-[10px] object-cover" />
                        <div className="bg-white px-4 py-3 rounded-2xl shadow-sm">
                            {searchStatus ? (
                                <div className="flex items-center gap-2 text-xs text-emerald-500 font-medium">
                                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    🔍 {searchStatus}
                                </div>
                            ) : recallStatus ? (
                                <div className="flex items-center gap-2 text-xs text-indigo-500 font-medium">
                                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    {recallStatus}
                                </div>
                            ) : diaryStatus ? (
                                <div className="flex items-center gap-2 text-xs text-amber-600 font-medium">
                                    <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    📖 {diaryStatus}
                                </div>
                            ) : (
                                <div className="flex gap-1"><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75"></div><div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150"></div></div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="relative z-40">
                {replyTarget && (
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                        <div className="flex items-center gap-2 truncate"><span className="font-bold text-slate-700">正在回复:</span><span className="truncate max-w-[200px]">{replyTarget.content}</span></div>
                        <button onClick={() => setReplyTarget(null)} className="p-1 text-slate-400 hover:text-slate-600">×</button>
                    </div>
                )}
                
                <ChatInputArea
                    input={input} setInput={handleInputChange}
                    isTyping={isTyping} selectionMode={selectionMode}
                    showPanel={showPanel} setShowPanel={setShowPanel}
                    onSend={handleSendCallback}
                    onDeleteSelected={handleBatchDelete}
                    onForwardSelected={handleForwardSelected}
                    selectedCount={selectedMsgIds.size}
                    emojis={filteredEmojis}
                    characters={characters} activeCharacterId={activeCharacterId}
                    onCharSelect={handleCharSelectCallback}
                    customThemes={customThemes} onUpdateTheme={(id) => updateCharacter(char.id, { bubbleStyle: id })}
                    onRemoveTheme={removeCustomTheme} activeThemeId={currentThemeId}
                    onPanelAction={handlePanelAction}
                    onImageSelect={handleImageSelect}
                    isSummarizing={isSummarizing}
                    categories={visibleCategories}
                    activeCategory={activeCategory}
                    onReroll={handleReroll}
                    canReroll={canReroll}
                />
            </div>

            {/* Forward Modal */}
            <Modal isOpen={showForwardModal} title="转发聊天记录" onClose={() => setShowForwardModal(false)}>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                    <p className="text-xs text-slate-400 mb-3">选择要转发给的角色 (已选 {selectedMsgIds.size} 条消息)</p>
                    {characters.filter(c => c.id !== activeCharacterId).map(c => (
                        <button
                            key={c.id}
                            onClick={() => handleForwardToCharacter(c.id)}
                            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 active:scale-[0.98] transition-all border border-slate-100"
                        >
                            <img src={c.avatar} className="w-10 h-10 rounded-xl object-cover" />
                            <div className="flex-1 text-left">
                                <div className="font-bold text-sm text-slate-700">{c.name}</div>
                                <div className="text-[10px] text-slate-400 truncate">{c.description}</div>
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                        </button>
                    ))}
                    {characters.filter(c => c.id !== activeCharacterId).length === 0 && (
                        <div className="text-center text-xs text-slate-400 py-8">没有其他角色可以转发</div>
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default Chat;

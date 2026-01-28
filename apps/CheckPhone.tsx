




import React, { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { CharacterProfile, PhoneEvidence, PhoneCustomApp } from '../types';
import { ContextBuilder } from '../utils/context';
import Modal from '../components/os/Modal';

// --- Debug Component ---
const LayoutInspector: React.FC = () => {
    const [stats, setStats] = useState({ w: 0, h: 0, vh: 0, top: 0 });
    
    useEffect(() => {
        const update = () => {
            setStats({
                w: window.innerWidth,
                h: window.innerHeight,
                vh: window.visualViewport?.height || 0,
                top: window.visualViewport?.offsetTop || 0
            });
        };
        window.addEventListener('resize', update);
        window.visualViewport?.addEventListener('resize', update);
        window.visualViewport?.addEventListener('scroll', update);
        update();
        return () => {
            window.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('scroll', update);
        };
    }, []);

    return (
        <div className="absolute top-0 right-0 z-[9999] bg-red-500/80 text-white text-[10px] font-mono p-1 pointer-events-none select-none">
            Win: {stats.w}x{stats.h}<br/>
            VV: {stats.vh.toFixed(0)} (y:{stats.top.toFixed(0)})
        </div>
    );
};

const CheckPhone: React.FC = () => {
    const { closeApp, characters, activeCharacterId, updateCharacter, apiConfig, addToast, userProfile } = useOS();
    const [view, setView] = useState<'select' | 'phone'>('select');
    // activeAppId: 'home' | 'chat_detail' | 'app_id'
    const [activeAppId, setActiveAppId] = useState<string>('home'); 
    const [targetChar, setTargetChar] = useState<CharacterProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Chat Detail State
    const [selectedChatRecord, setSelectedChatRecord] = useState<PhoneEvidence | null>(null);
    const chatEndRef = useRef<HTMLDivElement>(null);
    
    // Custom App Creation State
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newAppName, setNewAppName] = useState('');
    const [newAppIcon, setNewAppIcon] = useState('📱');
    const [newAppColor, setNewAppColor] = useState('#3b82f6');
    const [newAppPrompt, setNewAppPrompt] = useState('');

    // Debug Toggle
    const [showDebug, setShowDebug] = useState(false);

    // Derived state for evidence records
    const records = targetChar?.phoneState?.records || [];
    const customApps = targetChar?.phoneState?.customApps || [];

    useEffect(() => {
        if (targetChar) {
            // Keep targetChar in sync with global state if it updates (e.g. deletion)
            const updated = characters.find(c => c.id === targetChar.id);
            if (updated) {
                setTargetChar(updated);
                // Update selected record ref if open
                if (selectedChatRecord) {
                    const freshRecord = updated.phoneState?.records?.find(r => r.id === selectedChatRecord.id);
                    if (freshRecord) setSelectedChatRecord(freshRecord);
                }
            }
        }
    }, [characters]);

    // Auto scroll to bottom of chat detail
    useEffect(() => {
        if (activeAppId === 'chat_detail' && chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [selectedChatRecord?.detail, activeAppId]);

    const handleSelectChar = (c: CharacterProfile) => {
        setTargetChar(c);
        setView('phone');
        setActiveAppId('home');
    };

    const handleExitPhone = () => {
        setView('select');
        setTargetChar(null);
        setActiveAppId('home');
    };

    const handleDeleteRecord = async (record: PhoneEvidence) => {
        if (!targetChar) return;
        
        const newRecords = (targetChar.phoneState?.records || []).filter(r => r.id !== record.id);
        updateCharacter(targetChar.id, { 
            phoneState: { ...targetChar.phoneState, records: newRecords } 
        });

        if (record.systemMessageId) {
            await DB.deleteMessage(record.systemMessageId);
        }

        if (selectedChatRecord?.id === record.id) {
            setActiveAppId('chat'); // Go back to list
            setSelectedChatRecord(null);
        }

        addToast('记录已删除', 'success');
    };

    const handleDeleteApp = (appId: string) => {
        if (!targetChar) return;
        const newApps = (targetChar.phoneState?.customApps || []).filter(a => a.id !== appId);
        updateCharacter(targetChar.id, {
            phoneState: { ...targetChar.phoneState, customApps: newApps }
        });
        addToast('App 已卸载', 'success');
    };

    const handleCreateCustomApp = () => {
        if (!targetChar || !newAppName || !newAppPrompt) return;
        
        const newApp: PhoneCustomApp = {
            id: `app-${Date.now()}`,
            name: newAppName,
            icon: newAppIcon,
            color: newAppColor,
            prompt: newAppPrompt
        };

        const currentApps = targetChar.phoneState?.customApps || [];
        updateCharacter(targetChar.id, {
            phoneState: { ...targetChar.phoneState, customApps: [...currentApps, newApp] }
        });

        setShowCreateModal(false);
        setNewAppName('');
        setNewAppPrompt('');
        addToast(`已安装 ${newAppName}`, 'success');
    };

    // Calculate Time Gap - Duplicated logic from other apps for consistent experience
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

    // --- Core Generation Logic ---

    const handleGenerate = async (type: string, customPrompt?: string) => {
        if (!targetChar || !apiConfig.apiKey) {
            addToast('配置错误', 'error');
            return;
        }
        setIsLoading(true);

        try {
            // Include full memory details for accuracy
            const context = ContextBuilder.buildCoreContext(targetChar, userProfile, true);
            const msgs = await DB.getMessagesByCharId(targetChar.id);
            
            const lastMsg = msgs[msgs.length - 1];
            const timeGap = getTimeGapHint(lastMsg?.timestamp);

            const recentMsgs = msgs.slice(-50).map(m => {
                const roleName = m.role === 'user' ? userProfile.name : targetChar.name;
                const content = m.type === 'text' ? m.content : `[${m.type}]`;
                return `${roleName}: ${content}`;
            }).join('\n');

            let promptInstruction = "";
            let logPrefix = "";

            if (customPrompt) {
                promptInstruction = `用户正在查看你的手机 App: "${type}"。
该 App 的功能/用户想看的内容是: "${customPrompt}"。
请生成 2-4 条符合该 App 功能的记录。
必须符合你的人设（例如银行余额要符合身份，备忘录要符合性格）。
格式JSON数组: [{ "title": "标题/项目名", "detail": "详细内容/金额/状态", "value": "可选的数值状态(如 +100)" }, ...]`;
                const customApp = customApps.find(a => a.id === type);
                logPrefix = customApp ? customApp.name : type;
            } else {
                if (type === 'chat') {
                    promptInstruction = `生成 3 个该角色手机聊天软件(Message/Line)中的**对话片段**。
    要求：
    1. **自动匹配角色**: 根据人设，虚构 3 个合理的联系人（如：如果是学生，联系人可以是“辅导员”、“社团学长”；如果是杀手，联系人可以是“中间人”）。不要使用“User”作为联系人。
    2. **对话感**: 内容必须是有来有回的对话脚本（3-4句），体现他们之间的关系。
    3. **格式**: 必须严格使用 "我:..." 代表主角(你)，"对方:..." 或 "人名:..." 代表联系人。
    格式JSON数组: [{ "title": "联系人名称 (身份)", "detail": "对方: 最近怎么样？\\n我: 还活着。\\n对方: 那就好。" }, ...]`;
                    logPrefix = "聊天软件";
                } else if (type === 'call') {
                    promptInstruction = `生成 3 条该角色的近期**通话记录**。
    格式JSON数组: [{ "title": "联系人名称", "value": "呼入 (5分钟) / 未接 / 呼出 (30秒)", "detail": "关于下周聚会的事..." }, ...]`;
                    logPrefix = "通话记录";
                } else if (type === 'order') {
                    promptInstruction = `生成 3 条该角色最近的购物订单。
    格式JSON数组: [{ "title": "商品名", "detail": "状态" }, ...]`;
                    logPrefix = "购物APP";
                } else if (type === 'delivery') {
                    promptInstruction = `生成 3 条该角色最近的外卖记录。
    格式JSON数组: [{ "title": "店名", "detail": "菜品" }, ...]`;
                    logPrefix = "外卖APP";
                } else if (type === 'social') {
                    promptInstruction = `生成 2 条该角色的朋友圈/社交媒体动态。
    格式JSON数组: [{ "title": "时间/状态", "detail": "正文内容" }, ...]`;
                    logPrefix = "朋友圈";
                }
            }

            const fullPrompt = `${context}\n\n### [Current Status]\n时间距离上次互动: ${timeGap}\n\n### [Recent Chat Context]\n${recentMsgs}\n\n### [Task]\n${promptInstruction}\n请根据[Current Status]和人设调整生成内容的时间戳和情绪。如果很久没聊天，记录可能是近期的独处状态；如果刚聊过，记录可能与聊天内容相关。`;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: "user", content: fullPrompt }],
                    temperature: 0.8
                })
            });

            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            let content = data.choices[0].message.content;
            content = content.replace(/```json/g, '').replace(/```/g, '').trim();
            const firstBracket = content.indexOf('[');
            const lastBracket = content.lastIndexOf(']');
            if (firstBracket > -1 && lastBracket > -1) content = content.substring(firstBracket, lastBracket + 1);
            
            let json = [];
            try { json = JSON.parse(content); } catch (e) { json = []; }

            const newRecordsToAdd: PhoneEvidence[] = [];

            if (Array.isArray(json)) {
                for (const item of json) {
                    const recordTitle = item.title || 'Unknown';
                    const recordDetail = item.detail || '...';
                    
                    let sysMsgContent = "";
                    if (type === 'chat') {
                        sysMsgContent = `[系统: ${targetChar.name} 与 "${recordTitle}" 的聊天记录-内容涉及: ${recordDetail.replace(/\n/g, ' ')}]`;
                    } else {
                        sysMsgContent = `[系统: ${targetChar.name}的手机(${logPrefix}) 显示: ${recordTitle} - ${recordDetail}]`;
                    }
                    
                    await DB.saveMessage({
                        charId: targetChar.id,
                        role: 'system',
                        type: 'text',
                        content: sysMsgContent
                    });
                    
                    const currentMsgs = await DB.getMessagesByCharId(targetChar.id);
                    const savedMsg = currentMsgs[currentMsgs.length - 1];
                    
                    newRecordsToAdd.push({
                        id: `rec-${Date.now()}-${Math.random()}`,
                        type: type, 
                        title: recordTitle,
                        detail: recordDetail,
                        value: item.value,
                        timestamp: Date.now(),
                        systemMessageId: savedMsg?.id 
                    });
                    
                    await new Promise(r => setTimeout(r, 50)); 
                }
            }

            const existingRecords = targetChar.phoneState?.records || [];
            updateCharacter(targetChar.id, {
                phoneState: { ...targetChar.phoneState, records: [...existingRecords, ...newRecordsToAdd] }
            });

            addToast(`已刷新 ${newRecordsToAdd.length} 条数据`, 'success');

        } catch (e: any) {
            console.error(e);
            addToast('解析失败，请重试', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // --- Continue Chat Logic ---

    const handleContinueChat = async () => {
        if (!selectedChatRecord || !targetChar || !apiConfig.apiKey) return;
        setIsLoading(true);

        try {
            const context = ContextBuilder.buildCoreContext(targetChar, userProfile, true); // Enable detailed context
            const prompt = `${context}

### [Task: Continue Conversation]
Roleplay: You are "${targetChar.name}". You are chatting on your phone with "${selectedChatRecord.title}".
Current History:
"""
${selectedChatRecord.detail}
"""

Task: Please continue this conversation for 3-5 more turns. 
Style: Casual, IM style.
Format: 
- Use "我: ..." for yourself (${targetChar.name}).
- Use "对方: ..." for the contact (${selectedChatRecord.title}).
- Only output the new dialogue lines. Do NOT repeat history.
`;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.85
                })
            });

            if (response.ok) {
                const data = await response.json();
                let newLines = data.choices[0].message.content.trim();
                
                // Clean up any markdown
                newLines = newLines.replace(/```/g, '');

                // Append to existing record
                const updatedDetail = `${selectedChatRecord.detail}\n${newLines}`;
                
                // Update Local State
                const updatedRecord = { ...selectedChatRecord, detail: updatedDetail };
                setSelectedChatRecord(updatedRecord);

                // Update Character Profile
                const allRecords = targetChar.phoneState?.records || [];
                const updatedRecords = allRecords.map(r => r.id === updatedRecord.id ? updatedRecord : r);
                updateCharacter(targetChar.id, {
                    phoneState: { ...targetChar.phoneState, records: updatedRecords }
                });
                
                // Note: We deliberately do NOT add a system message to the main chat context here.
                // This is "pure viewing" mode.
            }

        } catch (e) {
            console.error(e);
            addToast('续写失败', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // --- Renderers ---

    const renderHeader = (title: string, backAction: () => void, extraAction?: React.ReactNode) => (
        <div className="h-14 flex items-center justify-between px-4 bg-white/80 backdrop-blur-md text-slate-800 shrink-0 z-20 border-b border-slate-200">
            <button onClick={backAction} className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
            </button>
            <span className="font-bold text-base tracking-wide truncate max-w-[200px]">{title}</span>
            <div className="w-8 flex justify-end">{extraAction}</div>
        </div>
    );

    const renderChatList = () => {
        const list = records.filter(r => r.type === 'chat').sort((a,b) => b.timestamp - a.timestamp);
        return (
            <div className="fixed inset-0 w-full h-full flex flex-col bg-slate-50 z-10">
                {renderHeader('Message', () => setActiveAppId('home'))}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-24 overscroll-contain">
                    {list.length === 0 && <div className="text-center text-slate-400 mt-20 text-xs">暂无聊天记录</div>}
                    {list.map(r => (
                        <div 
                            key={r.id} 
                            onClick={() => { setSelectedChatRecord(r); setActiveAppId('chat_detail'); }}
                            className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative group animate-slide-up active:scale-98 transition-transform cursor-pointer"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center text-xl shadow-inner shrink-0">
                                    👤
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <div className="font-bold text-slate-700 text-sm truncate">{r.title}</div>
                                        <div className="text-[10px] text-slate-400">{new Date(r.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                                    </div>
                                    <div className="text-xs text-slate-500 truncate">
                                        {r.detail.split('\n').pop() || '...'}
                                    </div>
                                </div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteRecord(r); }} className="absolute top-2 right-2 w-6 h-6 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10">×</button>
                        </div>
                    ))}
                </div>
                <div className="absolute bottom-8 w-full flex justify-center pointer-events-none z-30">
                    <button disabled={isLoading} onClick={() => handleGenerate('chat')} className="pointer-events-auto bg-green-500 text-white px-6 py-2.5 rounded-full shadow-xl font-bold text-xs flex items-center gap-2 active:scale-95 transition-transform">
                        {isLoading ? '连接中...' : '刷新消息列表'}
                    </button>
                </div>
            </div>
        );
    };

    const renderChatDetail = () => {
        if (!selectedChatRecord || !targetChar) return null;

        // Parse logic: look for "Me:" or "我:" vs others
        const lines = selectedChatRecord.detail.split('\n').filter(l => l.trim());
        const parsedLines = lines.map(line => {
            const isMe = line.startsWith('我') || line.startsWith('Me') || line.startsWith('Me:') || line.startsWith('我:');
            const content = line.replace(/^(我|Me|对方|Them|[\w\u4e00-\u9fa5]+)[:：]\s*/, '');
            return { isMe, content };
        });

        return (
            // FIX: Changed from 'absolute' to 'fixed inset-0 z-50 w-full h-full' to prevent layout gaps
            <div className="fixed inset-0 w-full h-full flex flex-col bg-[#f2f2f2] z-50">
                {renderHeader(selectedChatRecord.title, () => setActiveAppId('chat'))}
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar overscroll-contain">
                    {parsedLines.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'}`}>
                            {!msg.isMe && (
                                <div className="w-9 h-9 rounded-md bg-gray-300 flex items-center justify-center text-xs text-gray-500 mr-2 shrink-0">
                                    {selectedChatRecord.title[0]}
                                </div>
                            )}
                            <div className={`px-3 py-2 rounded-lg max-w-[75%] text-sm leading-relaxed shadow-sm break-words relative ${msg.isMe ? 'bg-[#95ec69] text-black' : 'bg-white text-black'}`}>
                                {msg.isMe && <div className="absolute top-2 -right-1.5 w-3 h-3 bg-[#95ec69] rotate-45"></div>}
                                {!msg.isMe && <div className="absolute top-3 -left-1 w-2.5 h-2.5 bg-white rotate-45"></div>}
                                <span className="relative z-10">{msg.content}</span>
                            </div>
                            {msg.isMe && (
                                <img src={targetChar.avatar} className="w-9 h-9 rounded-md object-cover ml-2 shrink-0 shadow-sm" />
                            )}
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-center py-4">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-100"></div>
                                <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-200"></div>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                <div className="shrink-0 w-full p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-[#f7f7f7] border-t border-gray-200 z-30">
                    <button 
                        onClick={handleContinueChat} 
                        disabled={isLoading}
                        className="w-full py-3 bg-white border border-gray-300 rounded-xl text-sm font-bold text-slate-600 shadow-sm active:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                    >
                        {isLoading ? '对方正在输入...' : '👀 偷看后续 / 拱火'}
                    </button>
                </div>
            </div>
        );
    };

    const renderCallList = () => {
        const list = records.filter(r => r.type === 'call').sort((a,b) => b.timestamp - a.timestamp);
        return (
            <div className="fixed inset-0 w-full h-full flex flex-col bg-white z-10">
                {renderHeader('Recents', () => setActiveAppId('home'))}
                <div className="flex-1 overflow-y-auto no-scrollbar pb-24 overscroll-contain">
                    {list.length === 0 && <div className="text-center text-slate-400 mt-20 text-xs">暂无通话记录</div>}
                    {list.map(r => {
                        const isMissed = r.value?.includes('未接') || r.value?.includes('Missed');
                        const isOutgoing = r.value?.includes('呼出') || r.value?.includes('Outgoing');
                        return (
                            <div key={r.id} className="flex items-center gap-4 px-6 py-4 border-b border-slate-50 relative group animate-fade-in hover:bg-slate-50 transition-colors">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isMissed ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
                                    📞
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={`font-bold text-sm truncate ${isMissed ? 'text-red-500' : 'text-slate-800'}`}>{r.title}</div>
                                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                                        <span>{isMissed ? '未接来电' : (isOutgoing ? '呼出' : '呼入')}</span>
                                        {r.value && !isMissed && <span>• {r.value.replace(/.*?\((.*?)\).*/, '$1')}</span>}
                                    </div>
                                    {r.detail && <div className="text-[10px] text-slate-500 mt-1 italic truncate">"{r.detail}"</div>}
                                </div>
                                <div className="text-[10px] text-slate-300">{new Date(r.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                                <button onClick={() => handleDeleteRecord(r)} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-red-100 text-red-500 rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                            </div>
                        );
                    })}
                </div>
                <div className="absolute bottom-8 w-full flex justify-center pointer-events-none z-30">
                    <button disabled={isLoading} onClick={() => handleGenerate('call')} className="pointer-events-auto bg-slate-800 text-white px-6 py-2.5 rounded-full shadow-xl font-bold text-xs flex items-center gap-2 active:scale-95 transition-transform">
                        {isLoading ? '...' : '刷新通话记录'}
                    </button>
                </div>
            </div>
        );
    };

    const renderGenericList = (appId: string, appName: string, customPrompt?: string) => {
        const list = records.filter(r => r.type === appId).sort((a,b) => b.timestamp - a.timestamp);
        
        return (
            <div className="fixed inset-0 w-full h-full flex flex-col bg-slate-50 z-10">
                {renderHeader(appName, () => setActiveAppId('home'))}
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar pb-24 overscroll-contain">
                    {list.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                            <span className="text-4xl opacity-20">📭</span>
                            <span className="text-xs">暂无数据</span>
                        </div>
                    )}
                    {list.map(r => (
                        <div key={r.id} className="bg-white rounded-xl p-4 border border-slate-100 shadow-sm relative group animate-slide-up">
                            <div className="flex justify-between items-start mb-1">
                                <span className="font-bold text-slate-700 text-sm line-clamp-1">{r.title}</span>
                                {r.value && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">{r.value}</span>}
                            </div>
                            <div className="text-xs text-slate-500 leading-relaxed">{r.detail}</div>
                            <div className="text-[10px] text-slate-300 mt-2 text-right">{new Date(r.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                            
                            <button onClick={() => handleDeleteRecord(r)} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity shadow-md">×</button>
                        </div>
                    ))}
                </div>

                <div className="absolute bottom-8 w-full flex justify-center pointer-events-none z-30">
                    <button 
                        disabled={isLoading} 
                        onClick={() => handleGenerate(appId, customPrompt)} 
                        className="pointer-events-auto bg-slate-800 text-white px-6 py-2.5 rounded-full shadow-xl font-bold text-xs flex items-center gap-2 active:scale-95 transition-transform hover:bg-slate-700"
                    >
                        {isLoading ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>}
                        刷新数据
                    </button>
                </div>
            </div>
        );
    };

    const AppIcon = ({ icon, color, label, onClick, onDelete }: { icon: string, color: string, label: string, onClick: () => void, onDelete?: () => void }) => (
        <div className="flex flex-col items-center gap-1.5 relative group">
            <button 
                onClick={onClick}
                className="w-[3.8rem] h-[3.8rem] rounded-[1.2rem] flex items-center justify-center text-2xl shadow-lg border border-white/10 active:scale-95 transition-transform relative overflow-hidden"
                style={{ background: color }}
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-black/10 to-transparent"></div>
                <div className="relative z-10 drop-shadow-md text-white">{icon}</div>
            </button>
            <span className="text-[10px] font-medium text-white/90 drop-shadow-md tracking-wide px-1 py-0.5 rounded bg-black/10 backdrop-blur-[2px]">{label}</span>
            {onDelete && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="absolute -top-1 -right-1 w-5 h-5 bg-slate-400 text-white rounded-full flex items-center justify-center text-[10px] shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-20 hover:bg-red-500">×</button>
            )}
        </div>
    );

    const renderDesktop = () => {
        const bgStyle = targetChar?.dateBackground 
            ? { backgroundImage: `url(${targetChar.dateBackground})` }
            : { background: 'linear-gradient(to bottom, #1e293b, #0f172a)' };

        return (
            <div className="absolute inset-0 flex flex-col z-0" style={{ ...bgStyle, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"></div>
                
                <div className="h-8 flex justify-between px-5 items-center text-white/80 text-[10px] font-bold z-20 relative">
                    <span>12:00</span>
                    <div className="flex gap-1.5 items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M1.371 8.143c5.858-5.857 15.356-5.857 21.213 0a.75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.06 0c-4.98-4.979-13.053-4.979-18.032 0a.75.75 0 0 1-1.06 0l-.53-.53a.75.75 0 0 1 0-1.06Zm3.182 3.182c4.1-4.1 10.749-4.1 14.85 0a.75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.062 0 8.25 8.25 0 0 0-11.667 0 .75.75 0 0 1-1.06 0l-.53-.53a.75.75 0 0 1 0-1.06Zm3.204 3.182a6 6 0 0 1 8.486 0 .75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.061 0 3.75 3.75 0 0 0-5.304 0 .75.75 0 0 1-1.06 0l-.53-.53a.75.75 0 0 1 0-1.06Zm3.182 3.182a1.5 1.5 0 0 1 2.122 0 .75.75 0 0 1 0 1.061l-.53.53a.75.75 0 0 1-1.061 0l-.53-.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                        <div className="w-4 h-2 border border-current rounded-[2px] relative"><div className="absolute left-0 top-0 bottom-0 bg-current w-3/4"></div></div>
                    </div>
                </div>

                <div className="flex-1 p-5 z-10 overflow-y-auto no-scrollbar overscroll-none">
                    <div className="grid grid-cols-4 gap-y-6 gap-x-2 place-items-center content-start">
                        <AppIcon icon="💬" color="linear-gradient(135deg, #10b981, #059669)" label="Message" onClick={() => setActiveAppId('chat')} />
                        <AppIcon icon="🛍️" color="linear-gradient(135deg, #f97316, #ea580c)" label="Taobao" onClick={() => setActiveAppId('taobao')} />
                        <AppIcon icon="🍔" color="linear-gradient(135deg, #eab308, #ca8a04)" label="Food" onClick={() => setActiveAppId('waimai')} />
                        <AppIcon icon="⭕" color="linear-gradient(135deg, #6366f1, #4f46e5)" label="Moments" onClick={() => setActiveAppId('social')} />
                        
                        {customApps.map(app => (
                            <AppIcon 
                                key={app.id} 
                                icon={app.icon} 
                                color={app.color} 
                                label={app.name} 
                                onClick={() => setActiveAppId(app.id)} 
                                onDelete={() => handleDeleteApp(app.id)}
                            />
                        ))}

                        <button onClick={() => setShowCreateModal(true)} className="flex flex-col items-center gap-1.5 group">
                            <div className="w-[3.8rem] h-[3.8rem] rounded-[1.2rem] bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-2xl text-white shadow-lg active:scale-95 transition-transform hover:bg-white/30">
                                +
                            </div>
                            <span className="text-[10px] font-medium text-white/90 drop-shadow-md">Add App</span>
                        </button>

                        <button onClick={handleExitPhone} className="flex flex-col items-center gap-1.5 group">
                            <div className="w-[3.8rem] h-[3.8rem] rounded-[1.2rem] bg-red-500/20 backdrop-blur-md border border-red-400/50 flex items-center justify-center shadow-lg active:scale-95 transition-transform hover:bg-red-500/40">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-white"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" /></svg>
                            </div>
                            <span className="text-[10px] font-medium text-white/90 drop-shadow-md">断开连接</span>
                        </button>

                        {/* Debug Toggle */}
                        <button onClick={() => setShowDebug(!showDebug)} className="flex flex-col items-center gap-1.5 group opacity-50 hover:opacity-100 transition-opacity">
                            <div className="w-[3.8rem] h-[3.8rem] rounded-[1.2rem] bg-black/20 backdrop-blur-md border border-white/10 flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                                <span className="text-xl">🛠️</span>
                            </div>
                            <span className="text-[10px] font-medium text-white/90 drop-shadow-md">Debug UI</span>
                        </button>

                    </div>
                </div>

                <div className="p-4 z-20">
                    <div className="bg-white/20 backdrop-blur-xl rounded-[2rem] p-3 flex justify-around items-center border border-white/10 shadow-lg">
                        <button onClick={() => {}} className="p-2 rounded-xl active:bg-white/20 transition-colors"><div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-2xl shadow-sm">📞</div></button>
                        <button onClick={() => setActiveAppId('chat')} className="p-2 rounded-xl active:bg-white/20 transition-colors"><div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-2xl shadow-sm">💬</div></button>
                        <button onClick={() => {}} className="p-2 rounded-xl active:bg-white/20 transition-colors"><div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-2xl shadow-sm">🧭</div></button>
                        <button onClick={() => {}} className="p-2 rounded-xl active:bg-white/20 transition-colors"><div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-2xl shadow-sm">⚙️</div></button>
                    </div>
                </div>
            </div>
        );
    };

    if (view === 'select') {
        return (
            <div className="absolute inset-0 flex flex-col bg-slate-900 font-light overflow-hidden">
                <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10">
                    <button onClick={closeApp} className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="font-bold text-white tracking-widest uppercase text-sm">Target Device</span>
                    <div className="w-8"></div>
                </div>
                <div className="p-6 grid grid-cols-2 gap-5 overflow-y-auto pb-20 no-scrollbar overscroll-contain">
                    {characters.map(c => (
                        <div key={c.id} onClick={() => handleSelectChar(c)} className="aspect-[3/4] bg-slate-800 rounded-xl border border-slate-700 p-4 flex flex-col items-center justify-center gap-4 cursor-pointer active:scale-95 transition-all group hover:border-green-500 hover:shadow-[0_0_15px_rgba(34,197,94,0.3)]">
                            <div className="w-20 h-20 rounded-full p-[2px] border-2 border-slate-600 group-hover:border-green-500 transition-colors">
                                <img src={c.avatar} className="w-full h-full rounded-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                            </div>
                            <div className="text-center">
                                <div className="font-bold text-slate-300 text-sm group-hover:text-green-400">{c.name}</div>
                                <div className="text-[10px] text-slate-500 font-mono mt-1">
  CONNECT &gt;
</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Phone View Container
    // FIXED: Use absolute inset-0 to force fill parent container properly
    return (
        <div className="absolute inset-0 w-full h-full bg-slate-900 overflow-hidden font-sans overscroll-none">
            {showDebug && <LayoutInspector />}
            {activeAppId === 'home' ? renderDesktop() : (
                <>
                    {activeAppId === 'chat' && renderChatList()}
                    {activeAppId === 'chat_detail' && renderChatDetail()}
                    {activeAppId === 'taobao' && renderGenericList('order', 'Taobao')}
                    {activeAppId === 'waimai' && renderGenericList('delivery', 'Food Delivery')}
                    {activeAppId === 'social' && renderGenericList('social', 'Moments')}
                    
                    {/* Render Custom Apps */}
                    {customApps.find(a => a.id === activeAppId) && (
                        (() => {
                            const app = customApps.find(a => a.id === activeAppId)!;
                            return renderGenericList(app.id, app.name, app.prompt);
                        })()
                    )}
                </>
            )}

            {/* Create App Modal */}
            <Modal isOpen={showCreateModal} title="安装自定义 App" onClose={() => setShowCreateModal(false)} footer={<button onClick={handleCreateCustomApp} className="w-full py-3 bg-blue-500 text-white font-bold rounded-2xl">安装到桌面</button>}>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl shadow-md border-2 border-slate-100 shrink-0" style={{ background: newAppColor }}>
                            {newAppIcon}
                        </div>
                        <div className="flex-1 space-y-2">
                            <input value={newAppName} onChange={e => setNewAppName(e.target.value)} placeholder="App 名称 (如: 银行)" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
                            <div className="flex gap-2">
                                <input value={newAppIcon} onChange={e => setNewAppIcon(e.target.value)} placeholder="Emoji" className="w-16 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-center" />
                                <input type="color" value={newAppColor} onChange={e => setNewAppColor(e.target.value)} className="h-9 flex-1 cursor-pointer rounded-lg bg-transparent" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">功能指令 (AI Prompt)</label>
                        <textarea 
                            value={newAppPrompt} 
                            onChange={e => setNewAppPrompt(e.target.value)} 
                            placeholder="例如: 显示该用户的存款余额、近期的转账记录以及理财收益。" 
                            className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs resize-none"
                        />
                        <p className="text-[9px] text-slate-400 mt-1">AI 将根据此指令生成该 App 内部的数据。</p>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default CheckPhone;

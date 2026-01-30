
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NovelBook, NovelSegment, CharacterProfile, UserProfile } from '../../types';
import { 
    NOVEL_THEMES, GenerationOptions, extractWritingTags, 
    analyzeWriterPersonaSimple, generateWriterPersonaDeep, 
    buildPrompt, parsePersonaMarkdown 
} from '../../utils/novelUtils';
import Modal from '../os/Modal';
import ConfirmDialog from '../os/ConfirmDialog';
import { useOS } from '../../context/OSContext';

interface NovelWriterProps {
    activeBook: NovelBook;
    updateNovel: (id: string, updates: Partial<NovelBook>) => Promise<void>;
    characters: CharacterProfile[];
    userProfile: UserProfile;
    apiConfig: any;
    onBack: () => void;
    updateCharacter: (id: string, updates: Partial<CharacterProfile>) => void;
    collaborators: CharacterProfile[];
    setTargetCharId: (id: string) => void;
    targetCharId: string | null;
    onOpenSettings: () => void;
}

// Extracted Component: PersonaPanel
// Moving this outside ensures React doesn't re-mount it on every render of parent, preserving scroll state.
interface PersonaPanelProps {
    char: CharacterProfile;
    userProfile: UserProfile;
    targetCharId: string | null;
    isTyping: boolean;
    setIsTyping: (v: boolean) => void;
    setConfirmDialog: (v: any) => void;
    addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
    apiConfig: any;
    updateCharacter: (id: string, updates: Partial<CharacterProfile>) => void;
}

const PersonaPanel: React.FC<PersonaPanelProps> = ({ 
    char, userProfile, targetCharId, isTyping, setIsTyping, setConfirmDialog, addToast, apiConfig, updateCharacter 
}) => {
    const rawPersona = char.writerPersona || analyzeWriterPersonaSimple(char);
    const sections = parsePersonaMarkdown(rawPersona);
    
    return (
        <div className="bg-gradient-to-b from-slate-50 to-white border-b border-black/5 overflow-hidden">
            <div className="max-h-[45vh] overflow-y-auto p-4 space-y-3 overscroll-contain">
                {sections.length === 0 ? <div className="text-center py-8 text-slate-400 text-sm">暂无详细风格数据<br/><span className="text-xs">点击下方按钮生成</span></div> : 
                    sections.map((sec, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100"><span className="text-base">{sec.icon}</span><h4 className="text-sm font-bold text-slate-800">{sec.title}</h4></div>
                            <div className="space-y-1.5">{sec.content.map((line, lIdx) => <p key={lIdx} className="text-sm text-slate-600 leading-relaxed">{line}</p>)}</div>
                        </div>
                    ))
                }
            </div>
            <div className="px-4 py-3 border-t border-slate-100 bg-white/80">
                <button onClick={async () => { 
                    if(!targetCharId) return; 
                    setConfirmDialog({ 
                        isOpen: true, 
                        title: '重新生成风格', 
                        message: '确定要重新分析该角色的写作人格吗？这将消耗一定量的 Token。', 
                        variant: 'info', 
                        confirmText: '重新生成', 
                        onConfirm: async () => { 
                            setConfirmDialog(null); 
                            addToast('正在分析...', 'info'); 
                            setIsTyping(true); 
                            try { 
                                await generateWriterPersonaDeep(char, userProfile, apiConfig, updateCharacter, true); 
                                addToast('风格已更新', 'success'); 
                            } catch (e) { 
                                addToast('失败', 'error'); 
                            } finally { 
                                setIsTyping(false); 
                            } 
                        } 
                    }); 
                }} disabled={isTyping} className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
                    {isTyping ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <>🔄 深度分析写作风格</>}
                </button>
            </div>
        </div>
    );
};

const NovelWriter: React.FC<NovelWriterProps> = ({ 
    activeBook, updateNovel, characters, userProfile, 
    apiConfig, onBack, updateCharacter, collaborators,
    targetCharId, setTargetCharId, onOpenSettings
}) => {
    const { addToast } = useOS();
    const activeTheme = useMemo(() => NOVEL_THEMES.find(t => t.id === activeBook.coverStyle) || NOVEL_THEMES[0], [activeBook.coverStyle]);
    
    // State
    const [genOptions, setGenOptions] = useState<GenerationOptions>({ write: true, comment: false, analyze: false });
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [segments, setSegments] = useState<NovelSegment[]>(activeBook.segments);
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);
    const [isStyleExpanded, setIsStyleExpanded] = useState(false);

    // Modals & Dialogs
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingSegment, setEditingSegment] = useState<NovelSegment | null>(null);
    const [editSegmentContent, setEditSegmentContent] = useState('');
    const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'info'; confirmText?: string; onConfirm: () => void; } | null>(null);
    
    // Summary States
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [summaryContent, setSummaryContent] = useState('');
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Sync local segments with book
    useEffect(() => {
        setSegments(activeBook.segments);
    }, [activeBook.segments]);

    useEffect(() => {
        if (scrollRef.current && !isEditModalOpen) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [segments, isTyping, isEditModalOpen]);

    const chapterCount = useMemo(() => segments.filter(s => s.focus === 'chapter_summary').length + 1, [segments]);
    const targetChar = characters.find(c => c.id === targetCharId);
    const canReroll = segments.length > 0 && segments[segments.length - 1].authorId !== 'user';

    const displaySegments = useMemo(() => {
        let lastSummaryIdx = -1;
        for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i].focus === 'chapter_summary') { lastSummaryIdx = i; break; }
        }
        return segments.slice(lastSummaryIdx + 1);
    }, [segments]);

    const historicalSummaries = useMemo(() => {
        return segments.filter(s => s.focus === 'chapter_summary');
    }, [segments]);

    // --- Actions ---

    const runGeneration = async (char: CharacterProfile, userPrompt: string, contextSegments: NovelSegment[]) => {
        setIsTyping(true);
        setLastTokenUsage(null);

        try {
            const allSummaries = contextSegments.filter(s => s.focus === 'chapter_summary');
            let currentChapterStart = 0;
            if (allSummaries.length > 0) {
                const lastSummary = allSummaries[allSummaries.length - 1];
                currentChapterStart = contextSegments.findIndex(s => s.id === lastSummary.id) + 1;
            }
            const currentChapterSegs = contextSegments.slice(currentChapterStart).filter(s => s.role === 'writer' || s.type === 'story');
            
            let storyContext = '';
            if (allSummaries.length > 0) {
                storyContext += '【前情回顾 / Chapter Recaps】\n';
                allSummaries.forEach((summary, idx) => storyContext += `\n第${idx + 1}章总结：\n${summary.content}\n`);
                storyContext += '\n---\n\n【当前章节 / Current Chapter】\n';
            } else {
                storyContext += '【当前章节 / Current Chapter】\n';
            }
            
            currentChapterSegs.forEach(s => {
                const authorName = s.authorId === 'user' ? userProfile.name : (characters.find(c => c.id === s.authorId)?.name || 'AI');
                storyContext += `\n[${authorName}]: ${s.content.substring(0, 500)}\n`;
            });

            const prompt = buildPrompt(char, userProfile, activeBook, userPrompt, storyContext, genOptions, contextSegments, characters);
            const traits = char.impression?.personality_core.observed_traits || [];
            let temperature = 0.85;
            if (traits.some(t => t.includes('电波') || t.includes('疯'))) temperature = 0.98;
            if (traits.some(t => t.includes('理性') || t.includes('冷') || t.includes('逻辑'))) temperature = 0.6;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }], temperature, max_tokens: 8000 })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);

                let content = data.choices[0].message.content.trim();
                const originalRaw = content; 
                content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) content = jsonMatch[0];
                
                let res;
                try { res = JSON.parse(content); } catch (e) { res = { writer: { content: originalRaw } }; }

                const newAiSegments: NovelSegment[] = [];
                const baseTime = Date.now();

                if (res.analysis && (res.analysis.critique || res.analysis.reaction)) {
                    newAiSegments.push({ id: `seg-${baseTime}-a`, role: 'analyst', type: 'analysis', authorId: char.id, content: res.analysis.critique || JSON.stringify(res.analysis), focus: res.analysis.focus, meta: { reaction: res.analysis.reaction }, timestamp: baseTime + 1 });
                }
                if (res.writer && res.writer.content) {
                    newAiSegments.push({ id: `seg-${baseTime}-w`, role: 'writer', type: 'story', authorId: char.id, content: res.writer.content, meta: { ...(res.meta || {}), technique: res.writer.technique, mood: res.writer.mood }, timestamp: baseTime + 2 });
                }
                if (res.comment && res.comment.content) {
                    newAiSegments.push({ id: `seg-${baseTime}-c`, role: 'commenter', type: 'discussion', authorId: char.id, content: res.comment.content, timestamp: baseTime + 3 });
                }

                setSegments(prev => {
                    const next = [...prev, ...newAiSegments];
                    updateNovel(activeBook.id, { segments: next });
                    return next;
                });
            } else { throw new Error(`API Error: ${response.status}`); }
        } catch (e: any) { addToast('请求失败: ' + e.message, 'error'); } finally { setIsTyping(false); }
    };

    const handleSend = async () => {
        if (!targetCharId) { addToast('请先选择一个角色', 'error'); return; }
        const selectedChar = characters.find(c => c.id === targetCharId);
        if (!selectedChar) return;

        let currentSegments = segments;
        if (inputText.trim()) {
            const userSegment: NovelSegment = { id: `seg-${Date.now()}`, role: 'writer', type: 'story', authorId: 'user', content: inputText, timestamp: Date.now() };
            currentSegments = [...segments, userSegment];
            setSegments(currentSegments);
            updateNovel(activeBook.id, { segments: currentSegments });
        }
        const userPrompt = inputText;
        setInputText('');
        await runGeneration(selectedChar, userPrompt, currentSegments);
    };

    const handleReroll = async () => {
        if (!targetCharId) return;
        const selectedChar = characters.find(c => c.id === targetCharId);
        if (!selectedChar) return;

        let newSegments = [...segments];
        let deletedCount = 0;
        while (newSegments.length > 0) {
            const last = newSegments[newSegments.length - 1];
            if (last.authorId !== 'user') { newSegments.pop(); deletedCount++; } else { break; }
        }
        if (deletedCount === 0) { addToast('没有可重随的 AI 内容', 'info'); return; }
        setSegments(newSegments);
        updateNovel(activeBook.id, { segments: newSegments });
        addToast('正在重随...', 'info');
        await runGeneration(selectedChar, "", newSegments);
    };

    const handleEditSegment = (seg: NovelSegment) => {
        setEditingSegment(seg);
        setEditSegmentContent(seg.content);
        setIsEditModalOpen(true);
    };

    const saveSegmentEdit = () => {
        if (!editingSegment) return;
        const newSegments = segments.map(s => s.id === editingSegment.id ? { ...s, content: editSegmentContent } : s);
        setSegments(newSegments);
        updateNovel(activeBook.id, { segments: newSegments });
        setIsEditModalOpen(false);
        setEditingSegment(null);
    };

    const handleDeleteSegment = (id: string) => {
        setConfirmDialog({
            isOpen: true,
            title: '删除段落',
            message: '确定要删除这个段落吗？',
            variant: 'danger',
            onConfirm: () => {
                const newSegments = segments.filter(s => s.id !== id);
                setSegments(newSegments);
                updateNovel(activeBook.id, { segments: newSegments });
                setConfirmDialog(null);
            }
        });
    };

    // Chapter Summary Logic
    const handleGenerateChapterSummary = async () => {
        setIsGeneratingSummary(true);
        setShowSummaryModal(true);
        setSummaryContent('正在回顾本章节内容...');
        try {
            let startIndex = 0;
            let lastSummaryIdx = -1;
            for (let i = segments.length - 1; i >= 0; i--) {
                if (segments[i].focus === 'chapter_summary') { lastSummaryIdx = i; break; }
            }
            if (lastSummaryIdx !== -1) startIndex = lastSummaryIdx + 1;
            
            const currentChapterSegs = segments.slice(startIndex).filter(s => s.type === 'story' || s.role === 'writer');
            const chapterText = currentChapterSegs.map(s => s.content).join('\n\n');

            if (!chapterText.trim()) {
                setSummaryContent('本章似乎还没有足够的内容来生成总结。');
                setIsGeneratingSummary(false);
                return;
            }

            const prompt = `### Task: Chapter Summary\nNovel: "${activeBook.title}"\nContent:\n${chapterText.substring(0, 200000)}\n\nGenerate a structured summary.`;
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }] })
            });

            if (response.ok) {
                const data = await response.json();
                setSummaryContent(data.choices[0].message.content);
            } else { setSummaryContent('生成失败，请重试。'); }
        } catch (e: any) { setSummaryContent(`错误: ${e.message}`); } finally { setIsGeneratingSummary(false); }
    };

    const confirmChapterSummary = async () => {
        const summarySeg: NovelSegment = { id: `seg-summary-${Date.now()}`, role: 'analyst', type: 'analysis', authorId: 'system', content: summaryContent, focus: 'chapter_summary', timestamp: Date.now(), meta: { reaction: '本章结束', suggestion: '新章节开始' } };
        const newSegments = [...segments, summarySeg];
        setSegments(newSegments);
        await updateNovel(activeBook.id, { segments: newSegments });
        
        const currentDate = new Date().toISOString().split('T')[0];
        const chapterNum = newSegments.filter(s => s.focus === 'chapter_summary').length;
        const collabNames = collaborators.map(c => c.name).join('、');

        for (const cId of activeBook.collaboratorIds) {
            const char = characters.find(c => c.id === cId);
            if (char) {
                const memory = { id: `mem-${Date.now()}-${Math.random()}`, date: currentDate, summary: `与${collabNames}一起为《${activeBook.title}》创作了第${chapterNum}章，已完成归档。`, mood: 'creative' };
                updateCharacter(char.id, { memories: [...(char.memories || []), memory] });
            }
        }
        setShowSummaryModal(false);
        setSummaryContent('');
        addToast('章节已归档，记忆已同步', 'success');
    };

    return (
        <div className={`h-full w-full flex flex-col font-serif ${activeTheme.bg} transition-colors duration-500 relative`}>
            <ConfirmDialog isOpen={!!confirmDialog} title={confirmDialog?.title || ''} message={confirmDialog?.message || ''} variant={confirmDialog?.variant} confirmText={confirmDialog?.confirmText || (confirmDialog?.onConfirm ? '确认' : 'OK')} onConfirm={confirmDialog?.onConfirm || (() => setConfirmDialog(null))} onCancel={() => setConfirmDialog(null)} />

            {/* Header */}
            {/* Removed 'sticky top-0' to fix layout overlap. It is now a standard flex child. */}
            <div className={`flex flex-col border-b border-black/5 shrink-0 z-20 backdrop-blur-md ${activeTheme.bg}/90 transition-all`}>
                <div className="h-16 flex items-center justify-between px-4 pt-2">
                    <button onClick={onBack} className="p-3 -ml-3 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 ${activeTheme.text}`}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    {/* Title is clickable to open settings */}
                    <div className="flex flex-col items-center cursor-pointer active:opacity-70 transition-opacity" onClick={onOpenSettings}>
                        <span className={`font-bold text-base ${activeTheme.text} truncate max-w-[150px]`}>{activeBook.title}</span>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] opacity-60 ${activeTheme.text}`}>第 {chapterCount} 章</span>
                            {lastTokenUsage && <span className={`text-[9px] px-1.5 py-0.5 rounded opacity-50 font-mono border border-current ${activeTheme.text}`}>⚡ {lastTokenUsage}</span>}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setShowHistoryModal(true)} className={`p-2 rounded-full hover:bg-black/5 transition-colors ${activeTheme.text}`} title="历史章节"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg></button>
                        <button onClick={handleGenerateChapterSummary} disabled={isTyping} className={`p-2 rounded-full hover:bg-black/5 transition-colors ${activeTheme.text}`} title="结束本章"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg></button>
                    </div>
                </div>
                <div className="px-4 pb-3 flex gap-3 overflow-x-auto no-scrollbar">
                    {collaborators.map(c => (
                        <button key={c.id} onClick={() => setTargetCharId(c.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all relative ${targetCharId === c.id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white/50 border-black/5 hover:bg-white text-slate-600'}`}>
                            <img src={c.avatar} className="w-6 h-6 rounded-full object-cover" />
                            <span className="text-xs font-bold whitespace-nowrap">{c.name}</span>
                            {c.writerPersona && <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full border border-white"></span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Style Bar (Non-sticky to prevent overlap) */}
            <div className={`z-10 ${activeTheme.bg}/95 backdrop-blur-md border-b border-black/5 shadow-sm`}>
                <div className="px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-x-auto no-scrollbar flex-1 mr-4">
                        <div className="flex items-center gap-2 shrink-0">
                            {targetChar && <img src={targetChar.avatar} className="w-6 h-6 rounded-full object-cover" />}
                            <span className="text-xs font-bold text-slate-700">{targetChar?.name ? `${targetChar.name}的风格` : '未选择角色'}</span>
                        </div>
                        <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar">
                            {targetChar && extractWritingTags(targetChar).slice(0, 3).map((tag, idx) => {
                                let colorClass = "bg-indigo-50 text-indigo-700 border-indigo-100";
                                if (['快节奏','慢节奏','节奏'].some(k => tag.includes(k))) colorClass = "bg-blue-50 text-blue-700 border-blue-100";
                                if (['冷峻','温情','治愈','燃','致郁'].some(k => tag.includes(k))) colorClass = "bg-pink-50 text-pink-700 border-pink-100";
                                if (['对话','心理','白描','意识流'].some(k => tag.includes(k))) colorClass = "bg-amber-50 text-amber-700 border-amber-100";
                                return <span key={idx} className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap border ${colorClass}`}>{tag}</span>;
                            })}
                        </div>
                    </div>
                    <button onClick={() => setIsStyleExpanded(!isStyleExpanded)} className="shrink-0 text-[10px] bg-white border border-slate-200 px-2 py-1 rounded-full hover:bg-slate-50 text-slate-600 flex items-center gap-1 transition-colors">详情 <span className={`transform transition-transform ${isStyleExpanded ? 'rotate-180' : ''}`}>▼</span></button>
                </div>
                <div className={`transition-all duration-300 ease-out overflow-hidden ${isStyleExpanded ? 'max-h-[60vh] opacity-100' : 'max-h-0 opacity-0'}`}>
                    {targetChar ? <PersonaPanel 
                        char={targetChar} 
                        userProfile={userProfile}
                        targetCharId={targetCharId}
                        isTyping={isTyping}
                        setIsTyping={setIsTyping}
                        setConfirmDialog={setConfirmDialog}
                        addToast={addToast}
                        apiConfig={apiConfig}
                        updateCharacter={updateCharacter}
                    /> : <div className="p-4 text-center text-xs text-slate-400">请先选择一个角色</div>}
                </div>
            </div>

            {/* Content Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-40" ref={scrollRef}>
                {displaySegments.length === 0 && <div className="text-center py-20 opacity-40"><p className="text-sm italic font-serif">第 {chapterCount} 章<br/>提笔写下新的开始...</p></div>}
                {displaySegments.map(seg => {
                    const isUser = seg.authorId === 'user';
                    const char = !isUser ? characters.find(c => c.id === seg.authorId) : null;
                    const role = seg.role || (seg.type === 'story' ? 'writer' : (seg.type === 'analysis' ? 'analyst' : 'commenter'));
                    const hoverMenu = (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10 bg-white/80 backdrop-blur rounded-lg p-1 shadow-sm border border-slate-100">
                            <button onClick={() => handleEditSegment(seg)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" /></svg></button>
                            <button onClick={() => handleDeleteSegment(seg.id)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" /></svg></button>
                        </div>
                    );

                    if (role === 'writer') return (
                        <div key={seg.id} className={`p-6 rounded-sm shadow-sm leading-loose text-justify text-[17px] relative group transition-all ${activeTheme.paper} ${activeTheme.text} ${isUser ? 'border-l-4 border-slate-300' : ''}`}>
                            {hoverMenu}
                            <div className="absolute -top-3 left-4 bg-white/90 border border-black/5 px-2 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wider text-slate-500 shadow-sm flex items-center gap-1.5">
                                {isUser ? null : <img src={char?.avatar} className="w-3 h-3 rounded-full object-cover" />}<span>{isUser ? '我 (User)' : char?.name} 执笔</span>{!isUser && seg.meta?.mood && <span className="bg-slate-100 px-1.5 rounded text-[9px] text-slate-600 normal-case">{seg.meta.mood}</span>}
                            </div>
                            <div className="whitespace-pre-wrap">{seg.content}</div>
                        </div>
                    );
                    if (role === 'commenter') return (
                        <div key={seg.id} className={`flex gap-3 max-w-[85%] font-sans ml-auto flex-row-reverse animate-slide-up group relative`}>
                            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border-2 border-white shadow-sm mt-1"><img src={isUser ? userProfile.avatar : char?.avatar} className="w-full h-full object-cover" /></div>
                            <div className={`p-3 rounded-xl text-sm shadow-sm relative bg-[#fff9c4] text-slate-700 transform rotate-1 border border-yellow-200/50`}>{hoverMenu}{seg.content}</div>
                        </div>
                    );
                    if (role === 'analyst') return (
                        <div key={seg.id} className="mx-4 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border border-slate-200 p-4 text-xs font-sans text-slate-600 shadow-sm group relative">
                            {hoverMenu}<div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200"><span className="text-lg">🧠</span><span className="font-bold text-slate-800">{char?.name} 的分析</span>{seg.focus && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">{seg.focus}</span>}</div>
                            {seg.meta?.reaction && <div className="mb-2 pb-2 border-b border-dashed border-slate-200"><span className="text-slate-400 text-[10px] uppercase">第一反应</span><p className="text-sm font-bold text-slate-700 mt-0.5">"{seg.meta.reaction}"</p></div>}<p className="leading-relaxed whitespace-pre-wrap">{seg.content}</p>
                        </div>
                    );
                    return null;
                })}
                {isTyping && <div className="flex justify-center py-4"><div className="flex gap-2"><div className={`w-2 h-2 rounded-full ${activeTheme.button} animate-bounce`}></div><div className={`w-2 h-2 rounded-full ${activeTheme.button} animate-bounce delay-75`}></div><div className={`w-2 h-2 rounded-full ${activeTheme.button} animate-bounce delay-150`}></div></div></div>}
            </div>

            {/* Input */}
            <div className={`absolute bottom-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 z-30 transition-transform duration-300 font-sans shadow-[0_-5px_20px_rgba(0,0,0,0.05)] pb-safe`}>
                <div className="flex gap-2 px-4 py-2 text-xs border-b border-slate-100 overflow-x-auto no-scrollbar">
                    <button onClick={() => setGenOptions({...genOptions, write: !genOptions.write})} className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${genOptions.write ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}><span>✍️</span> 续写正文</button>
                    <button onClick={() => setGenOptions({...genOptions, comment: !genOptions.comment})} className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${genOptions.comment ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}><span>💬</span> 角色吐槽</button>
                    <button onClick={() => setGenOptions({...genOptions, analyze: !genOptions.analyze})} className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${genOptions.analyze ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}><span>🧠</span> 深度分析</button>
                </div>
                <div className="p-3 flex gap-2 items-end">
                    <textarea value={inputText} onChange={e => setInputText(e.target.value)} placeholder={genOptions.write ? (inputText.trim() ? "输入剧情大纲..." : "输入指令或留空AI续写...") : "输入讨论内容..."} className="flex-1 bg-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-700 outline-none resize-none max-h-32 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 transition-all" rows={1} style={{ minHeight: '44px' }} />
                    {canReroll && !isTyping && !inputText.trim() && <button onClick={handleReroll} className={`w-11 h-11 rounded-full flex items-center justify-center text-slate-500 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all shrink-0`}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></button>}
                    <button onClick={handleSend} disabled={isTyping || (!inputText.trim() && !genOptions.write)} className={`w-11 h-11 rounded-full flex items-center justify-center text-white shadow-md active:scale-95 transition-all shrink-0 ${inputText.trim() || genOptions.write ? activeTheme.button : 'bg-slate-300'}`}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg></button>
                </div>
            </div>

            {/* Modals */}
            <Modal isOpen={isEditModalOpen} title="编辑段落" onClose={() => setIsEditModalOpen(false)} footer={<button onClick={saveSegmentEdit} className="w-full py-3 bg-slate-800 text-white font-bold rounded-2xl">保存</button>}>
                <textarea value={editSegmentContent} onChange={e => setEditSegmentContent(e.target.value)} className="w-full h-48 bg-slate-100 rounded-xl p-3 text-sm resize-none focus:outline-none leading-relaxed" />
            </Modal>
            <Modal isOpen={showSummaryModal} title="章节总结" onClose={() => setShowSummaryModal(false)} footer={isGeneratingSummary ? <div className="w-full py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl text-center">AI生成中...</div> : <button onClick={confirmChapterSummary} className="w-full py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow-lg">确认归档并开启新章</button>}>
                <textarea value={summaryContent} onChange={e => setSummaryContent(e.target.value)} className="w-full h-64 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none leading-relaxed" placeholder="总结生成中..." />
            </Modal>
            <Modal isOpen={showHistoryModal} title="历史章节" onClose={() => setShowHistoryModal(false)}>
                <div className="max-h-[60vh] overflow-y-auto space-y-4 p-1">
                    {historicalSummaries.length === 0 && <div className="text-center text-slate-400 py-4 text-xs">暂无历史章节</div>}
                    {historicalSummaries.map((s, i) => (<div key={s.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100"><div className="font-bold text-sm text-slate-700 mb-2">第 {i + 1} 章</div><div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{s.content}</div></div>))}
                </div>
            </Modal>
        </div>
    );
};

export default NovelWriter;

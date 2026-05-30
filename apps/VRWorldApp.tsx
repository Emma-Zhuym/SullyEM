import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOS } from '../context/OSContext';
import { ArrowLeft, Plus, Trash, BookOpen, Planet, Clock, Play, CaretRight, X } from '@phosphor-icons/react';
import { DB } from '../utils/db';
import { VRScheduler } from '../utils/vrWorld/scheduler';
import { VR_ROOMS, getRoom, VR_DEFAULT_INTERVAL_MIN } from '../utils/vrWorld/constants';
import { buildNovel, groupAnnotationsBySeg, getBookmark } from '../utils/vrWorld/novel';
import type { CharacterProfile, VRWorldNovel, VRNovelAnnotation, VRCardMeta, Message } from '../types';

// 沿用 520 / 约会模式的捏人立绘：优先激活皮肤组，回退默认立绘，再回退头像
const getStandingSprite = (char: CharacterProfile): string => {
    const sprites = (char.activeSkinSetId && char.dateSkinSets?.find(s => s.id === char.activeSkinSetId)?.sprites)
        || char.sprites || {};
    return sprites['happy'] || sprites['normal'] || sprites['smile'] || char.avatar || '';
};

type Tab = 'world' | 'library' | 'settings';

interface FeedItem {
    msgId: number;
    charId: string;
    charName: string;
    avatar: string;
    timestamp: number;
    meta: VRCardMeta;
    content: string;
}

const VRWorldApp: React.FC = () => {
    const { closeApp, characters, updateCharacter, addToast } = useOS();
    const [tab, setTab] = useState<Tab>('world');
    const [novels, setNovels] = useState<VRWorldNovel[]>([]);
    const [feed, setFeed] = useState<FeedItem[]>([]);
    const [loading, setLoading] = useState(true);

    // reader / upload modals
    const [readerNovel, setReaderNovel] = useState<VRWorldNovel | null>(null);
    const [showUpload, setShowUpload] = useState(false);

    const loadNovels = useCallback(async () => {
        setNovels(await DB.getVRNovels());
    }, []);

    const loadFeed = useCallback(async () => {
        const items: FeedItem[] = [];
        for (const c of characters) {
            const msgs = await DB.getRecentMessagesByCharId(c.id, 40);
            for (const m of msgs) {
                if (m.type === 'vr_card' && m.metadata?.vrCard) {
                    items.push({
                        msgId: m.id, charId: c.id, charName: c.name, avatar: c.avatar,
                        timestamp: m.timestamp, meta: m.metadata as VRCardMeta, content: m.content,
                    });
                }
            }
        }
        items.sort((a, b) => b.timestamp - a.timestamp);
        setFeed(items.slice(0, 40));
    }, [characters]);

    const reloadAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([loadNovels(), loadFeed()]);
        setLoading(false);
    }, [loadNovels, loadFeed]);

    useEffect(() => { void reloadAll(); }, [reloadAll]);

    // 角色逛完一次会派发 vr-session-done，刷新世界 + 动态
    useEffect(() => {
        const handler = () => { void reloadAll(); };
        window.addEventListener('vr-session-done', handler);
        return () => window.removeEventListener('vr-session-done', handler);
    }, [reloadAll]);

    // 当前"在场"的角色（按最近活动房间站位）
    const occupantsByRoom = useMemo(() => {
        const map: Record<string, CharacterProfile[]> = {};
        for (const c of characters) {
            if (c.vrState?.enabled && c.vrState.currentRoom) {
                (map[c.vrState.currentRoom] ||= []).push(c);
            }
        }
        return map;
    }, [characters]);

    const enabledCount = characters.filter(c => c.vrState?.enabled).length;

    return (
        <div className="h-full w-full flex flex-col text-white"
            style={{ background: 'radial-gradient(140% 100% at 50% 0%, #2a2350 0%, #15132b 55%, #0d0c1c 100%)' }}>
            {/* 顶栏 */}
            <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
                <button onClick={closeApp} className="p-1.5 -ml-1.5 rounded-full active:bg-white/10">
                    <ArrowLeft size={22} weight="bold" />
                </button>
                <div className="flex items-center gap-1.5">
                    <Planet size={20} weight="bold" className="text-indigo-300" />
                    <span className="text-lg font-bold tracking-wide">彼方</span>
                </div>
                <span className="ml-auto text-[11px] text-indigo-300/70">
                    {enabledCount > 0 ? `${enabledCount} 位已接入` : '尚无角色接入'}
                </span>
            </div>

            {/* Tab 切换 */}
            <div className="flex px-4 gap-1 shrink-0">
                {([['world', '世界'], ['library', '书库'], ['settings', '接入']] as [Tab, string][]).map(([t, label]) => (
                    <button key={t} onClick={() => setTab(t)}
                        className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors ${tab === t ? 'bg-indigo-400/90 text-white' : 'text-indigo-200/70 active:bg-white/10'}`}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
                {loading ? (
                    <div className="text-center text-indigo-300/60 text-sm py-10">载入彼方…</div>
                ) : tab === 'world' ? (
                    <WorldView occupantsByRoom={occupantsByRoom} feed={feed} novelCount={novels.length} onGoLibrary={() => setTab('library')} />
                ) : tab === 'library' ? (
                    <LibraryView novels={novels} characters={characters} onOpen={setReaderNovel}
                        onAdd={() => setShowUpload(true)}
                        onDelete={async (id) => { await DB.deleteVRNovel(id); await loadNovels(); addToast?.('已删除', 'success'); }} />
                ) : (
                    <SettingsView characters={characters} updateCharacter={updateCharacter} addToast={addToast} novelCount={novels.length} onReload={reloadAll} />
                )}
            </div>

            {readerNovel && (
                <ReaderModal novel={readerNovel} characters={characters} onClose={() => setReaderNovel(null)} />
            )}
            {showUpload && (
                <UploadModal onClose={() => setShowUpload(false)}
                    onSave={async (title, text, author, summary) => {
                        const novel = buildNovel(title, text, { author, summary });
                        if (novel.segments.length === 0) { addToast?.('正文是空的', 'error'); return; }
                        await DB.saveVRNovel(novel);
                        await loadNovels();
                        setShowUpload(false);
                        addToast?.(`《${novel.title}》已上架（${novel.segments.length} 段）`, 'success');
                    }} />
            )}
        </div>
    );
};

// ============ 世界视图：房间 + 立绘站位 + 动态流 ============
const WorldView: React.FC<{
    occupantsByRoom: Record<string, CharacterProfile[]>;
    feed: FeedItem[];
    novelCount: number;
    onGoLibrary: () => void;
}> = ({ occupantsByRoom, feed, novelCount, onGoLibrary }) => (
    <div className="space-y-4">
        {/* 房间 */}
        <div className="grid grid-cols-2 gap-3">
            {VR_ROOMS.map(room => {
                const occupants = occupantsByRoom[room.id] || [];
                return (
                    <div key={room.id}
                        className={`relative rounded-2xl p-3 min-h-[120px] overflow-hidden border ${room.implemented ? 'border-white/15' : 'border-white/5'}`}
                        style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 100%)' }}>
                        <div className="flex items-center gap-1.5">
                            <span className="text-lg">{room.emoji}</span>
                            <span className="text-[13px] font-bold">{room.name}</span>
                            {!room.implemented && <span className="text-[8px] text-indigo-300/50 border border-indigo-300/30 rounded px-1">待开放</span>}
                        </div>
                        <p className="text-[10px] text-indigo-200/60 mt-1 leading-snug">{room.blurb}</p>
                        {/* 立绘站位 */}
                        <div className="flex items-end gap-1 mt-2 min-h-[40px]">
                            {occupants.slice(0, 4).map(c => {
                                const sprite = getStandingSprite(c);
                                return sprite ? (
                                    <img key={c.id} src={sprite} alt={c.name}
                                        className="h-12 w-12 object-contain object-bottom drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                                        title={c.name} />
                                ) : (
                                    <div key={c.id} className="h-8 w-8 rounded-full bg-indigo-400/40 flex items-center justify-center text-[10px]" title={c.name}>
                                        {c.name.slice(0, 1)}
                                    </div>
                                );
                            })}
                            {occupants.length > 4 && <span className="text-[10px] text-indigo-300/60 ml-1">+{occupants.length - 4}</span>}
                        </div>
                    </div>
                );
            })}
        </div>

        {novelCount === 0 && (
            <button onClick={onGoLibrary}
                className="w-full rounded-xl border border-dashed border-indigo-300/40 py-3 text-[12px] text-indigo-200/80 active:bg-white/5">
                书库还空着，去上传一本小说，角色们登入后就能在图书馆读它 →
            </button>
        )}

        {/* 动态流 */}
        <div>
            <div className="text-[12px] font-bold text-indigo-200/80 mb-2 flex items-center gap-1.5">
                <Clock size={14} weight="bold" /> 彼方动态
            </div>
            {feed.length === 0 ? (
                <p className="text-[11px] text-indigo-300/50 py-4 text-center">还没有人留下痕迹。在「接入」里启用角色，它们到点会自己登入。</p>
            ) : (
                <div className="space-y-2">
                    {feed.map(item => {
                        const room = getRoom(item.meta.room);
                        return (
                            <div key={item.msgId} className="rounded-xl p-2.5 border border-white/10 flex gap-2.5"
                                style={{ background: 'rgba(255,255,255,0.04)' }}>
                                {item.avatar
                                    ? <img src={item.avatar} className="h-8 w-8 rounded-full object-cover shrink-0" alt="" />
                                    : <div className="h-8 w-8 rounded-full bg-indigo-400/40 shrink-0" />}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 text-[11px]">
                                        <span className="font-bold text-amber-200">{item.charName}</span>
                                        <span className="text-indigo-300/50">{room.emoji} {room.name}</span>
                                        <span className="ml-auto text-indigo-300/40 text-[9px]">
                                            {new Date(item.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-[11.5px] text-indigo-50/90 mt-0.5 leading-snug">{item.meta.activity}</p>
                                    {item.meta.annotationExcerpts && item.meta.annotationExcerpts.length > 0 && (
                                        <div className="mt-1 space-y-0.5">
                                            {item.meta.annotationExcerpts.slice(0, 2).map((ex, i) => (
                                                <div key={i} className="text-[10.5px] text-indigo-200/70 pl-2 border-l-2 border-amber-300/40 leading-snug">{ex}</div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    </div>
);

// ============ 书库视图 ============
const LibraryView: React.FC<{
    novels: VRWorldNovel[];
    characters: CharacterProfile[];
    onOpen: (n: VRWorldNovel) => void;
    onAdd: () => void;
    onDelete: (id: string) => void;
}> = ({ novels, characters, onOpen, onAdd, onDelete }) => (
    <div className="space-y-3">
        <button onClick={onAdd}
            className="w-full rounded-xl bg-indigo-400/90 py-2.5 text-[13px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform">
            <Plus size={16} weight="bold" /> 上传一本小说
        </button>
        {novels.length === 0 ? (
            <p className="text-[11px] text-indigo-300/50 py-6 text-center">书库空空如也。上传的小说会成为所有角色共享的读物，每个角色各自留批注、各自记书签。</p>
        ) : novels.map(novel => {
            const readers = characters.filter(c => getBookmark(c.vrState?.novelBookmarks, novel.id) > 0);
            return (
                <div key={novel.id} className="rounded-xl p-3 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="flex items-start gap-2">
                        <BookOpen size={18} weight="bold" className="text-amber-200 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold truncate">{novel.title}</div>
                            {novel.author && <div className="text-[10px] text-indigo-300/60">{novel.author}</div>}
                            <div className="text-[10px] text-indigo-300/50 mt-0.5">{novel.segments.length} 段 · {novel.totalChars.toLocaleString()} 字</div>
                        </div>
                        <button onClick={() => onDelete(novel.id)} className="p-1.5 rounded-full active:bg-white/10 text-indigo-300/50">
                            <Trash size={15} />
                        </button>
                    </div>
                    {readers.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {readers.map(c => {
                                const bm = getBookmark(c.vrState?.novelBookmarks, novel.id);
                                const pct = Math.round((bm / Math.max(1, novel.segments.length)) * 100);
                                return (
                                    <span key={c.id} className="text-[9.5px] bg-white/8 rounded-full px-2 py-0.5 text-indigo-100/80">
                                        {c.name} {pct}%
                                    </span>
                                );
                            })}
                        </div>
                    )}
                    <button onClick={() => onOpen(novel)}
                        className="mt-2 text-[11px] text-indigo-300 font-semibold flex items-center gap-0.5 active:opacity-70">
                        翻开阅读 / 看批注 <CaretRight size={12} weight="bold" />
                    </button>
                </div>
            );
        })}
    </div>
);

// ============ 阅读器：原文 + 批注 ============
const ReaderModal: React.FC<{
    novel: VRWorldNovel;
    characters: CharacterProfile[];
    onClose: () => void;
}> = ({ novel, characters, onClose }) => {
    const [annotations, setAnnotations] = useState<VRNovelAnnotation[]>([]);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 8;
    useEffect(() => { void (async () => setAnnotations(await DB.getVRAnnotations(novel.id)))(); }, [novel.id]);

    const annBySeg = useMemo(() => groupAnnotationsBySeg(annotations), [annotations]);
    const totalPages = Math.max(1, Math.ceil(novel.segments.length / PAGE_SIZE));
    const segs = novel.segments.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const nameOf = (id: string) => characters.find(c => c.id === id)?.name;

    return (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'linear-gradient(180deg,#1b1838 0%,#0d0c1c 100%)' }}>
            <div className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0 border-b border-white/10">
                <button onClick={onClose} className="p-1.5 -ml-1.5 rounded-full active:bg-white/10 text-white"><X size={20} weight="bold" /></button>
                <div className="min-w-0">
                    <div className="text-[14px] font-bold text-white truncate">{novel.title}</div>
                    <div className="text-[10px] text-indigo-300/60">第 {page * PAGE_SIZE + 1}~{Math.min((page + 1) * PAGE_SIZE, novel.segments.length)} 段 / 共 {novel.segments.length} 段</div>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 text-indigo-50/90"
                style={{ fontFamily: `'Noto Serif','Songti SC','Georgia',serif` }}>
                {segs.map(seg => {
                    const anns = annBySeg.get(seg.idx) || [];
                    return (
                        <div key={seg.idx} className="mb-4">
                            <p className="text-[13px] leading-[1.8] whitespace-pre-wrap">{seg.text}</p>
                            {anns.map(a => (
                                <div key={a.id} className="mt-1.5 ml-3 pl-2.5 border-l-2 border-amber-300/50 text-[11.5px] leading-snug">
                                    <span className="font-bold text-amber-200">{nameOf(a.authorId) || a.authorName}</span>
                                    {a.targetAnnotationId && <span className="text-indigo-300/50"> 回应</span>}
                                    <span className="text-indigo-100/80">：{a.content}</span>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 shrink-0 border-t border-white/10">
                <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
                    className="text-[12px] text-indigo-300 disabled:opacity-30 font-semibold">‹ 上一页</button>
                <span className="text-[11px] text-indigo-300/60">{page + 1} / {totalPages}</span>
                <button disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    className="text-[12px] text-indigo-300 disabled:opacity-30 font-semibold">下一页 ›</button>
            </div>
        </div>
    );
};

// ============ 上传弹窗 ============
const UploadModal: React.FC<{
    onClose: () => void;
    onSave: (title: string, text: string, author?: string, summary?: string) => void;
}> = ({ onClose, onSave }) => {
    const [title, setTitle] = useState('');
    const [author, setAuthor] = useState('');
    const [summary, setSummary] = useState('');
    const [text, setText] = useState('');
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
            <div className="w-full max-w-md rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto"
                style={{ background: '#1b1838' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center mb-3">
                    <span className="text-[15px] font-bold text-white">上传小说</span>
                    <button onClick={onClose} className="ml-auto p-1 text-indigo-300/60"><X size={18} /></button>
                </div>
                <div className="space-y-2.5">
                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="书名（必填）"
                        className="w-full rounded-lg bg-white/8 px-3 py-2 text-[13px] text-white placeholder-indigo-300/40 outline-none" />
                    <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="作者（选填）"
                        className="w-full rounded-lg bg-white/8 px-3 py-2 text-[13px] text-white placeholder-indigo-300/40 outline-none" />
                    <input value={summary} onChange={e => setSummary(e.target.value)} placeholder="一句话简介（选填，会喂给角色当背景）"
                        className="w-full rounded-lg bg-white/8 px-3 py-2 text-[13px] text-white placeholder-indigo-300/40 outline-none" />
                    <textarea value={text} onChange={e => setText(e.target.value)} placeholder="把小说正文粘贴到这里。会自动按自然段切成阅读单元。"
                        rows={10}
                        className="w-full rounded-lg bg-white/8 px-3 py-2 text-[12.5px] text-white placeholder-indigo-300/40 outline-none leading-relaxed" />
                    <div className="text-[10px] text-indigo-300/50">{text.length.toLocaleString()} 字</div>
                </div>
                <button onClick={() => onSave(title, text, author, summary)} disabled={!title.trim() || !text.trim()}
                    className="w-full mt-3 rounded-xl bg-indigo-400/90 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">
                    上架到书库
                </button>
            </div>
        </div>
    );
};

// ============ 接入设置：per-char 启用 + 间隔 + 立即触发 ============
const INTERVAL_OPTIONS = [60, 120, 180, 360, 720];
const SettingsView: React.FC<{
    characters: CharacterProfile[];
    updateCharacter: (id: string, updates: Partial<CharacterProfile>) => void;
    addToast?: (msg: string, type?: any) => void;
    novelCount: number;
    onReload: () => void;
}> = ({ characters, updateCharacter, addToast, novelCount, onReload }) => {

    const toggle = (char: CharacterProfile, enabled: boolean) => {
        const interval = char.vrState?.intervalMinutes || VR_DEFAULT_INTERVAL_MIN;
        updateCharacter(char.id, {
            vrState: { ...(char.vrState || { intervalMinutes: interval }), enabled, intervalMinutes: interval },
        });
        if (enabled) VRScheduler.start(char.id, interval);
        else VRScheduler.stop(char.id);
    };

    const setInterval = (char: CharacterProfile, minutes: number) => {
        updateCharacter(char.id, {
            vrState: { ...(char.vrState || { enabled: true }), enabled: char.vrState?.enabled ?? true, intervalMinutes: minutes },
        });
        if (char.vrState?.enabled) VRScheduler.start(char.id, minutes);
    };

    return (
        <div className="space-y-3">
            <p className="text-[11px] text-indigo-300/60 leading-relaxed">
                启用后，角色会按设定的间隔自己登入「彼方」，在图书馆读你上传的小说、写批注。每次活动会向 ta 的聊天里留下一张动态卡片，也会被记忆总结捕捉。
                {novelCount === 0 && <span className="text-amber-300/80"> 书库还空着，先去「书库」上传一本。</span>}
            </p>
            {characters.length === 0 && <p className="text-[11px] text-indigo-300/50 py-4 text-center">还没有角色。</p>}
            {characters.map(char => {
                const st = char.vrState;
                const enabled = !!st?.enabled;
                const interval = st?.intervalMinutes || VR_DEFAULT_INTERVAL_MIN;
                return (
                    <div key={char.id} className="rounded-xl p-3 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <div className="flex items-center gap-2.5">
                            {char.avatar
                                ? <img src={char.avatar} className="h-9 w-9 rounded-full object-cover" alt="" />
                                : <div className="h-9 w-9 rounded-full bg-indigo-400/40" />}
                            <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-bold truncate">{char.name}</div>
                                {enabled && <div className="text-[10px] text-indigo-300/60">每 {interval >= 60 ? `${interval / 60} 小时` : `${interval} 分`}登入一次</div>}
                            </div>
                            {/* toggle */}
                            <button onClick={() => toggle(char, !enabled)}
                                className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-indigo-400' : 'bg-white/15'}`}>
                                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>
                        {enabled && (
                            <>
                                <div className="flex flex-wrap gap-1.5 mt-2.5">
                                    {INTERVAL_OPTIONS.map(opt => (
                                        <button key={opt} onClick={() => setInterval(char, opt)}
                                            className={`text-[10.5px] rounded-full px-2.5 py-1 font-semibold ${interval === opt ? 'bg-indigo-400 text-white' : 'bg-white/8 text-indigo-200/70'}`}>
                                            {opt >= 60 ? `${opt / 60}h` : `${opt}min`}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={() => { VRScheduler.triggerNow(char.id); addToast?.(`${char.name} 正在登入彼方…`, 'info'); setTimeout(onReload, 4000); }}
                                    className="mt-2.5 text-[11px] text-amber-200 font-semibold flex items-center gap-1 active:opacity-70">
                                    <Play size={12} weight="fill" /> 让 ta 现在去逛一次
                                </button>
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default VRWorldApp;

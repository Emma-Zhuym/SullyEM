
import React, { useState, useRef, useEffect } from 'react';
import { useOS } from '../../context/OSContext';
import { CharacterProfile, SpriteConfig } from '../../types';
import { processImage } from '../../utils/file';

// 标准情绪列表
const REQUIRED_EMOTIONS = ['normal', 'happy', 'angry', 'sad', 'shy'];
const DEFAULT_SPRITE_CONFIG: SpriteConfig = { scale: 1, x: 0, y: 0 };

interface DateSettingsProps {
    char: CharacterProfile;
    onBack: () => void;
}

const DateSettings: React.FC<DateSettingsProps> = ({ char, onBack }) => {
    const { updateCharacter, addToast } = useOS();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [uploadTarget, setUploadTarget] = useState<'bg' | 'sprite'>('bg');
    const [targetEmotionKey, setTargetEmotionKey] = useState<string>('');
    const [tempSpriteConfig, setTempSpriteConfig] = useState<SpriteConfig>(DEFAULT_SPRITE_CONFIG);
    const [newEmotionName, setNewEmotionName] = useState<string>('');

    // Sync config on mount
    useEffect(() => {
        if (char.spriteConfig) {
            setTempSpriteConfig(char.spriteConfig);
        }
    }, [char.id]);

    const sprites = char.sprites || {};
    const currentSpriteImg = sprites['normal'] || sprites['default'] || Object.values(sprites)[0] || char.avatar;

    const triggerUpload = (target: 'bg' | 'sprite', emotionKey?: string) => {
        setUploadTarget(target);
        if (emotionKey) setTargetEmotionKey(emotionKey);
        fileInputRef.current?.click();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const base64 = await processImage(file);
            if (uploadTarget === 'bg') {
                updateCharacter(char.id, { dateBackground: base64 });
                addToast('背景已更新', 'success');
            } else {
                const key = targetEmotionKey.trim().toLowerCase();
                if (!key) { addToast('情绪Key丢失', 'error'); return; }
                const newSprites = { ...(char.sprites || {}), [key]: base64 };
                updateCharacter(char.id, { sprites: newSprites });
                addToast(`立绘 [${key}] 已保存`, 'success');
                setTargetEmotionKey('');
            }
        } catch (e: any) {
            addToast(e.message, 'error');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSaveSettings = () => {
        updateCharacter(char.id, { spriteConfig: tempSpriteConfig });
        addToast('配置已保存', 'success');
        onBack();
    };

    const customEmotions = char.customDateSprites || [];

    const handleAddCustomEmotion = () => {
        const key = newEmotionName.trim().toLowerCase().replace(/\s+/g, '_');
        if (!key) { addToast('请输入情绪名称', 'error'); return; }
        if (REQUIRED_EMOTIONS.includes(key)) { addToast('该名称与默认情绪重复', 'error'); return; }
        if (customEmotions.includes(key)) { addToast('该自定义情绪已存在', 'error'); return; }
        if (key === 'chibi') { addToast('不能使用 chibi 作为情绪名', 'error'); return; }
        const updated = [...customEmotions, key];
        updateCharacter(char.id, { customDateSprites: updated });
        setNewEmotionName('');
        addToast(`已添加自定义情绪 [${key}]`, 'success');
    };

    const handleDeleteCustomEmotion = (key: string) => {
        const updated = customEmotions.filter(e => e !== key);
        updateCharacter(char.id, { customDateSprites: updated });
        // Also remove the sprite image for this emotion
        const newSprites = { ...(char.sprites || {}) };
        delete newSprites[key];
        updateCharacter(char.id, { sprites: newSprites, customDateSprites: updated });
        addToast(`已删除自定义情绪 [${key}]`, 'success');
    };

    return (
        <div className="h-full w-full bg-slate-50 flex flex-col">
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-white shrink-0 z-20">
                <button onClick={onBack} className="p-2 -ml-2 text-slate-600 active:scale-95 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </button>
                <span className="font-bold text-slate-700">场景布置</span>
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
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">基础情绪立绘</h3>
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

                <section>
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">自定义情绪 (Custom Emotions)</h3>
                    <p className="text-[11px] text-slate-400 mb-4">为该角色添加专属情绪，AI 会在见面时使用。每个角色的自定义情绪互相独立。</p>

                    {/* Existing custom emotions grid */}
                    {customEmotions.length > 0 && (
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            {customEmotions.map(key => (
                                <div key={key} className="flex flex-col gap-2 group relative">
                                    <div
                                        onClick={() => triggerUpload('sprite', key)}
                                        className={`aspect-[3/4] rounded-xl overflow-hidden relative border ${sprites[key] ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-100'} shadow-sm flex items-center justify-center transition-all group-hover:border-primary cursor-pointer`}
                                    >
                                        {sprites[key] ? (
                                            <>
                                                <img src={sprites[key]} className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="text-white text-[10px]">更换</span></div>
                                            </>
                                        ) : <span className="text-slate-300 text-2xl">+</span>}
                                    </div>
                                    <div className="text-center flex items-center justify-center gap-1">
                                        <div className="text-xs font-bold text-slate-600 capitalize truncate">{key}</div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteCustomEmotion(key); }}
                                            className="text-slate-300 hover:text-red-400 transition-colors shrink-0"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add new custom emotion */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newEmotionName}
                            onChange={e => setNewEmotionName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAddCustomEmotion(); }}
                            placeholder="输入情绪名 (如 scared, excited...)"
                            className="flex-1 px-4 py-3 bg-slate-100 rounded-xl text-sm focus:ring-1 focus:ring-primary/30 outline-none transition-all"
                        />
                        <button
                            onClick={handleAddCustomEmotion}
                            disabled={!newEmotionName.trim()}
                            className="px-5 py-3 bg-primary text-white text-sm font-bold rounded-xl disabled:opacity-40 active:scale-95 transition-all"
                        >
                            添加
                        </button>
                    </div>
                </section>

                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
            </div>

            <div className="p-4 border-t border-slate-200 bg-white/90 backdrop-blur-sm sticky bottom-0 z-20">
                <button onClick={handleSaveSettings} className="w-full py-3 bg-primary text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-transform">
                    保存当前布置
                </button>
            </div>
        </div>
    );
};

export default DateSettings;

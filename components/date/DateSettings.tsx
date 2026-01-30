
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

            <div className="p-4 border-t border-slate-200 bg-white/90 backdrop-blur-sm sticky bottom-0 z-20">
                <button onClick={handleSaveSettings} className="w-full py-3 bg-primary text-white font-bold rounded-2xl shadow-lg active:scale-95 transition-transform">
                    保存当前布置
                </button>
            </div>
        </div>
    );
};

export default DateSettings;

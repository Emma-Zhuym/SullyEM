


import React, { useRef } from 'react';
import { Message, ChatTheme } from '../../types';

interface MessageItemProps {
    msg: Message;
    isFirstInGroup: boolean;
    isLastInGroup: boolean;
    activeTheme: ChatTheme;
    charAvatar: string;
    charName: string;
    userAvatar: string; 
    onLongPress: (m: Message) => void;
    selectionMode: boolean;
    isSelected: boolean;
    onToggleSelect: (id: number) => void;
}

const MessageItem = React.memo(({ 
    msg: m, 
    isFirstInGroup, 
    isLastInGroup, 
    activeTheme, 
    charAvatar, 
    charName, 
    userAvatar, 
    onLongPress,
    selectionMode,
    isSelected,
    onToggleSelect
}: MessageItemProps) => {
    const isUser = m.role === 'user';
    const isSystem = m.role === 'system';
    const marginBottom = isLastInGroup ? 'mb-6' : 'mb-1.5';
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPos = useRef({ x: 0, y: 0 }); // Track touch start position

    const styleConfig = isUser ? activeTheme.user : activeTheme.ai;

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        // Record initial position
        if ('touches' in e) {
            startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            startPos.current = { x: e.clientX, y: e.clientY };
        }
        
        longPressTimer.current = setTimeout(() => {
            if (!selectionMode) {
                onLongPress(m);
            }
        }, 600);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    // New handler to cancel long press if user drags/scrolls
    const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!longPressTimer.current) return;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const diffX = Math.abs(clientX - startPos.current.x);
        const diffY = Math.abs(clientY - startPos.current.y);

        // If moved more than 10px, assume scrolling and cancel long press
        if (diffX > 10 || diffY > 10) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleClick = (e: React.MouseEvent) => {
        if (selectionMode) {
            e.stopPropagation();
            e.preventDefault();
            onToggleSelect(m.id);
        }
    };

    const interactionProps = {
        onMouseDown: handleTouchStart,
        onMouseUp: handleTouchEnd,
        onMouseLeave: handleTouchEnd,
        onMouseMove: handleMove,
        onTouchStart: handleTouchStart,
        onTouchEnd: handleTouchEnd,
        onTouchMove: handleMove,
        onTouchCancel: handleTouchEnd, // Handle system interruptions
        onContextMenu: (e: React.MouseEvent) => {
            e.preventDefault();
            if (!selectionMode) onLongPress(m);
        },
        onClick: handleClick
    };

    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    // Render Avatar with potential decoration/frame
    // Removed mb-5 from here, handled via absolute positioning in parent
    const renderAvatar = (src: string) => (
        <div className="relative w-9 h-9 z-0">
            {isLastInGroup && (
                <>
                    <img 
                        src={src} 
                        className="w-full h-full rounded-full object-cover shadow-sm ring-1 ring-black/5 relative z-0" 
                        alt="avatar" 
                        loading="lazy" 
                        decoding="async" 
                    />
                    {styleConfig.avatarDecoration && (
                        <img 
                            src={styleConfig.avatarDecoration}
                            className="absolute pointer-events-none z-10 max-w-none"
                            style={{
                                left: `${styleConfig.avatarDecorationX ?? 50}%`,
                                top: `${styleConfig.avatarDecorationY ?? 50}%`,
                                width: `${36 * (styleConfig.avatarDecorationScale ?? 1)}px`, // Base size 36px (w-9)
                                height: 'auto',
                                transform: `translate(-50%, -50%) rotate(${styleConfig.avatarDecorationRotate ?? 0}deg)`,
                            }}
                        />
                    )}
                </>
            )}
        </div>
    );

    // --- SYSTEM MESSAGE RENDERING ---
    if (isSystem) {
        // Clean up text: remove [System:] or [系统:] prefix for display
        const displayText = m.content.replace(/^\[(System|系统|System Log|系统记录)\s*[:：]?\s*/i, '').replace(/\]$/, '').trim();
        
        return (
            <div className={`flex items-center w-full ${selectionMode ? 'pl-8' : ''} animate-fade-in relative transition-all duration-300`}>
                {selectionMode && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer z-20" onClick={() => onToggleSelect(m.id)}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-slate-300 bg-white/80'}`}>
                            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                        </div>
                    </div>
                )}
                <div className="flex justify-center my-6 px-10 w-full" {...interactionProps}>
                    <div className="flex items-center gap-1.5 bg-slate-200/40 backdrop-blur-md text-slate-500 px-3 py-1 rounded-full shadow-sm border border-white/20 select-none cursor-pointer active:scale-95 transition-transform">
                        {/* Optional Icon based on content */}
                        {displayText.includes('任务') ? '✨' : 
                        displayText.includes('纪念日') || displayText.includes('Event') ? '📅' :
                        displayText.includes('转账') ? '💰' : '🔔'}
                        <span className="text-[10px] font-medium tracking-wide">{displayText}</span>
                    </div>
                </div>
            </div>
        );
    }

    if (m.type === 'interaction') {
        return (
            <div className={`flex flex-col items-center ${marginBottom} w-full animate-fade-in relative transition-all duration-300 ${selectionMode ? 'pl-8' : ''}`}>
                {selectionMode && (
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 cursor-pointer z-20" onClick={() => onToggleSelect(m.id)}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-slate-300 bg-white/80'}`}>
                            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                        </div>
                    </div>
                )}
                <div className="text-[10px] text-slate-400 mb-1 opacity-70">{formatTime(m.timestamp)}</div>
                <div className="group relative cursor-pointer active:scale-95 transition-transform" {...interactionProps}>
                        <div className="text-[11px] text-slate-500 bg-slate-200/50 backdrop-blur-sm px-4 py-1.5 rounded-full flex items-center gap-1.5 border border-white/40 shadow-sm select-none">
                        <span className="group-hover:animate-bounce">👉</span>
                        <span className="font-medium opacity-80">{isUser ? '你' : charName}</span>
                        <span className="opacity-60">戳了戳</span>
                        <span className="font-medium opacity-80">{isUser ? charName : '你'}</span>
                    </div>
                </div>
            </div>
        );
    }

    const commonLayout = (content: React.ReactNode) => (
            <div className={`flex items-end ${isUser ? 'justify-end' : 'justify-start'} ${marginBottom} px-3 group select-none relative transition-all duration-300 ${selectionMode ? 'pl-12' : ''}`}>
                {selectionMode && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer z-20" onClick={() => onToggleSelect(m.id)}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-slate-300 bg-white/80'}`}>
                            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                        </div>
                    </div>
                )}

                {/* Avatar - Absolute Positioned */}
                {!isUser && (
                    <div className={`absolute bottom-[1.25rem] z-0 ${selectionMode ? 'left-14' : 'left-3'} transition-all duration-300`}>
                        {renderAvatar(charAvatar)}
                    </div>
                )}
                
                {/* 
                    UPDATED: Limit bubble max-width to 72% for better spacing. 
                    Added min-w-0 to prevent flexbox overflow issues.
                    Added explicit margins to clear absolute avatars.
                */}
                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[72%] min-w-0 ${!isUser ? 'ml-12' : 'mr-12'}`} {...interactionProps}>
                    <div className={selectionMode ? 'pointer-events-none' : ''}>
                        {content}
                    </div>
                    {isLastInGroup && <div className="text-[9px] text-slate-400/80 px-1 mt-1 font-medium">{formatTime(m.timestamp)}</div>}
                </div>

                {/* User Avatar - Absolute Positioned */}
                {isUser && (
                    <div className="absolute right-3 bottom-[1.25rem] z-0">
                        {renderAvatar(userAvatar)}
                    </div>
                )}
            </div>
    );

    // [New] Social Card Rendering
    if (m.type === 'social_card' && m.metadata?.post) {
        const post = m.metadata.post;
        return commonLayout(
            <div className="w-64 bg-white rounded-xl overflow-hidden shadow-sm border border-slate-100 cursor-pointer active:opacity-90 transition-opacity">
                <div className="h-32 w-full flex items-center justify-center text-6xl relative overflow-hidden" style={{ background: post.bgStyle || '#fce7f3' }}>
                    {post.images?.[0] || '📄'}
                    <div className="absolute bottom-0 left-0 w-full p-2 bg-gradient-to-t from-black/30 to-transparent">
                        <div className="text-white text-xs font-bold line-clamp-1">{post.title}</div>
                    </div>
                </div>
                <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <img src={post.authorAvatar} className="w-4 h-4 rounded-full" />
                        <span className="text-[10px] text-slate-500">{post.authorName}</span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{post.content}</p>
                    <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-1 text-[10px] text-slate-400">
                        <span className="text-red-400">Spark</span> • 笔记分享
                    </div>
                </div>
            </div>
        );
    }

    if (m.type === 'transfer') {
        return commonLayout(
            <div className="w-64 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden group active:scale-[0.98] transition-transform">
                    <div className="absolute top-0 right-0 p-4 opacity-20"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12"><path d="M10.464 8.746c.227-.18.497-.311.786-.394v2.795a2.252 2.252 0 0 1-.786-.393c-.394-.313-.546-.681-.546-1.004 0-.324.152-.691.546-1.004ZM12.75 15.662v-2.824c.347.085.664.228.921.421.427.32.579.686.579.991 0 .305-.152.671-.579.991a2.534 2.534 0 0 1-.921.42Z" /><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v.816a3.836 3.836 0 0 0-1.72.756c-.712.566-1.112 1.35-1.112 2.178 0 .829.4 1.612 1.113 2.178.502.4 1.102.647 1.719.756v2.978a2.536 2.536 0 0 1-.921-.421l-.879-.66a.75.75 0 0 0-.9 1.2l.879.66c.533.4 1.169.645 1.821.75V18a.75.75 0 0 0 1.5 0v-.81a4.124 4.124 0 0 0 1.821-.749c.745-.559 1.179-1.344 1.179-2.191 0-.847-.434-1.632-1.179-2.191a4.122 4.122 0 0 0-1.821-.75V8.354c.29.082.559.213.786.393l.415.33a.75.75 0 0 0 .933-1.175l-.415-.33a3.836 3.836 0 0 0-1.719-.755V6Z" clipRule="evenodd" /><path d="M2.25 18a.75.75 0 0 0 0 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 0 0-.75-.75H2.25Z" /></svg></div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-white/20 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 7.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" /><path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 0 1 1.5 14.625v-9.75ZM8.25 9.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM18.75 9a.75.75 0 0 0-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 0 0 .75-.75V9.75a.75.75 0 0 0-.75-.75h-.008ZM4.5 9.75A.75.75 0 0 1 5.25 9h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75-.75H5.25a.75.75 0 0 1-.75-.75V9.75Z" clipRule="evenodd" /><path d="M2.25 18a.75.75 0 0 0 0 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 0 0-.75-.75H2.25Z" /></svg></div>
                        <span className="font-medium text-white/90">Sully Pay</span>
                    </div>
                    <div className="text-2xl font-bold tracking-tight mb-1">₩ {m.metadata?.amount}</div>
                    <div className="text-[10px] text-white/70">转账给{isUser ? charName : '你'}</div>
            </div>
        );
    }

    if (m.type === 'emoji') {
        return commonLayout(
            <img src={m.content} className="max-w-[160px] max-h-[160px] rounded-2xl hover:scale-105 transition-transform shadow-md active:scale-95" loading="lazy" decoding="async" />
        );
    }

    if (m.type === 'image') {
        return commonLayout(
            <div className="relative group">
                <img src={m.content} className="max-w-[200px] max-h-[300px] rounded-2xl shadow-sm border border-black/5" alt="Uploaded" loading="lazy" decoding="async" />
            </div>
        );
    }

    // --- Dynamic Style Generation for Bubble ---
    const radius = styleConfig.borderRadius;
    let borderObj: React.CSSProperties = {};
    
    // Border Radius Logic
    if (!isFirstInGroup && !isLastInGroup) {
        borderObj = isUser 
            ? { borderRadius: `${radius}px`, borderTopRightRadius: '4px', borderBottomRightRadius: '4px' }
            : { borderRadius: `${radius}px`, borderTopLeftRadius: '4px', borderBottomLeftRadius: '4px' };
    } else if (isFirstInGroup && !isLastInGroup) {
        borderObj = isUser
            ? { borderRadius: `${radius}px`, borderBottomRightRadius: '4px' }
            : { borderRadius: `${radius}px`, borderBottomLeftRadius: '4px' };
    } else if (!isFirstInGroup && isLastInGroup) {
        borderObj = isUser
            ? { borderRadius: `${radius}px`, borderTopRightRadius: '4px' }
            : { borderRadius: `${radius}px`, borderTopLeftRadius: '4px' };
    } else {
            borderObj = isUser
            ? { borderRadius: `${radius}px`, borderBottomRightRadius: '2px' }
            : { borderRadius: `${radius}px`, borderBottomLeftRadius: '2px' };
    }

    // Container style (BackgroundColor + Opacity)
    const containerStyle: React.CSSProperties = {
        backgroundColor: styleConfig.backgroundColor,
        opacity: styleConfig.opacity, // Overall container opacity
        ...borderObj,
    };

    // --- Enhanced Text Rendering (Markdown Lite) ---
    const renderContent = (text: string) => {
        // 1. Split by Code Blocks
        const parts = text.split(/(```[\s\S]*?```)/g);
        return parts.map((part, index) => {
            // Render Code Block
            if (part.startsWith('```') && part.endsWith('```')) {
                const codeContent = part.replace(/^```\w*\n?/, '').replace(/```$/, '');
                return (
                    <pre key={index} className="bg-black/80 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2 whitespace-pre shadow-inner border border-white/10">
                        {codeContent}
                    </pre>
                );
            }
            
            // Render Regular Text (split by newlines for paragraph spacing)
            return part.split('\n').map((line, lineIdx) => {
                const key = `${index}-${lineIdx}`;
                
                // Quote Format "> text"
                if (line.trim().startsWith('>')) {
                    const quoteText = line.trim().substring(1).trim();
                    if (!quoteText) return null;
                    return (
                        <div key={key} className="my-1 pl-2.5 border-l-[3px] border-current opacity-70 italic text-[13px]">
                            {quoteText}
                        </div>
                    );
                }
                
                // Inline Bold Parsing (**text**)
                // A simple split by ** works for basic cases
                const boldSegments = line.split(/(\*\*.*?\*\*)/g);
                const renderedLine = boldSegments.map((seg, i) => {
                    if (seg.startsWith('**') && seg.endsWith('**')) {
                        return <strong key={i} className="font-bold">{seg.slice(2, -2)}</strong>;
                    }
                    return seg;
                });

                return <div key={key} className="min-h-[1.2em]">{renderedLine}</div>;
            });
        });
    };

    // Added stable class names "sully-bubble-user" and "sully-bubble-ai" for Custom CSS targeting
    // UPDATED: Added whitespace-pre-wrap and break-all to ensure long non-breaking strings wrap correctly
    return commonLayout(
        <div className={`relative shadow-sm px-5 py-3 animate-fade-in border border-black/5 active:scale-[0.98] transition-transform overflow-hidden ${isUser ? 'sully-bubble-user' : 'sully-bubble-ai'}`} style={containerStyle}>
            
            {/* Layer 1: Background Image with Independent Opacity */}
            {styleConfig.backgroundImage && (
                <div 
                    className="absolute inset-0 bg-cover bg-center pointer-events-none z-0"
                    style={{ 
                        backgroundImage: `url(${styleConfig.backgroundImage})`,
                        opacity: styleConfig.backgroundImageOpacity ?? 0.5 
                    }}
                />
            )}

            {/* Layer 2: Decoration Sticker (Custom Position) */}
            {styleConfig.decoration && (
                <img 
                    src={styleConfig.decoration} 
                    className="absolute z-10 w-8 h-8 object-contain drop-shadow-sm pointer-events-none" 
                    style={{ 
                        left: `${styleConfig.decorationX ?? (isUser ? 90 : 10)}%`,
                        top: `${styleConfig.decorationY ?? -10}%`,
                        transform: `translate(-50%, -50%) scale(${styleConfig.decorationScale ?? 1}) rotate(${styleConfig.decorationRotate ?? 0}deg)`
                    }}
                    alt=""
                />
            )}

            {/* Layer 3: Reply/Quote Block - UPDATED LAYOUT */}
            {m.replyTo && (
                <div className="relative z-10 mb-1 text-[10px] bg-black/5 p-1.5 rounded-md border-l-2 border-current opacity-60 flex flex-col gap-0.5 max-w-full overflow-hidden">
                    <span className="font-bold opacity-90 truncate">{m.replyTo.name}</span>
                    <span className="truncate italic">"{m.replyTo.content}"</span>
                </div>
            )}

            {/* Layer 4: Text Content */}
            <div className="relative z-10 text-[15px] leading-relaxed whitespace-pre-wrap break-all" style={{ color: styleConfig.textColor }}>
                {renderContent(m.content)}
            </div>
        </div>
    );
}, (prev, next) => {
    return prev.msg.id === next.msg.id && 
           prev.msg.content === next.msg.content &&
           prev.isFirstInGroup === next.isFirstInGroup &&
           prev.isLastInGroup === next.isLastInGroup &&
           prev.activeTheme === next.activeTheme &&
           prev.selectionMode === next.selectionMode && 
           prev.isSelected === next.isSelected;
});

export default MessageItem;
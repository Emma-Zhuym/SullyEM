import React, { useEffect, useState, useCallback } from 'react';
import { CaretLeft, ChatCircle } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import { CharacterProfile } from '../../types';

type RowMeta = {
  char: CharacterProfile;
  preview: string;
  lastAt: number;
};

/**
 * Dock Message 通讯录：列出角色 + 未读红点 + 最后一条预览。
 */
const ContactsList: React.FC = () => {
  const {
    characters,
    unreadMessages,
    setActiveCharacterId,
    setMessageSubView,
    clearUnread,
    closeApp,
    registerBackHandler,
    lastMsgTimestamp,
  } = useOS();

  const [rows, setRows] = useState<RowMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPreviews = useCallback(async () => {
    if (characters.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const metas = await Promise.all(
        characters.map(async (char) => {
          try {
            const { messages, totalCount } = await DB.getRecentMessagesWithCount(char.id, 1);
            const last = messages[messages.length - 1];
            let preview = '';
            let lastAt = 0;
            if (last) {
              lastAt = last.timestamp ?? last.id ?? 0;
              if (last.type === 'image') preview = '[图片]';
              else if (last.content) {
                preview = last.content.replace(/\[.*?\]/g, '').trim().slice(0, 80);
                if (!preview) preview = '[消息]';
              } else preview = totalCount > 0 ? '…' : '';
            } else {
              preview = char.description?.slice(0, 60) || '暂无消息';
            }
            return { char, preview, lastAt };
          } catch {
            return { char, preview: '…', lastAt: 0 };
          }
        })
      );
      metas.sort((a, b) => {
        const ua = unreadMessages[a.char.id] || 0;
        const ub = unreadMessages[b.char.id] || 0;
        if (ua !== ub) return ub - ua;
        return b.lastAt - a.lastAt;
      });
      setRows(metas);
    } finally {
      setLoading(false);
    }
  }, [characters, unreadMessages, lastMsgTimestamp]);

  useEffect(() => {
    loadPreviews();
  }, [loadPreviews]);

  useEffect(() => {
    const un = registerBackHandler(() => {
      closeApp();
      return true;
    });
    return un;
  }, [registerBackHandler, closeApp]);

  const handleSelect = (charId: string) => {
    setMessageSubView('chat');
    setActiveCharacterId(charId);
    clearUnread(charId);
  };

  const handleClose = () => {
    closeApp();
  };

  return (
    <div className="flex flex-col h-full bg-[#f1f5f9] overflow-hidden relative font-sans">
      <div className="h-24 bg-white/90 backdrop-blur-xl px-5 flex items-end pb-4 border-b border-slate-200/60 shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-3 w-full">
          <button type="button" onClick={handleClose} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full" aria-label="返回">
            <CaretLeft className="w-5 h-5" weight="bold" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800 text-lg">通讯录</div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Message</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-3 pt-3 pb-8">
        {loading && characters.length > 0 && (
          <div className="flex justify-center py-12 text-slate-400 text-sm">加载中…</div>
        )}
        {!loading && characters.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center text-slate-500">
            <ChatCircle className="w-14 h-14 opacity-30 mb-3" weight="duotone" />
            <p className="text-sm font-medium">暂无角色</p>
            <p className="text-xs mt-2 opacity-70">请先在「神经链接」里创建角色</p>
          </div>
        )}
        {rows.map(({ char, preview }) => {
          const n = unreadMessages[char.id] || 0;
          return (
            <button
              key={char.id}
              type="button"
              onClick={() => handleSelect(char.id)}
              className="w-full flex items-center gap-3 p-3 mb-2 rounded-2xl bg-white/90 border border-slate-200/80 shadow-sm active:scale-[0.99] transition-transform text-left"
            >
              <div className="relative shrink-0">
                <img src={char.avatar} alt="" className="w-14 h-14 rounded-2xl object-cover shadow-sm" />
                {n > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow">
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-slate-800 truncate">{char.name}</div>
                <div className="text-xs text-slate-500 truncate mt-0.5">{preview}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ContactsList;

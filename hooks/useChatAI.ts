
import { useState } from 'react';
import { CharacterProfile, UserProfile, Message, Emoji, EmojiCategory, GroupProfile } from '../types';
import { DB } from '../utils/db';
import { ChatPrompts } from '../utils/chatPrompts';
import { ChatParser } from '../utils/chatParser';

interface UseChatAIProps {
    char: CharacterProfile | undefined;
    userProfile: UserProfile;
    apiConfig: any;
    groups: GroupProfile[];
    emojis: Emoji[];
    categories: EmojiCategory[];
    addToast: (msg: string, type: 'info'|'success'|'error') => void;
    setMessages: (msgs: Message[]) => void; // Callback to update UI messages
}

export const useChatAI = ({ 
    char, 
    userProfile, 
    apiConfig, 
    groups, 
    emojis, 
    categories, 
    addToast,
    setMessages 
}: UseChatAIProps) => {
    
    const [isTyping, setIsTyping] = useState(false);
    const [recallStatus, setRecallStatus] = useState<string>('');
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);

    const triggerAI = async (currentMsgs: Message[]) => {
        if (isTyping || !char) return;
        if (!apiConfig.baseUrl) { alert("请先在设置中配置 API URL"); return; }

        setIsTyping(true);
        setRecallStatus('');

        try {
            const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}` };

            // 1. Build System Prompt
            const baseSystemPrompt = await ChatPrompts.buildSystemPrompt(char, userProfile, groups, emojis, categories, currentMsgs);

            // 2. Build Message History
            const limit = char.contextLimit || 500;
            const { apiMessages, historySlice } = ChatPrompts.buildMessageHistory(currentMsgs, limit, char, userProfile, emojis);

            const fullMessages = [{ role: 'system', content: baseSystemPrompt }, ...apiMessages];

            // 3. API Call
            let response = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST', headers,
                body: JSON.stringify({ model: apiConfig.model, messages: fullMessages, temperature: 0.85, stream: false })
            });

            if (!response.ok) throw new Error(`API Error ${response.status}`);
            let data = await response.json();
            if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);

            // 4. Initial Cleanup
            let aiContent = data.choices?.[0]?.message?.content || '';
            aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
            aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, ''); 
            aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');

            // 5. Handle Recall (Loop if needed)
            const recallMatch = aiContent.match(/\[\[RECALL:\s*(\d{4})[-/年](\d{1,2})\]\]/);
            if (recallMatch) {
                const year = recallMatch[1];
                const month = recallMatch[2];
                setRecallStatus(`正在调阅 ${year}年${month}月 的详细档案...`);
                
                // Helper to fetch detailed logs (duplicated logic from Chat.tsx, moved inside hook context)
                const getDetailedLogs = (y: string, m: string) => {
                    if (!char.memories) return null;
                    const target = `${y}-${m.padStart(2, '0')}`;
                    const logs = char.memories.filter(mem => {
                        return mem.date.includes(target) || mem.date.includes(`${y}年${parseInt(m)}月`);
                    });
                    if (logs.length === 0) return null;
                    return logs.map(mem => `[${mem.date}] (${mem.mood || 'normal'}): ${mem.summary}`).join('\n');
                };

                const detailedLogs = getDetailedLogs(year, month);
                
                if (detailedLogs) {
                    const recallMessages = [...fullMessages, { role: 'system', content: `[系统: 已成功调取 ${year}-${month} 的详细日志]\n${detailedLogs}\n[系统: 现在请结合这些细节回答用户。保持对话自然。]` }];
                    response = await fetch(`${baseUrl}/chat/completions`, {
                        method: 'POST', headers,
                        body: JSON.stringify({ model: apiConfig.model, messages: recallMessages, temperature: 0.8, stream: false })
                    });
                    if (response.ok) {
                        data = await response.json();
                        aiContent = data.choices?.[0]?.message?.content || '';
                        // Re-clean
                        aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
                        aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, '');
                        aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');
                        addToast(`已调用 ${year}-${month} 详细记忆`, 'info');
                    }
                }
            }
            setRecallStatus('');

            // 6. Parse Actions (Poke, Transfer, Schedule, etc.)
            aiContent = await ChatParser.parseAndExecuteActions(aiContent, char.id, char.name, addToast);

            // 7. Handle Quote/Reply Logic
            let aiReplyTarget: { id: number, content: string, name: string } | undefined;
            const firstQuoteMatch = aiContent.match(/\[\[QUOTE:\s*(.*?)\]\]/);
            if (firstQuoteMatch) {
                const quotedText = firstQuoteMatch[1];
                // Lookup in historySlice passed from Prompt Builder
                const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText));
                if (targetMsg) aiReplyTarget = { id: targetMsg.id, content: targetMsg.content, name: userProfile.name };
            }

            // 8. Split and Stream (Simulate Typing)
            if (aiContent) {
                const parts = ChatParser.splitResponse(aiContent);

                for (let partIndex = 0; partIndex < parts.length; partIndex++) {
                    const part = parts[partIndex];
                    
                    if (part.type === 'emoji') {
                        const foundEmoji = emojis.find(e => e.name === part.content);
                        if (foundEmoji) {
                            const delay = Math.random() * 500 + 300;
                            await new Promise(r => setTimeout(r, delay));
                            await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'emoji', content: foundEmoji.url });
                            // Update UI
                            setMessages(await DB.getMessagesByCharId(char.id));
                        }
                    } else {
                        // Text Chunking
                        const chunks = ChatParser.chunkText(part.content);
                        if (chunks.length === 0 && part.content.trim()) chunks.push(part.content.trim());

                        for (let i = 0; i < chunks.length; i++) {
                            let chunk = chunks[i];
                            const delay = Math.min(Math.max(chunk.length * 50, 500), 2000);
                            await new Promise(r => setTimeout(r, delay));
                            
                            // Check for inline Quote removal
                            let chunkReplyTarget: { id: number, content: string, name: string } | undefined;
                            const chunkQuoteMatch = chunk.match(/\[\[QUOTE:\s*(.*?)\]\]/);
                            if (chunkQuoteMatch) {
                                const quotedText = chunkQuoteMatch[1];
                                const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText));
                                if (targetMsg) chunkReplyTarget = { id: targetMsg.id, content: targetMsg.content, name: userProfile.name };
                                chunk = chunk.replace(chunkQuoteMatch[0], '').trim();
                            }
                            
                            const replyData = chunkReplyTarget || (partIndex === 0 && i === 0 ? aiReplyTarget : undefined);
                            
                            if (chunk) {
                                await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: chunk, replyTo: replyData });
                                // Update UI
                                setMessages(await DB.getMessagesByCharId(char.id));
                            }
                        }
                    }
                }
            } else {
                // If content was empty (e.g. only actions), just refresh
                setMessages(await DB.getMessagesByCharId(char.id));
            }

        } catch (e: any) {
            await DB.saveMessage({ charId: char.id, role: 'system', type: 'text', content: `[连接中断: ${e.message}]` });
            setMessages(await DB.getMessagesByCharId(char.id));
        } finally {
            setIsTyping(false);
            setRecallStatus('');
        }
    };

    return {
        isTyping,
        recallStatus,
        lastTokenUsage,
        setLastTokenUsage, // Allow manual reset if needed
        triggerAI
    };
};

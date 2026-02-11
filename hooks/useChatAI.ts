
import { useState } from 'react';
import { CharacterProfile, UserProfile, Message, Emoji, EmojiCategory, GroupProfile, RealtimeConfig } from '../types';
import { DB } from '../utils/db';
import { ChatPrompts } from '../utils/chatPrompts';
import { ChatParser } from '../utils/chatParser';
import { RealtimeContextManager, NotionManager, FeishuManager } from '../utils/realtimeContext';

interface UseChatAIProps {
    char: CharacterProfile | undefined;
    userProfile: UserProfile;
    apiConfig: any;
    groups: GroupProfile[];
    emojis: Emoji[];
    categories: EmojiCategory[];
    addToast: (msg: string, type: 'info'|'success'|'error') => void;
    setMessages: (msgs: Message[]) => void; // Callback to update UI messages
    realtimeConfig?: RealtimeConfig; // 新增：实时配置
    translationConfig?: { enabled: boolean; sourceLang: string; targetLang: string };
}

export const useChatAI = ({
    char,
    userProfile,
    apiConfig,
    groups,
    emojis,
    categories,
    addToast,
    setMessages,
    realtimeConfig,  // 新增
    translationConfig
}: UseChatAIProps) => {
    
    const [isTyping, setIsTyping] = useState(false);
    const [recallStatus, setRecallStatus] = useState<string>('');
    const [searchStatus, setSearchStatus] = useState<string>('');
    const [diaryStatus, setDiaryStatus] = useState<string>('');
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);

    const triggerAI = async (currentMsgs: Message[]) => {
        if (isTyping || !char) return;
        if (!apiConfig.baseUrl) { alert("请先在设置中配置 API URL"); return; }

        setIsTyping(true);
        setRecallStatus('');

        try {
            const baseUrl = apiConfig.baseUrl.replace(/\/+$/, '');
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey || 'sk-none'}` };

            // 1. Build System Prompt (包含实时世界信息)
            let systemPrompt = await ChatPrompts.buildSystemPrompt(char, userProfile, groups, emojis, categories, currentMsgs, realtimeConfig);

            // 1.5 Inject bilingual output instruction when translation is enabled
            const bilingualActive = translationConfig?.enabled && translationConfig.sourceLang && translationConfig.targetLang;
            if (bilingualActive) {
                systemPrompt += `\n\n[CRITICAL: 双语输出模式 - 必须严格遵守]
你的每句话都必须用以下XML标签格式输出双语内容：
<翻译>
<原文>${translationConfig.sourceLang}内容</原文>
<译文>${translationConfig.targetLang}内容</译文>
</翻译>

规则：
- 每句话单独包裹一个<翻译>标签
- 多句话就输出多个<翻译>标签，一句一个
- <翻译>标签外不要写任何文字
- 表情包命令 [[SEND_EMOJI: ...]] 放在所有<翻译>标签外面

示例（${translationConfig.sourceLang}→${translationConfig.targetLang}）：
<翻译>
<原文>こんにちは！</原文>
<译文>你好！</译文>
</翻译>
<翻译>
<原文>今日は何する？</原文>
<译文>今天做什么？</译文>
</翻译>`;
            }

            // 2. Build Message History
            const limit = char.contextLimit || 500;
            const { apiMessages, historySlice } = ChatPrompts.buildMessageHistory(currentMsgs, limit, char, userProfile, emojis);

            // 2.5 Strip translation content from previous messages to save tokens
            const cleanedApiMessages = apiMessages.map((msg: any) => {
                if (typeof msg.content !== 'string') return msg;
                let c = msg.content;
                // Strip old %%BILINGUAL%% format
                if (c.toLowerCase().includes('%%bilingual%%')) {
                    const idx = c.toLowerCase().indexOf('%%bilingual%%');
                    c = c.substring(0, idx).trim();
                }
                // Strip new XML tag format: keep only <原文> content
                if (c.includes('<翻译>')) {
                    c = c.replace(/<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/g, '$1').trim();
                }
                return { ...msg, content: c };
            });

            const fullMessages = [{ role: 'system', content: systemPrompt }, ...cleanedApiMessages];

            // 2.6 Reinforce bilingual instruction at the end of messages for stronger compliance
            if (bilingualActive) {
                fullMessages.push({ role: 'system', content: `[Reminder: 每句话必须用 <翻译><原文>...</原文><译文>...</译文></翻译> 标签包裹。一句一个标签。绝对不能省略。]` });
            }

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
                    const recallMessages = [...fullMessages, { role: 'user', content: `[系统: 已成功调取 ${year}-${month} 的详细日志]\n${detailedLogs}\n[系统: 现在请结合这些细节回答用户。保持对话自然。]` }];
                    response = await fetch(`${baseUrl}/chat/completions`, {
                        method: 'POST', headers,
                        body: JSON.stringify({ model: apiConfig.model, messages: recallMessages, temperature: 0.8, stream: false })
                    });
                    if (response.ok) {
                        data = await response.json();
                        if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);
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

            // 5.5 Handle Active Search (主动搜索)
            const searchMatch = aiContent.match(/\[\[SEARCH:\s*(.+?)\]\]/);
            if (searchMatch && realtimeConfig?.newsEnabled && realtimeConfig?.newsApiKey) {
                const searchQuery = searchMatch[1].trim();
                console.log('🔍 [Search] AI触发搜索:', searchQuery);
                setSearchStatus(`正在搜索: ${searchQuery}...`);

                try {
                    const searchResult = await RealtimeContextManager.performSearch(searchQuery, realtimeConfig.newsApiKey);
                    console.log('🔍 [Search] 搜索结果:', searchResult);

                    if (searchResult.success && searchResult.results.length > 0) {
                        // 构建搜索结果字符串
                        const resultsStr = searchResult.results.map((r, i) =>
                            `${i + 1}. ${r.title}\n   ${r.description}`
                        ).join('\n\n');

                        console.log('🔍 [Search] 注入结果到AI，重新生成回复...');

                        // 重新调用 API，注入搜索结果
                        const cleanedForSearch = aiContent.replace(/\[\[SEARCH:.*?\]\]/g, '').trim() || '让我搜一下...';
                        const searchMessages = [
                            ...fullMessages,
                            { role: 'assistant', content: cleanedForSearch },
                            { role: 'user', content: `[系统: 搜索完成！以下是关于"${searchQuery}"的搜索结果]\n\n${resultsStr}\n\n[系统: 现在请根据这些真实信息回复用户。用自然的语气分享，比如"我刚搜了一下发现..."、"诶我看到说..."。不要再输出[[SEARCH:...]]了。]` }
                        ];

                        response = await fetch(`${baseUrl}/chat/completions`, {
                            method: 'POST', headers,
                            body: JSON.stringify({ model: apiConfig.model, messages: searchMessages, temperature: 0.8, stream: false })
                        });

                        if (response.ok) {
                            data = await response.json();
                            if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);
                            aiContent = data.choices?.[0]?.message?.content || '';
                            console.log('🔍 [Search] AI基于搜索结果生成的新回复:', aiContent.slice(0, 100) + '...');
                            // Re-clean
                            aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
                            aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, '');
                            aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');
                            addToast(`🔍 搜索完成: ${searchQuery}`, 'success');
                        }
                    } else {
                        console.log('🔍 [Search] 搜索失败或无结果:', searchResult.message);
                        addToast(`搜索失败: ${searchResult.message}`, 'error');
                        // 搜索失败，移除搜索标记继续
                        aiContent = aiContent.replace(searchMatch[0], '').trim();
                    }
                } catch (e) {
                    console.error('Search execution failed:', e);
                    aiContent = aiContent.replace(searchMatch[0], '').trim();
                }
            } else if (searchMatch) {
                console.log('🔍 [Search] 检测到搜索意图但未配置API Key');
                // 没有配置 API Key，移除搜索标记
                aiContent = aiContent.replace(searchMatch[0], '').trim();
            }
            setSearchStatus('');

            // 清理残留的搜索标记
            aiContent = aiContent.replace(/\[\[SEARCH:.*?\]\]/g, '').trim();

            // 5.6 Handle Diary Writing (写日记到 Notion)
            // 支持两种格式:
            //   旧格式: [[DIARY: 标题 | 内容]]
            //   新格式: [[DIARY_START: 标题 | 心情]]\n多行内容...\n[[DIARY_END]]
            const diaryStartMatch = aiContent.match(/\[\[DIARY_START:\s*(.+?)\]\]\n?([\s\S]*?)\[\[DIARY_END\]\]/);
            const diaryMatch = diaryStartMatch || aiContent.match(/\[\[DIARY:\s*(.+?)\]\]/s);

            if (diaryMatch && realtimeConfig?.notionEnabled && realtimeConfig?.notionApiKey && realtimeConfig?.notionDatabaseId) {
                let title = '';
                let content = '';
                let mood = '';

                if (diaryStartMatch) {
                    // 新格式: [[DIARY_START: 标题 | 心情]]\n内容\n[[DIARY_END]]
                    const header = diaryStartMatch[1].trim();
                    content = diaryStartMatch[2].trim();

                    if (header.includes('|')) {
                        const parts = header.split('|');
                        title = parts[0].trim();
                        mood = parts.slice(1).join('|').trim();
                    } else {
                        title = header;
                    }
                    console.log('📔 [Diary] AI写了一篇长日记:', title, '心情:', mood);
                } else {
                    // 旧格式: [[DIARY: 标题 | 内容]]
                    const diaryRaw = diaryMatch[1].trim();
                    console.log('📔 [Diary] AI想写日记:', diaryRaw);

                    if (diaryRaw.includes('|')) {
                        const parts = diaryRaw.split('|');
                        title = parts[0].trim();
                        content = parts.slice(1).join('|').trim();
                    } else {
                        content = diaryRaw;
                    }
                }

                // 没有标题时用日期
                if (!title) {
                    const now = new Date();
                    title = `${char.name}的日记 - ${now.getMonth() + 1}/${now.getDate()}`;
                }

                try {
                    const result = await NotionManager.createDiaryPage(
                        realtimeConfig.notionApiKey,
                        realtimeConfig.notionDatabaseId,
                        { title, content, mood: mood || undefined, characterName: char.name }
                    );

                    if (result.success) {
                        console.log('📔 [Diary] 写入成功:', result.url);
                        await DB.saveMessage({
                            charId: char.id,
                            role: 'system',
                            type: 'text',
                            content: `📔 ${char.name}写了一篇日记「${title}」`
                        });
                        addToast(`📔 ${char.name}写了一篇日记!`, 'success');
                    } else {
                        console.error('📔 [Diary] 写入失败:', result.message);
                        addToast(`日记写入失败: ${result.message}`, 'error');
                    }
                } catch (e) {
                    console.error('📔 [Diary] 写入异常:', e);
                }

                // 移除日记标记，不在聊天中显示
                aiContent = aiContent.replace(diaryMatch[0], '').trim();
            } else if (diaryMatch) {
                console.log('📔 [Diary] 检测到日记意图但未配置Notion');
                aiContent = aiContent.replace(diaryMatch[0], '').trim();
            }

            // 清理残留的日记标记（两种格式都清理）
            aiContent = aiContent.replace(/\[\[DIARY:.*?\]\]/gs, '').trim();
            aiContent = aiContent.replace(/\[\[DIARY_START:.*?\]\][\s\S]*?\[\[DIARY_END\]\]/g, '').trim();

            // 5.7 Handle Read Diary (翻阅日记)
            const readDiaryMatch = aiContent.match(/\[\[READ_DIARY:\s*(.+?)\]\]/);

            // Helper: make a fallback API call so the AI keeps talking even when diary fails
            // NOTE: Uses role:'user' for the system instruction to ensure API compatibility
            // (some providers reject conversations not ending with a user message)
            const diaryFallbackCall = async (reason: string, tagPattern: RegExp) => {
                const cleaned = aiContent.replace(tagPattern, '').trim() || '让我翻翻日记...';
                const msgs = [
                    ...fullMessages,
                    { role: 'assistant', content: cleaned },
                    { role: 'user', content: `[系统: ${reason}。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 可以自然地提一下，比如"日记好像打不开诶"、"嗯...好像没找到"\n3. 继续正常聊天，用多条消息回复\n4. 严禁再输出[[READ_DIARY:...]]或[[FS_READ_DIARY:...]]标记]` }
                ];
                try {
                    response = await fetch(`${baseUrl}/chat/completions`, {
                        method: 'POST', headers,
                        body: JSON.stringify({ model: apiConfig.model, messages: msgs, temperature: 0.8, stream: false })
                    });
                    if (response.ok) {
                        data = await response.json();
                        if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);
                        aiContent = data.choices?.[0]?.message?.content || '';
                        aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
                        aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, '');
                        aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');
                    }
                } catch (fallbackErr) {
                    console.error('📖 [Diary Fallback] 也失败了:', fallbackErr);
                    aiContent = aiContent.replace(tagPattern, '').trim();
                }
            };

            // Helper: parse various date formats
            const parseDiaryDate = (dateInput: string): string => {
                const now = new Date();
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
                if (dateInput === '今天') return now.toISOString().split('T')[0];
                if (dateInput === '昨天') { const d = new Date(now); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }
                if (dateInput === '前天') { const d = new Date(now); d.setDate(d.getDate() - 2); return d.toISOString().split('T')[0]; }
                const daysAgo = dateInput.match(/^(\d+)天前$/);
                if (daysAgo) { const d = new Date(now); d.setDate(d.getDate() - parseInt(daysAgo[1])); return d.toISOString().split('T')[0]; }
                const monthDay = dateInput.match(/(\d{1,2})月(\d{1,2})/);
                if (monthDay) return `${now.getFullYear()}-${monthDay[1].padStart(2, '0')}-${monthDay[2].padStart(2, '0')}`;
                const parsed = new Date(dateInput);
                if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
                return '';
            };

            if (readDiaryMatch) {
                const dateInput = readDiaryMatch[1].trim();
                console.log('📖 [ReadDiary] AI想翻阅日记:', dateInput);

                if (realtimeConfig?.notionEnabled && realtimeConfig?.notionApiKey && realtimeConfig?.notionDatabaseId) {
                    const targetDate = parseDiaryDate(dateInput);

                    if (targetDate) {
                        try {
                            setDiaryStatus(`正在翻阅 ${targetDate} 的日记...`);

                            const findResult = await NotionManager.getDiaryByDate(
                                realtimeConfig.notionApiKey,
                                realtimeConfig.notionDatabaseId,
                                char.name,
                                targetDate
                            );

                            if (findResult.success && findResult.entries.length > 0) {
                                setDiaryStatus(`找到 ${findResult.entries.length} 篇日记，正在阅读...`);
                                const diaryContents: string[] = [];
                                for (const entry of findResult.entries) {
                                    const readResult = await NotionManager.readDiaryContent(
                                        realtimeConfig.notionApiKey,
                                        entry.id
                                    );
                                    if (readResult.success) {
                                        diaryContents.push(`📔「${entry.title}」(${entry.date})\n${readResult.content}`);
                                    }
                                }

                                if (diaryContents.length > 0) {
                                    const diaryText = diaryContents.join('\n\n---\n\n');
                                    console.log('📖 [ReadDiary] 成功读取', findResult.entries.length, '篇日记');
                                    setDiaryStatus('正在整理日记回忆...');

                                    const cleanedForDiary = aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                                    const diaryMessages = [
                                        ...fullMessages,
                                        { role: 'assistant', content: cleanedForDiary },
                                        { role: 'user', content: `[系统: 你翻开了自己 ${targetDate} 的日记，以下是你当时写的内容]\n\n${diaryText}\n\n[系统: 你已经看完了日记。现在请你：\n1. 先正常回应用户刚才说的话（这是最重要的！用户还在等你回复）\n2. 自然地把日记中的回忆融入你的回复中，比如"我想起来了那天..."、"看了日记才发现..."等\n3. 可以分享日记中有趣的细节，表达当时的情绪\n4. 用多条消息回复，别只说一句话就结束\n5. 严禁再输出[[READ_DIARY:...]]标记]` }
                                    ];

                                    response = await fetch(`${baseUrl}/chat/completions`, {
                                        method: 'POST', headers,
                                        body: JSON.stringify({ model: apiConfig.model, messages: diaryMessages, temperature: 0.8, stream: false })
                                    });

                                    if (response.ok) {
                                        data = await response.json();
                                        if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);
                                        aiContent = data.choices?.[0]?.message?.content || '';
                                        aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
                                        aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, '');
                                        aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');
                                        addToast(`📖 ${char.name}翻阅了${targetDate}的日记`, 'info');
                                    }
                                } else {
                                    console.log('📖 [ReadDiary] 日记内容为空');
                                    await diaryFallbackCall('你翻开了日记本但页面是空白的', /\[\[READ_DIARY:.*?\]\]/g);
                                }
                            } else {
                                console.log('📖 [ReadDiary] 该日期没有日记:', targetDate);
                                setDiaryStatus(`${targetDate} 没有找到日记...`);
                                const cleanedForNoDiary = aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                                const nodiaryMessages = [
                                    ...fullMessages,
                                    { role: 'assistant', content: cleanedForNoDiary },
                                    { role: 'user', content: `[系统: 你翻了翻日记本，发现 ${targetDate} 那天没有写日记。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 自然地提到没找到那天的日记，比如"嗯...那天好像没写日记"、"翻了翻没找到诶"\n3. 用多条消息回复，保持对话自然\n4. 严禁再输出[[READ_DIARY:...]]标记]` }
                                ];

                                response = await fetch(`${baseUrl}/chat/completions`, {
                                    method: 'POST', headers,
                                    body: JSON.stringify({ model: apiConfig.model, messages: nodiaryMessages, temperature: 0.8, stream: false })
                                });

                                if (response.ok) {
                                    data = await response.json();
                                    if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);
                                    aiContent = data.choices?.[0]?.message?.content || '';
                                    aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
                                    aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, '');
                                    aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');
                                }
                            }
                        } catch (e) {
                            console.error('📖 [ReadDiary] 读取异常:', e);
                            setDiaryStatus('日记读取失败，继续对话...');
                            await diaryFallbackCall('你想翻阅日记但读取出了问题（可能是网络问题）', /\[\[READ_DIARY:.*?\]\]/g);
                        }
                    } else {
                        console.log('📖 [ReadDiary] 无法解析日期:', dateInput);
                        await diaryFallbackCall(`你想翻阅日记但没能理解要找哪天的（"${dateInput}"）`, /\[\[READ_DIARY:.*?\]\]/g);
                    }
                } else {
                    console.log('📖 [ReadDiary] 检测到读日记意图但未配置Notion');
                    await diaryFallbackCall('你想翻阅日记但日记本暂时不可用', /\[\[READ_DIARY:.*?\]\]/g);
                }
                setDiaryStatus('');
            }

            // 清理残留的读日记标记
            aiContent = aiContent.replace(/\[\[READ_DIARY:.*?\]\]/g, '').trim();

            // 5.8 Handle Feishu Diary Writing (写日记到飞书多维表格 - 独立于 Notion)
            const fsDiaryStartMatch = aiContent.match(/\[\[FS_DIARY_START:\s*(.+?)\]\]\n?([\s\S]*?)\[\[FS_DIARY_END\]\]/);
            const fsDiaryMatch = fsDiaryStartMatch || aiContent.match(/\[\[FS_DIARY:\s*(.+?)\]\]/s);

            if (fsDiaryMatch && realtimeConfig?.feishuEnabled && realtimeConfig?.feishuAppId && realtimeConfig?.feishuAppSecret && realtimeConfig?.feishuBaseId && realtimeConfig?.feishuTableId) {
                let fsTitle = '';
                let fsContent = '';
                let fsMood = '';

                if (fsDiaryStartMatch) {
                    const header = fsDiaryStartMatch[1].trim();
                    fsContent = fsDiaryStartMatch[2].trim();
                    if (header.includes('|')) {
                        const parts = header.split('|');
                        fsTitle = parts[0].trim();
                        fsMood = parts.slice(1).join('|').trim();
                    } else {
                        fsTitle = header;
                    }
                    console.log('📒 [Feishu] AI写了一篇长日记:', fsTitle, '心情:', fsMood);
                } else {
                    const diaryRaw = fsDiaryMatch[1].trim();
                    console.log('📒 [Feishu] AI想写日记:', diaryRaw);
                    if (diaryRaw.includes('|')) {
                        const parts = diaryRaw.split('|');
                        fsTitle = parts[0].trim();
                        fsContent = parts.slice(1).join('|').trim();
                    } else {
                        fsContent = diaryRaw;
                    }
                }

                if (!fsTitle) {
                    const now = new Date();
                    fsTitle = `${char.name}的日记 - ${now.getMonth() + 1}/${now.getDate()}`;
                }

                try {
                    const result = await FeishuManager.createDiaryRecord(
                        realtimeConfig.feishuAppId,
                        realtimeConfig.feishuAppSecret,
                        realtimeConfig.feishuBaseId,
                        realtimeConfig.feishuTableId,
                        { title: fsTitle, content: fsContent, mood: fsMood || undefined, characterName: char.name }
                    );

                    if (result.success) {
                        console.log('📒 [Feishu] 写入成功:', result.recordId);
                        await DB.saveMessage({
                            charId: char.id,
                            role: 'system',
                            type: 'text',
                            content: `📒 ${char.name}写了一篇日记「${fsTitle}」(飞书)`
                        });
                        addToast(`📒 ${char.name}写了一篇日记! (飞书)`, 'success');
                    } else {
                        console.error('📒 [Feishu] 写入失败:', result.message);
                        addToast(`飞书日记写入失败: ${result.message}`, 'error');
                    }
                } catch (e) {
                    console.error('📒 [Feishu] 写入异常:', e);
                }

                aiContent = aiContent.replace(fsDiaryMatch[0], '').trim();
            } else if (fsDiaryMatch) {
                console.log('📒 [Feishu] 检测到日记意图但未配置飞书');
                aiContent = aiContent.replace(fsDiaryMatch[0], '').trim();
            }

            // 清理残留的飞书日记标记
            aiContent = aiContent.replace(/\[\[FS_DIARY:.*?\]\]/gs, '').trim();
            aiContent = aiContent.replace(/\[\[FS_DIARY_START:.*?\]\][\s\S]*?\[\[FS_DIARY_END\]\]/g, '').trim();

            // 5.9 Handle Feishu Read Diary (翻阅飞书日记)
            const fsReadDiaryMatch = aiContent.match(/\[\[FS_READ_DIARY:\s*(.+?)\]\]/);
            if (fsReadDiaryMatch) {
                const dateInput = fsReadDiaryMatch[1].trim();
                console.log('📖 [Feishu ReadDiary] AI想翻阅飞书日记:', dateInput);

                if (realtimeConfig?.feishuEnabled && realtimeConfig?.feishuAppId && realtimeConfig?.feishuAppSecret && realtimeConfig?.feishuBaseId && realtimeConfig?.feishuTableId) {
                    const targetDate = parseDiaryDate(dateInput);

                    if (targetDate) {
                        try {
                            setDiaryStatus(`正在翻阅 ${targetDate} 的飞书日记...`);

                            const findResult = await FeishuManager.getDiaryByDate(
                                realtimeConfig.feishuAppId,
                                realtimeConfig.feishuAppSecret,
                                realtimeConfig.feishuBaseId,
                                realtimeConfig.feishuTableId,
                                char.name,
                                targetDate
                            );

                            if (findResult.success && findResult.entries.length > 0) {
                                setDiaryStatus(`找到 ${findResult.entries.length} 篇飞书日记，正在阅读...`);
                                const diaryContents: string[] = [];
                                for (const entry of findResult.entries) {
                                    diaryContents.push(`📒「${entry.title}」(${entry.date})\n${entry.content}`);
                                }

                                if (diaryContents.length > 0) {
                                    const diaryText = diaryContents.join('\n\n---\n\n');
                                    console.log('📖 [Feishu ReadDiary] 成功读取', findResult.entries.length, '篇日记');
                                    setDiaryStatus('正在整理日记回忆...');

                                    const cleanedForFsDiary = aiContent.replace(/\[\[FS_READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                                    const diaryMessages = [
                                        ...fullMessages,
                                        { role: 'assistant', content: cleanedForFsDiary },
                                        { role: 'user', content: `[系统: 你翻开了自己 ${targetDate} 的日记（飞书），以下是你当时写的内容]\n\n${diaryText}\n\n[系统: 你已经看完了日记。现在请你：\n1. 先正常回应用户刚才说的话（这是最重要的！用户还在等你回复）\n2. 自然地把日记中的回忆融入你的回复中，比如"我想起来了那天..."、"看了日记才发现..."等\n3. 可以分享日记中有趣的细节，表达当时的情绪\n4. 用多条消息回复，别只说一句话就结束\n5. 严禁再输出[[FS_READ_DIARY:...]]标记]` }
                                    ];

                                    response = await fetch(`${baseUrl}/chat/completions`, {
                                        method: 'POST', headers,
                                        body: JSON.stringify({ model: apiConfig.model, messages: diaryMessages, temperature: 0.8, stream: false })
                                    });

                                    if (response.ok) {
                                        data = await response.json();
                                        if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);
                                        aiContent = data.choices?.[0]?.message?.content || '';
                                        aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
                                        aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, '');
                                        aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');
                                        addToast(`📖 ${char.name}翻阅了${targetDate}的飞书日记`, 'info');
                                    }
                                } else {
                                    console.log('📖 [Feishu ReadDiary] 日记内容为空');
                                    await diaryFallbackCall('你翻开了飞书日记本但页面是空白的', /\[\[FS_READ_DIARY:.*?\]\]/g);
                                }
                            } else {
                                setDiaryStatus(`${targetDate} 没有找到飞书日记...`);
                                const cleanedForFsNoDiary = aiContent.replace(/\[\[FS_READ_DIARY:.*?\]\]/g, '').trim() || '让我翻翻日记...';
                                const nodiaryMessages = [
                                    ...fullMessages,
                                    { role: 'assistant', content: cleanedForFsNoDiary },
                                    { role: 'user', content: `[系统: 你翻了翻飞书日记本，发现 ${targetDate} 那天没有写日记。请你：\n1. 先正常回应用户刚才说的话（用户还在等你回复！）\n2. 自然地提到没找到那天的日记，比如"嗯...那天好像没写日记"、"翻了翻没找到诶"\n3. 用多条消息回复，保持对话自然\n4. 严禁再输出[[FS_READ_DIARY:...]]标记]` }
                                ];

                                response = await fetch(`${baseUrl}/chat/completions`, {
                                    method: 'POST', headers,
                                    body: JSON.stringify({ model: apiConfig.model, messages: nodiaryMessages, temperature: 0.8, stream: false })
                                });

                                if (response.ok) {
                                    data = await response.json();
                                    if (data.usage?.total_tokens) setLastTokenUsage(data.usage.total_tokens);
                                    aiContent = data.choices?.[0]?.message?.content || '';
                                    aiContent = aiContent.replace(/\[\d{4}[-/年]\d{1,2}[-/月]\d{1,2}.*?\]/g, '');
                                    aiContent = aiContent.replace(/^[\w\u4e00-\u9fa5]+:\s*/, '');
                                    aiContent = aiContent.replace(/\[(?:你|User|用户|System)\s*发送了表情包[:：]\s*(.*?)\]/g, '[[SEND_EMOJI: $1]]');
                                }
                            }
                        } catch (e) {
                            console.error('📖 [Feishu ReadDiary] 读取异常:', e);
                            setDiaryStatus('飞书日记读取失败，继续对话...');
                            await diaryFallbackCall('你想翻阅飞书日记但读取出了问题（可能是网络问题）', /\[\[FS_READ_DIARY:.*?\]\]/g);
                        }
                    } else {
                        console.log('📖 [Feishu ReadDiary] 无法解析日期:', dateInput);
                        await diaryFallbackCall(`你想翻阅飞书日记但没能理解要找哪天的（"${dateInput}"）`, /\[\[FS_READ_DIARY:.*?\]\]/g);
                    }
                } else {
                    console.log('📖 [Feishu ReadDiary] 检测到读日记意图但未配置飞书');
                    await diaryFallbackCall('你想翻阅飞书日记但飞书暂时不可用', /\[\[FS_READ_DIARY:.*?\]\]/g);
                }
                setDiaryStatus('');
            }

            // 清理残留的飞书读日记标记
            aiContent = aiContent.replace(/\[\[FS_READ_DIARY:.*?\]\]/g, '').trim();

            // 6. Parse Actions (Poke, Transfer, Schedule, etc.)
            aiContent = await ChatParser.parseAndExecuteActions(aiContent, char.id, char.name, addToast);

            // 7. Handle Quote/Reply Logic (Robust: handles [[QUOTE:...]], [QUOTE:...])
            // Use separate patterns: [[...]] requires exact ]] close (safe with ] in content); [QUOTE:...] disallows ] in content
            let aiReplyTarget: { id: number, content: string, name: string } | undefined;
            const firstQuoteMatch = aiContent.match(/\[\[QUOTE:\s*([\s\S]*?)\]\]/) || aiContent.match(/\[QUOTE:\s*([^\]]*)\]/);
            if (firstQuoteMatch) {
                const quotedText = firstQuoteMatch[1].trim();
                if (quotedText) {
                    // Try exact include first, then fuzzy match (first 10 chars)
                    const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText))
                        || (quotedText.length > 10 ? historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText.slice(0, 10))) : undefined);
                    if (targetMsg) aiReplyTarget = { id: targetMsg.id, content: targetMsg.content, name: userProfile.name };
                }
            }
            // Clean all quote tag variants from content
            aiContent = aiContent.replace(/\[\[QUOTE:\s*[\s\S]*?\]\]/g, '').replace(/\[QUOTE:\s*[^\]]*\]/g, '').trim();

            // 8. Split and Stream (Simulate Typing)
            // Note: SEND_EMOJI tags are preserved through sanitize so splitResponse can interleave them with text

            // Comprehensive AI output sanitization (strips name prefixes, headers, stray backticks, residual tags, etc.)
            aiContent = ChatParser.sanitize(aiContent);

            // Fallback: if second-pass API calls (search/diary) returned empty, provide a minimal response
            if (!aiContent.trim() && (searchMatch || readDiaryMatch || fsReadDiaryMatch)) {
                aiContent = '嗯...';
            }
            if (aiContent) {

                // Check for <翻译> XML tags (new bilingual format)
                const hasTranslationTags = /<翻译>\s*<原文>[\s\S]*?<\/原文>\s*<译文>[\s\S]*?<\/译文>\s*<\/翻译>/.test(aiContent);

                let globalMsgIndex = 0;

                if (hasTranslationTags) {
                    // ─── New bilingual format: each <翻译> block = one bubble ───
                    // Extract emojis for bilingual path (splitResponse not used here)
                    const bilingualEmojis: string[] = [];
                    let bEm;
                    const bEmojiPat = /\[\[SEND_EMOJI:\s*(.*?)\]\]/g;
                    while ((bEm = bEmojiPat.exec(aiContent)) !== null) {
                        const name = bEm[1].trim();
                        if (!bilingualEmojis.includes(name)) bilingualEmojis.push(name);
                    }
                    aiContent = aiContent.replace(/\[\[SEND_EMOJI:\s*.*?\]\]/g, '').trim();
                    const tagPattern = /<翻译>\s*<原文>([\s\S]*?)<\/原文>\s*<译文>([\s\S]*?)<\/译文>\s*<\/翻译>/g;
                    let lastIndex = 0;
                    let tagMatch;

                    while ((tagMatch = tagPattern.exec(aiContent)) !== null) {
                        // Save any plain text BEFORE this <翻译> block
                        const textBefore = aiContent.slice(lastIndex, tagMatch.index).trim();
                        if (textBefore) {
                            const cleaned = ChatParser.sanitize(textBefore);
                            if (cleaned && ChatParser.hasDisplayContent(cleaned)) {
                                const chunks = ChatParser.chunkText(cleaned);
                                for (const chunk of chunks) {
                                    if (!chunk) continue;
                                    const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                                    await new Promise(r => setTimeout(r, Math.min(Math.max(chunk.length * 50, 500), 2000)));
                                    await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: chunk, replyTo: replyData });
                                    setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                                    globalMsgIndex++;
                                }
                            }
                        }

                        // Save the bilingual pair (stored as langA\n%%BILINGUAL%%\nlangB for renderer compatibility)
                        const originalText = ChatParser.sanitize(tagMatch[1].trim());
                        const translatedText = ChatParser.sanitize(tagMatch[2].trim());
                        if (originalText || translatedText) {
                            const biContent = originalText && translatedText
                                ? `${originalText}\n%%BILINGUAL%%\n${translatedText}`
                                : (originalText || translatedText);
                            const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                            await new Promise(r => setTimeout(r, Math.min(Math.max(biContent.length * 30, 400), 2000)));
                            await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: biContent, replyTo: replyData });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            globalMsgIndex++;
                        }

                        lastIndex = tagMatch.index + tagMatch[0].length;
                    }

                    // Save any remaining text AFTER last <翻译> block
                    const textAfter = aiContent.slice(lastIndex).trim();
                    if (textAfter) {
                        // Strip any stray translation tags
                        const cleaned = ChatParser.sanitize(textAfter.replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '').trim());
                        if (cleaned && ChatParser.hasDisplayContent(cleaned)) {
                            const chunks = ChatParser.chunkText(cleaned);
                            for (const chunk of chunks) {
                                if (!chunk) continue;
                                const replyData = globalMsgIndex === 0 ? aiReplyTarget : undefined;
                                await new Promise(r => setTimeout(r, Math.min(Math.max(chunk.length * 50, 500), 2000)));
                                await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: chunk, replyTo: replyData });
                                setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                                globalMsgIndex++;
                            }
                        }
                    }

                    // Send extracted emojis after bilingual text
                    for (const emojiName of bilingualEmojis) {
                        const foundEmoji = emojis.find(e => e.name === emojiName);
                        if (foundEmoji) {
                            await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
                            await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'emoji', content: foundEmoji.url });
                            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                        }
                    }
                } else {
                    // ─── Normal text (no bilingual tags) ───
                    // Also handles legacy %%BILINGUAL%% format for backwards compatibility
                    const parts = ChatParser.splitResponse(aiContent);
                    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
                        const part = parts[partIndex];

                        if (part.type === 'emoji') {
                            const foundEmoji = emojis.find(e => e.name === part.content);
                            if (foundEmoji) {
                                await new Promise(r => setTimeout(r, Math.random() * 500 + 300));
                                await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'emoji', content: foundEmoji.url });
                                setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                            }
                        } else {
                            // Split on --- separators first, then chunkText for fine-grained splitting
                            const rawBlocks = part.content.split(/^\s*---\s*$/m).filter(b => b.trim());
                            const allChunks: string[] = [];
                            for (const block of rawBlocks) {
                                allChunks.push(...ChatParser.chunkText(block.trim()));
                            }
                            if (allChunks.length === 0 && part.content.trim()) allChunks.push(part.content.trim());

                            for (let i = 0; i < allChunks.length; i++) {
                                let chunk = allChunks[i];
                                const delay = Math.min(Math.max(chunk.length * 50, 500), 2000);
                                await new Promise(r => setTimeout(r, delay));

                                let chunkReplyTarget: { id: number, content: string, name: string } | undefined;
                                const chunkQuoteMatch = chunk.match(/\[\[QUOTE:\s*([\s\S]*?)\]\]/) || chunk.match(/\[QUOTE:\s*([^\]]*)\]/);
                                if (chunkQuoteMatch) {
                                    const quotedText = chunkQuoteMatch[1].trim();
                                    if (quotedText) {
                                        const targetMsg = historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText))
                                            || (quotedText.length > 10 ? historySlice.slice().reverse().find((m: Message) => m.role === 'user' && m.content.includes(quotedText.slice(0, 10))) : undefined);
                                        if (targetMsg) chunkReplyTarget = { id: targetMsg.id, content: targetMsg.content, name: userProfile.name };
                                    }
                                    chunk = chunk.replace(/\[\[QUOTE:\s*[\s\S]*?\]\]/g, '').replace(/\[QUOTE:\s*[^\]]*\]/g, '').trim();
                                }

                                const replyData = chunkReplyTarget || (globalMsgIndex === 0 ? aiReplyTarget : undefined);

                                if (ChatParser.hasDisplayContent(chunk)) {
                                    const cleanChunk = ChatParser.sanitize(chunk);
                                    if (cleanChunk) {
                                        await DB.saveMessage({ charId: char.id, role: 'assistant', type: 'text', content: cleanChunk, replyTo: replyData });
                                        setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
                                        globalMsgIndex++;
                                    }
                                }
                            }
                        }
                    }
                }

            } else {
                // If content was empty (e.g. only actions), just refresh
                setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
            }

        } catch (e: any) {
            await DB.saveMessage({ charId: char.id, role: 'system', type: 'text', content: `[连接中断: ${e.message}]` });
            setMessages(await DB.getRecentMessagesByCharId(char.id, 200));
        } finally {
            setIsTyping(false);
            setRecallStatus('');
            setSearchStatus('');
            setDiaryStatus('');
        }
    };

    return {
        isTyping,
        recallStatus,
        searchStatus,
        diaryStatus,
        lastTokenUsage,
        setLastTokenUsage, // Allow manual reset if needed
        triggerAI
    };
};


import { DB } from './db';
import { LocalNotifications } from '@capacitor/local-notifications';

export const ChatParser = {
    // Return cleaned content and perform side effects
    parseAndExecuteActions: async (
        aiContent: string,
        charId: string,
        charName: string,
        addToast: (msg: string, type: 'info'|'success'|'error') => void
    ) => {
        let content = aiContent;

        // POKE
        if (content.includes('[[ACTION:POKE]]')) {
            await DB.saveMessage({ charId, role: 'assistant', type: 'interaction', content: '[戳一戳]' });
            content = content.replace('[[ACTION:POKE]]', '').trim();
        }

        // TRANSFER
        const transferMatch = content.match(/\[\[ACTION:TRANSFER:(\d+)\]\]/);
        if (transferMatch) {
            await DB.saveMessage({ charId, role: 'assistant', type: 'transfer', content: '[转账]', metadata: { amount: transferMatch[1] } });
            content = content.replace(transferMatch[0], '').trim();
        }

        // ADD_EVENT
        const eventMatch = content.match(/\[\[ACTION:ADD_EVENT\s*\|\s*(.*?)\s*\|\s*(.*?)\]\]/);
        if (eventMatch) {
            const title = eventMatch[1].trim();
            const date = eventMatch[2].trim();
            if (title && date) {
                const anni: any = { id: `anni-${Date.now()}`, title: title, date: date, charId };
                await DB.saveAnniversary(anni);
                addToast(`${charName} 添加了新日程: ${title}`, 'success');
                await DB.saveMessage({ charId, role: 'system', type: 'text', content: `[系统: ${charName} 新增了日程 "${title}" (${date})]` });
            }
            content = content.replace(eventMatch[0], '').trim();
        }

        // SCHEDULE
        const scheduleRegex = /\[schedule_message \| (.*?) \| fixed \| (.*?)\]/g;
        let match;
        while ((match = scheduleRegex.exec(content)) !== null) {
            const timeStr = match[1].trim();
            const msgContent = match[2].trim();
            const dueTime = new Date(timeStr).getTime();
            if (!isNaN(dueTime) && dueTime > Date.now()) {
                await DB.saveScheduledMessage({ id: `sched-${Date.now()}-${Math.random()}`, charId, content: msgContent, dueAt: dueTime, createdAt: Date.now() });
                try {
                    const hasPerm = await LocalNotifications.checkPermissions();
                    if (hasPerm.display === 'granted') {
                        await LocalNotifications.schedule({ notifications: [{ title: charName, body: msgContent, id: Math.floor(Math.random() * 100000), schedule: { at: new Date(dueTime) }, smallIcon: 'ic_stat_icon_config_sample' }] });
                    }
                } catch (e) { console.log("Notification schedule skipped (web mode)"); }
                addToast(`${charName} 似乎打算一会儿找你...`, 'info');
            }
        }
        content = content.replace(scheduleRegex, '').trim();

        // RECALL tag removal (handling done in main loop logic, but cleaning here just in case)
        content = content.replace(/\[\[RECALL:.*?\]\]/g, '').trim();

        return content;
    },

    /**
     * Comprehensive sanitizer for AI output before saving to DB.
     * Removes AI-specific artifacts that should never appear in chat bubbles.
     * Safe to call multiple times (idempotent). Preserves %%BILINGUAL%% markers.
     */
    sanitize: (text: string): string => {
        return text
            // Strip leaked timestamps from chat history context:
            // [2026-02-11 13:52] format (bracketed, from history entries)
            .replace(/\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\]\s*/g, '')
            // 2026-02-11 13:52 format (unbracketed, at line start)
            .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s*/gm, '')
            // （下午1:52）or（上午10:30）Chinese 12h parenthetical
            .replace(/（[上下]午\d{1,2}[：:]\d{2}）/g, '')
            // (1:52 PM) or (10:30 AM) English 12h parenthetical
            .replace(/\(\d{1,2}:\d{2}\s*[AP]M\)/gi, '')
            // Strip markdown headers (# ## ### etc) → keep the text
            .replace(/^#{1,6}\s+/gm, '')
            // Strip residual action/system tags that weren't caught earlier
            .replace(/\[\[(?:ACTION|RECALL|SEARCH|DIARY|READ_DIARY|FS_DIARY|FS_READ_DIARY|DIARY_START|DIARY_END|FS_DIARY_START|FS_DIARY_END)[:\s][\s\S]*?\]\]/g, '')
            .replace(/\[schedule_message[^\]]*\]/g, '')
            .replace(/\[\[QUOTE:\s*[\s\S]*?\]\]/g, '')
            .replace(/\[QUOTE:\s*[^\]]*\]/g, '')
            // Strip backtick-wrapped action tags and empty backtick pairs
            .replace(/`(\[\[[\s\S]*?\]\])`/g, '$1')
            .replace(/``+/g, '')
            .replace(/(^|\s)`(\s|$)/gm, '$1$2')
            // Strip markdown links → keep text only: [text](url) → text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Strip all ** sequences (orphaned bold markers are common AI artifacts;
            // in chat context, losing bold formatting is acceptable for clean display)
            .replace(/\*{2,}/g, '')
            // Strip standalone separators and bullets
            .replace(/^\s*---\s*$/gm, '')
            .replace(/^\s*[-*+]\s*$/gm, '')
            // Strip legacy translation marker (but keep %%BILINGUAL%% and <翻译> XML tags)
            .replace(/%%TRANS%%[\s\S]*/gi, '')
            // Collapse excessive whitespace
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    },

    /**
     * Check if text has meaningful display content after stripping all markers/junk.
     * Used to decide whether a chunk is worth saving as a message.
     */
    hasDisplayContent: (text: string): boolean => {
        const stripped = text
            .replace(/%%BILINGUAL%%/gi, '')
            .replace(/%%TRANS%%[\s\S]*/gi, '')
            .replace(/<\/?翻译>|<\/?原文>|<\/?译文>/g, '')
            .replace(/^\s*---\s*$/gm, '')
            .replace(/``+/g, '')
            .replace(/(^|\s)`(\s|$)/gm, '$1$2')
            .replace(/\[\[[\s\S]*?\]\]/g, '')
            .replace(/\[QUOTE:[^\]]*\]/g, '')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^\s*[-*+]\s*$/gm, '')
            .trim();
        return stripped.length > 0;
    },

    // Split text into bubbles (text and emojis)
    splitResponse: (content: string): { type: 'text' | 'emoji', content: string }[] => {
        const emojiPattern = /\[\[SEND_EMOJI:\s*(.*?)\]\]/g;
        const parts: {type: 'text' | 'emoji', content: string}[] = [];
        let lastIndex = 0;
        let emojiMatch;

        while ((emojiMatch = emojiPattern.exec(content)) !== null) {
            if (emojiMatch.index > lastIndex) {
                const textBefore = content.slice(lastIndex, emojiMatch.index).trim();
                if (textBefore) parts.push({ type: 'text', content: textBefore });
            }
            parts.push({ type: 'emoji', content: emojiMatch[1].trim() });
            lastIndex = emojiMatch.index + emojiMatch[0].length;
        }

        if (lastIndex < content.length) {
            const remaining = content.slice(lastIndex).trim();
            if (remaining) parts.push({ type: 'text', content: remaining });
        }

        if (parts.length === 0 && content.trim()) parts.push({ type: 'text', content: content.trim() });
        return parts;
    },

    // Chunking text for typing effect - splits into separate chat bubbles
    chunkText: (text: string): string[] => {
        // 1. Protect special content from being split by sentence-boundary punctuation
        const protectMap: Record<string, string> = {};
        let protectIdx = 0;
        const protect = (match: string): string => {
            const key = `{{P${protectIdx++}}}`;
            protectMap[key] = match;
            return key;
        };

        let tempContent = text
            // Protect <翻译> bilingual blocks as atomic units (never split inside)
            .replace(/<翻译>[\s\S]*?<\/翻译>/g, protect)
            // Protect QUOTE tags
            .replace(/\[\[QUOTE:\s*[\s\S]*?\]\]|\[QUOTE:\s*[^\]]*\]/g, protect)
            // Protect URLs (periods in URLs should NOT trigger splits)
            .replace(/https?:\/\/[^\s)\]>]+/g, protect)
            // Protect code blocks
            .replace(/```[\s\S]*?```/g, protect)
            // Protect inline code
            .replace(/`[^`]+`/g, protect)
            // Protect decimal numbers (e.g. 3.14)
            .replace(/\d+\.\d+/g, protect)
            // Protect common abbreviations
            .replace(/(?:Mr|Mrs|Ms|Dr|Prof|etc|vs|e\.g|i\.e)\./gi, protect);

        // 2. Protect ellipses
        tempContent = tempContent
            .replace(/\.{2,}/g, '{{ELLIPSIS_ENG}}')
            .replace(/…+/g, '{{ELLIPSIS_CN}}');

        // 3. Split on sentence boundaries
        tempContent = tempContent
            .replace(/([。])(?![）\)\]】""'])/g, '{{SPLIT}}')
            // Only split on English period at true end-of-sentence
            .replace(/\.(?=\s*$)/gm, '{{SPLIT}}')
            .replace(/\.(?=\s+[A-Z])/g, '.{{SPLIT}}')
            .replace(/([！!？?~]+)(?![）\)\]】""'])/g, '$1{{SPLIT}}')
            .replace(/\n+/g, '{{SPLIT}}')
            .replace(/([\u4e00-\u9fa5])[ ]+([\u4e00-\u9fa5])/g, '$1{{SPLIT}}$2');

        // 4. Split, restore ellipses and protected content
        let chunks = tempContent.split('{{SPLIT}}')
            .map(c => c.trim())
            .filter(c => c.length > 0)
            .map(c => {
                c = c.replace(/{{ELLIPSIS_ENG}}/g, '...').replace(/{{ELLIPSIS_CN}}/g, '……');
                // Restore all protected placeholders
                Object.keys(protectMap).forEach(key => {
                    c = c.replace(key, protectMap[key]);
                });
                return c;
            });

        // 5. Merge very short chunks (< 3 chars, likely stray punctuation) with the previous chunk
        if (chunks.length > 1) {
            const merged: string[] = [];
            for (let i = 0; i < chunks.length; i++) {
                if (chunks[i].length < 3 && merged.length > 0) {
                    merged[merged.length - 1] += chunks[i];
                } else {
                    merged.push(chunks[i]);
                }
            }
            chunks = merged;
        }

        return chunks;
    }
}

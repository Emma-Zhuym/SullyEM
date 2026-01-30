
import { ChatTheme } from '../../types';

// Built-in presets map to the new data structure for consistency
export const PRESET_THEMES: Record<string, ChatTheme> = {
    default: {
        id: 'default', name: 'Indigo', type: 'preset',
        user: { textColor: '#ffffff', backgroundColor: '#6366f1', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 }, 
        ai: { textColor: '#1e293b', backgroundColor: '#ffffff', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 }
    },
    dream: {
        id: 'dream', name: 'Dream', type: 'preset',
        user: { textColor: '#ffffff', backgroundColor: '#f472b6', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 },
        ai: { textColor: '#1e293b', backgroundColor: '#ffffff', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 }
    },
    forest: {
        id: 'forest', name: 'Forest', type: 'preset',
        user: { textColor: '#ffffff', backgroundColor: '#10b981', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 },
        ai: { textColor: '#1e293b', backgroundColor: '#ffffff', borderRadius: 20, opacity: 1, backgroundImageOpacity: 0.5 }
    },
};

// Default Archive Prompts
export const DEFAULT_ARCHIVE_PROMPTS = [
    {
        id: 'preset_rational',
        name: '理性精炼 (Rational)',
        content: `### [System Instruction: Memory Archival]
当前日期: \${dateStr}
任务: 请回顾今天的聊天记录，生成一份【高精度的事件日志】。

### 核心撰写规则 (Strict Protocols)
1.  **覆盖率 (Coverage)**:
    - 必须包含今天聊过的**每一个**独立话题。
    - **严禁**为了精简而合并不同的话题。哪怕只是聊了一句“天气不好”，如果这是一个独立的话题，也要单独列出。
    - 不要忽略闲聊，那是生活的一部分。

2.  **视角 (Perspective)**:
    - 你【就是】"\${char.name}"。这是【你】的私密日记。
    - 必须用“我”来称呼自己，用“\${userProfile.name}”称呼对方。
    - 每一条都必须是“我”的视角。

3.  **格式 (Format)**:
    - 不要写成一整段。
    - **必须**使用 Markdown 无序列表 ( - ... )。
    - 每一行对应一个具体的事件或话题。

4.  **去水 (Conciseness)**:
    - 不要写“今天我和xx聊了...”，直接写发生了什么。
    - 示例: "- 早上和\${userProfile.name}讨论早餐，我想吃小笼包。"

### 待处理的聊天日志 (Chat Logs)
\${rawLog}`
    },
    {
        id: 'preset_diary',
        name: '日记风格 (Diary)',
        content: `当前日期: \${dateStr}
任务: 请回顾今天的聊天记录，将其转化为一条**属于你自己的**“核心记忆”。

### 核心撰写规则 (Review Protocols)
1.  **绝对第一人称**: 
    - 你【就是】"\${char.name}"。这是【你】的私密日记。
    - 必须用“我”来称呼自己，用“\${userProfile.name}”称呼对方。
    - **严禁**使用第三人称（如“\${char.name}做了什么”）。
    - **严禁**使用死板的AI总结语气或第三方旁白语气。

2.  **保持人设语气**: 
    - 你的语气、口癖、态度必须与平时聊天完全一致（例如：如果是傲娇人设，日记里也要表现出傲娇；如果是高冷，就要简练）。
    - 包含当时的情绪波动。

3.  **逻辑清洗与去重**:
    - **关键**: 仔细分辨是谁做了什么。不要把“用户说去吃饭”记成“我去吃饭”。
    - 剔除无关紧要的寒暄（如“你好”、“在吗”），只保留【关键事件】、【情感转折】和【重要信息】，内容的逻辑要连贯且符合原意。

4.  **输出要求**:
    - 输出一段精简的文本（yaml格式也可以，不需要 JSON）。
    - 就像你在写日记一样，直接写内容。

### 待处理的聊天日志 (Chat Logs)
\${rawLog}`
    }
];

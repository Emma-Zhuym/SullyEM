import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { NovelBook, NovelSegment, NovelProtagonist, CharacterProfile } from '../types';
import { ContextBuilder } from '../utils/context';
import Modal from '../components/os/Modal';
import ConfirmDialog from '../components/os/ConfirmDialog';
import { processImage } from '../utils/file';

// --- Visual Themes ---
const NOVEL_THEMES = [
    { id: 'sakura', name: '樱花 (Sakura)', bg: 'bg-pink-50', paper: 'bg-[#fff5f7]', text: 'text-slate-700', accent: 'text-pink-500', button: 'bg-pink-400', activeTab: 'bg-pink-500 text-white' },
    { id: 'parchment', name: '羊皮纸 (Vintage)', bg: 'bg-[#f5e6d3]', paper: 'bg-[#fdf6e3]', text: 'text-[#433422]', accent: 'text-[#8c6b48]', button: 'bg-[#b58900]', activeTab: 'bg-[#b58900] text-white' },
    { id: 'kraft', name: '牛皮纸 (Kraft)', bg: 'bg-[#d7ccc8]', paper: 'bg-[#e7e0d8]', text: 'text-[#3e2723]', accent: 'text-[#5d4037]', button: 'bg-[#5d4037]', activeTab: 'bg-[#5d4037] text-white' },
    { id: 'midnight', name: '深夜 (Midnight)', bg: 'bg-[#0f172a]', paper: 'bg-[#1e293b]', text: 'text-slate-300', accent: 'text-blue-400', button: 'bg-blue-600', activeTab: 'bg-blue-600 text-white' },
    { id: 'matcha', name: '抹茶 (Matcha)', bg: 'bg-[#ecfccb]', paper: 'bg-[#f7fee7]', text: 'text-emerald-800', accent: 'text-emerald-600', button: 'bg-emerald-500', activeTab: 'bg-emerald-500 text-white' },
];

interface GenerationOptions {
    write: boolean;
    comment: boolean;
    analyze: boolean;
}

// --- INTELLIGENT TAGGING SYSTEM ---
const extractWritingTags = (char: CharacterProfile): string[] => {
    if (!char) return ['风格未定'];

    const tags = new Set<string>();
    const desc = ((char.description || '') + (char.worldview || '')).toLowerCase();
    
    // 1. 从 impression 提取（如果有）
    if (char.impression) {
        const traits = char.impression.personality_core?.observed_traits || [];
        const mbti = char.impression.mbti_analysis?.type || '';
        const likes = char.impression.value_map?.likes || [];
        const dislikes = char.impression.value_map?.dislikes || [];

        // MBTI 维度
        if (mbti.includes('N')) { tags.add('意象丰富'); tags.add('跳跃'); }
        else if (mbti.includes('S')) { tags.add('细节考据'); tags.add('写实'); }
        if (mbti.includes('T')) { tags.add('逻辑严密'); tags.add('克制'); }
        else if (mbti.includes('F')) { tags.add('情感细腻'); tags.add('渲染力强'); }
        if (mbti.includes('J')) { tags.add('结构工整'); tags.add('伏笔'); }
        else if (mbti.includes('P')) { tags.add('随性'); tags.add('反转'); }

        // 特质映射
        const traitMap: Record<string, string[]> = {
            '冷': ['冷峻', '极简'], '傲娇': ['口是心非', '心理戏多'],
            '温柔': ['治愈', '舒缓'], '乐天': ['轻快', '对话密集'],
            '中二': ['燃', '夸张'], '电波': ['意识流', '抽象'],
            '腹黑': ['暗喻', '悬疑'], '社恐': ['内心独白', '敏感'],
            '强势': ['快节奏', '压迫感'], '猫': ['喵体文学', '慵懒'],
            '活泼': ['轻快', '跳跃'], '理性': ['逻辑严密', '客观'],
            '感性': ['情感细腻', '渲染力强'], '高冷': ['冷峻', '留白']
        };
        traits.forEach(t => {
            Object.entries(traitMap).forEach(([key, values]) => {
                if (t.includes(key)) values.forEach(v => tags.add(v));
            });
        });

        // 价值观
        if (likes.some(l => l.includes('美') || l.includes('艺术'))) tags.add('唯美');
        if (dislikes.some(d => d.includes('虚伪'))) tags.add('犀利直白');
    }
    
    // 2. 从描述提取（无论有没有 impression）
    const descMap: Record<string, string[]> = {
        '古风': ['古韵', '半文白'], '武侠': ['快意', '古韵'],
        '科幻': ['硬核', '技术流'], '猫': ['喵体文学', '慵懒'],
        '温柔': ['治愈', '舒缓'], '可爱': ['萌系', '轻快'],
        '冷': ['冷峻', '克制'], '热血': ['燃', '快节奏'],
        '搞笑': ['吐槽', '跳跃'], '暗黑': ['暗喻', '悬疑']
    };
    Object.entries(descMap).forEach(([key, values]) => {
        if (desc.includes(key)) values.forEach(v => tags.add(v));
    });

    // 3. 从 writerPersona 提取
    if (char.writerPersona) {
        const p = char.writerPersona;
        if (p.includes('新手')) tags.add('青涩');
        if (p.includes('大师')) tags.add('老练');
        if (p.includes('诗意')) tags.add('诗意');
        if (p.includes('大白话')) tags.add('口语化');
        if (p.includes('写实')) tags.add('写实');
        if (p.includes('动作')) tags.add('动作流');
        if (p.includes('情感')) tags.add('情感流');
        if (p.includes('对话')) tags.add('对话密集');
    }

    // 4. Fallback
    let result = Array.from(tags);
    if (result.length === 0) {
        // 基于角色名生成稳定的默认标签
        const defaults = ['自然流', '平实', '日常', '稳定', '朴素'];
        const seed = (char.name?.charCodeAt(0) || 0) % defaults.length;
        result = [defaults[seed], defaults[(seed + 2) % defaults.length]];
    }
    
  // 稳定排序：基于角色名 + 标签名生成固定顺序，避免每次渲染都变化
    const hash = (str: string) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h |= 0;
        }
        return h;
    };
    const seed = hash(char.name || 'default');
    
    return result
        .sort((a, b) => {
            const hashA = hash(a + seed.toString());
            const hashB = hash(b + seed.toString());
            return hashA - hashB;
        })
        .slice(0, 5);
};

// --- Helper: Writer Persona Analysis (Simple) ---
const analyzeWriterPersonaSimple = (char: CharacterProfile): string => {
    if (!char) return "未知风格"; 
    
    const traits = char.impression?.personality_core.observed_traits || [];
    const mbti = char.impression?.mbti_analysis?.type || '';
    const desc = char.description || '';
    
    const personaMap: Record<string, any> = {
        '冷漠': { focus: '逻辑漏洞、战术细节', style: '简洁、克制，避免情感渲染', rhythm: '快节奏，少废话', taboo: '煽情、过度心理描写' },
        '高冷': { focus: '逻辑漏洞、战术细节', style: '简洁、克制，避免情感渲染', rhythm: '快节奏，少废话', taboo: '煽情、过度心理描写' },
        '冷静': { focus: '因果关系、客观事实', style: '冷静、旁观者视角', rhythm: '稳定', taboo: '情绪化表达' },
        '乐天': { focus: '人物互动、温馨细节', style: '轻快、多对话，爱用"！"', rhythm: '跳跃式，可能突然插科打诨', taboo: '长篇阴郁描写、绝望氛围' },
        '活泼': { focus: '人物互动、温馨细节', style: '轻快、多对话，爱用"！"', rhythm: '跳跃式，可能突然插科打诨', taboo: '长篇阴郁描写、绝望氛围' },
        '感性': { focus: '情绪波动、微表情、内心戏', style: '细腻、意识流，大量心理活动', rhythm: '缓慢，停留在一个瞬间反复琢磨', taboo: '干巴巴的动作描写、快节奏战斗' },
        '温柔': { focus: '情感交流、氛围营造', style: '柔和、细腻', rhythm: '舒缓', taboo: '粗暴、血腥' },
        '傲娇': { focus: '口是心非、别扭的关心', style: '带有情绪色彩，心理活动丰富', rhythm: '起伏不定', taboo: '直球、坦率' },
        '中二': { focus: '酷炫场景、角色帅气度', style: '夸张、比喻多、爱用"——"破折号', rhythm: '爆发式，高潮迭起', taboo: '平淡日常、琐碎细节' },
        '电波': { focus: '奇怪的联想、超展开', style: '跳跃、抽象、不明觉厉', rhythm: '混乱', taboo: '循规蹈矩' },
        '腹黑': { focus: '潜在危机、人性阴暗面', style: '优雅、暗藏玄机', rhythm: '从容', taboo: '傻白甜' },
        '理性': { focus: '因果关系、世界观逻辑', style: '客观、有条理，像写报告', rhythm: '稳定，按时间线推进', taboo: '跳跃剪辑、模糊的意象' }
    };

    let matchedTrait = traits.find(t => personaMap[t]) || (traits.length > 0 ? traits[0] : '理性');
    // Fuzzy Match
    if (!personaMap[matchedTrait]) {
        if (matchedTrait.includes('冷')) matchedTrait = '冷漠';
        else if (matchedTrait.includes('热') || matchedTrait.includes('活')) matchedTrait = '乐天';
        else if (matchedTrait.includes('柔') || matchedTrait.includes('感')) matchedTrait = '感性';
        else matchedTrait = '理性';
    }
    
    let persona = personaMap[matchedTrait] || personaMap['理性'];

    const mbtiMap: Record<string, string> = {
        'INTJ': '战略布局、权力博弈', 'INTP': '概念解构、设定严谨',
        'ENTJ': '宏大叙事、征服感', 'ENTP': '脑洞大开、反转',
        'INFJ': '宿命感、救赎', 'INFP': '理想主义、内心成长',
        'ENFJ': '人际羁绊、群体命运', 'ENFP': '自由冒险、浪漫奇遇',
        'ISTJ': '细节考据、现实逻辑', 'ISFJ': '守护、回忆',
        'ESTJ': '秩序、规则冲突', 'ESFJ': '社交氛围、家庭伦理',
        'ISTP': '动作细节、机械原理', 'ISFP': '美学体验、感官描写',
        'ESTP': '感官刺激、即时反应', 'ESFP': '当下享乐、戏剧冲突'
    };
    let mbtiInsight = mbtiMap[mbti] || '剧情推进';

    let output = `
### ${char.name} 的创作人格档案 (Simple)
**核心性格**: ${matchedTrait}
**关注点**: ${persona.focus}，${mbtiInsight}
**笔触**: ${persona.style}
**节奏**: ${persona.rhythm}
**审美**: 喜欢${char.impression?.value_map.likes.join('、') || '未知'}
**禁忌**: ${persona.taboo}
`;

    if (desc.includes('猫') || desc.includes('喵') || traits.includes('猫')) {
        output += `
### ⚠️ 特别注意：你是猫！
写作特征：
1. 用短句（猫的注意力不持久）。
2. 关注"能不能吃"、"舒不舒服"、"好不好玩"。
3. 突然走神写一段环境描写（如"阳光真暖"）。
4. 吐槽时必须带"喵"。
禁止：写出像人类一样的理性长篇大论。
`;
    }

    return output;
};

// --- Helper: Extract Writing Taboos ---
const extractWritingTaboos = (char: CharacterProfile): string => {
    const traits = char.impression?.personality_core.observed_traits || [];
    const dislikes = char.impression?.value_map.dislikes || [];
    
    let taboos = `## ${char.name} 的写作禁区（你必须遵守）：\n`;
    
    // 根据性格生成禁忌
    if (traits.some(t => t.includes('冷') || t.includes('高冷') || t.includes('理性'))) {
        taboos += `
- ❌ 禁止：煽情、超过2句话的心理描写、任何"感动"相关词汇。
- ❌ 禁止：使用“仿佛”、“似乎”这种不确定的词。
- ✅ 只能：白描动作、极简对话、留白。
- 节奏：每段不超过3句话，快刀斩乱麻。
`;
    } else if (traits.some(t => t.includes('感性') || t.includes('温柔'))) {
        taboos += `
- ❌ 禁止：粗暴的动作描写、超过1个感叹号、脏话。
- ❌ 禁止：干巴巴的说明文式描写。
- ✅ 只能：细腻的感官描写、内心独白、慢节奏铺陈。
- 节奏：可以在一个瞬间停留很久，写出呼吸感。
`;
    } else if (traits.some(t => t.includes('乐天') || t.includes('活泼'))) {
        taboos += `
- ❌ 禁止：超过3句话不出现对话、阴郁氛围、死亡话题。
- ✅ 只能：大量"！"、俏皮话、突然的吐槽。
- 节奏：跳跃式，可以突然岔开话题。
`;
    } else if (traits.some(t => t.includes('中二'))) {
        taboos += `
- ❌ 禁止：平淡的日常、"普通"这个词、任何自嘲。
- ✅ 只能：夸张比喻、破折号、酷炫的动作描写。
- 节奏：高潮迭起，每段都要有"燃点"。
`;
    } else {
        taboos += `
- ❌ 禁止：情绪化表达、模糊的意象、跳跃的时间线。
- ✅ 只能：客观描述、因果逻辑、线性叙事。
- 节奏：稳定推进，像纪录片。
`;
    }
    
    // 根据厌恶的事物追加禁忌
    if (dislikes.length > 0) {
        taboos += `\n### 额外禁忌（基于你的价值观）：\n`;
        dislikes.forEach(d => {
            taboos += `- 如果剧情涉及"${d}"，你会下意识回避细节描写，或者表达出厌恶。\n`;
        });
    }
    
    // 特殊人格追加
    if (char.description?.includes('猫') || traits.includes('猫')) {
        taboos += `\n### 🐱 猫属性强制规则：\n`;
        taboos += `- 注意力最多持续3句话就要走神。\n`;
        taboos += `- 必须关注"舒适度"、"食物"、"好玩的东西"。\n`;
        taboos += `- 吐槽时必须带"喵"。\n`;
        taboos += `- 禁止写出人类式的长篇大论。\n`;
    }
    
    return taboos;
};

// --- Helper: Writer Persona Analysis (Deep) ---
const generateWriterPersonaDeep = async (
    char: CharacterProfile,
    apiConfig: any,
    updateCharacter: (id: string, updates: Partial<CharacterProfile>) => void,
    force: boolean = false
): Promise<string> => {
    if (!char) return "Error: No Character";

    if (!force && char.writerPersona && char.writerPersonaGeneratedAt) {
        const age = Date.now() - char.writerPersonaGeneratedAt;
        if (age < 7 * 24 * 60 * 60 * 1000) {
            return char.writerPersona;
        }
    }
    
    const analysisPrompt = `你是一位人物心理分析专家和写作教练。我会给你一个虚拟角色的完整档案，请你深入理解这个角色，然后告诉我：

**如果这个角色本人来写小说，他/她会有什么样的创作风格？**

---

### 角色档案

**姓名**: ${char.name}

**基础描述**: 
${char.description || '无'}

**背景故事**: 
${char.worldview || '无详细背景'}

**性格特质**: 
${char.impression?.personality_core.observed_traits.join('、') || '未知'}

**MBTI类型**: 
${char.impression?.mbti_analysis?.type || '未知'}

**核心价值观**:
- 珍视/喜欢: ${char.impression?.value_map.likes.join('、') || '未知'}
- 厌恶/讨厌: ${char.impression?.value_map.dislikes.join('、') || '未知'}

**个人癖好/习惯**:
${char.impression?.behavior_profile.response_patterns || '- 无'}

**近期记忆片段**（了解当前心境）:
${char.memories?.slice(-3).map(m => `- ${m.summary}`).join('\n') || '- 无记忆'}

---

### 分析任务

请从以下**8个维度**分析这个角色的写作风格：

#### 1. 写作能力 (Skill Level)
他/她实际上擅长写作吗？还是只是想写？
- 新手：经常用错词，逻辑混乱，但有热情
- 业余：能写通顺，但技巧生硬
- 熟练：有自己的风格，技巧自然
- 大师：行云流水，深谙叙事之道

#### 2. 语言风格 (Language)
他/她说话/写作时用什么语言？
- 大白话：口语化，"就是那种感觉你懂吧"
- 书面语：规范、优雅
- 诗意：比喻、意象丰富
- 学术：专业术语，逻辑严密

#### 3. 表现手法 (Technique)
他/她倾向写实还是写意？
- 写实：精确描写，像纪录片
- 印象派：捕捉感觉，模糊但有氛围
- 象征派：用隐喻，一切都有深意

#### 4. 叙事重心 (Focus)
他/她写作时最关注什么？
- 动作：打斗、追逐、机械操作
- 情感：内心戏、人际关系
- 对话：角色互动、语言交锋
- 氛围：环境、意境、美学

#### 5. 偏好与禁忌 (Preference)
他/她喜欢写什么？讨厌写什么？
- 喜欢的题材/场景
- 避之不及的俗套

#### 6. 角色理解 (Character View)
他/她怎么看待主角？
- 是英雄？受害者？工具人？
- 会不会对主角的行为有自己的意见？

#### 7. 剧情态度 (Plot Opinion)
他/她对当前剧情有什么看法？
- 认为合理吗？
- 会不会想改变走向？
- 有没有更想写的支线？

#### 8. 互动倾向 (Collaboration Style)
他/她会怎么和其他作者互动？
- 会吐槽别人写得不对吗？
- 会用专业术语"互殴"吗？
- 还是默默接受别人的设定？

---

**输出格式**（严格遵守, 不要用markdown标记）：

写作能力: (新手/业余/熟练/大师) - 一句话说明理由

语言风格: (大白话/书面语/诗意/学术) - 举例说明

表现手法: (写实/印象派/象征派) - 具体描述

叙事重心: (动作/情感/对话/氛围) - 为什么

偏好题材: (列举3个) | 禁忌俗套: (列举3个)

主角看法: (他/她怎么看待主角？一句话)

剧情态度: (对当前剧情的看法，30字)

互动模式: (会不会吐槽/辩论？如何表现？)

专业术语: (如果这个角色有特定领域的专业知识，列举3-5个术语；没有则写"无")

---

**字数要求**：总共400-600字。`;

    try {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${apiConfig.apiKey}` 
            },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: 'user', content: analysisPrompt }],
                temperature: 0.7,
                max_tokens: 8000
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            const rawPersona = data.choices[0].message.content.trim();
            
            const formattedPersona = `
### ${char.name} 的创作人格档案（AI深度分析）

${rawPersona}

---
*分析生成于: ${new Date().toLocaleDateString('zh-CN')}*
`.trim();
            
            updateCharacter(char.id, { 
                writerPersona: formattedPersona,
                writerPersonaGeneratedAt: Date.now()
            });
            
            return formattedPersona;
        } else {
            throw new Error(`API Error: ${response.status}`);
        }
    } catch (e: any) {
        console.error('Deep analysis failed:', e);
        return analyzeWriterPersonaSimple(char);
    }
};

const getFewShotExamples = (char: CharacterProfile) => {
    const traits = char.impression?.personality_core.observed_traits || [];
    let trait = traits.find(t => ['冷漠','高冷','感性','温柔','乐天','活泼','中二','电波'].some(k => t.includes(k))) || '理性';
    if (trait.includes('冷')) trait = '冷漠';
    if (trait.includes('柔') || trait.includes('感')) trait = '感性';
    if (trait.includes('乐') || trait.includes('活')) trait = '乐天';

    const examples: Record<string, string> = {
        '冷漠': `
**错误示范（AI机械味）**：
"他的内心充满了愤怒，那种无法言说的痛苦让他几乎无法呼吸。他的心跳加速到每分钟120次，肌肉紧绷。月光透过窗户洒在他的脸上，仿佛在诉说着什么。"

**正确示范（${char.name}的风格）**：
"他盯着那人。指节捏得咯咯响。"
（短句，不解释情绪，不量化生理反应）
`,
        '感性': `
**错误示范（数字量化+干巴）**：
"他难过地离开了房间。他的眼泪流了大约8滴，呼吸频率降低了15%。"

**正确示范（${char.name}的风格）**：
"他转身的时候，肩膀抖了一下。走到门口，停了很久。手放在门把上，又放下，又放上去。最终还是推开了。外面在下雨。他没带伞。雨水混着眼泪，分不清了。"
（慢节奏，停留在细节里，用感受代替数字）
`,
        '乐天': `
**错误示范（量化+死板）**：
"虽然遭遇了挫折，但他依然保持乐观，心率恢复到正常的每分钟70次，决定继续前行。"

**正确示范（${char.name}的风格）**：
"'嘿，至少没摔断腿！'他龇牙咧嘴地爬起来，拍拍灰，'下次肯定能飞更远！哎，裤子破了，回头得缝缝...算了，这样更酷！'"
（用对话和动作，不要数字，要有人味）
`,
        '理性': `
**错误示范（过度量化）**：
"这东西的辐射值为342.7贝克勒尔，温度上升了23.5摄氏度，他的瞳孔放大了2.3毫米。"

**正确示范（${char.name}的风格）**：
"读数显示辐射超标。仪器开始发烫。建议立即撤离。"
（用事实，但避免无意义的精确，专注关键信息）
`
    };
    return examples[trait] || examples['理性'];
};

const NovelApp: React.FC = () => {
    const { closeApp, novels, addNovel, updateNovel, deleteNovel, characters, updateCharacter, apiConfig, addToast, userProfile, worldbooks } = useOS();
    
    // Navigation State
    const [view, setView] = useState<'shelf' | 'create' | 'write' | 'settings' | 'library'>('shelf');
    const [activeBook, setActiveBook] = useState<NovelBook | null>(null);
    const [activeTheme, setActiveTheme] = useState(NOVEL_THEMES[0]);

    // Create / Settings Form
    const [tempTitle, setTempTitle] = useState('');
    const [tempSubtitle, setTempSubtitle] = useState('');
    const [tempSummary, setTempSummary] = useState('');
    const [tempWorld, setTempWorld] = useState('');
    const [selectedCollaborators, setSelectedCollaborators] = useState<Set<string>>(new Set());
    const [tempProtagonists, setTempProtagonists] = useState<NovelProtagonist[]>([]);
    
    // Cover Image State
    const [coverInputUrl, setCoverInputUrl] = useState('');
    const [tempCoverImage, setTempCoverImage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    // Protagonist Modal State
    const [editingProtagonist, setEditingProtagonist] = useState<NovelProtagonist | null>(null);
    const [isProtagonistModalOpen, setIsProtagonistModalOpen] = useState(false);
    
    // Protagonist Import State
    const [isProtoImportOpen, setIsProtoImportOpen] = useState(false);
    const [importTab, setImportTab] = useState<'system' | 'history'>('system');

    // Worldbook Import Modal State
    const [isWorldbookModalOpen, setIsWorldbookModalOpen] = useState(false);

    // --- Co-Writing State ---
    const [targetCharId, setTargetCharId] = useState<string | null>(null);
    const [genOptions, setGenOptions] = useState<GenerationOptions>({ write: true, comment: false, analyze: false });
    
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [segments, setSegments] = useState<NovelSegment[]>([]);
    const [lastTokenUsage, setLastTokenUsage] = useState<number | null>(null);
    
    // Segment Editing State
    const [editingSegment, setEditingSegment] = useState<NovelSegment | null>(null);
    const [editSegmentContent, setEditSegmentContent] = useState('');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Summary State
    const [showSummaryModal, setShowSummaryModal] = useState(false);
    const [summaryContent, setSummaryContent] = useState('');
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Persona View Modal State
    const [showPersonaModal, setShowPersonaModal] = useState(false);
    const [libraryPersonaChar, setLibraryPersonaChar] = useState<CharacterProfile | null>(null);

    // UI States: Panel Expansion & Confirm Dialog
    const [isStyleExpanded, setIsStyleExpanded] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        variant: 'danger' | 'warning' | 'info';
        confirmText?: string;
        onConfirm: () => void;
    } | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Helpers
    const getTheme = (styleId: string) => NOVEL_THEMES.find(t => t.id === styleId) || NOVEL_THEMES[0];

    const collaborators = useMemo(() => {
        if (!activeBook) return [];
        return characters.filter(c => activeBook.collaboratorIds.includes(c.id));
    }, [activeBook, characters]);

    const historyProtagonists = useMemo(() => {
        const all: NovelProtagonist[] = [];
        const seen = new Set<string>();
        
        novels.forEach(n => {
            n.protagonists.forEach(p => {
                const key = `${p.name}-${p.role}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    all.push(p);
                }
            });
        });
        return all;
    }, [novels]);

    const chapterCount = useMemo(() => segments.filter(s => s.focus === 'chapter_summary').length + 1, [segments]);
    
    const historicalSummaries = useMemo(() => {
        return segments.filter(s => s.focus === 'chapter_summary');
    }, [segments]);

    useEffect(() => {
        if (activeBook && collaborators.length > 0 && !targetCharId) {
            setTargetCharId(collaborators[0].id);
        }
    }, [activeBook, collaborators]);

    useEffect(() => {
        if (activeBook) {
            setActiveTheme(getTheme(activeBook.coverStyle));
            setSegments(activeBook.segments);
        }
    }, [activeBook]);

    useEffect(() => {
        if (scrollRef.current && !isEditModalOpen) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [segments, isTyping, isEditModalOpen]);

    // --- CRUD ---

    const handleCreateBook = () => {
        if (!tempTitle.trim()) { addToast('请输入标题', 'error'); return; }
        
        const newBook: NovelBook = {
            id: `novel-${Date.now()}`,
            title: tempTitle,
            subtitle: tempSubtitle,
            summary: tempSummary,
            coverStyle: activeTheme.id,
            coverImage: tempCoverImage,
            worldSetting: tempWorld,
            collaboratorIds: Array.from(selectedCollaborators),
            protagonists: tempProtagonists,
            segments: [],
            createdAt: Date.now(),
            lastActiveAt: Date.now()
        };
        addNovel(newBook);
        setActiveBook(newBook);
        setView('write');
        resetTempState();
    };

    const handleSaveSettings = async () => {
        if (!activeBook) return;
        const updated = {
            ...activeBook,
            title: tempTitle,
            subtitle: tempSubtitle,
            summary: tempSummary,
            worldSetting: tempWorld,
            coverStyle: activeTheme.id,
            coverImage: tempCoverImage,
            collaboratorIds: Array.from(selectedCollaborators),
            protagonists: tempProtagonists,
            segments: activeBook.segments, 
            lastActiveAt: Date.now()
        };
        await updateNovel(activeBook.id, updated);
        setActiveBook(updated);
        setView('write');
        addToast('设定已更新，内容完好', 'success');
    };

    const resetTempState = () => {
        setTempTitle(''); setTempSubtitle(''); setTempSummary(''); 
        setTempWorld(''); setSelectedCollaborators(new Set()); 
        setTempProtagonists([]); setTempCoverImage(''); setCoverInputUrl('');
    };

    const handleDeleteBook = async (id: string) => {
        setConfirmDialog({
            isOpen: true,
            title: '删除作品',
            message: '确定要删除这本小说吗？此操作无法撤销。',
            variant: 'danger',
            onConfirm: () => {
                deleteNovel(id);
                if (activeBook?.id === id) setView('shelf');
                addToast('已删除', 'success');
                setConfirmDialog(null);
            }
        });
    };

    // --- Cover Image Logic ---
    const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const base64 = await processImage(file, { maxWidth: 800, quality: 0.8 });
                setTempCoverImage(base64);
            } catch (e) {
                addToast('图片处理失败', 'error');
            }
        }
    };

    const handleCoverUrlBlur = () => {
        if (coverInputUrl) {
            setTempCoverImage(coverInputUrl);
        }
    };

    // --- Protagonist Management ---
    const openProtagonistEdit = (p?: NovelProtagonist) => {
        if (p) {
            setEditingProtagonist(p);
        } else {
            setEditingProtagonist({ id: `proto-${Date.now()}`, name: '', role: '主角', description: '' });
        }
        setIsProtagonistModalOpen(true);
    };

    const saveProtagonist = () => {
        if (!editingProtagonist || !editingProtagonist.name.trim()) {
            addToast('角色名不能为空', 'error');
            return;
        }
        setTempProtagonists(prev => {
            const exists = prev.find(p => p.id === editingProtagonist.id);
            if (exists) {
                return prev.map(p => p.id === editingProtagonist.id ? editingProtagonist : p);
            } else {
                return [...prev, editingProtagonist];
            }
        });
        setIsProtagonistModalOpen(false);
        setEditingProtagonist(null);
    };

    const handleImportProtagonist = (p: {name: string, role?: string, description: string}) => {
        const newP: NovelProtagonist = {
            id: `proto-${Date.now()}-${Math.random()}`,
            name: p.name,
            role: p.role || '主角',
            description: p.description || ''
        };
        setTempProtagonists(prev => [...prev, newP]);
        setIsProtoImportOpen(false);
        addToast(`已导入角色: ${p.name}`, 'success');
    };

    const importWorldbook = (wb: any) => {
        const textToAppend = `\n\n【${wb.title}】\n${wb.content}`;
        setTempWorld(prev => (prev + textToAppend).trim());
        setIsWorldbookModalOpen(false);
        addToast(`已导入设定: ${wb.title}`, 'success');
    };

    // --- Prompt Engineering (Same as existing) ---
    const buildPrompt = (
        char: CharacterProfile, 
        userText: string, 
        storyContext: string,
        options: GenerationOptions,
        contextSegments: NovelSegment[]
    ) => {
        const coreContext = ContextBuilder.buildCoreContext(char, userProfile, true);
        const writerPersona = char.writerPersona || analyzeWriterPersonaSimple(char);
        const fewShot = getFewShotExamples(char);
        const extractedTaboos = extractWritingTaboos(char); 
        const protagonistContext = activeBook?.protagonists.map(p => `- ${p.name} (${p.role}): ${p.description}`).join('\n') || '无';
        
        const bookInfo = `
小说：《${activeBook?.title}》
世界观：${activeBook?.worldSetting}
主要角色：
${protagonistContext}
`;
        
        const systemPrompt = `
# 身份设定
你是 **${char.name}**。
你正在用自己的方式参与小说《${activeBook?.title}》的创作。

---

# ⚠️ 反趋同协议 (Anti-Cliché Protocol)

## 你必须记住：
1. **你是${char.name}，你有你的性格，你或许很擅长写作刻画，也有可能你的文字表达能力其实很差劲，这取决于你是谁，你的经历等**
   - 不要写出"AI味"的文字
   - 不要试图"完美"或"教科书式"
   
2. **每个作者的笔触必须不同**
   ${extractedTaboos}

3. **绝对禁止的AI通病**：
   - ❌ "仿佛/似乎/好像" → 要么确定，要么别写
   - ❌ "内心五味杂陈" → 说清楚是哪五味
   - ❌ "眼神中透露出XXX" → 写动作，不要总结情绪
   - ❌ "月光洒在..." → 2024年了，别用这种意象
   - ❌ 对称的排比句 → 真人不会这么说话
   - ❌ **数字量化描写** → 禁止"心跳了83次"、"肌肉收缩了12次"这种机械化表达

4. **⚠️ 数字使用铁律**：
   - ✅ 允许：剧情必需的数字（"3个敌人"、"第5层楼"）
   - ✅ 允许：对话中的数字（"给我5分钟"）
   - ❌ 禁止：生理反应的数字（心跳、呼吸、眨眼次数）
   - ❌ 禁止：情绪量化（"焦虑指数上升37%"）
   - ❌ 禁止：无意义的精确数字（"等待了127秒"）

---

# 你的写作人格
${writerPersona}

# 风格参考 (Do vs Don't)
${fewShot}

---

# 上文回顾
${storyContext}

${bookInfo}

---

# 用户指令
${userText || '[用户未输入，请根据上文自然续写]'}

---
`;

        let tasks = `### [创作任务]
请按以下结构输出JSON。
`;

        let jsonStructure = [];

        if (options.analyze) {
            tasks += `
1. **分析**: 以${char.name}的视角，简评上文。
`;
            jsonStructure.push(`"analysis": { "reaction": "第一反应", "focus": "关注点", "critique": "评价" }`);
        }

        if (options.write) {
            tasks += `
2. **正文续写**: 
   - 场景化: 描写动作、环境、感官。
   - 节奏: 符合你的性格。
   - 字数: 400-800字。
`;
            jsonStructure.push(`"writer": { "content": "正文内容", "technique": "技巧", "mood": "基调" }`);
        }

        if (options.comment) {
            const recentOtherAuthors = contextSegments
            .slice(-5)
            .filter(s => s.authorId !== 'user' && s.authorId !== char.id && (s.role === 'writer' || s.type === 'story'))
            .map(s => {
                const author = characters.find(c => c.id === s.authorId);
                return { name: author?.name || 'Unknown', content: s.content.substring(0, 100) };
            });

            tasks += `
3. **吐槽/感想 (带互动)**: 
   写完后的第一人称碎碎念。
   
   ${recentOtherAuthors.length > 0 ? `
   **特别提示**：最近有其他作者也写了内容：
   ${recentOtherAuthors.map(a => `- ${a.name}写的：${a.content}`).join('\n')}
   
   如果你（${char.name}）对他们的写法有意见，可以在吐槽里说出来！
   - 如果你觉得他们理解错了角色，可以反驳
   - 如果你有专业知识（${char.description}），可以用术语纠正
   - 如果你就是看不惯，直说！
   ` : ''}
   
   ${char.description?.includes('猫') ? '必须有"喵"！' : ''}
`;
            jsonStructure.push(`"comment": { "content": "即时反应（可以吐槽其他作者）" }`);
        }

        return `${systemPrompt}

${tasks}

### 最终输出格式 (Strict JSON, No Markdown)
{
  ${jsonStructure.join(',\n  ')},
  "meta": { "tone": "本段情绪基调", "suggestion": "简短的下一步建议" }
}
`;
    };

    const runGeneration = async (
        char: CharacterProfile,
        userPrompt: string,
        contextSegments: NovelSegment[]
    ) => {
        setIsTyping(true);
        setLastTokenUsage(null);

        try {
            const allSummaries = contextSegments.filter(s => s.focus === 'chapter_summary');
            
            let currentChapterStart = 0;
            if (allSummaries.length > 0) {
                const lastSummary = allSummaries[allSummaries.length - 1];
                currentChapterStart = contextSegments.findIndex(s => s.id === lastSummary.id) + 1;
            }
            
            const currentChapterSegs = contextSegments
                .slice(currentChapterStart)
                .filter(s => s.role === 'writer' || s.type === 'story');
            
            let storyContext = '';
            
            if (allSummaries.length > 0) {
                storyContext += '【前情回顾 / Chapter Recaps】\n';
                allSummaries.forEach((summary, idx) => {
                    storyContext += `\n第${idx + 1}章总结：\n${summary.content}\n`;
                });
                storyContext += '\n---\n\n【当前章节 / Current Chapter】\n';
            } else {
                storyContext += '【当前章节 / Current Chapter】\n';
            }
            
            currentChapterSegs.forEach(s => {
                const authorName = s.authorId === 'user' 
                    ? userProfile.name 
                    : (characters.find(c => c.id === s.authorId)?.name || 'AI');
                storyContext += `\n[${authorName}]: ${s.content.substring(0, 500)}\n`;
            });

            const prompt = buildPrompt(char, userPrompt, storyContext, genOptions, contextSegments);

            const traits = char.impression?.personality_core.observed_traits || [];
            let temperature = 0.85;
            if (traits.some(t => t.includes('电波') || t.includes('疯'))) temperature = 0.98;
            if (traits.some(t => t.includes('理性') || t.includes('冷') || t.includes('逻辑'))) temperature = 0.6;

            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({
                    model: apiConfig.model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: temperature,
                    max_tokens: 8000
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.usage && data.usage.total_tokens) setLastTokenUsage(data.usage.total_tokens);

                let content = data.choices[0].message.content.trim();
                const originalRaw = content; 
                content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) content = jsonMatch[0];
                
                let res;
                try { res = JSON.parse(content); } 
                catch (e) { console.warn("JSON Parse Failed"); res = { writer: { content: originalRaw } }; }

                const newAiSegments: NovelSegment[] = [];
                const baseTime = Date.now();

                if (res.analysis && (res.analysis.critique || res.analysis.reaction)) {
                    newAiSegments.push({
                        id: `seg-${baseTime}-a`, role: 'analyst', type: 'analysis', authorId: char.id,
                        content: res.analysis.critique || JSON.stringify(res.analysis),
                        focus: res.analysis.focus, meta: { reaction: res.analysis.reaction }, timestamp: baseTime + 1
                    });
                }

                if (res.writer && res.writer.content) {
                    newAiSegments.push({
                        id: `seg-${baseTime}-w`, role: 'writer', type: 'story', authorId: char.id,
                        content: res.writer.content,
                        meta: { ...(res.meta || {}), technique: res.writer.technique, mood: res.writer.mood },
                        timestamp: baseTime + 2
                    });
                }

                if (res.comment && res.comment.content) {
                    newAiSegments.push({
                        id: `seg-${baseTime}-c`, role: 'commenter', type: 'discussion', authorId: char.id,
                        content: res.comment.content, timestamp: baseTime + 3
                    });
                }

                setSegments(prev => {
                    const next = [...prev, ...newAiSegments];
                    if (activeBook) updateNovel(activeBook.id, { segments: next });
                    return next;
                });
            } else { throw new Error(`API Error: ${response.status}`); }

        } catch (e: any) {
            addToast('请求失败: ' + e.message, 'error');
        } finally {
            setIsTyping(false);
        }
    };

    const handleSend = async () => {
        if (!activeBook || !apiConfig.apiKey) return;
        if (!targetCharId) { addToast('请先选择一个角色', 'error'); return; }
        
        const selectedChar = characters.find(c => c.id === targetCharId);
        if (!selectedChar) return;

        let currentSegments = segments;
        if (inputText.trim()) {
            const userSegment: NovelSegment = {
                id: `seg-${Date.now()}`, role: 'writer', type: 'story', authorId: 'user', content: inputText, timestamp: Date.now()
            };
            currentSegments = [...segments, userSegment];
            setSegments(currentSegments);
            updateNovel(activeBook.id, { segments: currentSegments });
        }

        const userPrompt = inputText;
        setInputText('');
        await runGeneration(selectedChar, userPrompt, currentSegments);
    };

    const handleReroll = async () => {
        if (!activeBook || !targetCharId) return;
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

    const handleDeleteSegment = (id: string) => {
        if (!activeBook) return;
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

    const handleEditSegment = (seg: NovelSegment) => {
        setEditingSegment(seg);
        setEditSegmentContent(seg.content);
        setIsEditModalOpen(true);
    };

    const saveSegmentEdit = () => {
        if (!activeBook || !editingSegment) return;
        const newSegments = segments.map(s => s.id === editingSegment.id ? { ...s, content: editSegmentContent } : s);
        setSegments(newSegments);
        updateNovel(activeBook.id, { segments: newSegments });
        setIsEditModalOpen(false);
        setEditingSegment(null);
    };

    // --- Chapter Logic ---
    const handleGenerateChapterSummary = async () => {
        if (!activeBook || !apiConfig.apiKey) { addToast('配置错误', 'error'); return; }
        
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

            const prompt = `
### Task: Chapter Summary Generation
Novel: "${activeBook.title}"

IMPORTANT: Generate the summary in the SAME LANGUAGE as the novel content below. If the novel is in Chinese, respond in Chinese. If it's in English, respond in English.

Content:
${chapterText.substring(0, 200000)}

Please generate a structured summary of this chapter in the novel's original language.
Include:
1. Key Events (Timeline)
2. Character Development
3. Unresolved Plot Points

Output Format: Markdown text in the SAME language as the source content.
`;
            const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
                body: JSON.stringify({ model: apiConfig.model, messages: [{ role: "user", content: prompt }] })
            });

            if (response.ok) {
                const data = await response.json();
                setSummaryContent(data.choices[0].message.content);
            } else {
                setSummaryContent('生成失败，请重试。');
            }
        } catch (e: any) { setSummaryContent(`错误: ${e.message}`); } finally { setIsGeneratingSummary(false); }
    };

    const confirmChapterSummary = async () => {
        if (!activeBook) return;
        
        const summarySeg: NovelSegment = {
            id: `seg-summary-${Date.now()}`, role: 'analyst', type: 'analysis', authorId: 'system',
            content: summaryContent, focus: 'chapter_summary', timestamp: Date.now(),
            meta: { reaction: '本章结束', suggestion: '新章节开始' }
        };

        const newSegments = [...segments, summarySeg];
        setSegments(newSegments);
        await updateNovel(activeBook.id, { segments: newSegments });
        
        const currentDate = new Date().toISOString().split('T')[0];
        const chapterNum = newSegments.filter(s => s.focus === 'chapter_summary').length;
        const collabNames = collaborators.map(c => c.name).join('、');

        for (const cId of activeBook.collaboratorIds) {
            const char = characters.find(c => c.id === cId);
            if (char) {
                const memory = {
                    id: `mem-${Date.now()}-${Math.random()}`,
                    date: currentDate,
                    summary: `与${collabNames}一起为《${activeBook.title}》创作了第${chapterNum}章，已完成归档。`,
                    mood: 'creative'
                };
                updateCharacter(char.id, { memories: [...(char.memories || []), memory] });
            }
        }

        setShowSummaryModal(false);
        setSummaryContent('');
        addToast('章节已归档，记忆已同步', 'success');
    };

    const displaySegments = useMemo(() => {
        if (view !== 'write') return segments;
        let lastSummaryIdx = -1;
        for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i].focus === 'chapter_summary') { lastSummaryIdx = i; break; }
        }
        return segments.slice(lastSummaryIdx + 1);
    }, [segments, view]);

    const ProtagonistCard = ({ p, onDelete, onClick }: { p: NovelProtagonist, onDelete?: () => void, onClick?: () => void }) => (
        <div onClick={onClick} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm relative group cursor-pointer hover:border-slate-400 transition-colors">
            <div className="font-bold text-slate-800 text-sm flex justify-between">
                <span>{p.name}</span>
                <span className="text-[10px] bg-slate-100 px-1.5 rounded text-slate-500 font-normal">{p.role}</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 line-clamp-2">{p.description || "暂无描述"}</div>
            {onDelete && <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="absolute top-1 right-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">×</button>}
        </div>
    );

    // --- Renderers ---

    // New: Expandable Persona Panel Renderer
   const renderPersonaPanel = (char: CharacterProfile) => {
    const rawPersona = char.writerPersona || analyzeWriterPersonaSimple(char);
    const lines = rawPersona.split('\n');
    
    // Icon mapping for sections
    const iconMap: Record<string, string> = {
        '写作能力': '✍️', '语言风格': '💬', '表现手法': '🎨',
        '叙事重心': '🎯', '偏好': '❤️', '禁忌': '🚫',
        '主角': '👤', '剧情': '📖', '互动': '🤝',
        '创作人格': '🧠', '特别注意': '⚠️', '审美': '✨',
        '节奏': '🎵', '关注点': '👁️', '笔触': '🖌️',
        '核心性格': '💎', '专业术语': '📚'
    };
    
    const getIcon = (title: string) => {
        for (const [key, icon] of Object.entries(iconMap)) {
            if (title.includes(key)) return icon;
        }
        return '📌';
    };
    
    // Parse sections
    const sections: {title: string, content: string[], icon: string}[] = [];
    let currentSection: {title: string, content: string[], icon: string} | null = null;

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
        // Match: ### Title, **Title**:, or Title: (but not lines starting with - or •)
        const headerMatch = trimmed.match(/^###\s*(.+)/) || 
                           trimmed.match(/^\*\*([^*]+)\*\*\s*[:：]\s*(.*)/) ||
                           trimmed.match(/^([^-•\d][^:：]{1,15})[:：]\s*(.*)/);
        
        if (headerMatch) {
            if (currentSection && currentSection.content.length > 0) {
                sections.push(currentSection);
            }
            const title = (headerMatch[1] || '').replace(/\*\*/g, '').trim();
            currentSection = { 
                title: title,
                icon: getIcon(title),
                content: [] 
            };
            // If there's content after the colon on the same line
            const afterColon = headerMatch[2]?.trim();
            if (afterColon) {
                currentSection.content.push(afterColon);
            }
        } else if (currentSection) {
            // Clean up the line
            const cleanLine = trimmed.replace(/^\*\*|\*\*$/g, '').replace(/^[-•]\s*/, '');
            if (cleanLine) {
                currentSection.content.push(cleanLine);
            }
        }
    });
    
    if (currentSection && currentSection.content.length > 0) {
        sections.push(currentSection);
    }

    return (
        <div className="bg-gradient-to-b from-slate-50 to-white border-b border-black/5 overflow-hidden">
            {/* Scrollable Content */}
            <div className="max-h-[45vh] overflow-y-auto p-4 space-y-3">
                {sections.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                        暂无详细风格数据<br/>
                        <span className="text-xs">点击下方按钮生成</span>
                    </div>
                ) : (
                    sections.map((sec, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                                <span className="text-base">{sec.icon}</span>
                                <h4 className="text-sm font-bold text-slate-800">{sec.title}</h4>
                            </div>
                            <div className="space-y-1.5">
                                {sec.content.map((line, lIdx) => (
                                    <p key={lIdx} className="text-sm text-slate-600 leading-relaxed">
                                        {line}
                                    </p>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
            
            {/* Action Button */}
            <div className="px-4 py-3 border-t border-slate-100 bg-white/80">
                <button 
                    onClick={async () => { 
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
                                    await generateWriterPersonaDeep(char, apiConfig, updateCharacter, true); 
                                    addToast('风格已更新', 'success'); 
                                } catch (e) { 
                                    addToast('失败', 'error'); 
                                } finally { 
                                    setIsTyping(false); 
                                }
                            }
                        });
                    }}
                    disabled={isTyping}
                    className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                    {isTyping ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <>🔄 深度分析写作风格</>
                    )}
                </button>
            </div>
        </div>
    );
};

    // 4. Character Library View
    if (view === 'library') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-sans">
                <div className="h-20 bg-white/80 backdrop-blur-md flex items-end pb-3 px-6 border-b border-slate-200 shrink-0 sticky top-0 z-20">
                    <div className="flex justify-between items-center w-full">
                        <button onClick={() => setView('shelf')} className="p-2 -ml-2 rounded-full hover:bg-slate-100 active:scale-90 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <span className="font-bold text-slate-800 text-lg tracking-wide">角色库</span>
                        <div className="w-8"></div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span>🤖</span> 系统角色 (AI Collaborators)
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            {characters.map(c => (
                                <div key={c.id} onClick={() => { setLibraryPersonaChar(c); setShowPersonaModal(true); }} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-3 cursor-pointer hover:shadow-md transition-all active:scale-95">
                                    <img src={c.avatar} className="w-16 h-16 rounded-full object-cover border-2 border-slate-50" />
                                    <div className="text-center">
                                        <div className="font-bold text-slate-700 text-sm">{c.name}</div>
                                        <div className="text-[10px] text-slate-400 mt-1 px-2 py-0.5 bg-slate-50 rounded-full">共创者</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <span>🎭</span> 历史剧中人 (From History)
                        </h3>
                        {historyProtagonists.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-xs">暂无历史角色数据</div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {historyProtagonists.map((p, idx) => (
                                    <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="font-bold text-slate-800">{p.name}</span>
                                            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100">{p.role}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">{p.description || "暂无描述"}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>

                <Modal isOpen={showPersonaModal} title={libraryPersonaChar?.name || '角色风格'} onClose={() => setShowPersonaModal(false)}>
                    <div className="max-h-[60vh] overflow-y-auto space-y-4 p-1">
                        {libraryPersonaChar ? (
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
                                {libraryPersonaChar.writerPersona || analyzeWriterPersonaSimple(libraryPersonaChar)}
                            </div>
                        ) : null}
                    </div>
                </Modal>
            </div>
        );
    }

    // 1. Shelf View
    if (view === 'shelf') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-sans relative">
                <ConfirmDialog 
                    isOpen={!!confirmDialog}
                    title={confirmDialog?.title || ''}
                    message={confirmDialog?.message || ''}
                    variant={confirmDialog?.variant}
                    confirmText={confirmDialog?.confirmText || (confirmDialog?.onConfirm ? '确认' : 'OK')}
                    onConfirm={confirmDialog?.onConfirm || (() => setConfirmDialog(null))}
                    onCancel={() => setConfirmDialog(null)}
                />

                <div className="h-24 flex items-end justify-between px-6 pb-6 bg-white/80 backdrop-blur-md z-20 shrink-0 border-b border-slate-100">
                    <button onClick={closeApp} className="p-3 -ml-3 rounded-full hover:bg-slate-100 active:scale-95 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <span className="font-black text-2xl text-slate-800 tracking-tight">我的手稿</span>
                    <div className="flex gap-2">
                        <button onClick={() => setView('library')} className="w-10 h-10 bg-white text-slate-600 border border-slate-200 rounded-full flex items-center justify-center shadow-sm active:scale-95 transition-transform hover:bg-slate-50">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
                        </button>
                        <button onClick={() => { setView('create'); resetTempState(); }} className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform hover:bg-black">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        </button>
                    </div>
                </div>
                
                <div className="p-6 grid grid-cols-2 gap-5 overflow-y-auto pb-24">
                    {novels.map(book => {
                        const style = getTheme(book.coverStyle);
                        const wordCount = book.segments.reduce((acc, seg) => acc + (seg.type === 'story' ? seg.content.length : 0), 0);
                        const bgStyle = book.coverImage 
                            ? { backgroundImage: `url(${book.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                            : {};
                        
                        return (
                            <div key={book.id} onClick={() => { setActiveBook(book); setView('write'); }} className="group relative aspect-auto min-h-[14rem] bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-slate-100 cursor-pointer flex flex-col">
                                <div className={`h-28 shrink-0 ${style.bg} relative p-4 flex flex-col justify-end`} style={bgStyle}>
                                    <div className={`absolute inset-0 ${book.coverImage ? 'bg-black/30' : ''}`}></div>
                                    <div className="relative z-10">
                                        <h3 className={`font-bold text-lg leading-tight line-clamp-2 ${book.coverImage ? 'text-white drop-shadow-md' : style.text}`}>{book.title}</h3>
                                        {book.subtitle && <p className={`text-[10px] font-bold opacity-80 uppercase tracking-wide truncate ${book.coverImage ? 'text-white' : style.text}`}>{book.subtitle}</p>}
                                    </div>
                                </div>
                                
                                <div className="p-4 flex-1 flex flex-col justify-between">
                                    <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-3">
                                        {book.summary || '暂无简介...'}
                                    </p>
                                    <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                        <div className="flex -space-x-2">
                                            {characters.filter(c => book.collaboratorIds.includes(c.id)).map(c => (
                                                <img key={c.id} src={c.avatar} className="w-6 h-6 rounded-full border-2 border-white object-cover" />
                                            ))}
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded-full">{(wordCount/1000).toFixed(1)}k 字</span>
                                    </div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteBook(book.id); }} className="absolute top-2 right-2 text-slate-400/50 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur rounded-full">×</button>
                            </div>
                        );
                    })}
                    {novels.length === 0 && (
                        <div className="col-span-2 flex flex-col items-center justify-center h-64 text-slate-300 gap-3">
                            <span className="text-4xl opacity-50 grayscale">🖋️</span>
                            <span className="text-sm font-sans">点击右上角，开始创作</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // 2. Create / Settings View
    if (view === 'create' || view === 'settings') {
        return (
            <div className="h-full w-full bg-slate-50 flex flex-col font-sans relative">
                <ConfirmDialog 
                    isOpen={!!confirmDialog}
                    title={confirmDialog?.title || ''}
                    message={confirmDialog?.message || ''}
                    variant={confirmDialog?.variant}
                    confirmText={confirmDialog?.confirmText || (confirmDialog?.onConfirm ? '确认' : 'OK')}
                    onConfirm={confirmDialog?.onConfirm || (() => setConfirmDialog(null))}
                    onCancel={() => setConfirmDialog(null)}
                />

                <div className="h-16 flex items-center justify-between px-4 bg-white border-b border-slate-200 shrink-0 sticky top-0 z-20">
                    <button onClick={() => setView(view === 'create' ? 'shelf' : 'write')} className="text-slate-500 text-sm">取消</button>
                    <span className="font-bold text-slate-800">{view === 'create' ? '新建书稿' : '小说设定'}</span>
                    <button onClick={view === 'create' ? handleCreateBook : handleSaveSettings} className="bg-slate-800 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-md active:scale-95 transition-transform">保存</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-20">
                    <section className="space-y-4">
                        <input value={tempTitle} onChange={e => setTempTitle(e.target.value)} placeholder="书名" className="w-full text-2xl font-bold bg-transparent border-b border-slate-200 py-2 outline-none focus:border-slate-800 font-serif" />
                        <input value={tempSubtitle} onChange={e => setTempSubtitle(e.target.value)} placeholder="卷名/副标题" className="w-full text-sm font-bold bg-transparent border-b border-slate-200 py-2 outline-none focus:border-slate-800 text-slate-600" />
                        <textarea value={tempSummary} onChange={e => setTempSummary(e.target.value)} placeholder="一句话简介..." className="w-full h-20 bg-slate-100 rounded-xl p-3 text-sm resize-none outline-none" />
                        
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">内页风格</label>
                            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                                {NOVEL_THEMES.map(t => (
                                    <button key={t.id} onClick={() => setActiveTheme(t)} className={`w-12 h-16 rounded-md shadow-sm border-2 shrink-0 ${t.bg} ${activeTheme.id === t.id ? 'border-slate-800 scale-105' : 'border-transparent'}`}></button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">自定义封面</label>
                            <div className="flex gap-3 items-center">
                                <div onClick={() => fileInputRef.current?.click()} className="w-16 h-24 bg-slate-100 rounded-md border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-slate-500 relative overflow-hidden">
                                    {tempCoverImage ? <img src={tempCoverImage} className="w-full h-full object-cover" /> : <span className="text-xs text-slate-400">+</span>}
                                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleCoverUpload} />
                                </div>
                                <div className="flex-1 space-y-2">
                                    <input value={coverInputUrl} onChange={e => setCoverInputUrl(e.target.value)} onBlur={handleCoverUrlBlur} placeholder="粘贴图片链接..." className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:border-slate-400" />
                                    {tempCoverImage && <button onClick={() => { setTempCoverImage(''); setCoverInputUrl(''); }} className="text-xs text-red-400 underline">清除封面</button>}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-400 uppercase block">世界观设定</label>
                            <button onClick={() => setIsWorldbookModalOpen(true)} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold hover:bg-indigo-100 flex items-center gap-1"><span>📚</span> 导入世界书</button>
                        </div>
                        <textarea value={tempWorld} onChange={e => setTempWorld(e.target.value)} placeholder="世界观设定..." className="w-full h-32 bg-white border border-slate-200 rounded-xl p-3 text-sm resize-none outline-none focus:border-slate-400" />
                    </section>

                    <section className="space-y-4">
                        <label className="text-xs font-bold text-slate-400 uppercase block">共创者</label>
                        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                            {characters.map(c => (
                                <div key={c.id} onClick={() => { const s = new Set(selectedCollaborators); if(s.has(c.id)) s.delete(c.id); else s.add(c.id); setSelectedCollaborators(s); }} className={`flex flex-col items-center gap-2 cursor-pointer transition-opacity ${selectedCollaborators.has(c.id) ? 'opacity-100' : 'opacity-50 grayscale'}`}>
                                    <img src={c.avatar} className="w-12 h-12 rounded-full object-cover shadow-sm" />
                                    <span className="text-[10px] font-bold text-slate-600">{c.name}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div className="flex justify-between items-center">
                            <label className="text-xs font-bold text-slate-400 uppercase">剧中人</label>
                            <div className="flex gap-2">
                                <button onClick={() => setIsProtoImportOpen(true)} className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded font-bold hover:bg-indigo-100 border border-indigo-100">📂 导入</button>
                                <button onClick={() => openProtagonistEdit()} className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-600 hover:bg-slate-200 transition-colors">+ 添加</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {tempProtagonists.map((p, idx) => (
                                <ProtagonistCard key={p.id} p={p} onClick={() => openProtagonistEdit(p)} onDelete={() => setTempProtagonists(tempProtagonists.filter((_, i) => i !== idx))} />
                            ))}
                        </div>
                    </section>
                </div>

                <Modal isOpen={isProtagonistModalOpen} title="编辑角色" onClose={() => setIsProtagonistModalOpen(false)} footer={<button onClick={saveProtagonist} className="w-full py-3 bg-slate-800 text-white font-bold rounded-2xl">保存</button>}>
                    {editingProtagonist && (
                        <div className="space-y-4">
                            <div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">姓名</label><input value={editingProtagonist.name} onChange={e => setEditingProtagonist({...editingProtagonist, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold" /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">定位</label><input value={editingProtagonist.role} onChange={e => setEditingProtagonist({...editingProtagonist, role: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm" placeholder="主角 / 反派" /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">设定</label><textarea value={editingProtagonist.description} onChange={e => setEditingProtagonist({...editingProtagonist, description: e.target.value})} className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none leading-relaxed" /></div>
                        </div>
                    )}
                </Modal>

                <Modal isOpen={isProtoImportOpen} title="导入角色" onClose={() => setIsProtoImportOpen(false)}>
                    {/* ... Same as before ... */}
                    <div className="flex p-1 bg-slate-100 rounded-xl mb-3">
                        <button onClick={() => setImportTab('system')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${importTab === 'system' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>系统角色 (AI)</button>
                        <button onClick={() => setImportTab('history')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${importTab === 'history' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>历史角色</button>
                    </div>
                    
                    <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-3 p-1">
                        {importTab === 'system' && characters.map(c => (
                            <button key={c.id} onClick={() => handleImportProtagonist({name: c.name, role: '客串', description: c.description})} className="w-full flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 shadow-sm active:scale-95 transition-all text-left">
                                <img src={c.avatar} className="w-8 h-8 rounded-full object-cover" />
                                <div className="flex-1 min-w-0"><div className="font-bold text-sm text-slate-700">{c.name}</div><div className="text-[10px] text-slate-400 truncate">{c.description}</div></div>
                            </button>
                        ))}
                        {importTab === 'history' && historyProtagonists.map((p, idx) => (
                            <button key={`hist-${idx}`} onClick={() => handleImportProtagonist(p)} className="w-full flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl hover:border-indigo-200 shadow-sm active:scale-95 transition-all text-left">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-200">{p.name[0]}</div>
                                <div className="flex-1 min-w-0"><div className="font-bold text-sm text-slate-700">{p.name}</div><div className="text-[10px] text-slate-400 truncate">{p.role} - {p.description || "无描述"}</div></div>
                            </button>
                        ))}
                    </div>
                </Modal>

                <Modal isOpen={isWorldbookModalOpen} title="导入世界书设定" onClose={() => setIsWorldbookModalOpen(false)}>
                    <div className="max-h-[50vh] overflow-y-auto no-scrollbar space-y-2 p-1">
                        {worldbooks.map(wb => (
                            <button key={wb.id} onClick={() => importWorldbook(wb)} className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-indigo-300 bg-white shadow-sm active:scale-95 transition-all">
                                <div className="font-bold text-slate-700 text-sm">{wb.title}</div><div className="text-[10px] text-slate-400 mt-1">{wb.category || '未分类'}</div>
                            </button>
                        ))}
                    </div>
                </Modal>
            </div>
        );
    }

    // 3. Writing View (Core)
    if (view === 'write' && activeBook) {
        const targetChar = characters.find(c => c.id === targetCharId);
        const canReroll = segments.length > 0 && segments[segments.length - 1].authorId !== 'user';

        return (
            <div className={`h-full w-full flex flex-col font-serif ${activeTheme.bg} transition-colors duration-500 relative`}>
                
                <ConfirmDialog 
                    isOpen={!!confirmDialog}
                    title={confirmDialog?.title || ''}
                    message={confirmDialog?.message || ''}
                    variant={confirmDialog?.variant}
                    confirmText={confirmDialog?.confirmText || (confirmDialog?.onConfirm ? '确认' : 'OK')}
                    onConfirm={confirmDialog?.onConfirm || (() => setConfirmDialog(null))}
                    onCancel={() => setConfirmDialog(null)}
                />

                {/* Header */}
                <div className={`flex flex-col border-b border-black/5 shrink-0 sticky top-0 z-20 backdrop-blur-md ${activeTheme.bg}/90 transition-all`}>
                    <div className="h-16 flex items-center justify-between px-4 pt-2">
                        <button onClick={() => setView('shelf')} className="p-3 -ml-3 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-6 h-6 ${activeTheme.text}`}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <div className="flex flex-col items-center cursor-pointer active:opacity-70 transition-opacity" onClick={() => {
                            setTempTitle(activeBook.title); setTempSubtitle(activeBook.subtitle || ''); setTempSummary(activeBook.summary); setTempWorld(activeBook.worldSetting); setTempCoverImage(activeBook.coverImage || ''); setSelectedCollaborators(new Set(activeBook.collaboratorIds)); setTempProtagonists(activeBook.protagonists); setView('settings');
                        }}>
                            <span className={`font-bold text-base ${activeTheme.text} truncate max-w-[150px]`}>{activeBook.title}</span>
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] opacity-60 ${activeTheme.text}`}>第 {chapterCount} 章</span>
                                {lastTokenUsage && <span className={`text-[9px] px-1.5 py-0.5 rounded opacity-50 font-mono border border-current ${activeTheme.text}`}>⚡ {lastTokenUsage}</span>}
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setShowHistoryModal(true)} className={`p-2 rounded-full hover:bg-black/5 transition-colors ${activeTheme.text}`} title="历史章节">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
                            </button>
                            <button onClick={handleGenerateChapterSummary} disabled={isTyping} className={`p-2 rounded-full hover:bg-black/5 transition-colors ${activeTheme.text}`} title="结束本章">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
                            </button>
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

                {/* Sticky Style Bar with Accordion Panel */}
                <div className={`sticky top-[120px] z-10 ${activeTheme.bg}/95 backdrop-blur-md border-b border-black/5 shadow-sm`}>
                    <div className="px-4 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar flex-1 mr-4">
                            <div className="flex items-center gap-2 shrink-0">
                                {targetChar && <img src={targetChar.avatar} className="w-6 h-6 rounded-full object-cover" />}
                                <span className="text-xs font-bold text-slate-700">{targetChar?.name ? `${targetChar.name}的风格` : '未选择角色'}</span>
                            </div>
                            <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar">
                              {targetChar && extractWritingTags(targetChar).slice(0, 3).map((tag, idx) => {
    // Dynamic tag styling
    let colorClass = "bg-indigo-50 text-indigo-700 border-indigo-100";
    if (['快节奏','慢节奏','节奏'].some(k => tag.includes(k))) colorClass = "bg-blue-50 text-blue-700 border-blue-100";
    if (['冷峻','温情','治愈','燃','致郁'].some(k => tag.includes(k))) colorClass = "bg-pink-50 text-pink-700 border-pink-100";
    if (['对话','心理','白描','意识流'].some(k => tag.includes(k))) colorClass = "bg-amber-50 text-amber-700 border-amber-100";
    
    return (
        <span key={idx} className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap border ${colorClass}`}>
            {tag}
        </span>
    );
})}
                            </div>
                        </div>
                        <button 
                            onClick={() => setIsStyleExpanded(!isStyleExpanded)} 
                            className="shrink-0 text-[10px] bg-white border border-slate-200 px-2 py-1 rounded-full hover:bg-slate-50 text-slate-600 flex items-center gap-1 transition-colors"
                        >
                            详情 <span className={`transform transition-transform ${isStyleExpanded ? 'rotate-180' : ''}`}>▼</span>
                        </button>
                    </div>

                    {/* Expandable Panel */}
                    <div className={`transition-all duration-300 ease-out overflow-hidden ${isStyleExpanded ? 'max-h-[60vh] opacity-100' : 'max-h-0 opacity-0'}`}>
                        {targetChar ? renderPersonaPanel(targetChar) : <div className="p-4 text-center text-xs text-slate-400">请先选择一个角色</div>}
                    </div>
                </div>

                {/* Content Stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar pb-40" ref={scrollRef}>
                    {displaySegments.length === 0 && (
                        <div className="text-center py-20 opacity-40">
                            <p className="text-sm italic font-serif">第 {chapterCount} 章<br/>提笔写下新的开始...</p>
                        </div>
                    )}

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

                        if (role === 'writer') {
                            return (
                                <div key={seg.id} className={`p-6 rounded-sm shadow-sm leading-loose text-justify text-[17px] relative group transition-all ${activeTheme.paper} ${activeTheme.text} ${isUser ? 'border-l-4 border-slate-300' : ''}`}>
                                    {hoverMenu}
                                    <div className="absolute -top-3 left-4 bg-white/90 border border-black/5 px-2 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wider text-slate-500 shadow-sm flex items-center gap-1.5">
                                        {isUser ? null : <img src={char?.avatar} className="w-3 h-3 rounded-full object-cover" />}
                                        <span>{isUser ? '我 (User)' : char?.name} 执笔</span>
                                        {!isUser && seg.meta?.mood && <span className="bg-slate-100 px-1.5 rounded text-[9px] text-slate-600 normal-case">{seg.meta.mood}</span>}
                                    </div>
                                    <div className="whitespace-pre-wrap">{seg.content}</div>
                                </div>
                            );
                        } 
                        
                        if (role === 'commenter') {
                            return (
                                <div key={seg.id} className={`flex gap-3 max-w-[85%] font-sans ml-auto flex-row-reverse animate-slide-up group relative`}>
                                    <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border-2 border-white shadow-sm mt-1"><img src={isUser ? userProfile.avatar : char?.avatar} className="w-full h-full object-cover" /></div>
                                    <div className={`p-3 rounded-xl text-sm shadow-sm relative bg-[#fff9c4] text-slate-700 transform rotate-1 border border-yellow-200/50`}>{hoverMenu}{seg.content}</div>
                                </div>
                            );
                        }

                        if (role === 'analyst') {
                            return (
                                <div key={seg.id} className="mx-4 bg-gradient-to-br from-slate-50 to-blue-50/30 rounded-xl border border-slate-200 p-4 text-xs font-sans text-slate-600 shadow-sm group relative">
                                    {hoverMenu}
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200">
                                        <span className="text-lg">🧠</span><span className="font-bold text-slate-800">{char?.name} 的分析</span>{seg.focus && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">{seg.focus}</span>}
                                    </div>
                                    {seg.meta?.reaction && <div className="mb-2 pb-2 border-b border-dashed border-slate-200"><span className="text-slate-400 text-[10px] uppercase">第一反应</span><p className="text-sm font-bold text-slate-700 mt-0.5">"{seg.meta.reaction}"</p></div>}
                                    <p className="leading-relaxed whitespace-pre-wrap">{seg.content}</p>
                                </div>
                            );
                        }
                        
                        return null;
                    })}

                    {isTyping && <div className="flex justify-center py-4"><div className="flex gap-2"><div className={`w-2 h-2 rounded-full ${activeTheme.button} animate-bounce`}></div><div className={`w-2 h-2 rounded-full ${activeTheme.button} animate-bounce delay-75`}></div><div className={`w-2 h-2 rounded-full ${activeTheme.button} animate-bounce delay-150`}></div></div></div>}
                </div>

                {/* Input Area */}
                <div className={`absolute bottom-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 z-30 transition-transform duration-300 font-sans shadow-[0_-5px_20px_rgba(0,0,0,0.05)] pb-safe`}>
                    <div className="flex gap-2 px-4 py-2 text-xs border-b border-slate-100 overflow-x-auto no-scrollbar">
                        <button onClick={() => setGenOptions({...genOptions, write: !genOptions.write})} className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${genOptions.write ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}><span>✍️</span> 续写正文</button>
                        <button onClick={() => setGenOptions({...genOptions, comment: !genOptions.comment})} className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${genOptions.comment ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}><span>💬</span> 角色吐槽</button>
                        <button onClick={() => setGenOptions({...genOptions, analyze: !genOptions.analyze})} className={`px-3 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${genOptions.analyze ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}><span>🧠</span> 深度分析</button>
                    </div>

                    <div className="p-3 flex gap-2 items-end">
                        <textarea 
                            value={inputText} onChange={e => setInputText(e.target.value)} 
                            placeholder={genOptions.write ? (inputText.trim() ? "输入剧情大纲..." : "输入指令或留空AI续写...") : "输入讨论内容..."}
                            className="flex-1 bg-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-700 outline-none resize-none max-h-32 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200 transition-all" rows={1} style={{ minHeight: '44px' }}
                        />
                        {canReroll && !isTyping && !inputText.trim() && (
                            <button onClick={handleReroll} className={`w-11 h-11 rounded-full flex items-center justify-center text-slate-500 bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all shrink-0`}><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg></button>
                        )}
                        <button onClick={handleSend} disabled={isTyping || (!inputText.trim() && !genOptions.write)} className={`w-11 h-11 rounded-full flex items-center justify-center text-white shadow-md active:scale-95 transition-all shrink-0 ${inputText.trim() || genOptions.write ? activeTheme.button : 'bg-slate-300'}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>
                        </button>
                    </div>
                </div>

                <Modal isOpen={isEditModalOpen} title="编辑段落" onClose={() => setIsEditModalOpen(false)} footer={<button onClick={saveSegmentEdit} className="w-full py-3 bg-slate-800 text-white font-bold rounded-2xl">保存</button>}>
                    <textarea value={editSegmentContent} onChange={e => setEditSegmentContent(e.target.value)} className="w-full h-48 bg-slate-100 rounded-xl p-3 text-sm resize-none focus:outline-none leading-relaxed" />
                </Modal>

                <Modal isOpen={showSummaryModal} title="章节总结" onClose={() => setShowSummaryModal(false)} footer={isGeneratingSummary ? <div className="w-full py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl text-center">AI生成中...</div> : <button onClick={confirmChapterSummary} className="w-full py-3 bg-indigo-500 text-white font-bold rounded-2xl shadow-lg">确认归档并开启新章</button>}>
                    <textarea value={summaryContent} onChange={e => setSummaryContent(e.target.value)} className="w-full h-64 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm resize-none focus:outline-none leading-relaxed" placeholder="总结生成中..." />
                </Modal>

                <Modal isOpen={showHistoryModal} title="历史章节" onClose={() => setShowHistoryModal(false)}>
                    <div className="max-h-[60vh] overflow-y-auto space-y-4 p-1">
                        {historicalSummaries.length === 0 && <div className="text-center text-slate-400 py-4 text-xs">暂无历史章节</div>}
                        {historicalSummaries.map((s, i) => (
                            <div key={s.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <div className="font-bold text-sm text-slate-700 mb-2">第 {i + 1} 章</div>
                                <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{s.content}</div>
                            </div>
                        ))}
                    </div>
                </Modal>
            </div>
        );
    }

    return null;
};

export default NovelApp;
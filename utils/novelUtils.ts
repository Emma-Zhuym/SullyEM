
import { CharacterProfile, NovelBook, NovelSegment, UserProfile } from '../types';
import { ContextBuilder } from './context';

// --- Visual Themes ---
export const NOVEL_THEMES = [
    { id: 'sakura', name: '樱花 (Sakura)', bg: 'bg-pink-50', paper: 'bg-[#fff5f7]', text: 'text-slate-700', accent: 'text-pink-500', button: 'bg-pink-400', activeTab: 'bg-pink-500 text-white' },
    { id: 'parchment', name: '羊皮纸 (Vintage)', bg: 'bg-[#f5e6d3]', paper: 'bg-[#fdf6e3]', text: 'text-[#433422]', accent: 'text-[#8c6b48]', button: 'bg-[#b58900]', activeTab: 'bg-[#b58900] text-white' },
    { id: 'kraft', name: '牛皮纸 (Kraft)', bg: 'bg-[#d7ccc8]', paper: 'bg-[#e7e0d8]', text: 'text-[#3e2723]', accent: 'text-[#5d4037]', button: 'bg-[#5d4037]', activeTab: 'bg-[#5d4037] text-white' },
    { id: 'midnight', name: '深夜 (Midnight)', bg: 'bg-[#0f172a]', paper: 'bg-[#1e293b]', text: 'text-slate-300', accent: 'text-blue-400', button: 'bg-blue-600', activeTab: 'bg-blue-600 text-white' },
    { id: 'matcha', name: '抹茶 (Matcha)', bg: 'bg-[#ecfccb]', paper: 'bg-[#f7fee7]', text: 'text-emerald-800', accent: 'text-emerald-600', button: 'bg-emerald-500', activeTab: 'bg-emerald-500 text-white' },
];

export interface GenerationOptions {
    write: boolean;
    comment: boolean;
    analyze: boolean;
}

// --- INTELLIGENT TAGGING SYSTEM ---
export const extractWritingTags = (char: CharacterProfile): string[] => {
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
export const analyzeWriterPersonaSimple = (char: CharacterProfile): string => {
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
export const extractWritingTaboos = (char: CharacterProfile): string => {
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
export const generateWriterPersonaDeep = async (
    char: CharacterProfile,
    userProfile: UserProfile,
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
    
    const analysisPrompt = `你是一位人物心理分析专家和写作教练。我会给你一个虚拟角色的完整档案，以及与他/她互动的用户档案。请你深入理解这个角色，然后告诉我：

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

### 互动对象（用户背景）
(角色的记忆和性格形成深受用户影响)
**用户昵称**: ${userProfile.name}
**用户描述**: ${userProfile.bio || '无'}

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
他/她怎么看待自己笔下的【小说主角】（Fictional Protagonist）？
(注意：是指小说里的人物，不是指正在和他对话的用户)
- 是英雄？受害者？工具人？
- 会不会对主角的行为有自己的意见？

#### 7. 剧情态度 (Plot Opinion)
他/她对当前剧情有什么看法？
- 认为合理吗？
- 会不会想改变走向？
- 有没有更想写的支线？

#### 8. 互动倾向 (Collaboration Style)
他/她会怎么和共创搭档（用户）互动？
- 会吐槽搭档写得不对吗？
- 会用专业术语"互殴"吗？
- 还是默默接受搭档的设定？
- 态度是冷漠、热情、傲娇还是温柔？(参考性格特质)

---

**输出格式**（严格遵守, 不要用markdown标记）：

写作能力: (新手/业余/熟练/大师) - 一句话说明理由

语言风格: (大白话/书面语/诗意/学术) - 举例说明

表现手法: (写实/印象派/象征派) - 具体描述

叙事重心: (动作/情感/对话/氛围) - 为什么

偏好题材: (列举3个) | 禁忌俗套: (列举3个)

主角看法: (他/她怎么看待小说主角？一句话)

剧情态度: (对当前剧情的看法，30字)

互动模式: (与用户的互动风格？)

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

export const getFewShotExamples = (char: CharacterProfile) => {
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

// --- Prompt Builder ---
export const buildPrompt = (
    char: CharacterProfile, 
    userProfile: UserProfile,
    activeBook: NovelBook | null,
    userText: string, 
    storyContext: string,
    options: GenerationOptions,
    contextSegments: NovelSegment[],
    characters: CharacterProfile[]
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
${coreContext}

# 当前模式：小说共创 (Co-Writing Mode)
你正在与 **${userProfile.name}** (用户) 合作撰写小说。
书名：《${activeBook?.title}》

**你的角色**：
1. 你既是小说作者之一，也是${userProfile.name}的${char.impression?.personality_core.summary || '伙伴'}。
2. 在【分析】和【吐槽】环节，请完全保持你的人设（语气、性格、对用户的态度）。
3. 如果你们关系亲密，不要表现得像个陌生的AI工具人；如果你们关系紧张/傲娇，也要体现出来。

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
   - 语气：保持你的人设（${char.name}）。
   - 内容：如果是你觉得不合理的地方，可以直接指出；如果觉得好，可以夸奖搭档。
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
   写完后的第一人称碎碎念。这是你直接对用户说的话。
   
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
        jsonStructure.push(`"comment": { "content": "即时反应（与用户对话）" }`);
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

// --- Helper: Parse Persona Markdown for UI ---
export const parsePersonaMarkdown = (rawPersona: string) => {
    const lines = rawPersona.split('\n');
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
    
    const sections: {title: string, content: string[], icon: string}[] = [];
    let currentSection: {title: string, content: string[], icon: string} | null = null;

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        
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
            const afterColon = headerMatch[2]?.trim();
            if (afterColon) {
                currentSection.content.push(afterColon);
            }
        } else if (currentSection) {
            const cleanLine = trimmed.replace(/^\*\*|\*\*$/g, '').replace(/^[-•]\s*/, '');
            if (cleanLine) {
                currentSection.content.push(cleanLine);
            }
        }
    });
    
    if (currentSection && currentSection.content.length > 0) {
        sections.push(currentSection);
    }
    
    return sections;
};

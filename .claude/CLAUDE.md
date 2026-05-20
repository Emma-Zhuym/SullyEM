# SullyEM - 手抓糯米机

Emma（阿萌）的 SullyOS 个人 fork。基于上游 [SullyOS](https://github.com/qegj567-cloud/SullyOS) 添加个人功能。

## 上游合并策略

SullyOS 会持续更新，需要定期合并上游改动。

- **上游大改的文件** → 用 SullyOS 版本作为基础，把 EM 个人功能加回去
- **上游小改的文件** → 保留 EM 版本，把上游改进 cherry-pick 进来
- **EM 独有的文件** → 不受合并影响，直接保留

合并前先 `_em_backup/` 备份 EM 版本以便参考旧逻辑。

## EM 个人功能清单

以下功能是 EM 独有的，上游没有，合并时必须保留：

### 1. 通讯录 (ContactsList / messageSubView)
- `components/ContactsList.tsx` — 独立文件，不冲突
- `context/OSContext.tsx` 里的 `messageSubView` state (`'contacts' | 'chat'`)
- `components/PhoneShell.tsx` 里 `case AppID.Chat` 根据 `messageSubView` 切换显示
- `components/chat/ChatHeaderShell.tsx` 里的 `onOpenContacts` prop + 小房子按钮

### 2. Token 面板 (contextComposition)
- `hooks/useChatAI.ts` 里的 `ContextComposition` interface + state
- `utils/chatRequestPayload.ts` 里的 `contextBreakdown` 返回值（coreContextChars 等）
  - 必须 `import { ContextBuilder } from './context'` 并在 payload 里计算 `coreContextChars`
  - 返回 `contextBreakdown: { coreContextChars, systemCharsBeforeBilingual, bilingualAddonChars }`
- `components/chat/ChatHeaderShell.tsx` 里点击 ⚡ 数字展开的详细面板

### 3. 写 Notion 快捷操作
- `components/chat/ChatInputArea.tsx` 工具栏第二页的"写 Notion"按钮（NotePencil 图标，amber 色）
- `apps/Chat.tsx` 里的 `handleNotionDiaryQuick` + action case `'notion-diary-quick'`
- `utils/chatPrompts.ts` buildMessageHistory 里 `notion_diary_nudge` 特殊处理
  - 必须在 `m.type === 'interaction'` 判断**之前**检查 `m.metadata?.kind === 'notion_diary_nudge'`
  - 替换为系统指令让 AI 用 `[[DIARY_START: 标题 | 心情]]...[[DIARY_END]]` 格式写日记
- `hooks/useChatAI.ts` 里 `createDiaryPage` 调用必须传第四个参数 `realtimeConfig.notionDiaryExtraProperties`
  - 这个参数控制 Notion 额外列（如 character 角色标签列），不传的话日记不会自动选角色

### 4. Notion 扩展数据库 (notionExtraConfig)
- `utils/notionExtraConfig.ts` — TAG 系统、多库管理
- `apps/Settings.tsx` 里 Notion 额外数据库配置 UI
- `types.ts` 里 `NotionExtraDatabase` 类型（字段：`id`, `name`, `tag`, `databaseId`）
  - 注意是 `name` 不是 `displayName`
  - 新建时必须包含 `id: crypto.randomUUID()`

### 5. CheckPhone 固定联系人
- `apps/CheckPhone.tsx` — 固定联系人 + 角色关联

### 6. ScheduleApp 分钟精度
- `apps/ScheduleApp.tsx` — `dateTime` 字段精确到分钟
- `types.ts` 里 `AgendaItem` 的 `dateTime?`, `charId?`, `reminderMinutes?`, `createdAt?`
  - `dateTime` 是 optional，代码中访问时必须用 `item.dateTime ?? ''` 防 undefined

### 7. 桌面图标排序
- `context/OSContext.tsx` 里的 `appOrder` / `setAppOrder` state
- `apps/Launcher.tsx` 里长按拖拽排序逻辑
- 第一页固定 12 个图标

### 8. 默认壁纸
- `context/OSContext.tsx` 里 `export const DEFAULT_WALLPAPER = 'linear-gradient(...)'`

## 合并时常见坑（踩过的 bug）

### PhoneShell.tsx — messageSubView 必须解构
`useOS()` 解构时**必须**包含 `messageSubView`，否则 Chat 页面直接白屏（只剩背景图）。
```
const { ..., messageSubView } = useOS();
```

### ChatHeaderShell.tsx — 头像栏排版
标准布局 (`renderStandardInfo`) 的正确排版：
- **第一行**：名字 + online + ⚡token + 情绪分析中（flex-wrap 自动换行）
- **第二行**：心情状态 buff 标签（仅在有 buff 时显示）
- 头像尺寸 `w-10 h-10`，行间距 `gap-0.5`

### chatPrompts.ts — 日程注入
上游 `chatPrompts.ts` 的 `buildSystemPrompt` 会调用 `ContextBuilder.buildScheduleInjection()` 注入角色日程。如果用旧版 EM 的 chatPrompts 会导致角色聊天时完全不知道自己的日程（比如该开会的角色说去床上等你）。合并时优先用上游版本。

### chatPrompts.ts — notion_diary_nudge
上游的 chatPrompts 没有 `notion_diary_nudge` 处理。合并后必须在 `buildMessageHistory` 的 interaction 类型判断处手动加回：
```typescript
if (m.type === 'interaction' && m.metadata?.kind === 'notion_diary_nudge') {
    content = `${timeStr} [系统: 用户通过快捷操作希望你立刻写一篇 Notion 私人日记...]`;
} else if (m.type === 'interaction') content = `${timeStr} [系统: 用户戳了你一下]`;
```

### useChatAI.ts — contextComposition 不能硬编码 0
合并上游 useChatAI 后，`setContextComposition` 里的值不能写死为 0，必须从 `payload.contextBreakdown` 读取实际值。

### useChatAI.ts — notionDiaryExtraProperties
`NotionManager.createDiaryPage()` 必须传第四个参数 `realtimeConfig.notionDiaryExtraProperties`，否则 Notion 日记不会自动填充角色标签等额外列。

### types.ts — NotionExtraDatabase
字段名是 `name`（不是 `displayName`），合并时注意不要搞混。

### ValentineEvent.tsx — 520 等活动入口
特别时光 App 的活动入口在 `ValentineEvent.tsx` 的 `SpecialMomentsApp` 组件里。上游新增活动时需要更新此文件（如 Like520Event 的 import 和卡片入口）。

### Like520Event.tsx — 自动存档
已加 `useEffect` 在 callA + callB + chibis 齐全时自动存档，防止闪退丢失活动进度。上游版本只在用户手动点"下一步"时才存档。

## 架构原则

1. **个人新功能尽量做成独立文件**（新 App、新 util），减少对上游文件的侵入
2. **必须改上游文件时**，改动越小越好——加一行 import、加一个 case、加一个 hook 调用
3. **不要大面积重写上游文件**，否则每次合并都痛苦
4. **未来新功能**（如 Notion 高级管理）建议做成独立 App（`apps/NotionApp.tsx`），配置和逻辑放自己的文件里，跟上游 Settings 里的基础 Notion 配置互不干扰

### 9. Online/Busy/Offline 状态系统
- `utils/charStatus.ts` — 核心逻辑：根据日程 slot 计算状态，关键词 fallback
- `hooks/useCharStatus.ts` — React hook，精确 setTimeout + visibilitychange
- `utils/scheduleGenerator.ts` — 生成日程时 LLM 直接标注 `availability` 字段
- `types.ts` 里 `ScheduleSlot.availability?: 'online' | 'busy' | 'offline'`
- `ChatHeaderShell.tsx` — 状态 badge 颜色 + 文字
- `ChatInputArea.tsx` — offline 时禁用发送
- `chatRequestPayload.ts` — busy 时注入简短回复提示
- `ScheduleCard.tsx` — 编辑时可手动覆盖状态
- 三层判断优先级：手动覆盖 > LLM 生成 > 关键词 fallback

## 未来功能计划

### 1. Notion 高级管理 App（难度：中）
做成独立 `apps/NotionApp.tsx`，Settings 里的基础 Notion 配置不动。
- 全面的数据库权限配置、多库管理
- 日记模板自定义、标签管理
- 把 `notionExtraConfig.ts` 的逻辑搬过来并扩展

### 2. 地图系统（难度：高）
角色按日程 slot 的 `location` 字段在地图上移动。
- 需要自定义地图（不是真实地图），像游戏里的城镇地图
- 可以先做简单版：location 文字 → 预设坐标点
- 点击角色位置可以发起聊天

### 3. Intiface 外接硬件集成（难度：中）
通过 Intiface Central + WebSocket 连接蓝牙设备。
- Intiface 提供本地 WebSocket API（`ws://localhost:12345`）
- 角色情绪/反应 → 映射为震动强度和模式
- 做成独立 `utils/intifaceClient.ts` + `hooks/useIntiface.ts`
- UI 入口放聊天工具栏或设置

### 4. 记账系统增强（难度：低）
上游已有基础记账。在此基础上加：
- 类别管理、月度统计图表
- 和角色联动（角色评论花销习惯？）

### 5. Apple Health 健康数据接入（难度：低-中）
不走原生 HealthKit（需要 iOS app + 开发者账号），用曲线方案：
- iOS 快捷指令定时导出昨日睡眠/步数/心率 → 写入 Notion 数据库或简单 API
- SullyEM 读取数据，注入角色聊天上下文（"你昨晚才睡了5小时"）
- 可以做成 `utils/healthData.ts` + 在 `chatRequestPayload.ts` 注入
- 日程卡片也可以显示健康摘要

### 6. ~~Offline 系统~~ ✅ 已完成
已实现为 Online/Busy/Offline 状态系统（见上方功能 #9）。

## 文件说明

- `_em_backup/` — 合并前的 EM 旧版备份，供参考旧逻辑用
- `.claude/launch.json` — Vite dev/preview server 配置
- 部署：Vercel（绑 GitHub main 分支自动部署）+ GitHub Pages

## 技术栈

React + TypeScript + Vite + Tailwind CSS + IndexedDB（Dexie）

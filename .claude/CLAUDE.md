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
- `components/chat/ChatHeaderShell.tsx` 里点击 ⚡ 数字展开的详细面板

### 3. 写 Notion 快捷操作
- `components/chat/ChatInputArea.tsx` 工具栏第二页的"写 Notion"按钮
- `apps/Chat.tsx` 里的 `handleNotionDiaryQuick` + action case `'notion-diary-quick'`
- `utils/chatPrompts.ts` buildMessageHistory 里 `notion_diary_nudge` 特殊处理（第 730 行附近）

### 4. Notion 扩展数据库 (notionExtraConfig)
- `utils/notionExtraConfig.ts` — TAG 系统、多库管理
- `apps/Settings.tsx` 里 Notion 额外数据库配置 UI
- `types.ts` 里 `NotionExtraDatabase` 类型（字段：`id`, `name`, `tag`, `databaseId`）

### 5. CheckPhone 固定联系人
- `apps/CheckPhone.tsx` — 固定联系人 + 角色关联

### 6. ScheduleApp 分钟精度
- `apps/ScheduleApp.tsx` — `dateTime` 字段精确到分钟
- `types.ts` 里 `AgendaItem` 的 `dateTime?`, `charId?`, `reminderMinutes?`, `createdAt?`

### 7. 桌面图标排序
- `context/OSContext.tsx` 里的 `appOrder` / `setAppOrder` state
- `apps/Launcher.tsx` 里长按拖拽排序逻辑
- 第一页固定 12 个图标

### 8. 默认壁纸
- `context/OSContext.tsx` 里 `export const DEFAULT_WALLPAPER = 'linear-gradient(...)'`

## 架构原则

1. **个人新功能尽量做成独立文件**（新 App、新 util），减少对上游文件的侵入
2. **必须改上游文件时**，改动越小越好——加一行 import、加一个 case、加一个 hook 调用
3. **不要大面积重写上游文件**，否则每次合并都痛苦

## 文件说明

- `_em_backup/` — 合并前的 EM 旧版备份，供参考旧逻辑用
- `.claude/launch.json` — Vite dev/preview server 配置
- 部署：Vercel（绑 GitHub main 分支自动部署）

## 技术栈

React + TypeScript + Vite + Tailwind CSS + IndexedDB（Dexie）

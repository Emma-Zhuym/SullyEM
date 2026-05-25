# BankApp 开发与 Prompt 优化 — 会话改动总结

> 记录时间：2026-05-24  
> 涉及范围：BankApp 记账功能、分析页 TA 读、聊天系统 Notion 日记/引用 Prompt 优化

---

## 一、BankApp 功能开发

### 1. 交易 Tab — 记账表单

**文件：** `apps/BankApp.tsx`

- 新增 `TransactionForm` 组件，支持 **支出 / 收入 / 转账** 三种类型
- 支持 **新增、编辑、删除** 交易（点击流水行进入编辑，右下角 `+` 新增）
- 两级分类选择（展开子分类网格）
- 字段：金额、账户、转入账户（转账）、日期、备注
- 无账户时引导用户先去资产页添加

**Commit：** `df90899` — feat(bank): 记账表单 — 支出/收入/转账新增+编辑+删除

### 2. 分析 Tab — 饼图 + 分类列表 + TA 读

**文件：** `apps/BankApp.tsx`

- **SVG 环形饼图**（`DonutChart`）：按一级分类汇总支出占比
- **分类列表**：颜色圆点 + emoji + 金额 + 百分比 + 进度条
- 时间维度：周 / 月 / 年
- **TA 读**：选择角色 + 四种语气（调侃 / 认真 / 鼓励 / 关怀），调用 LLM 生成消费点评
- 结果按「角色 + 周期 + 语气」缓存，支持「换一个说法」重新生成

**Commit：** `ce135d7` — feat(bank): 分析页完善 — SVG饼图 + 彩色分类列表 + TA读LLM

### 3. TA 读 Prompt 工程

**文件：** `apps/BankApp.tsx`

- **`buildTAReadPrompt` 重写**：从只喂 300 字 persona 片段，升级为完整角色上下文
  - `systemPrompt`（核心性格）
  - `selfInsights`（内在认知）
  - `normalizeUserImpression(char.impression)`（角色眼中的用户）
  - 动态用户名：`userProfile?.name || '用户'`
  - 语气指令角色化 + 写作质量约束（参照聊天系统标准）
- **`findNotableTransactions`**：自动筛出值得角色点评的单笔交易
  - 高额 top 3
  - 异常偏离（超过该分类历史均值 2.5 倍）
  - 有备注的交易（最多 5 条）
  - 去重后最多 10 条
- Prompt 中加入「阅读指引」：引导角色对具体消费做个性化反应（同一笔消费，不同人设看到不同重点）
- `max_tokens` 500 → 800

**Commit：** `76a4b83` — feat(bank): TA读提示词重写+注入单笔交易明细

### 4. 硬编码用户名修复

- 将 `userProfile?.name || 'Emma'` 改为 `userProfile?.name || '用户'`
- 确认项目标准 fallback 为「用户」

### 5. TypeScript 类型修复

- `TABS` 图标类型从 `React.FC<{ weight?: string }>` 改为 Phosphor 官方 `Icon` 类型
- 消除 L18–21 的 3 个 lint 错误（不影响运行，仅类型检查）

---

## 二、聊天 Prompt 优化（Notion 日记 / 引用 / 小红书）

**背景：** 角色早期一天能写 2–3 篇 Notion 日记，近期几乎不写；引用功能也几乎不用。根因是 system prompt 膨胀（861 行、24 种 `[[...]]` 指令），日记/引用的相对注意力权重被稀释。

**文件：** `utils/chatPrompts.ts`、`context/OSContext.tsx`

### 1. Notion 日记 — 增加硬触发条件

- 标题加 `(非常重要！)`
- 新增 **⚠️ 8 种主动写日记场景**（触动的事、重要生活事件、吵架和好、新认识、灵感、深夜感性等）
- 新增 **频率参考**：「好几次聊天没写过？问自己：真的没什么值得记的吗？」
- 增加情感动机：「有些话你不会直接对用户说，但会写在日记里」
- 格式说明压缩（markdown / callout 合并为紧凑参考），**保留完整示例日记**
- 飞书日记段同步增加触发条件

### 2. 引用功能 — 从 2 行扩到 8 行

- 新增 4 种触发时机（多件事选一件回应、吐槽反驳、触动的话拎出来、翻旧话接着聊）
- 增加使用示例

### 3. 小红书 — 85 行压缩到 ~16 行

- 10 个操作合并为紧凑列表，保留完整语法 + 使用心态 + 主动提示
- 功能不丢，减少 prompt 体积

### 4. 主动消息 Hint

- `OSContext.tsx` proactive message 系统提示末尾增加：「如果最近有什么想法或感触，你也可以顺手写篇日记」

**Commit：** `2ac598d` — refactor(prompts): 强化日记写作/引用触发 + 压缩XHS指令  
**体积变化：** chatPrompts.ts 861 行 → 775 行（净减 86 行）

---

## 三、当前 BankApp 完成度

| 模块 | 状态 |
|------|------|
| 资产 Tab — 账户 CRUD | ✅ 完成 |
| 资产 Tab — 多币种总资产分列 | ✅ 完成 |
| 资产 Tab — 趋势图 | ⏳ 占位（按钮有，图表未实现） |
| 交易 Tab — 记账 CRUD（支出/收入/转账） | ✅ 完成 |
| 交易 Tab — 两级分类选择（可只选一级） | ✅ 完成 |
| 交易 Tab — 筛选 / 汇总 / 按日分组 | ✅ 完成 |
| 交易 Tab — 今日情报 | ⏳ 占位 |
| 分析 Tab — 饼图 + 分类列表 | ✅ 完成 |
| 分析 Tab — 时间段导航（offset 箭头切换历史周期） | ✅ 完成 |
| 分析 Tab — 支出/收入/收支三种视图 | ✅ 完成 |
| 分析 Tab — TA 读 LLM + 记忆宫殿注入 + 持久化 | ✅ 完成 |
| 设置页 — 常用币种 + 默认币种 | ✅ 完成 |
| 设置页 — 分类管理（一二级 CRUD + 级联删除） | ✅ 完成 |
| 数据层 IndexedDB（DB v3） | ✅ 完成 |
| UI — 标题居中 + FAB 调色定位 | ✅ 完成 |

详细设计规格见 [`finance-redesign.md`](./finance-redesign.md)。

---

## 四、Git 提交记录

| Commit | 说明 |
|--------|------|
| `df90899` | 记账表单 — 支出/收入/转账新增+编辑+删除 |
| `ce135d7` | 分析页 — SVG饼图 + 彩色分类列表 + TA读LLM |
| `76a4b83` | TA读提示词重写 + 注入单笔交易明细 + 用户名动态化 |
| `2ac598d` | 聊天 Prompt：日记/引用强化 + XHS压缩 + proactive日记提示 |
| `2b0d40e` | 多币种总资产、TA读持久化、分析筛选、记忆宫殿注入、设置页、分类管理 |
| `acccbb7` | 分析页时间导航+收支平衡+标题居中+FAB调色 |
| `ea1ee95` | FormRow 内容统一靠右对齐 |
| `39a3b16` | 切换一级分类时清除旧选中状态 |
| `ee18b92` | 允许只选一级分类，不强制选二级 |

---

## 五、相关文件清单

```
apps/BankApp.tsx          — BankApp 主文件（~2000行，三 Tab + 表单 + 分析 + TA读 + 设置）
utils/financeDb.ts        — IndexedDB 数据层（DB v3，5个store）
utils/chatPrompts.ts      — 聊天 system prompt 构建
context/OSContext.tsx     — proactive message hint
docs/finance-redesign.md  — BankApp 设计规格（已有）
```

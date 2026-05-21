# HealthApp 设计文档

> 设计时间：2026-05-21

---

## 一、功能定位

Emma 的个人健康日历：经期追踪、锻炼记录、症状记录。
与角色日程联动（只读），支持 Apple Health 数据导入。

---

## 二、日历视图

月历为主视图，每个日期格下方最多显示 3 个彩色小点：

| 颜色 | 含义 |
|------|------|
| 🔴 深红 | 经期（量多） |
| 🩷 粉色 | 经期（量少/点滴） |
| 🔵 浅蓝 | 预测排卵窗口（半透明背景色） |
| 🟢 绿色 | 有锻炼记录 |
| 🟣 紫色 | 症状（痛经/腹胀等） |

一天可以同时有多个点（如经期第一天+锻炼 = 红+绿）。
排卵窗口用日期格背景浅蓝色表示，不占点位。

日历顶部显示：当前周期第 X 天 · 预计下次 XX月XX日–XX日

---

## 三、日期详情 Panel

点击任意日期，日历下方滑出详情 panel，分两部分：

**Emma 的记录：**
- 经期：量级（无/点滴/少/中/多）
- 症状：多选标签（痛经、腹胀、头痛、情绪低落、疲劳……）
- 锻炼：类型（跑步/力量/瑜伽/游泳/其他）+ 时长（分钟）+ 消耗卡路里（可选）
- 备注（自由文字）

**角色当天日程（只读）：**
- 读取现有 `DB.getDailySchedule`，显示当天角色在做什么
- 格式：角色头像 + 时间段 + 活动名
- 没有日程数据则不显示此区块

底部：「+ 添加记录」按钮，打开快速记录 modal。

---

## 四、周期推算（纯前端计算，无 LLM）

```typescript
// 输入：所有历史经期开始日期数组
// 输出：当前周期天数、预测下次经期范围、当前阶段

function calcCycleStatus(periodStarts: string[]): CycleStatus {
  // 1. 当前周期第几天（从最近一次经期开始算，始终准确）
  // 2. 过去 N 次周期长度 → 计算平均值和标准差
  // 3. 预测下次 = 最近经期开始 + 平均周期长度，范围 = ±1标准差
  // 4. 当前阶段（卵泡期/排卵窗/黄体期）基于周期天数估算
  // 5. 数据不足（<3次）或周期变异系数 >0.15 时标注"预测不确定"
}
```

阶段显示用范围而不是确定值：
- "可能进入排卵窗口（第 12–16 天，你目前第 14 天）"
- 周期不规律时显示宽范围并注明"基于最近 X 次周期估算"

---

## 五、LLM 功能

仅用于角色周评论（手动触发，不自动调用）：
- 健康 app 底部「让 [角色] 来说说这周」按钮
- LLM 拿到本周症状+锻炼汇总，用角色口吻简评（3–5 句）
- 角色可结合自己的日程（"我那天在开会，你还在跑步呢"）

---

## 六、数据流

```
【历史导入，一次性】
Apple Health → 导出所有健康数据（.zip）
    → 上传到 SullyEM → 浏览器解压+解析 XML → IndexedDB

【日常同步，自动】
Apple Health → iOS 快捷指令（每日自动）
    → Notion HealthLog 数据库
    → SullyEM 打开健康 app 时增量同步 → IndexedDB

【手动记录】
直接在 SullyEM 健康 app 里添加 → IndexedDB（不回写 Notion）
```

### 历史导入：Apple Health XML 解析

Apple Health 导出路径：健康 app → 右上角头像 → 导出所有健康数据 → 生成 .zip

zip 内 `export.xml` 包含所有历史数据，SullyEM 用 JSZip + DOMParser 在浏览器端解析：

```
HKCategoryTypeIdentifierMenstrualFlow  → 经期记录
HKCategoryTypeIdentifierAbdominalCramps → 痛经症状
HKWorkoutActivityType*                 → 锻炼记录
```

### Notion HealthLog 数据库结构（日常同步用）

| 列名 | 类型 | 说明 |
|------|------|------|
| Date | Date | 日期 |
| Type | Select | period / symptom / workout |
| Detail | Text | 量级/症状名/锻炼类型 |
| Value | Number | 时长(min) 或卡路里（锻炼用） |
| Source | Select | apple_health / manual |

### 快捷指令逻辑（仅日常同步）

**每日自动同步（每晚 22:00 触发）：**
```
获取今天的经期 / 症状 / 锻炼数据
有数据则写入 Notion HealthLog（跳过已存在的条目）
```

---

## 七、文件结构

| 文件 | 说明 |
|------|------|
| `apps/HealthApp.tsx` | 主 app，月历 + 详情 panel |
| `utils/healthDb.ts` | IndexedDB 读写（健康数据表） |
| `utils/cycleCalc.ts` | 周期推算纯计算函数 |
| `utils/healthNotionSync.ts` | 从 Notion 同步到本地 IndexedDB |

**需要动的上游文件（最小改动）：**
- `constants.tsx`：加 `AppID.Health`，加应用注册
- `types.ts`：加健康数据类型（或单独 `types/health.ts`）

---

## 八、实现顺序

1. 类型定义 + `healthDb.ts`（本地存储）
2. `cycleCalc.ts`（周期推算逻辑，可单独测试）
3. `HealthApp.tsx` 月历视图 + 彩点渲染
4. 日期详情 panel + 手动记录 modal
5. `healthNotionSync.ts`（Notion 同步）
6. 角色日程联动（读 DailySchedule）
7. LLM 角色周评论
8. 快捷指令模板（文档说明，不是代码）

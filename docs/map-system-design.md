# 地图系统设计文档

> 设计时间：2026-05-21  
> 原型位置：`/Tavern/mapsystem/`（独立 HTML 原型，已完成 UI 设计）

---

## 一、整体概念

**Meta 空间地图**：不强求地理真实性，角色的虚构城市设定和 Emma 的真实地点共存，不做解释。地图是"你们关系的可视化空间"，不是现实地理。

以后如需升级为真实地图底图（Mapbox），坐标从百分比换经纬度，核心逻辑不变。

---

## 二、视图层级

### 书架（Shelf）— 入口页
- 每个角色一张"世界书卡"：封面色块 + 角色名 + 当前状态 + 上次消息时间
- **Crossover 开关**：OFF = 每人独立世界；ON = 所有角色合并到"星辰镇"总图
- 点击书卡进入该世界的地图

### 地图（MapView）— 主视图
三层叠加：
1. **底层**：SVG blob 有机色块区域（装饰性地标，如"星澜大厦"、"你们的家"）
2. **中层**：Emma 手动放置的个人地标（公寓、学校、常去地点）
3. **上层**：角色 pin（位置由日程 slot `location` 字段驱动）

顶部 tabs：角色 / 地点 / 时间线（v1 时间线可以只做占位）

### 底部抽屉（BottomSheet）— 角色详情
点击角色 pin 展开，显示：
- 角色名 + 当前所在区域
- **状态 badge**（接 `useCharStatus`）：在线绿 / 忙碌琥珀 / 下线灰，busy 时显示活动名
- **当前活动描述**：从日程 slot 的 location + activity 字段读取（"28楼会议室 · 正在赶方案"）
- **最后一句话**：从 `DB.getMessagesByCharId` 拿最近一条 AI 消息
- **"去见TA"按钮**：`openApp(AppID.Chat, { messageWidgetCharId: char.id })`

---

## 三、SullyEM 数据接入

| 原型里的硬编码 | 接入 SullyEM 后的数据来源 |
|---|---|
| `character.mood` | `useCharStatus(schedule).status` |
| `character.moodLabel` | status → "在线" / `activity+'中'` / "下线" |
| `character.sub`（活动描述） | 当前 schedule slot 的 location + title |
| `character.quote`（最后一句话） | `DB.getMessagesByCharId(char.id)` 最近一条 |
| "去找TA"按钮 | `openApp(AppID.Chat, { messageWidgetCharId: char.id })` |

---

## 四、个人地标编辑

Emma 可以在地图上自己放置个人地点（公寓、学校、常去咖啡馆等）。

**交互：**
- 地图右上角"编辑"按钮 → 进入编辑模式
- 长按地图空白处 → 弹出 modal 输入名称 + 选 emoji → 落 pin
- 编辑模式下可拖动已有个人 pin 调整位置
- 角色 pin 不可手动拖动（由日程驱动）

**数据结构：**
```typescript
interface PersonalLocation {
  id: string;
  name: string;      // "我的公寓"、"UAB"
  glyph: string;     // emoji
  x: string;         // 百分比，如 "42%"
  y: string;         // 百分比，如 "65%"
  isMe?: boolean;    // 主居住地显示脉冲动效
}
```

每个世界独立保存自己的个人地标配置到 IndexedDB。

---

## 五、角色世界配置

每个角色需要手动设计自己的世界地图（blob 区域路径），这是一次性的创意工作。

原型中已有陈照的世界作为参考模板（`worlds-data.js` 的 `chenzhao` 条目）。

Emma 的真实角色需要重新定义各自的区域：
- 陈照（已有原型）
- 陆时（总裁，商务场景为主）
- 乐手
- 策划
- 继承人
- Persephone / Sully（AI 角色，区域设定可以更抽象）

Crossover 总图（星辰镇）统一给所有角色分配区域，可以先做这一张。

---

## 六、文件结构

| 文件 | 说明 |
|------|------|
| `apps/MapApp.tsx` | 主入口，书架 + 地图视图 |
| `components/map/MapShelf.tsx` | 书架组件（世界书卡列表） |
| `components/map/MapView.tsx` | 单世界地图（SVG 区域 + pins） |
| `components/map/MapPin.tsx` | 角色/个人地标 pin 组件 |
| `components/map/MapBottomSheet.tsx` | 底部角色详情抽屉 |
| `utils/mapDb.ts` | 个人地标 + 世界配置的 IndexedDB 读写 |
| `utils/mapWorldConfig.ts` | 各角色世界的区域定义数据（blob 路径等） |

**需要动的上游文件（最小）：**
- `constants.tsx`：加 `AppID.Map`，注册图标

---

## 七、实现顺序

1. 原型代码移植（vanilla JS → TypeScript，global → import）
2. `mapWorldConfig.ts` 定义角色世界区域（先做陈照 + Crossover）
3. SullyEM 数据接入（useCharStatus、最近消息、openApp）
4. 个人地标编辑功能
5. 其余角色的世界区域补全

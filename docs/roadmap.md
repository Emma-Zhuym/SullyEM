# SullyEM Roadmap

> 此文件同步自 Claude memory，跨会话记忆以 memory 为准，这里是可读副本。

## 待做功能

1. **Notion 高级管理 App** — 独立 `apps/NotionApp.tsx`，多库管理 + 权限配置 + 日记模板
2. **地图系统** — 规格见 `docs/map-system-design.md`（2026-05-21 设计完成）：原型已在 `/Tavern/mapsystem/`，书架→世界地图→底部抽屉→跳Chat，接入 useCharStatus/最近消息/openApp，支持个人地标手动放置
3. **Intiface 硬件集成** — WebSocket 连蓝牙设备，角色情绪→震动模式
4. **记账重设计** — 详细规格见 `docs/finance-redesign.md`（2026-05-21 设计完成，待实现）
5. **健康 App** — 详细规格见 `docs/health-app-design.md`（2026-05-21 设计完成，待实现）：经期日历（彩点色块）、锻炼记录、症状追踪、周期推算（统计方法适配不规律周期）、Apple Health→快捷指令→Notion→IndexedDB 数据流、角色日程联动、LLM 角色周评论

## 已完成

- ~~Offline 系统~~ → Online/Busy/Offline 状态系统（2026-05-20）
- Chat UI 改进（2026-05-21）：气泡弹性入场动效、引用块独立气泡化、工具栏弹性动效 + 等高
- 日程卡片状态可视化（2026-05-21）：每个 slot 显示推断的 有空/忙/离线 badge
- Chat UI 收尾（2026-05-21）：+ 按钮展开时弹性旋转 45° 变 ×、工具栏按钮弹性按压动效（cubic-bezier spring）
- 引用气泡 bug 修复（2026-05-21）：引用块宽度不再撑开主气泡（w-fit + ml-auto）
- 首页角色小组件状态 bug 修复（2026-05-21）：绿灯和 Online 标签改为动态读取 useCharStatus

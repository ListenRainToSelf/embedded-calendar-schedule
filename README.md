# 嵌入日历日程（Embedded Calendar Schedule）

Obsidian 插件：在笔记中嵌入**可交互的日历日程表格**，右键即可添加日程，日历下方实时显示日程列表；支持**法定节假日 / 调休 / 农历标记**，并与 **TaskNotes** 任务笔记联动（任务笔记呈现：**来源笔记 + 日程信息 + 时间**）。

## 功能

- **插入日历**：笔记中输入 `/` 选择「插入日历日程表格」（或命令面板 Ctrl+P → 同名命令），生成 ```` ```ecs-calendar ```` 代码块，实时预览/阅读模式下渲染为交互日历。
- **右键添加日程**：右键任意日期 → 添加日程；也可双击单元格快速添加。弹窗内可设置标题、分类、日期、开始/结束时间（或全天）、地点、备注、来源笔记。
- **日历下方显示日程**：默认显示本月全部日程（按日期分组、显示节假日名与“今天”）；点击某一天则切换为当日视图。每条日程可直接勾选完成、点击编辑、删除。
- **右键日期还能**：查看当日日程、打开当日日程的来源笔记 / 任务笔记、一键清空当日日程。
- **节假日标记**：内置 2025–2026 年国务院办公厅公布的放假安排与调休上班日（节日名红色角标、上班日“班”字角标）；2027 年及以后可在设置中用 JSON 自行补充。
- **农历显示**：日期下方显示农历日 / 传统节日（春节、元宵、端午、七夕、中秋、重阳、腊八、除夕、龙抬头）。
- **TaskNotes 联动**：添加日程时可同时生成 TaskNotes 兼容的任务笔记（默认 `TaskNotes/Tasks/`，frontmatter 含 `tags: task`、`title`、`status`、`scheduled`、`time`、`source` 等），勾选完成会同步 `status: done` + `completedDate`，删除日程可连带移除任务笔记。任务笔记正文为三行式：**来源笔记 + 日程信息 + 时间**。
- **日程面板**：左侧栏（或功能区日历图标 / 命令「打开日程面板」）按日期分组列出全部日程：日期、时间、分类色点、标题、来源笔记、时间，一键打开来源笔记或任务笔记。
- **状态栏**：底部显示「今日待办 N 项」，点击打开日程面板。

## 代码块参数

````markdown
```ecs-calendar
month: current      # current | next | YYYY-MM，初始显示月份
filter: all         # all（全部日程）| note（仅当前笔记的日程）
showHolidays: true  # 法定节假日角标
showWorkdays: true  # 调休上班“班”角标
showLunar: true     # 农历与传统节日
```
````

不写的参数回退到插件设置中的默认值。日历上方的「全部日程 / 本笔记」按钮可临时切换筛选，`‹ › 今天` 可翻页浏览（记忆在会话内）。

## 设置项

- 日历显示：周首日（周一/周日）、高亮周末、节假日/调休/农历开关、默认筛选
- 日程分类：JSON 自定义分类与颜色，如 `[{"name":"工作","color":"#4f8cff"}]`
- 自定义节假日 JSON：`{"holidays":[["2027-01-01","2027-01-03","元旦"]],"workdays":[["2027-01-09","2027-01-09"]]}`
- TaskNotes 联动：总开关、任务笔记文件夹（默认 `TaskNotes/Tasks`，与 TaskNotes 插件设置保持一致）、新建日程时默认创建任务笔记、完成状态同步、删除日程时移除任务笔记
- 其他：状态栏今日待办

## 数据说明

- 所有日程集中保存在本插件 `data.json`（vault 的 `.obsidian/plugins/embedded-calendar-schedule/` 内）；日历代码块只保存显示参数。
- 任务笔记由本插件创建并维护 frontmatter 中它管理的字段（title/status/scheduled/time/source/tags/type/eventId/completedDate）；你在任务笔记中添加的其它字段会被保留。正文若含插件标记行则随日程编辑自动更新，否则不动你的正文。
- 来源笔记被重命名/移动时日程中的引用自动更新；被删除时仅清空引用、日程保留。

## 开发

```bash
npm install        # 安装依赖
npm run dev        # watch 模式
npm test           # 三套自测（逻辑 / jsdom 渲染 / TaskNotes 联动）
npm run build      # 类型检查 + 生产构建 main.js
npm run deploy     # 构建并复制到 F:/obsidian vault（可传参：node deploy.mjs <vault路径>）
```

源码结构：`src/main.ts` 入口 · `src/block.ts` 日历代码块 · `src/store.ts` 事件存储 · `src/modal.ts` 日程弹窗 · `src/tasknotes.ts` TaskNotes 联动 · `src/panel.ts` 日程面板 · `src/holidays.ts` 节假日数据 · `src/lunar.ts` 农历 · `src/settings.ts` 设置页。

## 安装

1. 复制 `manifest.json`、`main.js`、`styles.css` 到 `<vault>/.obsidian/plugins/embedded-calendar-schedule/`（`npm run deploy` 可自动完成）。
2. Obsidian → 设置 → 第三方插件 → 关闭安全模式（若未关）→ 「已安装插件」中启用 **嵌入日历日程**。
3. 新开一篇笔记，输入 `/` 选择「插入日历日程表格」即可开始使用。

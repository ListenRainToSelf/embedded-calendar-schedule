/** 日程事件数据模型 */
export interface EcsEvent {
	/** 唯一 id */
	id: string;
	/** 日程标题 */
	title: string;
	/** 日期 YYYY-MM-DD */
	date: string;
	/** 开始时间 HH:mm，空表示全天 */
	startTime: string;
	/** 结束时间 HH:mm */
	endTime: string;
	/** 分类名（对应 settings.categories 之一） */
	category: string;
	/** 地点 */
	location: string;
	/** 备注/描述 */
	description: string;
	/** 来源笔记路径（vault 内路径，不含 .md），空表示无 */
	note: string;
	/** 是否已完成 */
	done: boolean;
	/** 联动的 TaskNotes 任务笔记路径，空表示未创建 */
	taskNote: string;
	/** 创建时间戳 */
	created: number;
}

export interface EcsCategory {
	name: string;
	color: string;
}

export interface EcsSettings {
	/** 周首日：0=周日，1=周一 */
	firstDayOfWeek: 0 | 1;
	/** 代码块默认筛选：all=全部日程，note=仅当前笔记 */
	defaultFilter: 'all' | 'note';
	/** 状态栏显示今日日程数 */
	showStatusBar: boolean;
	/** 标记法定节假日 */
	showHolidays: boolean;
	/** 标记调休上班日 */
	showWorkdays: boolean;
	/** 显示农历与农历节日 */
	showLunar: boolean;
	/** 高亮周末 */
	highlightWeekends: boolean;
	/** 日程分类与颜色 */
	categories: EcsCategory[];
	/** 自定义节假日 JSON（扩展内置 2025-2026 数据） */
	customHolidayJson: string;
	/** 启用 TaskNotes 联动 */
	taskNotesEnabled: boolean;
	/** TaskNotes 任务笔记文件夹 */
	taskNotesFolder: string;
	/** 新建日程时默认同时创建任务笔记 */
	taskNotesCreateByDefault: boolean;
	/** 勾选完成时同步任务笔记状态 */
	taskNotesSyncStatus: boolean;
	/** 删除日程时把任务笔记移入系统回收站 */
	taskNotesDeleteOnEventDelete: boolean;
}

export const DEFAULT_SETTINGS: EcsSettings = {
	firstDayOfWeek: 1,
	defaultFilter: 'all',
	showStatusBar: true,
	showHolidays: true,
	showWorkdays: true,
	showLunar: true,
	highlightWeekends: true,
	categories: [
		{ name: '工作', color: '#4f8cff' },
		{ name: '生活', color: '#34c77b' },
		{ name: '学习', color: '#f5a623' },
		{ name: '重要', color: '#e05260' },
		{ name: '其他', color: '#9aa0a6' },
	],
	customHolidayJson: '',
	taskNotesEnabled: true,
	taskNotesFolder: 'TaskNotes/Tasks',
	taskNotesCreateByDefault: true,
	taskNotesSyncStatus: true,
	taskNotesDeleteOnEventDelete: true,
};

/** 代码块语言 */
export const BLOCK_LANG = 'ecs-calendar';
/** 侧边栏视图类型 */
export const VIEW_TYPE_SCHEDULE_PANEL = 'ecs-schedule-panel';
/** 任务笔记正文里插件托管的标记行，用于判断正文是否可安全重写 */
export const TASK_NOTE_MARKER = '> 由「嵌入日历日程」自动维护';

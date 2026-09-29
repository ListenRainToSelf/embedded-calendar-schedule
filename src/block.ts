import { Menu, MarkdownRenderChild, setIcon } from 'obsidian';
import type { EcsPlugin } from './main';
import { EcsEvent } from './types';
import {
	addMonths,
	buildMonthMatrix,
	monthTitle,
	parseBlockOptions,
	todayStr,
	truthy,
	WEEKDAY_CN,
} from './util';
import { getHoliday } from './holidays';
import { solarToLunar } from './lunar';
import { EventModal } from './modal';
import { ConfirmModal } from './suggest';

/** 记住每个日历块的导航状态（文件被重新渲染后仍保留当前查看的月份） */
const blockStateMap = new Map<string, { y: number; m: number; selected: string | null }>();

interface BlockOptions {
	monthKey: string;
	initY: number;
	initM: number;
	filter: 'all' | 'note';
	showHolidays: boolean;
	showWorkdays: boolean;
	showLunar: boolean;
}

function parseOptions(plugin: EcsPlugin, source: string): BlockOptions {
	const o = parseBlockOptions(source);
	const s = plugin.settings;
	const monthRaw = (o['month'] ?? 'current').trim();
	const now = new Date();
	let initY = now.getFullYear();
	let initM = now.getMonth() + 1;
	const mt = /^(\d{4})-(\d{1,2})$/.exec(monthRaw);
	if (mt) {
		initY = +mt[1];
		initM = Math.min(12, Math.max(1, +mt[2]));
	} else if (monthRaw === 'next') {
		const n = addMonths(initY, initM, 1);
		initY = n.y;
		initM = n.m;
	}
	const filter = (o['filter'] ?? s.defaultFilter) === 'note' ? 'note' : 'all';
	return {
		monthKey: monthRaw,
		initY,
		initM,
		filter,
		showHolidays: o['showHolidays'] !== undefined ? truthy(o['showHolidays']) : s.showHolidays,
		showWorkdays: o['showWorkdays'] !== undefined ? truthy(o['showWorkdays']) : s.showWorkdays,
		showLunar: o['showLunar'] !== undefined ? truthy(o['showLunar']) : s.showLunar,
	};
}

export class CalendarBlock extends MarkdownRenderChild {
	private opts: BlockOptions;
	private state: { y: number; m: number; selected: string | null };
	private readonly stateKey: string;
	private unsubscribe: (() => void) | null = null;

	constructor(containerEl: HTMLElement, private plugin: EcsPlugin, source: string, private sourcePath: string) {
		super(containerEl);
		this.opts = parseOptions(plugin, source);
		this.stateKey = `${sourcePath}#${this.opts.monthKey}|${this.opts.filter}`;
		const saved = blockStateMap.get(this.stateKey);
		this.state = saved ?? { y: this.opts.initY, m: this.opts.initM, selected: null };
		if (blockStateMap.size > 300) blockStateMap.clear();
		blockStateMap.set(this.stateKey, this.state);
	}

	onload(): void {
		this.unsubscribe = this.plugin.store.subscribe(() => this.render());
		this.render();
	}

	onunload(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private get filter(): 'all' | 'note' {
		return this.localFilter ?? this.opts.filter;
	}

	private localFilter: 'all' | 'note' | null = null;

	private categoryColor(name: string): string {
		return this.plugin.settings.categories.find((c) => c.name === name)?.color ?? '#9aa0a6';
	}

	private noteName(path: string): string {
		if (!path) return '';
		const noExt = path.replace(/\.md$/i, '');
		return noExt.includes('/') ? noExt.slice(noExt.lastIndexOf('/') + 1) : noExt;
	}

	private render(): void {
		const root = this.containerEl;
		root.empty();
		root.addClass('ecs-calendar-block');
		const { y, m } = this.state;

		// ── 工具栏 ──
		const toolbar = root.createDiv({ cls: 'ecs-toolbar' });
		const nav = toolbar.createDiv({ cls: 'ecs-nav' });
		const prev = nav.createEl('button', { cls: 'ecs-icon-btn' });
		setIcon(prev, 'chevron-left');
		prev.setAttribute('aria-label', '上个月');
		prev.addEventListener('click', () => {
			const n = addMonths(this.state.y, this.state.m, -1);
			this.state.y = n.y;
			this.state.m = n.m;
			this.state.selected = null;
			this.render();
		});
		const title = nav.createSpan({ cls: 'ecs-month-title' });
		title.setText(monthTitle(y, m));
		const next = nav.createEl('button', { cls: 'ecs-icon-btn' });
		setIcon(next, 'chevron-right');
		next.setAttribute('aria-label', '下个月');
		next.addEventListener('click', () => {
			const n = addMonths(this.state.y, this.state.m, 1);
			this.state.y = n.y;
			this.state.m = n.m;
			this.state.selected = null;
			this.render();
		});
		const todayBtn = nav.createEl('button', { text: '今天', cls: 'ecs-text-btn' });
		todayBtn.addEventListener('click', () => {
			const now = new Date();
			this.state.y = now.getFullYear();
			this.state.m = now.getMonth() + 1;
			this.state.selected = null;
			this.render();
		});

		const right = toolbar.createDiv({ cls: 'ecs-toolbar-right' });
		const filterBtn = right.createEl('button', {
			text: this.filter === 'note' ? '本笔记' : '全部日程',
			cls: 'ecs-text-btn ecs-filter-chip',
		});
		filterBtn.setAttribute('aria-label', '切换：显示全部日程 / 仅当前笔记的日程');
		filterBtn.addEventListener('click', () => {
			this.localFilter = this.filter === 'note' ? 'all' : 'note';
			this.render();
		});
		const addBtn = right.createEl('button', { cls: 'ecs-text-btn ecs-add-btn' });
		setIcon(addBtn, 'plus');
		addBtn.createSpan({ text: '添加日程' });
		addBtn.addEventListener('click', () => this.openAdd(todayStr()));

		// ── 星期表头 ──
		const wkRow = root.createDiv({ cls: 'ecs-weekdays' });
		for (let i = 0; i < 7; i++) {
			const wd = (i + this.plugin.settings.firstDayOfWeek) % 7;
			wkRow.createSpan({ text: WEEKDAY_CN[wd], cls: `ecs-wk${wd === 0 || wd === 6 ? ' ecs-wk-end' : ''}` });
		}

		// ── 日期网格 ──
		const matrix = buildMonthMatrix(y, m, this.plugin.settings.firstDayOfWeek);
		const grid = root.createDiv({ cls: 'ecs-grid' });
		const today = todayStr();
		for (const row of matrix) {
			for (const cell of row) {
				this.renderCell(grid, cell, today);
			}
		}

		// ── 日程列表 ──
		const listEl = root.createDiv({ cls: 'ecs-list' });
		this.renderListInto(listEl);

		const footer = root.createDiv({ cls: 'ecs-footer' });
		footer.setText('右键日期添加日程 · 双击单元格快速添加 · 点击日期查看当日');
	}

	private renderCell(grid: HTMLElement, cell: { y: number; m: number; d: number; str: string; inMonth: boolean; weekday: number }, today: string): void {
		const s = this.plugin.settings;
		const cellEl = grid.createDiv({ cls: 'ecs-cell' });
		cellEl.setAttribute('data-date', cell.str);
		if (!cell.inMonth) cellEl.addClass('ecs-out');
		if (cell.str === today) cellEl.addClass('ecs-today');
		if (cell.str === this.state.selected) cellEl.addClass('ecs-selected');
		const isWeekend = cell.weekday === 0 || cell.weekday === 6;

		const holiday = this.opts.showHolidays ? getHoliday(cell.str, s.customHolidayJson) : null;
		const isStatHoliday = holiday?.type === 'holiday';
		const workHit = this.opts.showWorkdays ? getHoliday(cell.str, s.customHolidayJson) : null;
		const isWorkday = workHit?.type === 'workday';
		if (isStatHoliday) cellEl.addClass('ecs-holiday-cell');
		if ((isWeekend || isStatHoliday) && s.highlightWeekends) cellEl.addClass('ecs-weekend');
		if (isWorkday) cellEl.addClass('ecs-workday-cell');

		const head = cellEl.createDiv({ cls: 'ecs-cell-head' });
		const num = head.createSpan({ text: String(cell.d), cls: 'ecs-daynum' });
		if (isWorkday) {
			num.createSpan({ text: '班', cls: 'ecs-workday-badge' });
		}

		let subText = '';
		if (isStatHoliday) {
			subText = holiday!.name;
		} else if (this.opts.showLunar) {
			const lunar = solarToLunar(cell.y, cell.m, cell.d);
			subText = lunar ? (lunar.festival || lunar.label) : '';
		}
		if (subText) {
			head.createSpan({
				text: subText,
				cls: isStatHoliday ? 'ecs-holiday-name' : lunarFestCls(subText),
			});
		}

		// 事件圆点
		const dayEvents = this.plugin.store.byDateFiltered(cell.str, this.filter, this.sourcePath);
		if (dayEvents.length) {
			const dots = cellEl.createDiv({ cls: 'ecs-dots' });
			const shown = dayEvents.slice(0, 4);
			for (const ev of shown) {
				dots.createSpan({ cls: `ecs-dot${ev.done ? ' ecs-dot-done' : ''}` }).style.background = this.categoryColor(ev.category);
			}
			if (dayEvents.length > 4) {
				dots.createSpan({ text: `+${dayEvents.length - 4}`, cls: 'ecs-dot-more' });
			}
		}

		cellEl.addEventListener('click', () => this.selectDay(cell.str));
		cellEl.addEventListener('dblclick', () => this.openAdd(cell.str));
		cellEl.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			this.showCellMenu(e as MouseEvent, cell);
		});
	}

	/** 单击选中某日：就地更新选中态与列表，避免整体重渲染打断双击手势 */
	private selectDay(date: string | null): void {
		this.state.selected = this.state.selected === date ? null : date;
		this.containerEl.querySelectorAll<HTMLElement>('.ecs-cell').forEach((c) => {
			c.classList.toggle('ecs-selected', c.getAttribute('data-date') === this.state.selected);
		});
		const list = this.containerEl.querySelector<HTMLElement>('.ecs-list');
		if (list) {
			list.empty();
			this.renderListInto(list);
		}
	}

	private showCellMenu(evt: MouseEvent, cell: { str: string; y: number; m: number; d: number }): void {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle(`添加日程（${cell.m}月${cell.d}日）`)
				.setIcon('plus')
				.onClick(() => this.openAdd(cell.str))
		);
		menu.addItem((item) =>
			item
				.setTitle('查看当日日程')
				.setIcon('list')
				.onClick(() => this.selectDay(cell.str))
		);
		const dayEvents = this.plugin.store.byDateFiltered(cell.str, this.filter, this.sourcePath);
		const notes = [...new Set(dayEvents.map((e) => e.note).filter(Boolean))];
		for (const n of notes.slice(0, 3)) {
			menu.addItem((item) =>
				item
					.setTitle(`打开来源笔记：${this.noteName(n)}`)
					.setIcon('file-text')
					.onClick(() => void this.plugin.app.workspace.openLinkText(n, this.sourcePath, false))
			);
		}
		const taskNote = dayEvents.find((e) => e.taskNote)?.taskNote;
		if (taskNote) {
			menu.addItem((item) =>
				item
					.setTitle('打开任务笔记')
					.setIcon('check-square')
					.onClick(() => void this.plugin.app.workspace.openLinkText(taskNote, '', false))
			);
		}
		if (dayEvents.length) {
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle(`清空当日 ${dayEvents.length} 项日程`)
					.setIcon('trash-2')
					.onClick(() => {
						new ConfirmModal(this.plugin.app, '清空日程', `确定删除 ${cell.str} 的 ${dayEvents.length} 项日程吗？`, () => {
							for (const ev of [...dayEvents]) void this.plugin.deleteEventFlow(ev.id);
						}).open();
					})
			);
		}
		menu.showAtMouseEvent(evt);
	}

	private renderListInto(listWrap: HTMLElement): void {
		const s = this.plugin.settings;
		const header = listWrap.createDiv({ cls: 'ecs-list-header' });
		const heading = header.createSpan({ cls: 'ecs-list-title' });
		const events = this.plugin.store.inMonthFiltered(this.state.y, this.state.m, this.filter, this.sourcePath);
		const doneCount = events.filter((e) => e.done).length;

		if (this.state.selected) {
			const sel = this.state.selected;
			const d = new Date(+sel.slice(0, 4), +sel.slice(5, 7) - 1, +sel.slice(8, 10));
			heading.setText(`${sel.slice(5, 7).replace(/^0/, '')}月${sel.slice(8, 10).replace(/^0/, '')}日 周${WEEKDAY_CN[d.getDay()]} · ${events.filter((e) => e.date === sel).length} 项`);
			const clearBtn = header.createEl('button', { text: '查看全月', cls: 'ecs-text-btn' });
			clearBtn.addEventListener('click', () => this.selectDay(null));
			this.renderItems(listWrap, this.plugin.store.byDateFiltered(sel, this.filter, this.sourcePath), true);
			return;
		}

		heading.setText(`本月日程 ${events.length} 项${events.length ? ` · 已完成 ${doneCount}` : ''}`);
		if (!events.length) {
			const empty = listWrap.createDiv({ cls: 'ecs-empty' });
			empty.setText('本月暂无日程，右键日期或双击单元格添加');
			return;
		}
		// 按日期分组
		let lastDate = '';
		let group: HTMLElement | null = null;
		for (const ev of events) {
			if (ev.date !== lastDate) {
				lastDate = ev.date;
				const d = new Date(+ev.date.slice(0, 4), +ev.date.slice(5, 7) - 1, +ev.date.slice(8, 10));
				const hol = this.opts.showHolidays ? getHoliday(ev.date, s.customHolidayJson) : null;
				const label = `${+ev.date.slice(5, 7)}月${+ev.date.slice(8, 10)}日 周${WEEKDAY_CN[d.getDay()]}${hol?.type === 'holiday' ? ` · ${hol.name}` : ''}${ev.date === todayStr() ? ' · 今天' : ''}`;
				group = listWrap.createDiv({ cls: 'ecs-day-group' });
				group.createDiv({ text: label, cls: 'ecs-day-label' });
			}
			this.renderItem(group!, ev);
		}
	}

	private renderItems(wrap: HTMLElement, events: EcsEvent[], emptyHint: boolean): void {
		if (!events.length) {
			if (emptyHint) wrap.createDiv({ text: '当日暂无日程', cls: 'ecs-empty' });
			return;
		}
		for (const ev of events) this.renderItem(wrap, ev);
	}

	private renderItem(wrap: HTMLElement, ev: EcsEvent): void {
		const item = wrap.createDiv({ cls: `ecs-item${ev.done ? ' ecs-item-done' : ''}` });

		const check = item.createSpan({ cls: 'ecs-item-check', attr: { 'aria-label': ev.done ? '标记为未完成' : '标记为完成' } });
		setIcon(check, ev.done ? 'check-circle-2' : 'circle');
		check.addEventListener('click', (e) => {
			e.stopPropagation();
			void this.plugin.toggleDone(ev.id, !ev.done);
		});

		item.createSpan({ cls: 'ecs-dot ecs-item-dot' }).style.background = this.categoryColor(ev.category);

		const time = item.createSpan({ cls: 'ecs-item-time' });
		time.setText(ev.startTime ? (ev.endTime ? `${ev.startTime}–${ev.endTime}` : ev.startTime) : '全天');

		const title = item.createSpan({ cls: 'ecs-item-title' });
		title.setText(ev.title);
		title.setAttribute('aria-label', '点击编辑');
		title.addEventListener('click', () => {
			new EventModal(this.plugin, { event: ev }).open();
		});

		if (ev.note) {
			const note = item.createSpan({ cls: 'ecs-item-note' });
			setIcon(note, 'file-text');
			note.createSpan({ text: this.noteName(ev.note) });
			note.setAttribute('aria-label', `来源笔记：${ev.note}`);
			note.addEventListener('click', (e) => {
				e.stopPropagation();
				void this.plugin.app.workspace.openLinkText(ev.note, this.sourcePath, false);
			});
		}

		const actions = item.createSpan({ cls: 'ecs-item-actions' });
		const editBtn = actions.createSpan({ cls: 'ecs-item-btn', attr: { 'aria-label': '编辑' } });
		setIcon(editBtn, 'pencil');
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			new EventModal(this.plugin, { event: ev }).open();
		});
		const delBtn = actions.createSpan({ cls: 'ecs-item-btn', attr: { 'aria-label': '删除' } });
		setIcon(delBtn, 'trash-2');
		delBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			new ConfirmModal(this.plugin.app, '删除日程', `确定删除日程「${ev.title}」吗？`, () => {
				void this.plugin.deleteEventFlow(ev.id);
			}).open();
		});

		item.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const menu = new Menu();
			menu.addItem((it) =>
				it
					.setTitle(ev.done ? '标记为未完成' : '标记为完成')
					.setIcon(ev.done ? 'circle' : 'check-circle-2')
					.onClick(() => void this.plugin.toggleDone(ev.id, !ev.done))
			);
			menu.addItem((it) =>
				it
					.setTitle('编辑日程')
					.setIcon('pencil')
					.onClick(() => new EventModal(this.plugin, { event: ev }).open())
			);
			if (ev.note) {
				menu.addItem((it) =>
					it
						.setTitle(`打开来源笔记：${this.noteName(ev.note)}`)
						.setIcon('file-text')
						.onClick(() => void this.plugin.app.workspace.openLinkText(ev.note, this.sourcePath, false))
				);
			}
			if (ev.taskNote) {
				menu.addItem((it) =>
					it
						.setTitle('打开任务笔记')
						.setIcon('check-square')
						.onClick(() => void this.plugin.app.workspace.openLinkText(ev.taskNote, '', false))
				);
			}
			menu.addSeparator();
			menu.addItem((it) =>
				it
					.setTitle('删除日程')
					.setIcon('trash-2')
					.onClick(() => {
						new ConfirmModal(this.plugin.app, '删除日程', `确定删除日程「${ev.title}」吗？`, () => {
							void this.plugin.deleteEventFlow(ev.id);
						}).open();
					})
			);
			menu.showAtMouseEvent(e as MouseEvent);
		});
	}

	private openAdd(date: string): void {
		new EventModal(this.plugin, { defaultDate: date, defaultNote: this.sourcePath || '' }).open();
	}
}

function lunarFestCls(text: string): string {
	// 农历节日名（非数字开头的非月名展示）用强调色
	return /^(春节|元宵|端午|七夕|中秋|重阳|腊八|除夕|龙抬头)$/.test(text) ? 'ecs-lunar-fest' : 'ecs-lunar';
}

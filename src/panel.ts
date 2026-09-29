import { ItemView, Menu, setIcon, WorkspaceLeaf } from 'obsidian';
import type { EcsPlugin } from './main';
import { EcsEvent, VIEW_TYPE_SCHEDULE_PANEL } from './types';
import { compareEvents, fmtDate, timeRangeText, todayStr, WEEKDAY_CN } from './util';
import { EventModal } from './modal';
import { ConfirmModal } from './suggest';

type PanelFilter = 'all' | 'open' | 'done';

/** 侧边栏日程面板：按日期分组展示 来源笔记 + 日程信息 + 时间 */
export class SchedulePanelView extends ItemView {
	private filter: PanelFilter = 'all';
	private unsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: EcsPlugin) {
		super(leaf);
		this.navigation = false;
	}

	getViewType(): string {
		return VIEW_TYPE_SCHEDULE_PANEL;
	}

	getDisplayText(): string {
		return '嵌入日历日程面板';
	}

	getIcon(): string {
		return 'calendar-days';
	}

	onOpen(): Promise<void> {
		this.unsubscribe = this.plugin.store.subscribe(() => this.render());
		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		return Promise.resolve();
	}

	private render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('ecs-panel');

		const header = root.createDiv({ cls: 'ecs-panel-header' });
		header.createDiv({ text: '日程面板', cls: 'ecs-panel-title' });

		const seg = header.createDiv({ cls: 'ecs-seg' });
		const opts: [PanelFilter, string][] = [
			['all', '全部'],
			['open', '未完成'],
			['done', '已完成'],
		];
		for (const [key, label] of opts) {
			const b = seg.createEl('button', { text: label, cls: `ecs-seg-btn${this.filter === key ? ' is-active' : ''}` });
			b.addEventListener('click', () => {
				this.filter = key;
				this.render();
			});
		}

		const addBtn = header.createEl('button', { cls: 'ecs-panel-add' });
		setIcon(addBtn, 'plus');
		addBtn.createSpan({ text: '新建日程' });
		addBtn.addEventListener('click', () => {
			const active = this.app.workspace.getActiveFile();
			new EventModal(this.plugin, { defaultNote: active?.path ?? '' }).open();
		});

		// 汇总：过去 7 天到未来的全部日程
		const past = new Date();
		past.setDate(past.getDate() - 7);
		const pastStr = fmtDate(past.getFullYear(), past.getMonth() + 1, past.getDate());
		const today = todayStr();

		const events = this.plugin.store.events
			.filter((e) => e.date >= pastStr)
			.filter((e) => (this.filter === 'all' ? true : this.filter === 'done' ? e.done : !e.done))
			.sort(compareEvents);

		if (!events.length) {
			const empty = root.createDiv({ cls: 'ecs-panel-empty' });
			empty.createDiv({ text: '暂无日程', cls: 'ecs-panel-empty-title' });
			empty.createDiv({
				text: '在笔记中输入 / 并选择「插入日历日程表格」，或点击上方「新建日程」开始规划你的日程。',
				cls: 'ecs-panel-empty-hint',
			});
			return;
		}

		const list = root.createDiv({ cls: 'ecs-panel-list' });
		let lastDate = '';
		let overdueShown = false;
		for (const ev of events) {
			if (ev.date !== lastDate) {
				lastDate = ev.date;
				const d = new Date(+ev.date.slice(0, 4), +ev.date.slice(5, 7) - 1, +ev.date.slice(8, 10));
				const dayCount = this.plugin.store.byDate(ev.date).length;
				const dayHeader = list.createDiv({ cls: 'ecs-panel-day' });
				const label = `${+ev.date.slice(5, 7)}月${+ev.date.slice(8, 10)}日 周${WEEKDAY_CN[d.getDay()]} · ${dayCount} 项`;
				dayHeader.createSpan({ text: ev.date === today ? `今天 · ${label}` : label, cls: ev.date === today ? 'ecs-panel-day-today' : '' });
				if (ev.date < today && !overdueShown) {
					overdueShown = true;
					dayHeader.createSpan({ text: '以下为过去 7 天', cls: 'ecs-panel-past-hint' });
				}
			}
			this.renderRow(list, ev, today);
		}
	}

	private renderRow(list: HTMLElement, ev: EcsEvent, today: string): void {
		const row = list.createDiv({ cls: `ecs-panel-row${ev.done ? ' ecs-item-done' : ''}${ev.date < today ? ' ecs-row-past' : ''}` });

		const check = row.createSpan({ cls: 'ecs-item-check' });
		setIcon(check, ev.done ? 'check-circle-2' : 'circle');
		check.addEventListener('click', () => void this.plugin.toggleDone(ev.id, !ev.done));

		row.createSpan({ cls: 'ecs-dot' }).style.background = this.categoryColor(ev.category);

		const main = row.createDiv({ cls: 'ecs-panel-main' });
		const line1 = main.createDiv({ cls: 'ecs-panel-line1' });
		const title = line1.createSpan({ cls: 'ecs-panel-title-text' });
		title.setText(ev.title);
		title.addEventListener('click', () => new EventModal(this.plugin, { event: ev }).open());

		const time = line1.createSpan({ cls: 'ecs-panel-time' });
		time.setText(timeRangeText(ev.startTime, ev.endTime));

		const line2 = main.createDiv({ cls: 'ecs-panel-line2' });
		if (ev.note) {
			const note = line2.createSpan({ cls: 'ecs-panel-note' });
			setIcon(note, 'file-text');
			note.createSpan({ text: this.noteName(ev.note) });
			note.setAttribute('aria-label', `来源笔记：${ev.note}`);
			note.addEventListener('click', () => void this.app.workspace.openLinkText(ev.note, '', false));
		} else {
			line2.createSpan({ text: '无来源笔记', cls: 'ecs-panel-note ecs-panel-note-none' });
		}
		if (ev.location) {
			line2.createSpan({ text: ev.location, cls: 'ecs-panel-loc' });
		}

		const actions = row.createDiv({ cls: 'ecs-item-actions' });
		if (ev.taskNote) {
			const taskBtn = actions.createSpan({ cls: 'ecs-item-btn', attr: { 'aria-label': '打开任务笔记' } });
			setIcon(taskBtn, 'check-square');
			taskBtn.addEventListener('click', () => void this.app.workspace.openLinkText(ev.taskNote, '', false));
		}
		if (ev.note) {
			const openBtn = actions.createSpan({ cls: 'ecs-item-btn', attr: { 'aria-label': '打开来源笔记' } });
			setIcon(openBtn, 'external-link');
			openBtn.addEventListener('click', () => void this.app.workspace.openLinkText(ev.note, '', false));
		}
		const delBtn = actions.createSpan({ cls: 'ecs-item-btn', attr: { 'aria-label': '删除日程' } });
		setIcon(delBtn, 'trash-2');
		delBtn.addEventListener('click', () => {
			new ConfirmModal(this.app, '删除日程', `确定删除日程「${ev.title}」吗？`, () => {
				void this.plugin.deleteEventFlow(ev.id);
			}).open();
		});

		row.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			const menu = new Menu();
			menu.addItem((it) =>
				it
					.setTitle(ev.done ? '标记为未完成' : '标记为完成')
					.setIcon(ev.done ? 'circle' : 'check-circle-2')
					.onClick(() => void this.plugin.toggleDone(ev.id, !ev.done))
			);
			menu.addItem((it) =>
				it.setTitle('编辑日程').setIcon('pencil').onClick(() => new EventModal(this.plugin, { event: ev }).open())
			);
			if (ev.note) {
				menu.addItem((it) =>
					it
						.setTitle(`打开来源笔记：${this.noteName(ev.note)}`)
						.setIcon('file-text')
						.onClick(() => void this.app.workspace.openLinkText(ev.note, '', false))
				);
			}
			if (ev.taskNote) {
				menu.addItem((it) =>
					it
						.setTitle('打开任务笔记')
						.setIcon('check-square')
						.onClick(() => void this.app.workspace.openLinkText(ev.taskNote, '', false))
				);
			}
			menu.addSeparator();
			menu.addItem((it) =>
				it
					.setTitle('删除日程')
					.setIcon('trash-2')
					.onClick(() => {
						new ConfirmModal(this.app, '删除日程', `确定删除日程「${ev.title}」吗？`, () => {
							void this.plugin.deleteEventFlow(ev.id);
						}).open();
					})
			);
			menu.showAtMouseEvent(e as MouseEvent);
		});
	}

	private noteName(path: string): string {
		const noExt = path.replace(/\.md$/i, '');
		return noExt.includes('/') ? noExt.slice(noExt.lastIndexOf('/') + 1) : noExt;
	}

	private categoryColor(name: string): string {
		return this.plugin.settings.categories.find((c) => c.name === name)?.color ?? '#9aa0a6';
	}
}

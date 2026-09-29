import { Editor, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS, BLOCK_LANG, EcsEvent, EcsSettings, VIEW_TYPE_SCHEDULE_PANEL } from './types';
import { EventStore } from './store';
import { CalendarBlock } from './block';
import { SchedulePanelView } from './panel';
import { EcsSettingTab } from './settings';
import { EventModal } from './modal';
import { syncTaskNoteStatus, trashTaskNote } from './tasknotes';

/**
 * 嵌入日历日程（Embedded Calendar Schedule）
 * - 斜杠命令 / 编辑器命令插入交互式日历代码块
 * - 右键日期添加日程，日历下方显示日程列表
 * - 法定节假日、调休、农历标记
 * - 与 TaskNotes 联动：来源笔记 + 日程信息 + 时间
 */
export class EcsPlugin extends Plugin {
	settings: EcsSettings = DEFAULT_SETTINGS;
	store!: EventStore;

	private statusBarEl: HTMLElement | null = null;
	private statusUnsub: (() => void) | null = null;
	private statusInterval: number | null = null;

	async onload(): Promise<void> {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (data ?? {}) as Partial<EcsSettings>);
		this.store = new EventStore(this);
		this.store.load(data);

		this.registerMarkdownCodeBlockProcessor(BLOCK_LANG, (source, el, ctx) => {
			const block = new CalendarBlock(el, this, source, ctx.sourcePath);
			ctx.addChild(block);
		});

		this.addCommand({
			id: 'insert-calendar',
			name: '插入日历日程表格',
			editorCallback: (editor: Editor) => {
				const snippet = ['```' + BLOCK_LANG, 'month: current', 'filter: all', 'showHolidays: true', 'showLunar: true', '```', ''].join('\n');
				editor.replaceSelection('\n' + snippet);
				new Notice('已插入日历日程表格，切换到阅读/实时预览即可使用');
			},
		});

		this.addCommand({
			id: 'new-event',
			name: '新建日程',
			callback: () => {
				const active = this.app.workspace.getActiveFile();
				new EventModal(this, { defaultNote: active?.path ?? '' }).open();
			},
		});

		this.addCommand({
			id: 'open-panel',
			name: '打开日程面板',
			callback: () => void this.activatePanel(),
		});

		this.registerView(VIEW_TYPE_SCHEDULE_PANEL, (leaf: WorkspaceLeaf) => new SchedulePanelView(leaf, this));

		this.addRibbonIcon('calendar-days', '嵌入日历日程 · 日程面板', () => void this.activatePanel());

		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'md') this.store.handleRename(file, oldPath);
			})
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile && file.extension === 'md') this.store.handleDelete(file);
			})
		);

		this.addSettingTab(new EcsSettingTab(this.app, this));

		this.refreshStatusBar();
	}

	onunload(): void {
		this.statusUnsub?.();
		if (this.statusInterval !== null) window.clearInterval(this.statusInterval);
	}

	async saveSettings(): Promise<void> {
		await this.persist();
	}

	/** 事件存储统一走这里的持久化 */
	async persist(): Promise<void> {
		await this.saveData({ ...this.settings, events: this.store.events });
	}

	/** 勾选/取消完成，并同步任务笔记状态 */
	async toggleDone(id: string, done: boolean): Promise<void> {
		this.store.setDone(id, done);
		const ev = this.store.get(id);
		if (ev) await syncTaskNoteStatus(this.app, ev, this.settings);
	}

	/** 删除日程（按设置移除或保留任务笔记） */
	async deleteEventFlow(id: string): Promise<void> {
		const ev = this.store.get(id);
		if (!ev) return;
		if (ev.taskNote && this.settings.taskNotesDeleteOnEventDelete) {
			await trashTaskNote(this.app, ev);
		}
		this.store.remove(id);
		new Notice('日程已删除');
	}

	/** 完成状态变化后的任务笔记同步（编辑弹窗内勾选时调用） */
	async syncDoneState(ev: EcsEvent): Promise<void> {
		await syncTaskNoteStatus(this.app, ev, this.settings);
	}

	refreshStatusBar(): void {
		this.statusUnsub?.();
		if (this.statusInterval !== null) {
			window.clearInterval(this.statusInterval);
			this.statusInterval = null;
		}
		if (this.statusBarEl) {
			this.statusBarEl.detach();
			this.statusBarEl = null;
		}
		if (!this.settings.showStatusBar) return;
		this.statusBarEl = this.addStatusBarItem();
		const update = () => {
			if (!this.statusBarEl) return;
			const n = this.store.todayCount();
			this.statusBarEl.empty();
			this.statusBarEl.addClass('ecs-statusbar');
			this.statusBarEl.setText(`📅 今日待办 ${n} 项`);
		};
		update();
		this.statusUnsub = this.store.subscribe(update);
		this.statusInterval = window.setInterval(update, 60_000);
		this.statusBarEl.addEventListener('click', () => void this.activatePanel());
	}

	private async activatePanel(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_SCHEDULE_PANEL)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: VIEW_TYPE_SCHEDULE_PANEL, active: true });
		}
		workspace.revealLeaf(leaf);
	}
}

export default EcsPlugin;

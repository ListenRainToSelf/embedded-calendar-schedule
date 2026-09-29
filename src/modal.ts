import { App, Modal, Notice, Setting } from 'obsidian';
import type { EcsPlugin } from './main';
import { EcsEvent } from './types';
import { isValidDateStr, todayStr } from './util';
import { createTaskNote, trashTaskNote, updateTaskNote } from './tasknotes';
import { NoteSuggest, ConfirmModal } from './suggest';

export interface EventModalOptions {
	/** 编辑既有日程；不传则新建 */
	event?: EcsEvent;
	/** 新建时默认日期 */
	defaultDate?: string;
	/** 新建时默认来源笔记路径 */
	defaultNote?: string;
}

/** 新建/编辑日程弹窗 */
export class EventModal extends Modal {
	private ev: EcsEvent | null;
	private readonly isEdit: boolean;

	constructor(private plugin: EcsPlugin, private opts: EventModalOptions, private onDone?: (saved: boolean) => void) {
		super(plugin.app);
		this.isEdit = !!opts.event;
		this.ev = opts.event
			? { ...opts.event }
			: {
					id: '',
					title: '',
					date: opts.defaultDate || todayStr(),
					startTime: '09:00',
					endTime: '',
					category: plugin.settings.categories[0]?.name ?? '其他',
					location: '',
					description: '',
					note: opts.defaultNote ?? '',
					done: false,
					taskNote: '',
					created: 0,
				};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ecs-event-modal');
		contentEl.createEl('h3', { text: this.isEdit ? '编辑日程' : '添加日程' });

		let createTask = this.plugin.settings.taskNotesCreateByDefault && this.plugin.settings.taskNotesEnabled && !this.isEdit;

		new Setting(contentEl)
			.setName('标题')
			.setDesc('必填')
			.addText((t) => {
				t.setPlaceholder('例如：小组会议').setValue(this.ev!.title).onChange((v) => (this.ev!.title = v));
				t.inputEl.addClass('ecs-wide-input');
			});

		new Setting(contentEl)
			.setName('分类')
			.addDropdown((d) => {
				for (const c of this.plugin.settings.categories) {
					d.addOption(c.name, c.name);
				}
				if (this.ev!.category && !this.plugin.settings.categories.some((c) => c.name === this.ev!.category)) {
					d.addOption(this.ev!.category, this.ev!.category);
				}
				d.setValue(this.ev!.category).onChange((v) => (this.ev!.category = v));
			});

		const dateSetting = new Setting(contentEl).setName('日期').setClass('ecs-setting-row');
		dateSetting.addText((t) => {
			t.setValue(this.ev!.date);
			t.inputEl.type = 'date';
			t.inputEl.addClass('ecs-date-input');
			t.onChange((v) => {
				if (isValidDateStr(v)) this.ev!.date = v;
			});
		});
		dateSetting.addButton((b) => b.setButtonText('今天').setTooltip('设为今天').onClick(() => {
			this.ev!.date = todayStr();
			(this.contentEl.querySelector('.ecs-date-input') as HTMLInputElement).value = this.ev!.date;
		}));
		dateSetting.addButton((b) => b.setButtonText('明天').setTooltip('设为明天').onClick(() => {
			const dt = new Date();
			dt.setDate(dt.getDate() + 1);
			this.ev!.date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
			(this.contentEl.querySelector('.ecs-date-input') as HTMLInputElement).value = this.ev!.date;
		}));

		let startEl: HTMLInputElement | null = null;
		let endEl: HTMLInputElement | null = null;
		new Setting(contentEl)
			.setName('全天')
			.setDesc('开启后不显示具体时间')
			.addToggle((t) => {
				t.setValue(!this.ev!.startTime && !this.ev!.endTime);
				t.onChange((v) => {
					if (startEl) startEl.disabled = v;
					if (endEl) endEl.disabled = v;
					if (v) {
						this.ev!.startTime = '';
						this.ev!.endTime = '';
					} else {
						this.ev!.startTime = this.ev!.startTime || '09:00';
					}
				});
			});

		const timeSetting = new Setting(contentEl).setName('时间').setClass('ecs-setting-row');
		timeSetting.addText((t) => {
			t.setValue(this.ev!.startTime);
			startEl = t.inputEl;
			t.inputEl.type = 'time';
			t.inputEl.addClass('ecs-time-input');
			t.onChange((v) => (this.ev!.startTime = v));
		});
		timeSetting.addText((t) => {
			t.setValue(this.ev!.endTime);
			endEl = t.inputEl;
			t.inputEl.type = 'time';
			t.inputEl.addClass('ecs-time-input');
			t.onChange((v) => (this.ev!.endTime = v));
		});

		new Setting(contentEl)
			.setName('地点')
			.addText((t) => {
				t.setPlaceholder('可选').setValue(this.ev!.location).onChange((v) => (this.ev!.location = v));
				t.inputEl.addClass('ecs-wide-input');
			});

		new Setting(contentEl)
			.setName('来源笔记')
			.setDesc('日程来自哪篇笔记，将显示在 TaskNotes 联动与日程面板中')
			.addText((t) => {
				t.setPlaceholder('默认为当前笔记').setValue(this.ev!.note).onChange((v) => (this.ev!.note = v.trim()));
				t.inputEl.addClass('ecs-wide-input');
				new NoteSuggest(this.app, t.inputEl, (path) => {
					this.ev!.note = path;
					t.setValue(path);
				});
			});

		new Setting(contentEl)
			.setName('备注')
			.addTextArea((t) => {
				t.setPlaceholder('可选').setValue(this.ev!.description).onChange((v) => (this.ev!.description = v));
				t.inputEl.addClass('ecs-desc-area');
			});

		if (this.plugin.settings.taskNotesEnabled) {
			if (this.isEdit && this.ev!.taskNote) {
				new Setting(contentEl)
					.setName('TaskNotes 任务笔记')
					.setDesc('已关联，编辑保存后自动同步')
					.addButton((b) =>
						b.setButtonText('打开').onClick(() => {
							const f = this.app.vault.getAbstractFileByPath(this.ev!.taskNote);
							if (f) void this.app.workspace.openLinkText(f.path, '', false);
						})
					);
			} else {
				new Setting(contentEl)
					.setName('同时创建任务笔记')
					.setDesc(`在 ${this.plugin.settings.taskNotesFolder} 生成 TaskNotes 兼容的任务笔记`)
					.addToggle((t) => t.setValue(createTask).onChange((v) => (createTask = v)));
			}
		}

		const btns = contentEl.createDiv({ cls: 'ecs-modal-buttons' });
		if (this.isEdit) {
			btns.createEl('button', { text: '删除', cls: 'mod-warning' }).addEventListener('click', () => {
				this.close();
				new ConfirmModal(this.app, '删除日程', `确定删除日程「${this.ev!.title}」吗？`, () => {
					void this.plugin.deleteEventFlow(this.ev!.id);
				}).open();
			});
		}
		btns.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());
		const save = btns.createEl('button', { text: '保存', cls: 'mod-cta' });
		save.addEventListener('click', () => void this.save(createTask));
	}

	private async save(createTask: boolean): Promise<void> {
		const ev = this.ev!;
		if (!ev.title.trim()) {
			new Notice('请填写日程标题');
			return;
		}
		if (!isValidDateStr(ev.date)) {
			new Notice('日期格式无效');
			return;
		}
		ev.title = ev.title.trim();
		if (ev.endTime && ev.startTime && ev.endTime < ev.startTime) {
			new Notice('结束时间早于开始时间，已按原样保存');
		}

		if (this.isEdit) {
			const before = this.plugin.store.get(ev.id);
			this.plugin.store.update(ev.id, ev);
			if (before && before.done !== ev.done) {
				await this.plugin.syncDoneState(ev);
			} else {
				await updateTaskNote(this.app, ev);
			}
			new Notice('日程已更新');
		} else {
			const created = this.plugin.store.create(ev);
			if (createTask) {
				const path = await createTaskNote(this.app, this.plugin.settings, created);
				if (path) {
					this.plugin.store.update(created.id, { taskNote: path });
					new Notice('日程与任务笔记已创建');
				}
			} else {
				new Notice('日程已添加');
			}
		}
		this.close();
		this.onDone?.(true);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

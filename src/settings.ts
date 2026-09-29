import { App, Notice, PluginSettingTab, Setting, TFolder } from 'obsidian';
import type { EcsPlugin } from './main';

export class EcsSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: EcsPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		containerEl.createEl('h2', { text: '嵌入日历日程 · 设置' });

		// ── 日历显示 ──
		containerEl.createEl('h3', { text: '日历显示' });
		new Setting(containerEl)
			.setName('周首日')
			.addDropdown((d) =>
				d
					.addOption('1', '周一')
					.addOption('0', '周日')
					.setValue(String(s.firstDayOfWeek))
					.onChange(async (v) => {
						s.firstDayOfWeek = v === '0' ? 0 : 1;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName('高亮周末')
			.addToggle((t) => t.setValue(s.highlightWeekends).onChange(async (v) => { s.highlightWeekends = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl)
			.setName('标记法定节假日')
			.setDesc('内置 2025–2026 年国务院办公厅公布的放假安排')
			.addToggle((t) => t.setValue(s.showHolidays).onChange(async (v) => { s.showHolidays = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl)
			.setName('标记调休上班日')
			.setDesc('在周末上 “班” 字角标')
			.addToggle((t) => t.setValue(s.showWorkdays).onChange(async (v) => { s.showWorkdays = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl)
			.setName('显示农历')
			.setDesc('显示农历日期与传统节日（春节、中秋等）')
			.addToggle((t) => t.setValue(s.showLunar).onChange(async (v) => { s.showLunar = v; await this.plugin.saveSettings(); }));
		new Setting(containerEl)
			.setName('默认筛选')
			.setDesc('插入的日历默认显示全部日程，还是仅当前笔记的日程（代码块内可用 filter 覆盖）')
			.addDropdown((d) =>
				d
					.addOption('all', '全部日程')
					.addOption('note', '仅当前笔记')
					.setValue(s.defaultFilter)
					.onChange(async (v) => {
						s.defaultFilter = v === 'note' ? 'note' : 'all';
						await this.plugin.saveSettings();
					})
			);

		// ── 分类 ──
		containerEl.createEl('h3', { text: '日程分类' });
		const catDesc = containerEl.createEl('p', {
			text: '用 JSON 数组定义分类与颜色，例如：[{"name":"工作","color":"#4f8cff"},{"name":"生活","color":"#34c77b"}]',
			cls: 'setting-item-description',
		});
		catDesc.style.margin = '0 0 8px';
		const catArea = containerEl.createEl('textarea');
		catArea.value = JSON.stringify(s.categories, null, 2);
		catArea.rows = 6;
		catArea.addClass('ecs-json-area');
		catArea.addEventListener('change', async () => {
			try {
				const parsed = JSON.parse(catArea.value) as { name: unknown; color: unknown }[];
				if (!Array.isArray(parsed) || parsed.some((c) => typeof c.name !== 'string' || typeof c.color !== 'string')) {
					throw new Error('格式不正确');
				}
				s.categories = parsed.map((c) => ({ name: c.name as string, color: c.color as string }));
				await this.plugin.saveSettings();
				new Notice('分类已保存');
			} catch (e) {
				new Notice(`JSON 解析失败：${String(e)}`);
			}
		});

		// ── 节假日扩展 ──
		containerEl.createEl('h3', { text: '自定义节假日（可选）' });
		const holDesc = containerEl.createEl('p', {
			text: '用于补充 2027 年及以后官方安排或个人节假日。格式：{"holidays":[["2027-01-01","2027-01-03","元旦"]],"workdays":[["2027-01-09","2027-01-09"]]}',
			cls: 'setting-item-description',
		});
		holDesc.style.margin = '0 0 8px';
		const holArea = containerEl.createEl('textarea');
		holArea.value = s.customHolidayJson;
		holArea.rows = 4;
		holArea.placeholder = '{"holidays":[],"workdays":[]}';
		holArea.addClass('ecs-json-area');
		holArea.addEventListener('change', async () => {
			if (!holArea.value.trim()) {
				s.customHolidayJson = '';
				await this.plugin.saveSettings();
				return;
			}
			try {
				JSON.parse(holArea.value);
				s.customHolidayJson = holArea.value;
				await this.plugin.saveSettings();
				new Notice('自定义节假日已保存');
			} catch (e) {
				new Notice(`JSON 解析失败：${String(e)}`);
			}
		});

		// ── TaskNotes 联动 ──
		containerEl.createEl('h3', { text: 'TaskNotes 联动' });
		new Setting(containerEl)
			.setName('启用 TaskNotes 联动')
			.setDesc('与 TaskNotes 插件联动：创建任务笔记、同步完成状态；任务以 tags: task 识别')
			.addToggle((t) => t.setValue(s.taskNotesEnabled).onChange(async (v) => { s.taskNotesEnabled = v; await this.plugin.saveSettings(); this.display(); }));
		if (s.taskNotesEnabled) {
			new Setting(containerEl)
				.setName('任务笔记文件夹')
				.setDesc('需与 TaskNotes 插件设置中的 Tasks Folder 一致')
				.addText((t) => {
					t.setValue(s.taskNotesFolder).onChange(async (v) => { s.taskNotesFolder = v.trim() || 'TaskNotes/Tasks'; await this.plugin.saveSettings(); });
					t.inputEl.addClass('ecs-wide-input');
				});
			new Setting(containerEl)
				.setName('新建日程时同时创建任务笔记')
				.addToggle((t) => t.setValue(s.taskNotesCreateByDefault).onChange(async (v) => { s.taskNotesCreateByDefault = v; await this.plugin.saveSettings(); }));
			new Setting(containerEl)
				.setName('同步完成状态')
				.setDesc('在日历中勾选完成时，把任务笔记的 status 同步为 done / open')
				.addToggle((t) => t.setValue(s.taskNotesSyncStatus).onChange(async (v) => { s.taskNotesSyncStatus = v; await this.plugin.saveSettings(); }));
			new Setting(containerEl)
				.setName('删除日程时移除任务笔记')
				.setDesc('关闭时仅解除关联，任务笔记保留')
				.addToggle((t) => t.setValue(s.taskNotesDeleteOnEventDelete).onChange(async (v) => { s.taskNotesDeleteOnEventDelete = v; await this.plugin.saveSettings(); }));
			const hint = containerEl.createEl('p', {
				text: `当前文件夹：${s.taskNotesFolder}${this.app.vault.getAbstractFileByPath(s.taskNotesFolder) instanceof TFolder ? '（已存在）' : '（保存后首次创建任务笔记时自动建立）'}`,
				cls: 'setting-item-description',
			});
			hint.style.margin = '0';
		}

		// ── 其他 ──
		containerEl.createEl('h3', { text: '其他' });
		new Setting(containerEl)
			.setName('状态栏显示今日待办')
			.setDesc('在底部状态栏显示「今日待办 N 项」，点击打开日程面板')
			.addToggle((t) =>
				t.setValue(s.showStatusBar).onChange(async (v) => {
					s.showStatusBar = v;
					await this.plugin.saveSettings();
					this.plugin.refreshStatusBar();
				})
			);
	}
}

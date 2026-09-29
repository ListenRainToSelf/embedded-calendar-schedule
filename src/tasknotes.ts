import { App, Notice, TFile } from 'obsidian';
import { EcsEvent, EcsSettings, TASK_NOTE_MARKER } from './types';
import { sanitizeFilename, timeRangeText, todayStr } from './util';

/** TaskNotes 插件任务笔记读写：frontmatter 兼容 TaskNotes 字段映射（title/status/scheduled/...） */

function wikiLink(path: string): string {
	if (!path) return '';
	const noExt = path.replace(/\.md$/i, '');
	const base = noExt.includes('/') ? noExt.slice(noExt.lastIndexOf('/') + 1) : noExt;
	return `[[${noExt}|${base}]]`;
}

export function taskNoteTitle(ev: EcsEvent): string {
	return `日程｜${ev.title}`;
}

/** 事件在任务笔记正文中展示的三要素：来源笔记 + 日程信息 + 时间 */
export function eventSummaryLines(ev: EcsEvent): string {
	const lines: string[] = [];
	const source = ev.note ? wikiLink(ev.note) : '—';
	lines.push(`- **来源笔记**：${source}`);
	const info = ev.title + (ev.location ? `（${ev.location}）` : '');
	lines.push(`- **日程信息**：${info}`);
	const t = timeRangeText(ev.startTime, ev.endTime);
	lines.push(`- **时间**：${ev.date} ${t}`);
	return lines.join('\n');
}

function buildContent(ev: EcsEvent, status: string, completedDate: string): string {
	const fm = [
		'---',
		'tags:',
		'  - task',
		'  - 日程',
		`title: ${taskNoteTitle(ev)}`,
		`status: ${status}`,
		'priority: normal',
		`scheduled: "${ev.date}"`,
		`time: "${timeRangeText(ev.startTime, ev.endTime)}"`,
		`source: "${ev.note ? wikiLink(ev.note) : ''}"`,
		'type: calendar-event',
		`eventId: ${ev.id}`,
	];
	if (completedDate) fm.push(`completedDate: "${completedDate}"`);
	fm.push(`dateCreated: "${todayStr()}"`);
	fm.push('---');

	const body: string[] = [];
	body.push(eventSummaryLines(ev), '');
	if (ev.description) body.push(ev.description, '');
	body.push('', TASK_NOTE_MARKER);
	return fm.join('\n') + '\n\n' + body.join('\n') + '\n';
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	const parts = folderPath.split('/').filter(Boolean);
	let cur = '';
	for (const p of parts) {
		cur = cur ? `${cur}/${p}` : p;
		const existing = app.vault.getAbstractFileByPath(cur);
		if (!existing) {
			try {
				await app.vault.createFolder(cur);
			} catch {
				// 已存在或并发创建，忽略
			}
		}
	}
}

async function uniquePath(app: App, base: string): Promise<string> {
	if (!app.vault.getAbstractFileByPath(`${base}.md`)) return `${base}.md`;
	for (let i = 2; i < 1000; i++) {
		const p = `${base} ${i}.md`;
		if (!app.vault.getAbstractFileByPath(p)) return p;
	}
	return `${base} ${Date.now()}.md`;
}

interface FmEntry {
	key: string;
	lines: string[];
}

/** 极简 frontmatter 解析：按顶层 key 分组（支持列表项缩进行） */
function parseFrontmatter(content: string): { entries: FmEntry[]; bodyStart: number } | null {
	if (!content.startsWith('---')) return null;
	const end = content.indexOf('\n---', 3);
	if (end < 0) return null;
	const fmText = content.slice(4, end);
	const bodyStart = content.indexOf('\n', end + 1) + 1;
	const entries: FmEntry[] = [];
	for (const line of fmText.split('\n')) {
		if (/^\s/.test(line) && entries.length) {
			entries[entries.length - 1].lines.push(line);
			continue;
		}
		const idx = line.indexOf(':');
		if (idx <= 0) continue;
		entries.push({ key: line.slice(0, idx).trim(), lines: [line] });
	}
	return { entries, bodyStart };
}

function serializeFm(entries: FmEntry[], body: string): string {
	const fm = ['---'];
	for (const e of entries) fm.push(...e.lines);
	fm.push('---');
	return fm.join('\n') + '\n' + body;
}

function stripQuotes(v: string): string {
	const t = v.trim();
	if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
		return t.slice(1, -1);
	}
	return t;
}

/**
 * 创建/重写任务笔记：仅当正文由本插件维护（含标记行）时才整体重写，
 * 否则只更新 frontmatter 中本插件管理的字段。
 */
async function writeTaskNote(app: App, file: TFile, ev: EcsEvent, status: string, completedDate: string): Promise<void> {
	const content = await app.vault.read(file);
	const parsed = parseFrontmatter(content);
	if (!parsed) {
		await app.vault.modify(file, buildContent(ev, status, completedDate));
		return;
	}
	const byKey = new Map<string, FmEntry>();
	for (const e of parsed.entries) byKey.set(e.key, e);

	const setValue = (key: string, value: string) => {
		const e = byKey.get(key);
		if (e) e.lines = [`${key}: ${value}`];
		else byKey.set(key, { key, lines: [`${key}: ${value}`] });
	};
	const removeKey = (key: string) => {
		byKey.delete(key);
	};

	setValue('title', taskNoteTitle(ev));
	// status/completedDate 仅在显式状态同步时改动；纯编辑同步保留 TaskNotes 侧状态
	if (status) {
		setValue('status', status);
		if (completedDate) setValue('completedDate', `"${completedDate}"`);
		else removeKey('completedDate');
	}
	setValue('scheduled', `"${ev.date}"`);
	setValue('time', `"${timeRangeText(ev.startTime, ev.endTime)}"`);
	setValue('source', ev.note ? `"${wikiLink(ev.note)}"` : '""');
	setValue('type', 'calendar-event');
	setValue('eventId', ev.id);

	// tags：确保包含 task 与 日程，其余保留
	const tagsEntry = byKey.get('tags');
	const tagSet = new Set<string>();
	if (tagsEntry) {
		for (const line of tagsEntry.lines.slice(1)) {
			const v = stripQuotes(line.replace(/^[\s*-]+/, ''));
			if (v) tagSet.add(v);
		}
	}
	tagSet.add('task');
	tagSet.add('日程');
	byKey.set('tags', { key: 'tags', lines: ['tags:', ...[...tagSet].map((t) => `  - ${t}`)] });

	// 输出时保持原顺序，新字段追加在末尾（dateModified 类除外）
	const ordered: FmEntry[] = [];
	const seen = new Set<string>();
	for (const e of parsed.entries) {
		const cur = byKey.get(e.key);
		if (cur && !seen.has(e.key)) {
			ordered.push(cur);
			seen.add(e.key);
		}
	}
	for (const [key, e] of byKey) {
		if (!seen.has(key)) ordered.push(e);
	}

	const oldBody = content.slice(parsed.bodyStart);
	const body = oldBody.includes(TASK_NOTE_MARKER)
		? `${eventSummaryLines(ev)}\n${ev.description ? ev.description + '\n\n' : ''}${TASK_NOTE_MARKER}\n`
		: oldBody;

	await app.vault.modify(file, serializeFm(ordered, body));
}

/** 为日程创建任务笔记，返回文件路径 */
export async function createTaskNote(app: App, settings: EcsSettings, ev: EcsEvent): Promise<string> {
	try {
		await ensureFolder(app, settings.taskNotesFolder);
		const base = `日程-${sanitizeFilename(ev.title)}-${ev.date.replace(/-/g, '')}`;
		const path = await uniquePath(app, `${settings.taskNotesFolder}/${base}`);
		await app.vault.create(path, buildContent(ev, ev.done ? 'done' : 'open', ev.done ? todayStr() : ''));
		return path;
	} catch (e) {
		console.error('[嵌入日历日程] 创建任务笔记失败', e);
		new Notice(`创建 TaskNotes 任务笔记失败：${String(e)}`);
		return '';
	}
}

/** 日程被编辑后同步任务笔记 */
export async function updateTaskNote(app: App, ev: EcsEvent): Promise<void> {
	if (!ev.taskNote) return;
	const file = app.vault.getAbstractFileByPath(ev.taskNote);
	if (!(file instanceof TFile)) return;
	try {
		await writeTaskNote(app, file, ev, '', '');
	} catch (e) {
		console.error('[嵌入日历日程] 更新任务笔记失败', e);
	}
}

/** 完成状态同步到任务笔记 */
export async function syncTaskNoteStatus(app: App, ev: EcsEvent, settings: EcsSettings): Promise<void> {
	if (!settings.taskNotesSyncStatus || !ev.taskNote) return;
	const file = app.vault.getAbstractFileByPath(ev.taskNote);
	if (!(file instanceof TFile)) return;
	try {
		await writeTaskNote(app, file, ev, ev.done ? 'done' : 'open', ev.done ? todayStr() : '');
	} catch (e) {
		console.error('[嵌入日历日程] 同步任务状态失败', e);
	}
}

/** 删除日程时移除任务笔记（移入系统回收站） */
export async function trashTaskNote(app: App, ev: EcsEvent): Promise<void> {
	if (!ev.taskNote) return;
	const file = app.vault.getAbstractFileByPath(ev.taskNote);
	if (!(file instanceof TFile)) return;
	try {
		await app.vault.trash(file, true);
	} catch (e) {
		console.error('[嵌入日历日程] 移除任务笔记失败', e);
	}
}

/** 日程的 taskNote 丢失时按需重建 */
export async function ensureTaskNote(app: App, settings: EcsSettings, ev: EcsEvent): Promise<void> {
	if (ev.taskNote && app.vault.getAbstractFileByPath(ev.taskNote) instanceof TFile) return;
	ev.taskNote = await createTaskNote(app, settings, ev);
}

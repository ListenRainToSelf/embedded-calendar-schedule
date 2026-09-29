/**
 * TaskNotes 联动自测：任务笔记创建 / 状态同步 / 编辑同步 / frontmatter 保留
 * 运行：npx esbuild tests/tasknote.test.ts --bundle --format=cjs --platform=node --alias:obsidian=./tests/obsidian-mock.ts --outfile=.tmp/tasknote.cjs && node .tmp/tasknote.cjs
 */
import { TFile } from 'obsidian';
import { createTaskNote, updateTaskNote, syncTaskNoteStatus, trashTaskNote } from '../src/tasknotes';
import { DEFAULT_SETTINGS, EcsEvent, TASK_NOTE_MARKER } from '../src/types';
import { uid } from '../src/util';

const files = new Map<string, string>();
const folders = new Set<string>();

// 最小内存 vault（Obsidian 的 read/modify/trash 接收 TFile 对象或路径）
const keyOf = (p: string | { path: string }): string => (typeof p === 'string' ? p : p.path);
const vault = {
	getAbstractFileByPath(path: string): unknown {
		if (files.has(path)) {
			const f = new TFile() as unknown as { path: string };
			f.path = path;
			return f;
		}
		if (folders.has(path)) return { path, children: [] };
		return null;
	},
	async createFolder(p: string): Promise<void> {
		folders.add(p);
	},
	async create(path: string, content: string): Promise<unknown> {
		files.set(path, content);
		return { path };
	},
	async read(p: string | { path: string }): Promise<string> {
		return files.get(keyOf(p)) ?? '';
	},
	async modify(p: string | { path: string }, content: string): Promise<void> {
		files.set(keyOf(p), content);
	},
	async trash(p: string | { path: string }): Promise<void> {
		files.delete(keyOf(p));
	},
};
const app = { vault } as never;

let failures = 0;
function ok(cond: boolean, label: string, detail?: string): void {
	if (cond) console.log(`  ok  ${label}`);
	else {
		failures++;
		console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
	}
}

const ev: EcsEvent = {
	id: uid(),
	title: '组会汇报',
	date: '2026-10-01',
	startTime: '14:00',
	endTime: '15:30',
	category: '工作',
	location: '3号会议室',
	description: '带上季度数据',
	note: '工作/重要项目.md',
	done: false,
	taskNote: '',
	created: 1,
};

console.log('[tasknotes]');
const path = await createTaskNote(app, DEFAULT_SETTINGS, ev);
ev.taskNote = path; // 真实流程中由插件在创建后写回事件
ok(path.startsWith('TaskNotes/Tasks/'), '创建在任务笔记文件夹', path);
ok(/日程-组会汇报-20261001\.md$/.test(path), '文件名含标题与日期', path);
const c1 = files.get(path) ?? '';
ok(c1.includes('  - task'), 'tags 含 task');
ok(c1.includes('  - 日程'), 'tags 含 日程');
ok(c1.includes('title: 日程｜组会汇报'), 'title 字段');
ok(c1.includes('status: open'), 'status open');
ok(c1.includes('scheduled: "2026-10-01"'), 'scheduled 日期');
ok(c1.includes('time: "14:00–15:30"'), '时间字段');
ok(c1.includes('source: "[[工作/重要项目|重要项目]]"'), 'source 指向来源笔记');
ok(c1.includes(`eventId: ${ev.id}`), 'eventId 关联');
ok(c1.includes('**来源笔记**：[[工作/重要项目|重要项目]]'), '正文：来源笔记');
ok(c1.includes('**日程信息**：组会汇报（3号会议室）'), '正文：日程信息');
ok(c1.includes('**时间**：2026-10-01 14:00–15:30'), '正文：时间');
ok(c1.includes(TASK_NOTE_MARKER), '正文含插件标记');

// 用户在任务笔记里加了自定义字段后，同步仍保留
files.set(path, (files.get(path) ?? '').replace('priority: normal', 'priority: normal\ncustomfield: keepme'));

ev.done = true;
await syncTaskNoteStatus(app, ev, DEFAULT_SETTINGS);
const c2 = files.get(path) ?? '';
ok(c2.includes('status: done'), '完成同步为 done');
ok(c2.includes('completedDate: "'), '写入 completedDate');
ok(c2.includes('customfield: keepme'), '自定义字段被保留');
ok(c2.includes('**时间**：2026-10-01 14:00–15:30'), '完成同步后正文仍在');

ev.title = '组会汇报（改）';
ev.startTime = '15:00';
await updateTaskNote(app, ev);
const c3 = files.get(path) ?? '';
ok(c3.includes('title: 日程｜组会汇报（改）'), '编辑同步标题');
ok(c3.includes('time: "15:00–15:30"'), '编辑同步时间');
ok(c3.includes('status: done'), '纯编辑保留 TaskNotes 侧状态');
ok(c3.includes('completedDate:'), '纯编辑保留 completedDate');

// 取消完成走状态同步：done → open
ev.done = false;
await syncTaskNoteStatus(app, ev, DEFAULT_SETTINGS);
const c4 = files.get(path) ?? '';
ok(c4.includes('status: open'), '重开同步为 open');
ok(!c4.includes('completedDate:'), '重开移除 completedDate');
ok(c4.includes('customfield: keepme'), '再次同步仍保留自定义字段');

// 丢关联后按需重建
ev.taskNote = 'TaskNotes/Tasks/不存在的文件.md';
await updateTaskNote(app, ev);
ok(files.get('TaskNotes/Tasks/不存在的文件.md') === undefined, '任务笔记不存在时不报错');

ev.taskNote = path;
await trashTaskNote(app, ev);
ok(!files.has(path), '删除日程时任务笔记进回收站');

if (failures > 0) {
	console.error(`\n${failures} 项 TaskNotes 断言失败`);
	process.exit(1);
}
console.log('\nTaskNotes 自测全部通过 ✓');

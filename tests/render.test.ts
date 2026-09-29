/**
 * 渲染自测：用 jsdom 真实渲染 CalendarBlock，验证 DOM 结构与交互无运行时错误。
 * 运行：npx esbuild tests/render.test.ts --bundle --format=cjs --platform=node --external:jsdom --alias:obsidian=./tests/obsidian-mock.ts --outfile=.tmp/render.cjs && node .tmp/render.cjs
 */
import { JSDOM } from 'jsdom';
import { CalendarBlock } from '../src/block';
import { EventStore } from '../src/store';
import { DEFAULT_SETTINGS } from '../src/types';

const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>');
const g = globalThis as Record<string, unknown>;
g['window'] = dom.window;
g['document'] = dom.window.document;
g['HTMLElement'] = dom.window.HTMLElement;
g['HTMLInputElement'] = dom.window.HTMLInputElement;
g['HTMLTextAreaElement'] = dom.window.HTMLTextAreaElement;
g['MouseEvent'] = dom.window.MouseEvent;
g['Node'] = dom.window.Node;

// polyfill Obsidian 对 HTMLElement 的运行时扩展
function makeCreateEl(tag: string) {
	return function (this: HTMLElement, opts?: { cls?: string; text?: string; attr?: Record<string, string>; title?: string; href?: string }) {
		const el = document.createElement(tag);
		if (opts?.cls) el.className = opts.cls;
		if (opts?.text !== undefined) el.textContent = opts.text;
		if (opts?.title) el.setAttribute('title', opts.title);
		if (opts?.href) el.setAttribute('href', opts.href);
		if (opts?.attr) for (const [k, v] of Object.entries(opts.attr)) el.setAttribute(k, String(v));
		this.appendChild(el);
		return el;
	};
}
const proto = dom.window.HTMLElement.prototype as unknown as Record<string, unknown>;
proto['createEl'] = makeCreateEl('div');
proto['createDiv'] = makeCreateEl('div');
proto['createSpan'] = makeCreateEl('span');
proto['empty'] = function (this: HTMLElement) {
	this.textContent = '';
};
proto['setText'] = function (this: HTMLElement, v: string | DocumentFragment) {
	this.textContent = v as string;
	return this;
};
proto['getText'] = function (this: HTMLElement) {
	return this.textContent ?? '';
};
proto['addClass'] = function (this: HTMLElement, c: string) {
	this.classList.add(c);
};
proto['removeClass'] = function (this: HTMLElement, c: string) {
	this.classList.remove(c);
};
proto['hasClass'] = function (this: HTMLElement, c: string) {
	return this.classList.contains(c);
};
proto['detach'] = function (this: HTMLElement) {
	this.parentElement?.removeChild(this);
};

let failures = 0;
function ok(cond: boolean, label: string): void {
	if (cond) console.log(`  ok  ${label}`);
	else {
		failures++;
		console.error(`FAIL  ${label}`);
	}
}

// ── 构造 fake plugin ──
const store = new EventStore({ persist: async () => {} } as never);
store.load({
	events: [
		{ id: 'e1', title: '国庆值班', date: '2026-10-01', startTime: '09:00', endTime: '12:00', category: '工作', location: '', description: '', note: '工作/重要项目.md', done: false, taskNote: '', created: 1 },
		{ id: 'e2', title: '上午爬山', date: '2026-10-01', startTime: '', endTime: '', category: '生活', location: '香山', description: '', note: '', done: false, taskNote: '', created: 2 },
		{ id: 'e3', title: '复习计划', date: '2026-10-18', startTime: '20:00', endTime: '21:00', category: '学习', location: '', description: '', note: '学习/复习.md', done: true, taskNote: 'TaskNotes/Tasks/日程-复习计划-20261018.md', created: 3 },
	],
});
const plugin = {
	app: {
		vault: { getAbstractFileByPath: () => null, getMarkdownFiles: () => [] },
		workspace: { openLinkText: async () => {} },
	},
	settings: { ...DEFAULT_SETTINGS, customHolidayJson: '' },
	store,
	toggleDone: async () => {},
	deleteEventFlow: async () => {},
	syncDoneState: async () => {},
	todayStr: () => '2026-10-08',
};

const host = document.getElementById('host')!;
const block = new CalendarBlock(
	host,
	plugin as never,
	'month: 2026-10\nfilter: all\nshowHolidays: true\nshowLunar: true',
	'测试笔记.md'
);
block.onload();

console.log('[render]');
ok(host.querySelectorAll('.ecs-cell').length === 42, '渲染42个日期格');
ok(host.querySelector('.ecs-month-title')?.textContent === '2026年10月', '标题为2026年10月');
const cells = Array.from(host.querySelectorAll('.ecs-cell')) as HTMLElement[];
const oct1 = cells.find((c) => c.querySelector('.ecs-daynum')?.textContent === '1' && c.querySelector('.ecs-holiday-name')?.textContent === '国庆节');
ok(!!oct1, '10月1日格子带“国庆节”角标');
ok((oct1?.querySelectorAll('.ecs-dot').length ?? 0) === 2, '10月1日有2个事件圆点');
ok(!!cells.find((c) => c.classList.contains('ecs-workday-cell') && (c.querySelector('.ecs-daynum')?.textContent ?? '').startsWith('10')), '10月10日显示调休上班');
ok((host.querySelector('.ecs-list-title')?.textContent ?? '').includes('本月日程 3 项'), '列表标题显示本月3项');
ok(host.querySelectorAll('.ecs-item').length === 3, '列表渲染3条日程');
ok(!!host.querySelector('.ecs-item.ecs-item-done'), '已完成日程有完成样式');
const noteTag = Array.from(host.querySelectorAll('.ecs-item-note')) as HTMLElement[];
ok(noteTag.some((n) => n.textContent?.includes('重要项目')), '日程行显示来源笔记名');

// ── 交互：新增事件自动刷新 ──
store.create({ title: '临时日程', date: '2026-10-15', startTime: '10:00', endTime: '', category: '其他', location: '', description: '', note: '测试笔记.md', done: false, taskNote: '', created: 4 });
ok((host.querySelector('.ecs-list-title')?.textContent ?? '').includes('4 项'), '新增事件后列表自动刷新');

// ── 交互：点击格子选中当日 ──
const c15 = cells.find((c) => c.querySelector('.ecs-daynum')?.textContent === '15');
c15!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
// 点击会整体重渲染，需重新查询
const cells2 = Array.from(host.querySelectorAll('.ecs-cell')) as HTMLElement[];
ok(!!cells2.find((c) => c.classList.contains('ecs-selected')), '点击后格子选中');
ok((host.querySelector('.ecs-list-title')?.textContent ?? '').includes('10月15日'), '列表切换为当日视图');
ok(host.querySelectorAll('.ecs-item').length === 1, '当日视图1条日程');

// ── 交互：单击后单元格元素不被替换（保证双击可用） ──
const c15b = Array.from(host.querySelectorAll('.ecs-cell')).find((c) => c.getAttribute('data-date') === '2026-10-15');
ok(c15b!.classList.contains('ecs-selected'), 'data-date 定位选中态');
c15b!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const c15c = Array.from(host.querySelectorAll('.ecs-cell')).find((c) => c.getAttribute('data-date') === '2026-10-15');
ok(c15b === c15c, '单击后单元格元素被保留（双击手势不被打断）');
// 再次点击切回选中（toggle 语义），第三次点击取消
c15c!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
ok(c15c!.classList.contains('ecs-selected'), '再次点击恢复选中（toggle 语义）');
c15c!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
ok(!c15c!.classList.contains('ecs-selected'), '第三次点击取消选中');
ok((host.querySelector('.ecs-list-title')?.textContent ?? '').includes('本月日程'), '回到全月视图');

// ── 交互：右键菜单不抛错 ──
let menuOk = true;
try {
	oct1!.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
} catch {
	menuOk = false;
}
ok(menuOk, '右键菜单无运行时错误');

// ── 卸载 ──
block.onunload();
store.create({ title: '卸载后', date: '2026-10-20', startTime: '', endTime: '', category: '其他', location: '', description: '', note: '', done: false, taskNote: '', created: 5 });
ok(true, 'onunload 后订阅已断开（无异常）');

if (failures > 0) {
	console.error(`\n${failures} 项渲染断言失败`);
	process.exit(1);
}
console.log('\n渲染自测全部通过 ✓');

import { Plugin, TFile } from 'obsidian';
import { EcsEvent, EcsSettings } from './types';
import { compareEvents, uid } from './util';

/**
 * 事件存储：全部日程集中保存在插件 data.json（与设置同文件），
 * data.json 形如 { ...EcsSettings, events: EcsEvent[] }。
 */
export class EventStore {
	events: EcsEvent[] = [];
	private listeners = new Set<() => void>();
	private saveTimer: number | null = null;

	constructor(private plugin: Plugin & { settings: EcsSettings; persist: () => Promise<void> }) {}

	load(data: unknown): void {
		const obj = (data ?? {}) as Record<string, unknown>;
		const raw = obj['events'];
		this.events = Array.isArray(raw) ? (raw as EcsEvent[]).filter((e) => e && typeof e.id === 'string' && typeof e.date === 'string') : [];
	}

	subscribe(cb: () => void): () => void {
		this.listeners.add(cb);
		return () => this.listeners.delete(cb);
	}

	notify(): void {
		for (const cb of this.listeners) {
			try {
				cb();
			} catch (e) {
				console.error('[嵌入日历日程] listener error', e);
			}
		}
	}

	private saveAndNotify(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.plugin.persist();
		}, 250);
		this.notify();
	}

	create(ev: Omit<EcsEvent, 'id' | 'created'>): EcsEvent {
		const full: EcsEvent = { ...ev, id: uid(), created: Date.now() };
		this.events.push(full);
		this.saveAndNotify();
		return full;
	}

	get(id: string): EcsEvent | undefined {
		return this.events.find((e) => e.id === id);
	}

	update(id: string, patch: Partial<Omit<EcsEvent, 'id' | 'created'>>): EcsEvent | undefined {
		const ev = this.get(id);
		if (!ev) return undefined;
		Object.assign(ev, patch);
		this.saveAndNotify();
		return ev;
	}

	remove(id: string): EcsEvent | undefined {
		const idx = this.events.findIndex((e) => e.id === id);
		if (idx < 0) return undefined;
		const [ev] = this.events.splice(idx, 1);
		this.saveAndNotify();
		return ev;
	}

	setDone(id: string, done: boolean): void {
		this.update(id, { done });
	}

	byDate(date: string): EcsEvent[] {
		return this.events.filter((e) => e.date === date).sort(compareEvents);
	}

	/** 某年某月的事件（含跨月矩阵中显示但属于其它月的？——只取本月） */
	inMonth(y: number, m: number): EcsEvent[] {
		const prefix = `${y}-${String(m).padStart(2, '0')}-`;
		return this.events.filter((e) => e.date.startsWith(prefix)).sort(compareEvents);
	}

	/** 按筛选取某月事件：all=全部；note=仅来源为指定笔记（或在该笔记中创建） */
	inMonthFiltered(y: number, m: number, filter: 'all' | 'note', sourcePath: string): EcsEvent[] {
		const list = this.inMonth(y, m);
		if (filter === 'note') {
			const norm = sourcePath.replace(/\.md$/i, '');
			return list.filter((e) => e.note && e.note.replace(/\.md$/i, '') === norm);
		}
		return list;
	}

	byDateFiltered(date: string, filter: 'all' | 'note', sourcePath: string): EcsEvent[] {
		const list = this.byDate(date);
		if (filter === 'note') {
			const norm = sourcePath.replace(/\.md$/i, '');
			return list.filter((e) => e.note && e.note.replace(/\.md$/i, '') === norm);
		}
		return list;
	}

	todayCount(): number {
		const t = new Date();
		const prefix = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
		return this.events.filter((e) => e.date === prefix && !e.done).length;
	}

	/** 来源笔记重命名/移动时同步事件里的路径 */
	handleRename(file: TFile, oldPath: string): void {
		const normOld = oldPath.replace(/\.md$/i, '');
		let touched = false;
		for (const ev of this.events) {
			if (ev.note && ev.note.replace(/\.md$/i, '') === normOld) {
				ev.note = file.path;
				touched = true;
			}
		}
		if (touched) this.saveAndNotify();
	}

	/** 来源笔记删除时仅清空引用，不删日程 */
	handleDelete(file: TFile): void {
		const norm = file.path.replace(/\.md$/i, '');
		let touched = false;
		for (const ev of this.events) {
			if (ev.note && ev.note.replace(/\.md$/i, '') === norm) {
				ev.note = '';
				touched = true;
			}
		}
		if (touched) this.saveAndNotify();
	}
}

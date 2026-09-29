/** 日期与通用工具函数（不依赖 Obsidian API，便于单元验证） */

export const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'] as const;

export function pad2(n: number): string {
	return n < 10 ? `0${n}` : `${n}`;
}

export function fmtDate(y: number, m: number, d: number): string {
	return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function todayStr(): string {
	const n = new Date();
	return fmtDate(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

export interface YMD {
	y: number;
	m: number;
	d: number;
}

/** 解析 YYYY-MM-DD；非法返回 null */
export function parseDateStr(s: string): YMD | null {
	const mt = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
	if (!mt) return null;
	const y = +mt[1], m = +mt[2], d = +mt[3];
	if (m < 1 || m > 12 || d < 1 || d > 31) return null;
	if (d > daysInMonth(y, m)) return null;
	return { y, m, d };
}

export function isValidDateStr(s: string): boolean {
	return parseDateStr(s) !== null;
}

export function daysInMonth(y: number, m: number): number {
	return new Date(y, m, 0).getDate();
}

/** 返回 y 年 m 月（1-12）的 6x7 日历矩阵 */
export interface MonthCell extends YMD {
	str: string;
	inMonth: boolean;
	weekday: number;
}

export function buildMonthMatrix(y: number, m: number, firstDay: 0 | 1): MonthCell[][] {
	const firstWeekday = new Date(y, m - 1, 1).getDay();
	const offset = (firstWeekday - firstDay + 7) % 7;
	const cells: MonthCell[] = [];
	const start = new Date(y, m - 1, 1 - offset);
	for (let i = 0; i < 42; i++) {
		const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
		const yy = dt.getFullYear(), mm = dt.getMonth() + 1, dd = dt.getDate();
		cells.push({
			y: yy, m: mm, d: dd,
			str: fmtDate(yy, mm, dd),
			inMonth: yy === y && mm === m,
			weekday: dt.getDay(),
		});
	}
	const rows: MonthCell[][] = [];
	for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7));
	return rows;
}

export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
	const t = new Date(y, m - 1 + delta, 1);
	return { y: t.getFullYear(), m: t.getMonth() + 1 };
}

export function monthTitle(y: number, m: number): string {
	return `${y}年${m}月`;
}

/** 解析代码块里的简单 YAML（每行 key: value，忽略注释/空行/#列表） */
export function parseBlockOptions(source: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const raw of source.split('\n')) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const idx = line.indexOf(':');
		if (idx <= 0) continue;
		const key = line.slice(0, idx).trim();
		let val = line.slice(idx + 1).trim();
		if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) val = val.slice(1, -1);
		if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) val = val.slice(1, -1);
		if (key) out[key] = val;
	}
	return out;
}

export function truthy(v: string | undefined): boolean {
	if (v === undefined) return true;
	return /^(1|true|yes|on|开|是)$/i.test(v.trim());
}

export function uid(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 清理用于文件名的字符 */
export function sanitizeFilename(s: string): string {
	return s
		.replace(/[\\/:*?"<>|#^[\]]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
}

/** 时间显示：全天 → “全天”，否则 HH:mm 或 HH:mm–HH:mm */
export function timeRangeText(startTime: string, endTime: string): string {
	if (!startTime && !endTime) return '全天';
	if (startTime && endTime) return `${startTime}–${endTime}`;
	return startTime || endTime;
}

/** 事件排序：日期 → 开始时间（全天排最前）→ 创建时间 */
export function compareEvents(a: { date: string; startTime: string; created: number }, b: { date: string; startTime: string; created: number }): number {
	if (a.date !== b.date) return a.date < b.date ? -1 : 1;
	const at = a.startTime || '';
	const bt = b.startTime || '';
	if (at !== bt) {
		if (!at) return -1;
		if (!bt) return 1;
		return at < bt ? -1 : 1;
	}
	return a.created - b.created;
}

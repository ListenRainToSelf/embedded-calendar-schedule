/**
 * 法定节假日数据（国务院办公厅公告）：
 * - 2025 年：国办发明电〔2024〕7号《关于2025年部分节假日安排的通知》
 * - 2026 年：国办发明电〔2025〕xxx号《关于2026年部分节假日安排的通知》（2025-11-04 发布）
 * 2027 年及以后官方安排发布前，可通过设置里的“自定义节假日 JSON”扩展。
 */

export interface HolidayHit {
	name: string;
	type: 'holiday' | 'workday';
}

type Range = [start: string, end: string, name: string];

const BUILTIN_HOLIDAYS: Range[] = [
	// 2025
	['2025-01-01', '2025-01-01', '元旦'],
	['2025-01-28', '2025-02-04', '春节'],
	['2025-04-04', '2025-04-06', '清明节'],
	['2025-05-01', '2025-05-05', '劳动节'],
	['2025-05-31', '2025-06-02', '端午节'],
	['2025-10-01', '2025-10-08', '国庆节·中秋'],
	// 2026
	['2026-01-01', '2026-01-03', '元旦'],
	['2026-02-15', '2026-02-23', '春节'],
	['2026-04-04', '2026-04-06', '清明节'],
	['2026-05-01', '2026-05-05', '劳动节'],
	['2026-06-19', '2026-06-21', '端午节'],
	['2026-09-25', '2026-09-27', '中秋节'],
	['2026-10-01', '2026-10-07', '国庆节'],
];

/** 调休上班日（周末但需上班） */
type DayRange = [start: string, end: string];

const BUILTIN_WORKDAYS: DayRange[] = [
	// 2025
	['2025-01-26', '2025-01-26'],
	['2025-02-08', '2025-02-08'],
	['2025-04-27', '2025-04-27'],
	['2025-09-28', '2025-09-28'],
	['2025-10-11', '2025-10-11'],
	// 2026
	['2026-01-04', '2026-01-04'],
	['2026-02-14', '2026-02-14'],
	['2026-02-28', '2026-02-28'],
	['2026-05-09', '2026-05-09'],
	['2026-09-20', '2026-09-20'],
	['2026-10-10', '2026-10-10'],
];

function eachDate(start: string, end: string, cb: (s: string) => void): void {
	const sy = +start.slice(0, 4), sm = +start.slice(5, 7), sd = +start.slice(8, 10);
	const ey = +end.slice(0, 4), em = +end.slice(5, 7), ed = +end.slice(8, 10);
	let cur = new Date(sy, sm - 1, sd);
	const stop = new Date(ey, em - 1, ed);
	while (cur <= stop) {
		const y = cur.getFullYear(), m = cur.getMonth() + 1, d = cur.getDate();
		cb(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
		cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
	}
}

interface CustomHolidayJson {
	holidays?: Range[];
	workdays?: DayRange[];
}

let cacheMap: Map<string, HolidayHit> | null = null;
let cacheJson = '';

function buildMap(customJson: string): Map<string, HolidayHit> {
	const map = new Map<string, HolidayHit>();
	for (const [s, e, name] of BUILTIN_HOLIDAYS) {
		eachDate(s, e, (d) => map.set(d, { name, type: 'holiday' }));
	}
	for (const [s, e] of BUILTIN_WORKDAYS) {
		eachDate(s, e, (d) => map.set(d, { name: '班', type: 'workday' }));
	}
	if (customJson && customJson.trim()) {
		try {
			const parsed = JSON.parse(customJson) as CustomHolidayJson;
			for (const [s, e, name] of parsed.holidays ?? []) {
				if (typeof s === 'string' && typeof e === 'string' && typeof name === 'string') {
					eachDate(s, e, (d) => map.set(d, { name, type: 'holiday' }));
				}
			}
			for (const [s, e] of parsed.workdays ?? []) {
				if (typeof s === 'string' && typeof e === 'string') {
					eachDate(s, e, (d) => map.set(d, { name: '班', type: 'workday' }));
				}
			}
		} catch {
			// 自定义 JSON 格式错误时忽略，保持内置数据
		}
	}
	return map;
}

/** 查询某日期的节假日/调休信息，无则返回 null */
export function getHoliday(dateStr: string, customJson: string): HolidayHit | null {
	if (cacheMap === null || cacheJson !== customJson) {
		cacheMap = buildMap(customJson);
		cacheJson = customJson;
	}
	return cacheMap.get(dateStr) ?? null;
}

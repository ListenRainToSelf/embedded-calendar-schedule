/**
 * 农历换算（1900–2049），基于通用 lunarInfo 位表。
 * 若日期超出表范围，返回空字符串并隐藏农历显示。
 */

const LUNAR_INFO: number[] = [
	0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
	0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
	0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
	0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
	0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
	0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
	0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
	0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6, // 1970-1979
	0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
	0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
	0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
	0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
	0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
	0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
	0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
];

const LUNAR_FIRST_YEAR = 1900;

const MONTH_CN = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const DAY_CN = [
	'初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
	'十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
	'廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];

/** 农历节日：key = `月-日`（农历月日） */
const LUNAR_FESTIVALS: Record<string, string> = {
	'1-1': '春节',
	'1-15': '元宵',
	'2-2': '龙抬头',
	'5-5': '端午',
	'7-7': '七夕',
	'8-15': '中秋',
	'9-9': '重阳',
	'12-8': '腊八',
};

function leapMonth(y: number): number {
	return LUNAR_INFO[y - LUNAR_FIRST_YEAR] & 0xf;
}

function leapDays(y: number): number {
	return leapMonth(y) ? ((LUNAR_INFO[y - LUNAR_FIRST_YEAR] & 0x10000) ? 30 : 29) : 0;
}

function yearDays(y: number): number {
	let sum = 348;
	for (let i = 0x8000; i > 0x8; i >>= 1) {
		sum += (LUNAR_INFO[y - LUNAR_FIRST_YEAR] & i) ? 1 : 0;
	}
	return sum + leapDays(y);
}

function monthDays(y: number, m: number): number {
	return (LUNAR_INFO[y - LUNAR_FIRST_YEAR] & (0x10000 >> m)) ? 30 : 29;
}

export interface LunarInfo {
	/** 如 “八月” 或 “八月十五” */
	label: string;
	/** 农历节日名，如 “中秋”，无则空 */
	festival: string;
}

/** 公历 → 农历；超出支持范围返回 null */
export function solarToLunar(y: number, m: number, d: number): LunarInfo | null {
	if (y < LUNAR_FIRST_YEAR + 1 || y > LUNAR_FIRST_YEAR + LUNAR_INFO.length) return null;
	let offset = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(LUNAR_FIRST_YEAR, 0, 31)) / 86400000);
	if (offset < 0) return null;

	let lunarY = LUNAR_FIRST_YEAR;
	for (let days = yearDays(lunarY); offset >= days; days = yearDays(lunarY)) {
		offset -= days;
		lunarY++;
		if (lunarY > LUNAR_FIRST_YEAR + LUNAR_INFO.length - 1) return null;
	}

	const leap = leapMonth(lunarY);
	let isLeap = false;
	let lunarM = 1;
	while (true) {
		let md: number;
		if (leap > 0 && lunarM === leap + 1 && !isLeap) {
			lunarM--;
			isLeap = true;
			md = leapDays(lunarY);
		} else {
			md = monthDays(lunarY, lunarM);
		}
		if (isLeap && lunarM === leap + 1) isLeap = false;
		if (offset < md) break;
		offset -= md;
		lunarM++;
		if (lunarM > 12) {
			lunarM = 1;
			// 理论不会到达（年份循环已处理），防御性返回
			return null;
		}
	}
	const lunarD = offset + 1;

	let label: string;
	if (lunarD === 1) {
		label = (isLeap ? '闰' : '') + MONTH_CN[lunarM - 1] + '月';
	} else {
		label = DAY_CN[lunarD - 1];
	}
	// 除夕 = 腊月最后一天
	let festival = '';
	if (!isLeap && lunarM === 12 && lunarD === monthDays(lunarY, 12)) {
		festival = '除夕';
	} else {
		festival = LUNAR_FESTIVALS[`${lunarM}-${lunarD}`] ?? '';
	}
	return { label, festival };
}

/**
 * 纯逻辑自测：日期工具 / 节假日数据 / 农历换算
 * 运行：npx esbuild tests/smoke.ts --bundle --format=cjs --platform=node --outfile=.tmp/smoke.cjs && node .tmp/smoke.cjs
 */
import { buildMonthMatrix, daysInMonth, parseBlockOptions, timeRangeText, sanitizeFilename, isValidDateStr } from '../src/util';
import { getHoliday } from '../src/holidays';
import { solarToLunar } from '../src/lunar';

let failures = 0;
function eq(actual: unknown, expected: unknown, label: string): void {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) {
		console.log(`  ok  ${label}`);
	} else {
		failures++;
		console.error(`FAIL  ${label}: expected ${e}, got ${a}`);
	}
}

// ── 日期工具 ──
console.log('[util]');
eq(daysInMonth(2024, 2), 29, '2024年2月有29天');
eq(daysInMonth(2026, 2), 28, '2026年2月有28天');
const sep = buildMonthMatrix(2026, 9, 1);
eq(sep[0][0].str, '2026-08-31', '2026年9月周首制首格为8月31日');
eq(sep[0][1].str, '2026-09-01', '2026-09-01 落在周二列');
const oct = buildMonthMatrix(2026, 10, 1);
eq(oct.some((r) => r.some((c) => c.str === '2026-10-01' && c.inMonth)), true, '10月矩阵包含2026-10-01');
eq(sunMatrix()[0][0].weekday, 0, '周日制首列 weekday=0');
eq(parseBlockOptions('month: 2026-10\nfilter: "note"\nshowHolidays: true')['filter'], 'note', '代码块选项解析（引号）');
eq(isValidDateStr('2026-02-29'), false, '拒绝2026-02-29');
eq(isValidDateStr('2024-02-29'), true, '接受2024-02-29');
eq(timeRangeText('', ''), '全天', '无时间为全天');
eq(timeRangeText('09:00', '10:30'), '09:00–10:30', '时间区间');
eq(sanitizeFilename('a/b:c*d?"<>|#'), 'abcd', '文件名清理');

function sunMatrix() {
	return buildMonthMatrix(2026, 9, 0);
}

// ── 节假日 ──
console.log('[holidays]');
eq(getHoliday('2026-10-01', '')?.name, '国庆节', '2026国庆');
eq(getHoliday('2026-10-07', '')?.type, 'holiday', '2026-10-07放假');
eq(getHoliday('2026-10-10', '')?.type, 'workday', '2026-10-10调休上班');
eq(getHoliday('2026-01-04', '')?.type, 'workday', '2026-01-04调休上班');
eq(getHoliday('2026-02-15', '')?.name, '春节', '2026春节开始');
eq(getHoliday('2026-02-23', '')?.name, '春节', '2026春节结束');
eq(getHoliday('2026-02-14', '')?.type, 'workday', '2026-02-14调休上班');
eq(getHoliday('2026-02-28', '')?.type, 'workday', '2026-02-28调休上班');
eq(getHoliday('2026-09-25', '')?.name, '中秋节', '2026中秋');
eq(getHoliday('2026-09-27', '')?.name, '中秋节', '2026中秋末日');
eq(getHoliday('2026-06-19', '')?.name, '端午节', '2026端午');
eq(getHoliday('2026-05-01', '')?.name, '劳动节', '2026劳动节');
eq(getHoliday('2026-05-09', '')?.type, 'workday', '2026-05-09调休上班');
eq(getHoliday('2026-09-20', '')?.type, 'workday', '2026-09-20调休上班');
eq(getHoliday('2025-10-08', '')?.name, '国庆节·中秋', '2025国庆中秋末日');
eq(getHoliday('2025-04-27', '')?.type, 'workday', '2025-04-27调休上班');
eq(getHoliday('2027-01-01', ''), null, '2027默认无内置数据');
const custom = JSON.stringify({ holidays: [['2027-01-01', '2027-01-03', '元旦']] });
eq(getHoliday('2027-01-02', custom)?.name, '元旦', '自定义节假日生效');
eq(getHoliday('2026-10-01', custom)?.name, '国庆节', '自定义不影响内置');

// ── 农历（锚点：历年春节等） ──
console.log('[lunar]');
const chunjie: [string, string][] = [
	['2000-02-05', '2000春节'],
	['2008-02-07', '2008春节'],
	['2018-02-16', '2018春节'],
	['2020-01-25', '2020春节'],
	['2021-02-12', '2021春节'],
	['2022-02-01', '2022春节'],
	['2023-01-22', '2023春节'],
	['2024-02-10', '2024春节'],
	['2025-01-29', '2025春节'],
	['2026-02-17', '2026春节'],
];
for (const [d, label] of chunjie) {
	const [y, m, dd] = d.split('-').map(Number);
	const l = solarToLunar(y, m, dd);
	// 约定：农历初一显示月名（如“正月”），其余显示日名
	eq([l?.label, l?.festival], ['正月' as string, '春节'], `农历锚点 ${label} = ${d}`);
}
const cuxi24 = solarToLunar(2024, 2, 9);
eq(cuxi24?.festival, '除夕', '2024-02-09除夕');
const zx26 = solarToLunar(2026, 9, 25);
eq(zx26?.label, '十五', '2026-09-25农历十五');
eq(zx26?.festival, '中秋', '2026-09-25中秋');
const dw26 = solarToLunar(2026, 6, 19);
eq(dw26?.label, '初五', '2026-06-19农历初五');
eq(dw26?.festival, '端午', '2026-06-19端午');
const cy26 = solarToLunar(2026, 2, 16);
eq(cy26?.festival, '除夕', '2026-02-16除夕');
const yx26 = solarToLunar(2026, 3, 3);
eq(yx26?.festival, '元宵', '2026-03-03元宵(正月十五)');
const jj26 = solarToLunar(2026, 10, 18);
eq([jj26?.label, jj26?.festival], ['初九', '重阳'], '2026-10-18重阳(九月初九)');
eq(solarToLunar(2026, 10, 11)?.label, '初二', '2026-10-11九月初二');
eq(solarToLunar(1899, 12, 1), null, '早于1900返回null');

if (failures > 0) {
	console.error(`\n${failures} 项断言失败`);
	process.exit(1);
} else {
	console.log('\n全部断言通过 ✓');
}

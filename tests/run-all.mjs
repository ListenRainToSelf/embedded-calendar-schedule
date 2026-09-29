/** 依次构建并运行三套自测：逻辑 / 渲染 / TaskNotes 联动 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args) {
	execFileSync(npx, args, { stdio: 'inherit', shell: true });
}

rmSync('.tmp', { recursive: true, force: true });
run(['esbuild', 'tests/smoke.ts', '--bundle', '--format=cjs', '--platform=node', '--outfile=.tmp/smoke.cjs', '--log-level=error']);
run(['esbuild', 'tests/render.test.ts', '--bundle', '--format=cjs', '--platform=node', '--external:jsdom', '--alias:obsidian=./tests/obsidian-mock.ts', '--outfile=.tmp/render.cjs', '--log-level=error']);
run(['esbuild', 'tests/tasknote.test.ts', '--bundle', '--format=esm', '--platform=node', '--alias:obsidian=./tests/obsidian-mock.ts', '--outfile=.tmp/tasknote.mjs', '--log-level=error']);

for (const f of ['.tmp/smoke.cjs', '.tmp/render.cjs', '.tmp/tasknote.mjs']) {
	execFileSync('node', [f], { stdio: 'inherit' });
}
console.log('\n✅ 三套自测全部通过');

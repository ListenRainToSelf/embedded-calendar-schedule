/** 把构建产物部署到 Obsidian vault：node deploy.mjs [vault路径] */
import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const vault = process.argv[2] ?? 'F:/obsidian';
const dest = path.join(vault, '.obsidian', 'plugins', 'embedded-calendar-schedule');
mkdirSync(dest, { recursive: true });
for (const f of ['manifest.json', 'main.js', 'styles.css', 'versions.json']) {
	cpSync(f, path.join(dest, f));
}
console.log(`已部署到 ${dest}`);

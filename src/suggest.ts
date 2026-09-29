import { App, TFile, AbstractInputSuggest, Modal } from 'obsidian';

/** 在输入框中模糊提示 vault 内的笔记，用于“来源笔记”字段 */
export class NoteSuggest extends AbstractInputSuggest<TFile> {
	constructor(app: App, inputEl: HTMLInputElement, private onPick: (path: string) => void) {
		super(app, inputEl);
	}

	getSuggestions(query: string): TFile[] {
		const q = query.toLowerCase().replace(/\.md$/i, '');
		const files = this.app.vault.getMarkdownFiles();
		if (!q) return files.slice(0, 30);
		const hits: TFile[] = [];
		for (const f of files) {
			if (f.basename.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)) {
				hits.push(f);
				if (hits.length >= 30) break;
			}
		}
		return hits;
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		const base = el.createDiv({ cls: 'ecs-suggest-title' });
		base.setText(file.basename);
		const dir = el.createDiv({ cls: 'ecs-suggest-path' });
		dir.setText(file.parent ? file.parent.path : '');
	}

	selectSuggestion(file: TFile): void {
		this.onPick(file.path);
		this.close();
	}
}

/** 简单确认弹窗（用于删除等破坏性操作） */
export class ConfirmModal extends Modal {
	constructor(app: App, private title: string, private message: string, private onConfirm: () => void) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.createEl('h3', { text: this.title });
		this.contentEl.createEl('p', { text: this.message, cls: 'ecs-confirm-message' });
		const btns = this.contentEl.createDiv({ cls: 'ecs-modal-buttons' });
		btns.createEl('button', { text: '取消' }).addEventListener('click', () => this.close());
		const ok = btns.createEl('button', { text: '确定', cls: 'mod-warning' });
		ok.addEventListener('click', () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** 渲染自测用的 obsidian 模块 mock（esbuild --alias:obsidian 指向本文件） */

export class Component {
	onload?: () => void;
	onunload?: () => void;
	addChild<T extends Component>(child: T): T {
		child.onload?.();
		return child;
	}
	removeChild<T extends Component>(child: T): T {
		return child;
	}
	register(_cb: () => void): void {}
}

export class MarkdownRenderChild extends Component {
	containerEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		super();
		this.containerEl = containerEl;
	}
}

export function setIcon(el: HTMLElement, name: string): void {
	const span = document.createElement('span');
	span.setAttribute('data-icon', name);
	el.appendChild(span);
}

export class MenuItem {
	setTitle(_t: string | DocumentFragment): this {
		return this;
	}
	setIcon(_i: string): this {
		return this;
	}
	onClick(_cb: () => void): this {
		return this;
	}
}

export class Menu {
	addItem(_cb: (item: MenuItem) => void): this {
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtMouseEvent(_e: MouseEvent): this {
		return this;
	}
	showAtPosition(_p: { x: number; y: number }): this {
		return this;
	}
	hide(): this {
		return this;
	}
}

export class TFile {
	get basename(): string {
		return 'mock';
	}
	get extension(): string {
		return 'md';
	}
}

export class TFolder {}

export class Notice {
	constructor(_msg: string | DocumentFragment, _timeout?: number) {}
	hide(): void {}
}

export class Modal {
	contentEl: HTMLElement;
	constructor(public app?: unknown) {
		this.contentEl = document.createElement('div');
	}
	open(): void {}
	close(): void {}
}

export class PopoverSuggest<T> {}

export abstract class AbstractInputSuggest<T> {
	constructor(public app: unknown, public inputEl: HTMLInputElement | HTMLDivElement) {}
	close(): void {}
	setValue(_v: string): void {}
	getValue(): string {
		return '';
	}
}

export class Setting {
	private nameEl = document.createElement('div');
	constructor(public containerEl?: HTMLElement) {}
	setName(_n: string | DocumentFragment): this {
		return this;
	}
	setDesc(_d: string | DocumentFragment): this {
		return this;
	}
	setClass(_c: string): this {
		return this;
	}
	addText(_cb: (c: { inputEl: HTMLInputElement; setPlaceholder: (p: string) => unknown; setValue: (v: string) => unknown; onChange: (cb: (v: string) => void) => unknown; addClass: (c: string) => unknown }) => unknown): this {
		return this;
	}
	addTextArea(_cb: (c: unknown) => unknown): this {
		return this;
	}
	addToggle(_cb: (c: unknown) => unknown): this {
		return this;
	}
	addDropdown(_cb: (c: unknown) => unknown): this {
		return this;
	}
	addButton(_cb: (c: unknown) => unknown): this {
		return this;
	}
}

export class ItemView {
	contentEl: HTMLElement = document.createElement('div');
	navigation = false;
	constructor(public leaf?: unknown) {}
	getViewType(): string {
		return '';
	}
	getDisplayText(): string {
		return '';
	}
	getIcon(): string {
		return '';
	}
}

export class WorkspaceLeaf {}

export class Plugin {
	app: unknown;
	constructor(app?: unknown) {
		this.app = app;
	}
}

export class PluginSettingTab {}

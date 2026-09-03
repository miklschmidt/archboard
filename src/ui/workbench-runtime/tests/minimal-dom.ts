type AttributeMap = Map<string, string>;

class TestNode {
	readonly ownerDocument: TestDocument;
	readonly nodeType: number;
	readonly nodeName: string;
	parentNode: TestNode | null = null;
	childNodes: TestNode[] = [];
	nodeValue: string | null = null;

	constructor(ownerDocument: TestDocument, nodeType: number, nodeName: string) {
		this.ownerDocument = ownerDocument;
		this.nodeType = nodeType;
		this.nodeName = nodeName;
	}

	get firstChild(): TestNode | null {
		return this.childNodes[0] ?? null;
	}

	get lastChild(): TestNode | null {
		return this.childNodes.at(-1) ?? null;
	}

	get nextSibling(): TestNode | null {
		if (this.parentNode === null) return null;
		const index = this.parentNode.childNodes.indexOf(this);
		return this.parentNode.childNodes[index + 1] ?? null;
	}

	get textContent(): string {
		if (this.nodeType === 3) return this.nodeValue ?? "";
		return this.childNodes.map((child) => child.textContent).join("");
	}

	set textContent(value: string) {
		this.childNodes = [];
		if (value.length > 0) this.appendChild(this.ownerDocument.createTextNode(value));
	}

	appendChild<T extends TestNode>(child: T): T {
		child.parentNode?.removeChild(child);
		child.parentNode = this;
		this.childNodes.push(child);
		return child;
	}

	insertBefore<T extends TestNode>(child: T, before: TestNode | null): T {
		if (before === null) return this.appendChild(child);
		const index = this.childNodes.indexOf(before);
		if (index < 0) throw new Error("Reference node is not a child");
		child.parentNode?.removeChild(child);
		child.parentNode = this;
		this.childNodes.splice(index, 0, child);
		return child;
	}

	removeChild<T extends TestNode>(child: T): T {
		const index = this.childNodes.indexOf(child);
		if (index < 0) throw new Error("Node is not a child");
		this.childNodes.splice(index, 1);
		child.parentNode = null;
		return child;
	}

	addEventListener(): void {}
	removeEventListener(): void {}
}

class TestText extends TestNode {
	constructor(ownerDocument: TestDocument, value: string) {
		super(ownerDocument, 3, "#text");
		this.nodeValue = value;
	}
}

export class TestElement extends TestNode {
	readonly tagName: string;
	readonly namespaceURI = "http://www.w3.org/1999/xhtml";
	readonly style: Record<string, string> = {};
	private readonly attributes: AttributeMap = new Map();

	constructor(ownerDocument: TestDocument, tagName: string) {
		super(ownerDocument, 1, tagName.toUpperCase());
		this.tagName = tagName.toUpperCase();
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, String(value));
	}

	removeAttribute(name: string): void {
		this.attributes.delete(name);
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	matches(): boolean {
		return false;
	}

	queryByRole(role: string): TestElement | null {
		if (this.getAttribute("role") === role) return this;
		for (const child of this.childNodes) {
			if (child instanceof TestElement) {
				const found = child.queryByRole(role);
				if (found !== null) return found;
			}
		}
		return null;
	}
}

class TestDocument extends TestNode {
	readonly documentElement: TestElement;
	readonly body: TestElement;
	readonly defaultView: Record<string, unknown>;
	activeElement: TestElement | null = null;

	constructor() {
		super(null as unknown as TestDocument, 9, "#document");
		Object.defineProperty(this, "ownerDocument", { value: this });
		this.documentElement = this.createElement("html");
		this.body = this.createElement("body");
		this.documentElement.appendChild(this.body);
		this.appendChild(this.documentElement);
		this.defaultView = {};
	}

	createElement(tagName: string): TestElement {
		return new TestElement(this, tagName);
	}

	createElementNS(_namespace: string, tagName: string): TestElement {
		return this.createElement(tagName);
	}

	createTextNode(value: string): TestText {
		return new TestText(this, value);
	}

	createComment(value: string): TestText {
		const comment = new TestText(this, value);
		Object.defineProperty(comment, "nodeType", { value: 8 });
		return comment;
	}
}

export interface MinimalDom {
	readonly container: TestElement;
	readonly restore: () => void;
}

export function installMinimalDom(): MinimalDom {
	const document = new TestDocument();
	class TestHtmlElement extends TestElement {}
	class TestHtmlIFrameElement extends TestHtmlElement {}
	const window = {
		document,
		Node: TestNode,
		Element: TestElement,
		HTMLElement: TestHtmlElement,
		HTMLIFrameElement: TestHtmlIFrameElement,
		addEventListener() {},
		removeEventListener() {},
		getComputedStyle: () => ({}),
	};
	Object.assign(document.defaultView, window);
	const previous = new Map<string, PropertyDescriptor | undefined>();
	for (const [name, value] of Object.entries({
		document,
		window,
		Node: TestNode,
		Element: TestElement,
		HTMLElement: TestHtmlElement,
		IS_REACT_ACT_ENVIRONMENT: true,
	})) {
		previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
	}
	return {
		container: document.createElement("div"),
		restore: () => {
			for (const [name, descriptor] of previous) {
				if (descriptor === undefined) delete (globalThis as Record<string, unknown>)[name];
				else Object.defineProperty(globalThis, name, descriptor);
			}
		},
	};
}

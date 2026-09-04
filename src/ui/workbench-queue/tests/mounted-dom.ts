type Listener = ((event: TestEvent) => void) | { handleEvent: (event: TestEvent) => void };

interface ListenerEntry {
	readonly listener: Listener;
	readonly capture: boolean;
}

export interface TestEventInit {
	readonly bubbles?: boolean;
	readonly cancelable?: boolean;
	readonly key?: string;
	readonly detail?: number;
	readonly button?: number;
	readonly buttons?: number;
	readonly pointerId?: number;
	readonly pointerType?: string;
	readonly isPrimary?: boolean;
	readonly clientX?: number;
	readonly clientY?: number;
	readonly altKey?: boolean;
	readonly ctrlKey?: boolean;
	readonly metaKey?: boolean;
	readonly shiftKey?: boolean;
	readonly dataTransfer?: TestDataTransfer | null;
	readonly relatedTarget?: TestNode | null;
}

/** The bit of `DataTransfer` an HTML5 reorder actually uses. */
export class TestDataTransfer {
	effectAllowed = "uninitialized";
	dropEffect = "none";
	private readonly items = new Map<string, string>();

	setData(format: string, value: string): void {
		this.items.set(format, value);
	}

	getData(format: string): string {
		return this.items.get(format) ?? "";
	}
}

export class TestEvent {
	readonly type: string;
	readonly bubbles: boolean;
	readonly cancelable: boolean;
	readonly key: string;
	readonly detail: number;
	readonly button: number;
	readonly buttons: number;
	readonly pointerId: number;
	readonly pointerType: string;
	readonly isPrimary: boolean;
	readonly clientX: number;
	readonly clientY: number;
	readonly altKey: boolean;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly shiftKey: boolean;
	readonly dataTransfer: TestDataTransfer | null;
	readonly relatedTarget: TestNode | null;
	readonly isTrusted = true;
	target: TestNode | null = null;
	currentTarget: TestNode | null = null;
	eventPhase = 0;
	defaultPrevented = false;
	private stopped = false;

	constructor(type: string, init: TestEventInit = {}) {
		this.type = type;
		this.bubbles = init.bubbles ?? true;
		this.cancelable = init.cancelable ?? true;
		this.key = init.key ?? "";
		this.detail = init.detail ?? 0;
		this.button = init.button ?? 0;
		this.buttons = init.buttons ?? 0;
		this.pointerId = init.pointerId ?? 1;
		this.pointerType = init.pointerType ?? "mouse";
		this.isPrimary = init.isPrimary ?? true;
		this.clientX = init.clientX ?? 0;
		this.clientY = init.clientY ?? 0;
		this.altKey = init.altKey ?? false;
		this.ctrlKey = init.ctrlKey ?? false;
		this.metaKey = init.metaKey ?? false;
		this.shiftKey = init.shiftKey ?? false;
		this.dataTransfer = init.dataTransfer ?? null;
		this.relatedTarget = init.relatedTarget ?? null;
	}

	preventDefault(): void {
		if (this.cancelable) this.defaultPrevented = true;
	}

	stopPropagation(): void {
		this.stopped = true;
	}

	stopImmediatePropagation(): void {
		this.stopped = true;
	}

	get propagationStopped(): boolean {
		return this.stopped;
	}

	composedPath(): TestNode[] {
		const path: TestNode[] = [];
		for (let node = this.target; node !== null; node = node.parentNode) path.push(node);
		return path;
	}
}

export class TestNode {
	readonly nodeType: number;
	readonly nodeName: string;
	ownerDocument: TestDocument;
	parentNode: TestNode | null = null;
	readonly childNodes: TestNode[] = [];
	private readonly listeners = new Map<string, ListenerEntry[]>();

	constructor(nodeType: number, nodeName: string, ownerDocument: TestDocument) {
		this.nodeType = nodeType;
		this.nodeName = nodeName;
		this.ownerDocument = ownerDocument;
	}

	get firstChild(): TestNode | null {
		return this.childNodes[0] ?? null;
	}

	get lastChild(): TestNode | null {
		return this.childNodes.at(-1) ?? null;
	}

	get nextSibling(): TestNode | null {
		const siblings = this.parentNode?.childNodes;
		if (siblings === undefined) return null;
		return siblings[siblings.indexOf(this) + 1] ?? null;
	}

	get previousSibling(): TestNode | null {
		const siblings = this.parentNode?.childNodes;
		if (siblings === undefined) return null;
		const index = siblings.indexOf(this);
		return index <= 0 ? null : (siblings[index - 1] ?? null);
	}

	get isConnected(): boolean {
		return this.nodeType === 9 || (this.parentNode?.isConnected ?? false);
	}

	appendChild<T extends TestNode>(child: T): T {
		return this.insertBefore(child, null);
	}

	insertBefore<T extends TestNode>(child: T, before: TestNode | null): T {
		child.parentNode?.removeChild(child);
		const index = before === null ? this.childNodes.length : this.childNodes.indexOf(before);
		if (index < 0) throw new Error("Reference node is not a child.");
		this.childNodes.splice(index, 0, child);
		child.parentNode = this;
		child.ownerDocument = this.ownerDocument;
		return child;
	}

	removeChild<T extends TestNode>(child: T): T {
		const index = this.childNodes.indexOf(child);
		if (index < 0) throw new Error("Node is not a child.");
		this.childNodes.splice(index, 1);
		child.parentNode = null;
		return child;
	}

	contains(node: TestNode | null): boolean {
		for (let current = node; current !== null; current = current.parentNode)
			if (current === this) return true;
		return false;
	}

	getRootNode(): TestNode {
		return this.parentNode?.getRootNode() ?? this;
	}

	addEventListener(
		type: string,
		listener: Listener,
		options?: boolean | { capture?: boolean },
	): void {
		const capture = typeof options === "boolean" ? options : (options?.capture ?? false);
		const entries = this.listeners.get(type) ?? [];
		entries.push({ listener, capture });
		this.listeners.set(type, entries);
	}

	removeEventListener(
		type: string,
		listener: Listener,
		options?: boolean | { capture?: boolean },
	): void {
		const capture = typeof options === "boolean" ? options : (options?.capture ?? false);
		const entries = this.listeners.get(type);
		if (entries === undefined) return;
		const index = entries.findIndex(
			(entry) => entry.listener === listener && entry.capture === capture,
		);
		if (index >= 0) entries.splice(index, 1);
	}

	/** Target first, root last — the order a real capture and bubble pass walks. */
	private eventPath(): TestNode[] {
		const path: TestNode[] = [this];
		for (let node = this.parentNode; node !== null; node = node.parentNode) path.push(node);
		return path;
	}

	private invoke(event: TestEvent, capture: boolean): void {
		event.currentTarget = this;
		for (const entry of Array.from(this.listeners.get(event.type) ?? [])) {
			if (entry.capture !== capture) continue;
			if (event.propagationStopped) break;
			if (typeof entry.listener === "function") entry.listener(event);
			else entry.listener.handleEvent(event);
		}
	}

	/** A real capture pass followed by a real bubble pass, as React expects. */
	dispatchEvent(event: TestEvent): boolean {
		event.target ??= this;
		const path = this.eventPath();
		for (const node of path.toReversed()) {
			if (event.propagationStopped) break;
			node.invoke(event, true);
		}
		for (const node of path) {
			if (event.propagationStopped) break;
			node.invoke(event, false);
			if (!event.bubbles) break;
		}
		event.currentTarget = null;
		return !event.defaultPrevented;
	}

	get textContent(): string {
		return this.childNodes.map((child) => child.textContent).join("");
	}

	set textContent(value: string) {
		while (this.firstChild !== null) this.removeChild(this.firstChild);
		if (value !== "") this.appendChild(this.ownerDocument.createTextNode(value));
	}
}

export class TestText extends TestNode {
	data: string;

	constructor(data: string, ownerDocument: TestDocument, nodeType = 3) {
		super(nodeType, nodeType === 8 ? "#comment" : "#text", ownerDocument);
		this.data = data;
	}

	override get textContent(): string {
		return this.data;
	}

	override set textContent(value: string) {
		this.data = value;
	}

	get nodeValue(): string {
		return this.data;
	}

	set nodeValue(value: string) {
		this.data = value;
	}
}

class TestStyle {
	readonly values = new Map<string, string>();

	setProperty(name: string, value: string): void {
		this.values.set(name, value);
	}

	removeProperty(name: string): void {
		this.values.delete(name);
	}
}

export class TestElement extends TestNode {
	readonly tagName: string;
	readonly namespaceURI = "http://www.w3.org/1999/xhtml";
	readonly style = new TestStyle();
	/** Present so React's textarea and input paths have somewhere to write. */
	value = "";
	defaultValue = "";
	private readonly attributes = new Map<string, string>();

	constructor(tagName: string, ownerDocument: TestDocument) {
		super(1, tagName.toUpperCase(), ownerDocument);
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

	hasAttribute(name: string): boolean {
		return this.attributes.has(name);
	}

	matches(): boolean {
		return false;
	}

	focus(): void {
		this.ownerDocument.activeElement = this;
	}

	blur(): void {
		if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
	}

	/** Every descendant element, in document order. */
	descendants(): TestElement[] {
		const found: TestElement[] = [];
		for (const child of this.childNodes) {
			if (!(child instanceof TestElement)) continue;
			found.push(child, ...child.descendants());
		}
		return found;
	}
}

/**
 * A textarea whose `value` reflects its `defaultValue` until something writes
 * to it, the way the DOM's dirty-value flag works. React only assigns
 * `defaultValue` for an uncontrolled field, and the component reads `value`.
 */
export class TestTextAreaElement extends TestElement {
	constructor(ownerDocument: TestDocument) {
		super("textarea", ownerDocument);
		let own: string | null = null;
		// Own accessors, not prototype ones, so React's value tracker sees an own
		// `value` property and leaves the field alone.
		Object.defineProperty(this, "value", {
			configurable: true,
			get: () => own ?? this.defaultValue,
			set: (next: string) => {
				own = String(next);
			},
		});
	}
}

export class TestDocument extends TestNode {
	readonly documentElement: TestElement;
	readonly body: TestElement;
	readonly head: TestElement;
	readonly defaultView: Record<string, unknown> = {};
	activeElement: TestElement | null = null;

	constructor() {
		super(9, "#document", null as unknown as TestDocument);
		Object.defineProperty(this, "ownerDocument", { value: this });
		this.documentElement = this.createElement("html");
		this.head = this.createElement("head");
		this.body = this.createElement("body");
		this.documentElement.appendChild(this.head);
		this.documentElement.appendChild(this.body);
		this.appendChild(this.documentElement);
	}

	createElement(tagName: string): TestElement {
		if (tagName.toLowerCase() === "textarea") return new TestTextAreaElement(this);
		return new TestElement(tagName, this);
	}

	createElementNS(_namespace: string, tagName: string): TestElement {
		return this.createElement(tagName);
	}

	createTextNode(value: string): TestText {
		return new TestText(value, this);
	}

	createComment(value: string): TestText {
		return new TestText(value, this, 8);
	}

	createDocumentFragment(): TestNode {
		return new TestNode(11, "#document-fragment", this);
	}
}

export interface InstalledDom {
	readonly document: TestDocument;
	readonly container: TestElement;
	readonly restore: () => void;
}

/**
 * A DOM small enough to read and real enough for React: capture and bubble
 * phases, focus, and drag data. The repository ships no happy-dom or jsdom, and
 * TASK-143.03 serializes root dependency edits, so the queue owner brings its
 * own rather than adding one.
 */
export function installMinimalDom(): InstalledDom {
	const document = new TestDocument();
	class TestHtmlIFrameElement extends TestElement {}
	// `HTMLElement` is TestElement itself: Base UI and floating-ui both ask
	// `element instanceof getWindow(element).HTMLElement`, and a subclass the
	// document never mints would answer no for every real element.
	const window = {
		document,
		Node: TestNode,
		Element: TestElement,
		HTMLElement: TestElement,
		HTMLTextAreaElement: TestTextAreaElement,
		HTMLIFrameElement: TestHtmlIFrameElement,
		Event: TestEvent,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		getComputedStyle: () => ({}),
		navigator: { userAgent: "archboard-test" },
	};
	Object.assign(document.defaultView, window);
	const container = document.createElement("div");
	document.body.appendChild(container);
	const previous = new Map<string, PropertyDescriptor | undefined>();
	const globals: Record<string, unknown> = {
		document,
		window,
		Node: TestNode,
		Element: TestElement,
		HTMLElement: TestElement,
		HTMLTextAreaElement: TestTextAreaElement,
		IS_REACT_ACT_ENVIRONMENT: true,
	};
	for (const [name, value] of Object.entries(globals)) {
		previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
	}
	return {
		document,
		container,
		restore: () => {
			for (const [name, descriptor] of previous) {
				if (descriptor === undefined) delete (globalThis as Record<string, unknown>)[name];
				else Object.defineProperty(globalThis, name, descriptor);
			}
		},
	};
}

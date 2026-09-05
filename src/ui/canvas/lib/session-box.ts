// What the pane core reads live between renders: the latest options,
// Excalidraw's API once it has mounted, and the element the canvas fills.
// Never rendered from, so it is a plain box rather than React state.

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import type { CanvasSessionOptions } from "@/ui/canvas/lib/session-contracts";
import type { WorkbenchTransportPort } from "@/ui/canvas/workbench-port";

/** The mutable box behind one session. */
class SessionBox<Transport extends WorkbenchTransportPort> {
	#options: CanvasSessionOptions<Transport>;
	#api: ExcalidrawImperativeAPI | null = null;
	#paneElement: HTMLElement | null = null;
	#observer: ResizeObserver | null = null;

	/**
	 * Start with the options the session mounted with.
	 * @param options The initial options.
	 */
	constructor(options: CanvasSessionOptions<Transport>) {
		this.#options = options;
	}

	/**
	 * The latest options.
	 * @returns The options.
	 */
	get options(): CanvasSessionOptions<Transport> {
		return this.#options;
	}

	/**
	 * Excalidraw's API once mounted.
	 * @returns The API, or null.
	 */
	get api(): ExcalidrawImperativeAPI | null {
		return this.#api;
	}

	/**
	 * The element the canvas fills.
	 * @returns The element, or null.
	 */
	get paneElement(): HTMLElement | null {
		return this.#paneElement;
	}

	/**
	 * The options changed.
	 * @param options The latest options.
	 */
	setOptions(options: CanvasSessionOptions<Transport>): void {
		this.#options = options;
	}

	/**
	 * Excalidraw mounted.
	 * @param api Its API.
	 */
	setApi(api: ExcalidrawImperativeAPI): void {
		this.#api = api;
	}

	/**
	 * Watch the element the canvas fills, so the pane can report its real size.
	 * @param element The element, or null when the canvas unmounts.
	 * @param onResize What to do when it resizes.
	 * @returns Whether the element changed.
	 */
	watch(element: HTMLElement | null, onResize: () => void): boolean {
		if (this.#paneElement === element) {
			return false;
		}
		this.#observer?.disconnect();
		this.#observer = null;
		this.#paneElement = element;
		if (element && typeof ResizeObserver !== "undefined") {
			const observer = new ResizeObserver(onResize);
			observer.observe(element);
			this.#observer = observer;
		}
		return true;
	}

	/** Stop watching the element. */
	unwatch(): void {
		this.#observer?.disconnect();
		this.#observer = null;
	}
}

export { SessionBox };

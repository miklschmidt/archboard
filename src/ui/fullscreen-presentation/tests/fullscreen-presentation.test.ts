import { expect, test } from "bun:test";

import { createFullscreenPresentation } from "@/ui/fullscreen-presentation";

/** A promise settled from outside. */
interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: Error) => void;
}

/** A settler that has not been captured yet. */
function unsettled(): void {
	// Replaced by the promise's own settlers before anyone can call it.
}

/**
 * A promise and its settlers.
 * @returns The deferred.
 */
function deferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = unsettled;
	let reject: (error: Error) => void = unsettled;
	const promise = new Promise<T>((accept, refuse) => {
		resolve = accept;
		reject = refuse;
	});
	return { promise, resolve, reject };
}

/** Let microtasks settle. */
async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

/** A document whose fullscreen the test drives by hand. */
class FullscreenDocumentFake extends EventTarget {
	fullscreenElement: Element | null = null;
	exitCalls = 0;
	listenerAdds = 0;
	listenerRemoves = 0;
	exitResults: Promise<void>[] = [];

	/**
	 * Count fullscreen listeners as they are added.
	 * @param args The listener arguments.
	 */
	override addEventListener(...args: Parameters<EventTarget["addEventListener"]>): void {
		if (args[0] === "fullscreenchange") {
			this.listenerAdds += 1;
		}
		super.addEventListener(...args);
	}

	/**
	 * Count fullscreen listeners as they are removed.
	 * @param args The listener arguments.
	 */
	override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>): void {
		if (args[0] === "fullscreenchange") {
			this.listenerRemoves += 1;
		}
		super.removeEventListener(...args);
	}

	/**
	 * The browser is asked to leave fullscreen.
	 * @returns The scripted outcome, or success.
	 */
	exitFullscreen(): Promise<void> {
		this.exitCalls += 1;
		return this.exitResults.shift() ?? Promise.resolve();
	}

	/**
	 * The browser granted fullscreen to a root.
	 * @param root The root.
	 */
	enter(root: FullscreenRootFake): void {
		this.fullscreenElement = root.asElement();
		this.dispatchEvent(new Event("fullscreenchange"));
	}

	/** The browser left fullscreen. */
	lose(): void {
		this.fullscreenElement = null;
		this.dispatchEvent(new Event("fullscreenchange"));
	}
}

/** A root element whose fullscreen requests the test scripts. */
class FullscreenRootFake {
	isConnected = true;
	requestCalls = 0;
	requestResults: Promise<void>[] = [];
	readonly ownerDocument: FullscreenDocumentFake;

	/**
	 * A root in a document.
	 * @param ownerDocument The document.
	 */
	constructor(ownerDocument = new FullscreenDocumentFake()) {
		this.ownerDocument = ownerDocument;
	}

	/**
	 * The browser is asked for fullscreen.
	 * @returns The scripted outcome, or success.
	 */
	requestFullscreen(): Promise<void> {
		this.requestCalls += 1;
		return this.requestResults.shift() ?? Promise.resolve();
	}

	/**
	 * This fake as the element the presentation is given.
	 * @returns The fake, typed as an element.
	 */
	asElement(): HTMLElement {
		// The presentation reads only ownerDocument, isConnected and requestFullscreen.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion
		return this as unknown as HTMLElement;
	}
}

/**
 * A document, a root in it and a presentation over the root.
 * @returns The fixture.
 */
function createFixture(): {
	document: FullscreenDocumentFake;
	root: FullscreenRootFake;
	presentation: ReturnType<typeof createFullscreenPresentation>;
} {
	const document = new FullscreenDocumentFake();
	const root = new FullscreenRootFake(document);
	return { document, root, presentation: createFullscreenPresentation(root.asElement()) };
}

test("Present requests fullscreen synchronously and transfers one owned root", async () => {
	const { document, root, presentation } = createFixture();
	presentation.present("pane-1");
	expect(root.requestCalls).toBe(1);
	expect(presentation.getSnapshot()).toEqual({ paneId: null, error: null });
	document.enter(root);
	await settle();
	expect(presentation.getSnapshot()).toEqual({ paneId: "pane-1", error: null });

	presentation.present("pane-2");
	expect(root.requestCalls).toBe(1);
	expect(presentation.getSnapshot()).toEqual({ paneId: "pane-2", error: null });
	presentation.dispose();
});

test("overlapping requests publish only the latest pane", async () => {
	const { document, root, presentation } = createFixture();
	const first = deferred<void>();
	const second = deferred<void>();
	root.requestResults.push(first.promise, second.promise);
	presentation.present("pane-1");
	presentation.present("pane-2");
	expect(root.requestCalls).toBe(2);
	document.enter(root);
	first.resolve();
	second.resolve();
	await settle();
	expect(presentation.getSnapshot()).toEqual({ paneId: "pane-2", error: null });
	presentation.dispose();
});

test("pending-entry removal retargets synchronously and cancels before success", async () => {
	const { document, root, presentation } = createFixture();
	const first = deferred<void>();
	const second = deferred<void>();
	root.requestResults.push(first.promise, second.promise);
	presentation.present("pane-1");
	expect(presentation.getTargetPaneId()).toBe("pane-1");
	presentation.present("pane-2");
	expect(presentation.getTargetPaneId()).toBe("pane-2");
	presentation.exit();
	expect(presentation.getTargetPaneId()).toBeNull();
	document.fullscreenElement = root.asElement();
	first.resolve();
	second.resolve();
	await settle();
	expect(document.exitCalls).toBeGreaterThanOrEqual(1);
	expect(presentation.getSnapshot()).toEqual({ paneId: null, error: null });
	presentation.dispose();
});

test("same-root transfer removal retargets before subscriber work", async () => {
	const { document, root, presentation } = createFixture();
	presentation.present("pane-1");
	document.enter(root);
	await settle();
	presentation.present("pane-2");
	expect(presentation.getTargetPaneId()).toBe("pane-2");
	presentation.present("pane-1");
	expect(presentation.getTargetPaneId()).toBe("pane-1");
	presentation.exit();
	expect(presentation.getTargetPaneId()).toBe("pane-1");
	document.lose();
	expect(presentation.getTargetPaneId()).toBeNull();
	expect(presentation.getSnapshot()).toEqual({ paneId: null, error: null });
	presentation.dispose();
});

test("Escape during pending entry invalidates a later stale success", async () => {
	const { document, root, presentation } = createFixture();
	const request = deferred<void>();
	root.requestResults.push(request.promise);
	presentation.present("pane-1");
	document.lose();
	document.fullscreenElement = root.asElement();
	request.resolve();
	await settle();
	expect(document.exitCalls).toBe(1);
	expect(presentation.getSnapshot()).toEqual({ paneId: null, error: null });
	presentation.dispose();
});

test("a stale success exits after the newer request was refused", async () => {
	const { document, root, presentation } = createFixture();
	const first = deferred<void>();
	const second = deferred<void>();
	root.requestResults.push(first.promise, second.promise);
	presentation.present("pane-1");
	presentation.present("pane-2");
	second.reject(new Error("permission denied"));
	await settle();
	expect(presentation.getSnapshot().error).toContain("permission denied");
	document.fullscreenElement = root.asElement();
	first.resolve();
	await settle();
	expect(document.exitCalls).toBe(1);
	expect(presentation.getSnapshot().paneId).toBeNull();
	presentation.dispose();
});

test("entry refusal is recoverable and browser loss clears presentation", async () => {
	const { document, root, presentation } = createFixture();
	root.requestResults.push(Promise.reject(new Error("not allowed")));
	presentation.present("pane-1");
	await settle();
	expect(presentation.getSnapshot()).toEqual({
		paneId: null,
		error: "Could not start presentation: not allowed. Try Present again.",
	});
	presentation.clearError();
	expect(presentation.getSnapshot()).toEqual({ paneId: null, error: null });
	presentation.present("pane-1");
	document.enter(root);
	await settle();
	document.lose();
	expect(presentation.getSnapshot()).toEqual({ paneId: null, error: null });
	presentation.dispose();
});

test("exit refusal stays visible while this root still owns fullscreen", async () => {
	const { document, root, presentation } = createFixture();
	presentation.present("pane-1");
	document.enter(root);
	await settle();
	document.exitResults.push(Promise.reject(new Error("exit blocked")));
	presentation.exit();
	await settle();
	expect(presentation.getSnapshot()).toEqual({
		paneId: "pane-1",
		error: "Could not exit presentation: exit blocked. Use Exit again or press Escape.",
	});
	presentation.dispose();
});

test("browser-driven loss wins over a later exit rejection", async () => {
	const { document, root, presentation } = createFixture();
	presentation.present("pane-1");
	document.enter(root);
	await settle();
	const exit = deferred<void>();
	document.exitResults.push(exit.promise);
	presentation.exit();
	document.lose();
	exit.reject(new Error("late refusal"));
	await settle();
	expect(presentation.getSnapshot()).toEqual({ paneId: null, error: null });
	presentation.dispose();
});

test("root removal clears state and exits only this root", async () => {
	const { document, root, presentation } = createFixture();
	presentation.present("pane-1");
	document.enter(root);
	await settle();
	root.isConnected = false;
	presentation.rootRemoved();
	expect(document.exitCalls).toBe(1);
	expect(presentation.getSnapshot()).toEqual({ paneId: null, error: null });
	presentation.dispose();

	const nextRoot = new FullscreenRootFake(document);
	const next = createFullscreenPresentation(nextRoot.asElement());
	document.fullscreenElement = new FullscreenRootFake(document).asElement();
	next.rootRemoved();
	expect(document.exitCalls).toBe(1);
	next.dispose();
});

test("disposal is StrictMode-safe and invalidates pending work", async () => {
	const document = new FullscreenDocumentFake();
	const firstRoot = new FullscreenRootFake(document);
	const pending = deferred<void>();
	firstRoot.requestResults.push(pending.promise);
	const first = createFullscreenPresentation(firstRoot.asElement());
	let notifications = 0;
	first.subscribe(() => {
		notifications += 1;
	});
	first.present("pane-1");
	first.dispose();
	document.fullscreenElement = firstRoot.asElement();
	pending.resolve();
	await settle();
	expect(document.exitCalls).toBe(0);
	expect(notifications).toBe(0);
	expect(document.listenerAdds).toBe(1);
	expect(document.listenerRemoves).toBe(1);

	document.fullscreenElement = null;
	const nextRoot = new FullscreenRootFake(document);
	const next = createFullscreenPresentation(nextRoot.asElement());
	next.present("pane-2");
	document.enter(nextRoot);
	expect(next.getSnapshot()).toEqual({ paneId: "pane-2", error: null });
	next.dispose();
	expect(document.listenerAdds).toBe(2);
	expect(document.listenerRemoves).toBe(2);
});

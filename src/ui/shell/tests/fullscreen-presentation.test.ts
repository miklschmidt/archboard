import { expect, test } from "bun:test";

import { createFullscreenPresentation } from "../fullscreen-presentation";

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value?: T): void;
	reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value?: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((accept, refuse) => {
		resolve = accept as (value?: T) => void;
		reject = refuse;
	});
	return { promise, resolve, reject };
}

async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

class FullscreenDocumentFake extends EventTarget {
	fullscreenElement: Element | null = null;
	exitCalls = 0;
	listenerAdds = 0;
	listenerRemoves = 0;
	exitResults: Array<Promise<void>> = [];

	override addEventListener(...args: Parameters<EventTarget["addEventListener"]>): void {
		if (args[0] === "fullscreenchange") this.listenerAdds += 1;
		super.addEventListener(...args);
	}

	override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>): void {
		if (args[0] === "fullscreenchange") this.listenerRemoves += 1;
		super.removeEventListener(...args);
	}

	exitFullscreen = (): Promise<void> => {
		this.exitCalls += 1;
		return this.exitResults.shift() ?? Promise.resolve();
	};

	enter(root: FullscreenRootFake): void {
		this.fullscreenElement = root as unknown as Element;
		this.dispatchEvent(new Event("fullscreenchange"));
	}

	lose(): void {
		this.fullscreenElement = null;
		this.dispatchEvent(new Event("fullscreenchange"));
	}
}

class FullscreenRootFake {
	isConnected = true;
	requestCalls = 0;
	requestResults: Array<Promise<void>> = [];
	readonly ownerDocument: FullscreenDocumentFake;

	constructor(ownerDocument = new FullscreenDocumentFake()) {
		this.ownerDocument = ownerDocument;
	}

	requestFullscreen = (): Promise<void> => {
		this.requestCalls += 1;
		return this.requestResults.shift() ?? Promise.resolve();
	};
}

function createFixture(): {
	document: FullscreenDocumentFake;
	root: FullscreenRootFake;
	presentation: ReturnType<typeof createFullscreenPresentation>;
} {
	const document = new FullscreenDocumentFake();
	const root = new FullscreenRootFake(document);
	return {
		document,
		root,
		presentation: createFullscreenPresentation(root as unknown as HTMLElement),
	};
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
	document.fullscreenElement = root as unknown as Element;
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
	document.fullscreenElement = root as unknown as Element;
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
	document.fullscreenElement = root as unknown as Element;
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
	const next = createFullscreenPresentation(nextRoot as unknown as HTMLElement);
	document.fullscreenElement = {} as Element;
	next.rootRemoved();
	expect(document.exitCalls).toBe(1);
	next.dispose();
});

test("disposal is StrictMode-safe and invalidates pending work", async () => {
	const document = new FullscreenDocumentFake();
	const firstRoot = new FullscreenRootFake(document);
	const pending = deferred<void>();
	firstRoot.requestResults.push(pending.promise);
	const first = createFullscreenPresentation(firstRoot as unknown as HTMLElement);
	let notifications = 0;
	first.subscribe(() => (notifications += 1));
	first.present("pane-1");
	first.dispose();
	document.fullscreenElement = firstRoot as unknown as Element;
	pending.resolve();
	await settle();
	expect(document.exitCalls).toBe(0);
	expect(notifications).toBe(0);
	expect(document.listenerAdds).toBe(1);
	expect(document.listenerRemoves).toBe(1);

	document.fullscreenElement = null;
	const nextRoot = new FullscreenRootFake(document);
	const next = createFullscreenPresentation(nextRoot as unknown as HTMLElement);
	next.present("pane-2");
	document.enter(nextRoot);
	expect(next.getSnapshot()).toEqual({ paneId: "pane-2", error: null });
	next.dispose();
	expect(document.listenerAdds).toBe(2);
	expect(document.listenerRemoves).toBe(2);
});

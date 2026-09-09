// A canvas server for the cache tests: it answers the three board endpoints
// over the real fetch boundary, counts what was asked for, and can refuse an
// endpoint or hold one answer back. Private support for this module's tests.

import type { MountedPreviewSnapshot } from "@/ui/board-preview";
import type { BoardIdentity } from "@/ui/types";

/** An answer held back until the test releases it. */
interface HeldAnswer {
	/** Let the request that is waiting complete. */
	readonly answer: () => void;
}

/** One held answer and the promise the request waits on. */
interface Latch {
	readonly waited: Promise<void>;
	readonly release: () => void;
}

/** The canvas server as these tests need it. */
interface FakeServer {
	/**
	 * How many times an endpoint was asked.
	 * @param path The endpoint path.
	 * @returns The count.
	 */
	readonly reads: (path: string) => number;
	/**
	 * Refuse an endpoint until it is recovered.
	 * @param path The endpoint path.
	 * @param message What the server says went wrong.
	 */
	readonly fail: (path: string, message: string) => void;
	/**
	 * Answer an endpoint normally again.
	 * @param path The endpoint path.
	 */
	readonly recover: (path: string) => void;
	/**
	 * Hold the next answer from an endpoint back until it is released.
	 * @param path The endpoint path.
	 * @returns The release.
	 */
	readonly defer: (path: string) => HeldAnswer;
	/**
	 * Add a board to the vault.
	 * @param name The board's name.
	 */
	readonly addBoard: (name: string) => void;
	/** Change what the previewed board looks like. */
	readonly redrawBoard: () => void;
	/** Put the real fetch back. */
	readonly restore: () => void;
}

/**
 * The identity a plain board name spells.
 * @param name The board's name.
 * @returns Its identity.
 */
function identityOf(name: string): BoardIdentity {
	return { board: name, variant: "current" };
}

/**
 * A mounted scene for one board, as a pane would report it.
 * @param board The board key.
 * @returns The snapshot.
 */
function mountedScene(board: string): MountedPreviewSnapshot {
	return { kind: "mounted", board, fingerprint: "mounted", elements: [], files: {} };
}

/** Nothing is waiting yet; the promise executor replaces this at once. */
function releaseNothing(): void {
	// Intentionally empty.
}

/**
 * A promise and the function that resolves it.
 * @returns The latch.
 */
function latch(): Latch {
	let resolveWaited: () => void = releaseNothing;
	const waited = new Promise<void>((resolve) => {
		resolveWaited = resolve;
	});
	/** Let the request that is waiting answer. */
	function release(): void {
		resolveWaited();
	}
	return { waited, release };
}

/** The state one fake server holds. */
interface ServerState {
	boards: string[];
	previewGeneration: number;
	/** Whether the open board is scratch: a note nobody has named. */
	unnamed: boolean;
	readonly counts: Map<string, number>;
	readonly failures: Map<string, string>;
	readonly held: Map<string, Latch>;
}

/**
 * What one endpoint answers with.
 * @param path The endpoint path.
 * @param state The server's state.
 * @returns The body.
 */
function bodyFor(path: string, state: ServerState): Record<string, unknown> {
	if (path === "/api/boards") {
		return {
			vault: "/vault",
			boards: state.boards.map((name) => ({ key: name, identity: identityOf(name) })),
		};
	}
	if (path === "/api/panes") {
		const pane = { paneId: "A", place: "left", board: "Draft", elementCount: 1 };
		return { panes: [{ ...pane, identity: identityOf("Draft") }] };
	}
	if (path === "/api/boards/info") {
		return {
			success: true,
			board: "Draft",
			identity: identityOf("Draft"),
			elementCount: 1,
			placeholder: state.unnamed,
		};
	}
	return {
		success: true,
		board: "Checkout",
		fingerprint: `server-${state.previewGeneration}`,
		elements: [],
		files: {},
	};
}

/**
 * The answer to one request.
 * @param path The endpoint path.
 * @param state The server's state.
 * @returns The response.
 */
function answerFor(path: string, state: ServerState): Response {
	const failure = state.failures.get(path);
	if (failure !== undefined) {
		return new Response(JSON.stringify({ success: false, error: failure }), { status: 500 });
	}
	return new Response(JSON.stringify(bodyFor(path, state)), { status: 200 });
}

/**
 * Wait, when this request is the one whose answer is being held back.
 * @param path The endpoint path.
 * @param state The server's state.
 * @returns Settles when the request may answer.
 */
async function waitForRelease(path: string, state: ServerState): Promise<void> {
	const held = state.held.get(path);
	if (held === undefined) {
		return;
	}
	state.held.delete(path);
	await held.waited;
}

/**
 * The path of a request, however it was addressed.
 * @param input What was requested.
 * @returns The endpoint path.
 */
function pathOf(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return new URL(input, "http://canvas.test").pathname;
	}
	return new URL(input instanceof URL ? input.href : input.url, "http://canvas.test").pathname;
}

/**
 * A canvas server that answers the board endpoints, installed over global
 * fetch for the life of one test.
 * @returns The server.
 */
function fakeServer(): FakeServer {
	const real = globalThis.fetch;
	const state: ServerState = {
		boards: ["Checkout"],
		previewGeneration: 1,
		unnamed: true,
		counts: new Map(),
		failures: new Map(),
		held: new Map(),
	};
	/**
	 * Answer one request.
	 * @param input What was requested.
	 * @returns The response.
	 */
	async function serve(input: RequestInfo | URL): Promise<Response> {
		const path = pathOf(input);
		state.counts.set(path, (state.counts.get(path) ?? 0) + 1);
		// Answered from the state the server had when it was asked, as a real one
		// would. Only the delivery is held back, so a request that is still on the
		// wire when something changes still carries the older answer.
		const answer = answerFor(path, state);
		await waitForRelease(path, state);
		return answer;
	}
	Object.defineProperty(globalThis, "fetch", { value: serve, writable: true, configurable: true });
	return {
		/**
		 * How many times an endpoint was asked.
		 * @param path The endpoint path.
		 * @returns The count.
		 */
		reads: (path: string): number => state.counts.get(path) ?? 0,
		/**
		 * Refuse an endpoint.
		 * @param path The endpoint path.
		 * @param message What went wrong.
		 */
		fail: (path: string, message: string): void => {
			state.failures.set(path, message);
		},
		/**
		 * Answer an endpoint normally again.
		 * @param path The endpoint path.
		 */
		recover: (path: string): void => {
			state.failures.delete(path);
		},
		/**
		 * Hold the next answer from an endpoint back.
		 * @param path The endpoint path.
		 * @returns The release.
		 */
		defer: (path: string): HeldAnswer => {
			const held = latch();
			state.held.set(path, held);
			return { answer: held.release };
		},
		/**
		 * Add a board to the vault.
		 * @param name The board's name.
		 */
		addBoard: (name: string): void => {
			state.boards = [...state.boards, name];
		},
		/** Change what the previewed board looks like. */
		redrawBoard: (): void => {
			state.previewGeneration += 1;
		},
		/** Put the real fetch back. */
		restore: (): void => {
			Object.defineProperty(globalThis, "fetch", {
				value: real,
				writable: true,
				configurable: true,
			});
		},
	};
}

export { fakeServer, mountedScene, type FakeServer, type HeldAnswer };

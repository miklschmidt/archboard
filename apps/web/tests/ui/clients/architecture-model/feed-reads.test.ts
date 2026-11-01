// The feed reports revisions, and a reader reads only when the revision moved.
// A focus, a mount of cached data and a returning socket read nothing.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import type { ArchitectureFeedFrame } from "@archboard/board/model";

GlobalRegistrator.register({ url: "http://127.0.0.1:3000/" });

const { QueryClient, QueryObserver, focusManager } = await import("@tanstack/react-query");
const { waitFor } = await import("@testing-library/react");
const { architectureFeed } = await import("#ui/clients/architecture-model/events.ts");
const { architectureCheckpointsQuery, architectureModelQuery } =
	await import("#ui/clients/architecture-model/queries.ts");
const { vaultCheckQuery } = await import("#ui/clients/semantic-board-canvas/reads/queries.ts");
const { readBoardsFrom } = await import("#ui/clients/semantic-board-canvas/reads/board-reads.ts");

const VAULT = "/work/shop/.archboard/vault";
const OLD = "a".repeat(64);
const NEW = "b".repeat(64);
const claims = { success: true as const, claims: [] };
const sockets: FeedSocket[] = [];
const reads: string[] = [];
let served = OLD;

/** The tab's one controlled socket. */
class FeedSocket extends EventTarget {
	static readonly OPEN = 1;
	readonly readyState = FeedSocket.OPEN;
	/** Open at once, as a local server does. */
	constructor() {
		super();
		sockets.push(this);
		queueMicrotask(() => this.dispatchEvent(new Event("open")));
	}
	/** The server answers through `hear`. */
	send(): void {}
	/** Close as the browser does. */
	close(): void {
		this.dispatchEvent(new Event("close"));
	}
}
const realSocket = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
Object.defineProperty(globalThis, "WebSocket", { value: FeedSocket, configurable: true });
const realFetch = globalThis.fetch;

/**
 * Count each read and answer with the revision the server holds.
 * @param input The request.
 * @returns A minimal coherent model.
 */
async function answer(input: Parameters<typeof fetch>[0]): Promise<Response> {
	const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
	reads.push(url.pathname);
	if (url.pathname.endsWith("/checkpoints/rows"))
		return Response.json({ success: true, checkpoints: [] });
	return Response.json({
		success: true,
		manifest: { schemaVersion: 1, id: "Shop", name: "Shop", current: null },
		policy: {
			levels: [],
			groups: {},
			nodeKinds: { service: { name: "Service", icon: "RiServerLine" } },
			relationshipKinds: { calls: { name: "Calls", dash: "solid", arrowhead: "filled" } },
		},
		modules: [],
		collections: [],
		walkthroughs: [],
		relationships: [],
		roots: [],
		selectedState: null,
		proposals: [],
		revision: { digest: served, files: [] },
	});
}
globalThis.fetch = Object.assign(answer, { preconnect: realFetch.preconnect });

readBoardsFrom({
	/**
	 * No board is listed here.
	 * @returns No boards.
	 */
	listing: async () => ({ levels: [], boards: [] }),
	/**
	 * No board is read here.
	 * @returns Nothing.
	 */
	document: async () => undefined,
	/**
	 * No findings.
	 * @returns No readings.
	 */
	codeFindings: async () => ({ readings: [] }),
	/**
	 * Count a vault check, which refuses, because only the read matters here.
	 * @throws {Error} Always.
	 */
	vaultCheck: async () => {
		reads.push("vault-check");
		throw new Error("no checker");
	},
});

/**
 * Deliver one frame of the feed.
 * @param frame The frame.
 */
function hear(frame: ArchitectureFeedFrame): void {
	sockets.at(-1)!.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) }));
}

/**
 * Report a revision as a subscription does.
 * @param digest The revision.
 */
function snapshot(digest: string): void {
	const reading = { success: true, manifest: { id: "Shop", name: "Shop" }, digest } as const;
	hear({ type: "architecture_snapshot", vault: VAULT, reading, claims });
}

/** Let the feed's queued work finish. */
async function settled(): Promise<void> {
	await Bun.sleep(20);
}

afterEach(() => {
	reads.length = 0;
	sockets.length = 0;
	served = OLD;
	focusManager.setFocused(undefined);
});
afterAll(async () => {
	globalThis.fetch = realFetch;
	if (realSocket) Object.defineProperty(globalThis, "WebSocket", realSocket);
	await GlobalRegistrator.unregister();
});

/**
 * Open a followed reading.
 * @returns The cache, and how to close the reader.
 */
async function openReader() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const stopFeed = architectureFeed(client, VAULT).subscribe(() => {});
	const stopReading = new QueryObserver(client, architectureModelQuery(VAULT)).subscribe(() => {});
	await waitFor(() =>
		expect(client.getQueryData(architectureModelQuery(VAULT).queryKey)).toBeDefined(),
	);
	expect(reads).toEqual(["/api/architecture/model"]);
	/** Close the reader and its feed. */
	const close = (): void => {
		stopReading();
		stopFeed();
	};
	return { client, close };
}

test("a subscription that names the held revision reads nothing, and neither does a focus", async () => {
	const { close } = await openReader();
	snapshot(OLD);
	await settled();
	focusManager.setFocused(false);
	focusManager.setFocused(true);
	await settled();
	expect(reads).toEqual(["/api/architecture/model"]);
	close();
});

test("a snapshot of another revision reads the open reading again", async () => {
	const { client, close } = await openReader();
	served = NEW;
	snapshot(NEW);
	await waitFor(() => expect(reads).toHaveLength(2));
	await waitFor(() =>
		expect(
			client.getQueryData<{ revision: { digest: string } }>(architectureModelQuery(VAULT).queryKey)
				?.revision.digest,
		).toBe(NEW),
	);
	close();
});

test("a change marks the vault check stale without a timer", async () => {
	const { client, close } = await openReader();
	const stopCheck = new QueryObserver(client, vaultCheckQuery(VAULT)).subscribe(() => {});
	await waitFor(() => expect(reads).toContain("vault-check"));
	reads.length = 0;
	served = NEW;
	hear({
		type: "architecture_changed",
		vault: VAULT,
		model: "Shop",
		name: "Shop",
		state: null,
		revision: { digest: NEW, files: [] },
		subjects: [],
		reason: "external",
	});
	await waitFor(() => expect(reads.toSorted()).toEqual(["/api/architecture/model", "vault-check"]));
	stopCheck();
	close();
});

test("checkpoint rows wait for a request and then follow completions", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const rows = new QueryObserver(client, architectureCheckpointsQuery(VAULT));
	const stop = rows.subscribe(() => {});
	await settled();
	expect(reads).toEqual([]);
	await rows.refetch();
	expect(reads).toEqual(["/api/architecture/checkpoints/rows"]);
	await client.invalidateQueries({ queryKey: architectureCheckpointsQuery(VAULT).queryKey });
	await waitFor(() => expect(reads).toHaveLength(2));
	stop();
});

// Repository discovery reads no model: the event feed reports each vault's summary.
import { ArchitectureFeedRequestSchema } from "@archboard/board/model";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import type { ReactNode } from "react";
import type { ArchitectureFeedFrame } from "@archboard/board/model";

GlobalRegistrator.register({ url: "http://127.0.0.1:3000/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

const { act, cleanup, renderHook, waitFor } = await import("@testing-library/react");
const { createElement } = await import("react");
const { BoardCatalogProvider } =
	await import("#ui/components/board-catalog/BoardCatalogProvider.tsx");
const { useModelCatalog } = await import("#ui/hooks/architecture-model/use-model-catalog.ts");

const SHOP = "/work/shop/.archboard/vault";
const BILLING = "/work/billing/.archboard/vault";
const REPOSITORIES = {
	success: true,
	served: SHOP,
	repositories: [
		{ name: "github.com/acme/shop", untracked: false, vault: SHOP, state: "ready", checkouts: [] },
		{
			name: "github.com/acme/billing",
			untracked: false,
			vault: BILLING,
			state: "ready",
			checkouts: [],
		},
		{ name: "github.com/acme/gone", untracked: false, vault: null, state: "gone", checkouts: [] },
		{
			name: "github.com/acme/unchosen",
			untracked: false,
			vault: null,
			state: "unchosen",
			checkouts: [],
		},
	],
};
type Summary = Extract<ArchitectureFeedFrame, { type: "architecture_snapshot" }>["reading"];

const SHOP_SUMMARY: Summary = {
	success: true,
	manifest: { id: "Shop", name: "Shop" },
	digest: "a".repeat(64),
};
const BUSY: Extract<Summary, { success: false }> = {
	success: false,
	code: "MODEL_BUSY",
	error: "The current architecture is unavailable during installation.",
	diagnostics: [{ code: "MODEL_BUSY", file: ".", message: "Busy.", recovery: "Retry." }],
};
const LEGACY: Extract<Summary, { success: false }> = {
	success: false,
	code: "LEGACY_AUTHORITY",
	error: "Explicit migration is required.",
	diagnostics: [
		{
			code: "LEGACY_AUTHORITY",
			file: BILLING,
			message: "Legacy inputs remain.",
			recovery: "Plan migration.",
		},
	],
};
const read: string[] = [];
let repositoriesRefused = false;
const followed = new Set<string>();
const sockets: ModelSocket[] = [];

/** Controlled tab socket for the architecture event protocol. */
class ModelSocket extends EventTarget {
	static readonly OPEN = 1;
	readonly readyState = ModelSocket.OPEN;
	/** Open at once, as a local server does. */
	constructor() {
		super();
		sockets.push(this);
		queueMicrotask(() => this.dispatchEvent(new Event("open")));
	}
	/**
	 * Keep the vaults the production subscriber follows.
	 * @param frame One request.
	 */
	send(frame: string): void {
		const { type, vault } = ArchitectureFeedRequestSchema.parse(JSON.parse(frame));
		if (type === "subscribe") followed.add(vault);
		else followed.delete(vault);
	}
	/** Close as the browser does. */
	close(): void {
		this.dispatchEvent(new Event("close"));
	}
}
const realSocket = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
Object.defineProperty(globalThis, "WebSocket", { value: ModelSocket, configurable: true });
const realFetch = globalThis.fetch;

/**
 * Answer actual discovery and model HTTP requests.
 * @param input The requested resource.
 * @returns Its public response.
 */
async function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const asked = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
	if (asked.pathname === "/api/repositories") {
		return repositoriesRefused
			? Response.json(
					{ success: false, error: "Repository discovery is unavailable." },
					{ status: 500 },
				)
			: Response.json(REPOSITORIES);
	}
	if (asked.pathname === "/api/architecture/model") read.push(asked.searchParams.get("vault")!);
	throw new Error(`Unexpected route: ${asked.pathname}`);
}
globalThis.fetch = Object.assign(fakeFetch, { preconnect: realFetch.preconnect });

/**
 * Use the same query lifetime as the application.
 * @param props The mounted consumer.
 * @param props.children The consumer.
 * @returns Its cache provider.
 */
function Provided(props: { children: ReactNode }): ReactNode {
	return createElement(BoardCatalogProvider, null, props.children);
}

afterEach(() => {
	cleanup();
	read.length = 0;
	followed.clear();
	sockets.length = 0;
	repositoriesRefused = false;
});
afterAll(async () => {
	globalThis.fetch = realFetch;
	if (realSocket) Object.defineProperty(globalThis, "WebSocket", realSocket);
	else Reflect.deleteProperty(globalThis, "WebSocket");
	await GlobalRegistrator.unregister();
});

/**
 * Report a vault as the server does when a tab subscribes, or a change of it.
 * @param frame The architecture event.
 */
async function hear(frame: ArchitectureFeedFrame): Promise<void> {
	await act(async () => {
		sockets[0]!.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) }));
	});
}

test("each readable repository takes its model or migration requirement from the feed and reads no model", async () => {
	const { result } = renderHook(() => useModelCatalog(), { wrapper: Provided });
	await waitFor(() => expect([...followed].toSorted()).toEqual([BILLING, SHOP]));
	expect(sockets).toHaveLength(1);
	expect(result.current.repositories.map((each) => each.loading)).toEqual([
		true,
		true,
		false,
		false,
	]);
	const claims = { success: true as const, claims: [] };
	await hear({ type: "architecture_snapshot", vault: SHOP, reading: SHOP_SUMMARY, claims });
	await hear({ type: "architecture_snapshot", vault: BILLING, reading: LEGACY, claims });
	await waitFor(() =>
		expect(
			result.current.repositories.map((each) => ({
				model: each.model?.name ?? null,
				migration: each.migrationRequired,
				failed: each.error !== null,
				loading: each.loading,
			})),
		).toEqual([
			{ model: "Shop", migration: false, failed: false, loading: false },
			{ model: null, migration: true, failed: false, loading: false },
			{ model: null, migration: false, failed: false, loading: false },
			{ model: null, migration: false, failed: false, loading: false },
		]),
	);
	await hear({
		type: "architecture_changed",
		vault: SHOP,
		model: "Shop",
		name: "Renamed shop",
		state: null,
		revision: { digest: "b".repeat(64), files: [] },
		subjects: [],
		reason: "external",
	});
	await waitFor(() => expect(result.current.repositories[0]?.model?.name).toBe("Renamed shop"));
	await hear({ type: "architecture_status", vault: SHOP, reading: BUSY });
	await waitFor(() => expect(result.current.repositories[0]?.error).toBe(BUSY.error));
	expect(result.current.repositories[0]?.model?.name).toBe("Renamed shop");
	expect(read).toEqual([]);
});

test("a failed repository discovery remains explicit and starts no model read", async () => {
	repositoriesRefused = true;
	const { result } = renderHook(() => useModelCatalog(), { wrapper: Provided });
	await waitFor(() => expect(result.current.error).not.toBeNull());
	expect(result.current.repositories).toEqual([]);
	expect(followed.size).toBe(0);
});

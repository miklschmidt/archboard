// Repository discovery reads canonical models through the shared cache and event feed.
import { ArchitectureFeedRequestSchema } from "@archboard/board/model";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import type { ReactNode } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";

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
const MODEL: Extract<ArchitectureModelRead, { success: true }> = {
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
	revision: { digest: "a".repeat(64), files: [] },
};
const LEGACY: ArchitectureModelRead = {
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
const listed: string[] = [];
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
	if (asked.pathname !== "/api/architecture/model")
		throw new Error(`Unexpected route: ${asked.pathname}`);
	const vault = asked.searchParams.get("vault")!;
	listed.push(vault);
	return Response.json(vault === SHOP ? MODEL : LEGACY);
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
	listed.length = 0;
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

test("each readable repository exposes its model or migration requirement and follows canonical news", async () => {
	const { result } = renderHook(() => useModelCatalog(), { wrapper: Provided });
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
	expect(listed.toSorted()).toEqual([BILLING, SHOP]);
	expect([...followed].toSorted()).toEqual([BILLING, SHOP]);
	expect(sockets).toHaveLength(1);
	await act(async () => {
		sockets[0]!.dispatchEvent(
			new MessageEvent("message", {
				data: JSON.stringify({
					type: "architecture_snapshot",
					vault: SHOP,
					reading: { ...MODEL, manifest: { ...MODEL.manifest, name: "Renamed shop" } },
					claims: { success: true, claims: [] },
				}),
			}),
		);
	});
	await waitFor(() => expect(result.current.repositories[0]?.model?.name).toBe("Renamed shop"));
	expect(listed.toSorted()).toEqual([BILLING, SHOP]);
});

test("a failed repository discovery remains explicit and starts no model read", async () => {
	repositoriesRefused = true;
	const { result } = renderHook(() => useModelCatalog(), { wrapper: Provided });
	await waitFor(() => expect(result.current.error).not.toBeNull());
	expect(result.current.repositories).toEqual([]);
	expect(listed).toEqual([]);
	expect(followed.size).toBe(0);
});

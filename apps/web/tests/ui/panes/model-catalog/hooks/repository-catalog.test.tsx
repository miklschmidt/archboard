// Repository discovery reads no model: the event feed reports the repositories and each vault's
// summary.
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import type { ReactNode } from "react";
import type { ArchitectureFeedFrame } from "@archboard/model/contract";
import { installFeedServer } from "#tests/ui/support/model-catalog/feed-server.ts";

GlobalRegistrator.register({ url: "http://127.0.0.1:3000/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

const { act, cleanup, renderHook, waitFor } = await import("@testing-library/react");
const { createElement } = await import("react");
const { ModelCatalogProvider } =
	await import("#ui/panes/model-catalog/components/ModelCatalogProvider.tsx");
const { useModelCatalog } = await import("#ui/panes/model-catalog/hooks/use-model-catalog.ts");

const SHOP = "/work/shop/.archboard/vault";
const BILLING = "/work/billing/.archboard/vault";
const REPOSITORIES: Extract<ArchitectureFeedFrame, { type: "repositories" }> = {
	type: "repositories",
	revision: 0,
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
const PENDING: Extract<Summary, { success: false }> = {
	success: false,
	code: "RECOVERY_REQUIRED",
	error: "A durable architecture transaction is pending.",
	diagnostics: [
		{ code: "RECOVERY_REQUIRED", file: ".", message: "Pending.", recovery: "Run model recover." },
	],
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
const feed = installFeedServer();
const realFetch = globalThis.fetch;

/**
 * Record a model read, which discovery must never make.
 * @param input The requested resource.
 * @returns Never.
 */
async function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const asked = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
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
	return createElement(ModelCatalogProvider, null, props.children);
}

afterEach(() => {
	cleanup();
	read.length = 0;
	feed.reset();
});
afterAll(async () => {
	globalThis.fetch = realFetch;
	feed.uninstall();
	await GlobalRegistrator.unregister();
});

/**
 * Send the tab a frame as the server does when it subscribes, or on a change.
 * @param frame The frame.
 */
async function hear(frame: ArchitectureFeedFrame): Promise<void> {
	await act(async () => feed.latest()!.receive(frame));
}

test("each readable repository takes its model or migration requirement from the feed and reads no model", async () => {
	const { result } = renderHook(() => useModelCatalog(), { wrapper: Provided });
	await waitFor(() => expect([...(feed.latest()?.topics ?? [])]).toEqual(["repositories"]));
	await hear(REPOSITORIES);
	await waitFor(() =>
		expect([...feed.latest()!.topics].toSorted()).toEqual([BILLING, SHOP, "repositories"]),
	);
	expect(feed.sockets).toHaveLength(1);
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
	await act(() => Bun.sleep(20));
	expect(result.current.repositories[0]?.error).toBeNull();
	await hear({ type: "architecture_status", vault: SHOP, reading: PENDING });
	await waitFor(() => expect(result.current.repositories[0]?.error).toBe(PENDING.error));
	expect(result.current.repositories[0]?.model?.name).toBe("Renamed shop");
	expect(read).toEqual([]);
});

test("a server that does not answer leaves the catalog empty with its reason, and starts no model read", async () => {
	feed.refuse(true);
	const { result } = renderHook(() => useModelCatalog(), { wrapper: Provided });
	await waitFor(() => expect(result.current.error).not.toBeNull());
	expect(result.current.repositories).toEqual([]);
	expect(feed.sockets.flatMap((socket) => [...socket.topics])).toEqual([]);
	expect(read).toEqual([]);
});

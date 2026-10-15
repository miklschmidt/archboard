// The catalog over the repositories the server lists (ADR 0050): one board
// listing for each repository with a vault to read, each with its own failure,
// and nothing read for a repository whose chosen checkout has no vault.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, spyOn, test } from "bun:test";
import type { ReactNode } from "react";

GlobalRegistrator.register({ url: "http://127.0.0.1:3000/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

// React's renderer is loaded once the page's globals are there.
const { cleanup, renderHook, waitFor } = await import("@testing-library/react");
const { createElement } = await import("react");
const { BoardCatalogProvider, useBoardCatalog } = await import("@/ui/board-catalog");

const SHOP = "/work/shop/.archboard/vault";
const BILLING = "/work/billing/.archboard/vault";

/** Two readable repositories, and two whose chosen checkout has no vault to read. */
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

/** The shop vault's one board. */
const SHOP_BOARDS = {
	success: true,
	levels: [],
	boards: [
		{
			name: "Checkout",
			key: "checkout",
			opens: "v1",
			links: [],
			description: null,
			variants: [{ id: "v1", name: "Initial", lifecycle: "current", parentId: null }],
		},
	],
};

/** The vaults each listing was asked of, in order. */
const listed: string[] = [];

/**
 * A JSON answer.
 * @param body The body.
 * @param status The status.
 * @returns The response.
 */
function answer(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/**
 * One vault's listing: shop's boards, and a failure for any other vault.
 * @param asked The request.
 * @returns The answer.
 */
function listingOf(asked: URL): Response {
	const vault = asked.searchParams.get("vault") ?? "";
	listed.push(vault);
	return vault === SHOP
		? answer(SHOP_BOARDS)
		: answer({ success: false, error: "The vault could not be read." }, 500);
}

/** The faked routes, by path. */
const ROUTES: Readonly<Record<string, (asked: URL) => Response>> = {
	"/api/repositories": answer.bind(null, REPOSITORIES, 200),
	"/api/panes": answer.bind(null, { panes: [] }, 200),
	"/api/semantic-boards": listingOf,
};

/**
 * The faked server: the repositories, the panes, and each vault's listing.
 * @param input The request.
 * @returns The answer.
 */
function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const asked = new URL(
		input instanceof Request ? input.url : String(input),
		"http://127.0.0.1:3000/",
	);
	const route = ROUTES[asked.pathname];
	return Promise.resolve(route === undefined ? answer({ success: false }, 404) : route(asked));
}

/**
 * The cache the catalog reads through, as the page provides it.
 * @param props The children.
 * @param props.children The hook under test.
 * @returns The provider.
 */
function Provided(props: { children: ReactNode }): ReactNode {
	return createElement(BoardCatalogProvider, null, props.children);
}

const realFetch = globalThis.fetch;
globalThis.fetch = Object.assign(fakeFetch, { preconnect: realFetch.preconnect });

afterAll(async () => {
	cleanup();
	globalThis.fetch = realFetch;
	await GlobalRegistrator.unregister();
});

test("each repository with a vault lists its own boards or its own failure, and one without reads nothing", async () => {
	const warned = spyOn(console, "warn");
	const { result } = renderHook(() => useBoardCatalog(), { wrapper: Provided });
	/**
	 * What the navigator shows of each repository.
	 * @returns Each one's boards, whether it failed and whether it is loading.
	 */
	const shown = () =>
		result.current.repositories.map((each) => ({
			boards: each.listing.boards.map((board) => board.name),
			failed: each.error !== null,
			loading: each.loading,
		}));
	// A repository with no vault to read is neither loading nor failed: its row
	// says why from its state, and no listing is asked for it.
	await waitFor(() =>
		expect(shown()).toEqual([
			{ boards: ["Checkout"], failed: false, loading: false },
			{ boards: [], failed: true, loading: false },
			{ boards: [], failed: false, loading: false },
			{ boards: [], failed: false, loading: false },
		]),
	);
	expect(listed.toSorted()).toEqual([BILLING, SHOP]);
	// Two repositories with no vault are not one query asked twice.
	expect(warned.mock.calls.flat().some((said) => String(said).includes("Duplicate"))).toBe(false);
	warned.mockRestore();
});

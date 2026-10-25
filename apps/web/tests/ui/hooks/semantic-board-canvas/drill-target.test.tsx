// Where a drill-down leads, as the inspector reads it and as the double-click
// does: one reading behind two adapters, which must agree.
//
// What these catch: a link to the pane's own repository read as another one;
// a link to a repository this machine cannot read opened anyway; a failed
// listing of the pane's vault answered by guessing another vault, so the
// inspector offers a way down that the double-click cannot follow; a named
// variant that is not there swapped for the current one; and a renamed board
// whose news the inspector stops hearing.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { ReactNode } from "react";

import type { SemanticNode } from "@archboard/board/content";
import type { RepositoryPlaces } from "#ui/rules/semantic-board-canvas/drilling/drill-target.ts";
import type { DrillTarget } from "#ui/hooks/semantic-board-canvas/use-drill-target.ts";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

// React's renderer and the modules that use it are loaded once the page's globals are there.
const { act, cleanup, renderHook, waitFor } = await import("@testing-library/react");
const { createElement } = await import("react");
const { PaneVaultContext } = await import("#ui/state/semantic-board-canvas/pane-vault.ts");
const { RepositoryPlacesContext } =
	await import("#ui/state/semantic-board-canvas/repository-places.ts");
const { useDrillTarget, useDrillTargetReader } =
	await import("#ui/hooks/semantic-board-canvas/use-drill-target.ts");
const { announceSemanticBoardChange } =
	await import("#ui/state/semantic-board-canvas/board-changes.ts");

type DrillDown = NonNullable<SemanticNode["drillDown"]>;

const SHOP = "/work/shop/.archboard/vault";
const PAYMENTS = "/work/payments/.archboard/vault";
const OWN = "github.com/acme/shop";
const OTHER = "github.com/acme/payments";

/** The repositories this machine lists. */
const LISTED = new Map([
	[OTHER, { vault: PAYMENTS, state: "ready" as const }],
	["github.com/acme/gone", { vault: null, state: "gone" as const }],
]);

/**
 * The repositories this machine lists, by identity.
 * @param identity The repository identity.
 * @returns Its chosen checkout's vault and state, or undefined when it is not listed.
 */
const PLACES: RepositoryPlaces = (identity) => LISTED.get(identity);

/**
 * A board document with one current variant and one draft.
 * @param name What the board is called.
 * @returns The document.
 */
function boardOf(name: string): Record<string, unknown> {
	const content = { nodes: [], edges: [] };
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "bd1",
		name,
		level: "module",
		version: 1,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "e2",
		variants: [
			{ id: "e1", name: "as built", lifecycle: "draft", content },
			{ id: "e2", name: "shipped", lifecycle: "current", content },
		],
	};
}

/** What the controlled server answers: listings by vault, documents by vault and board. */
const server: {
	listings: Map<string, unknown>;
	documents: Map<string, unknown>;
	asked: string[];
} = { listings: new Map(), documents: new Map(), asked: [] };

const realFetch = globalThis.fetch;

afterEach(() => {
	cleanup();
	globalThis.fetch = realFetch;
	server.listings.clear();
	server.documents.clear();
	server.asked = [];
});

/**
 * A JSON answer.
 * @param status Its status.
 * @param body Its body.
 * @returns The response.
 */
function answer(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/** What the server answers for something it does not hold. */
const MISSING = { success: false, code: "BOARD_MISSING", error: "not there" };

/**
 * Answer one request from `server`: a vault it lists nothing for refuses.
 * @param input The request.
 * @returns The answer.
 */
function serve(input: RequestInfo | URL): Promise<Response> {
	const url = new URL(input instanceof Request ? input.url : input, "http://archboard.test");
	server.asked.push(`${url.pathname}${url.search}`);
	const vault = url.searchParams.get("vault") ?? "";
	return Promise.resolve(
		url.pathname === "/api/semantic-boards"
			? listingReply(vault)
			: documentReply(`${vault}|${url.searchParams.get("board") ?? ""}`),
	);
}

/**
 * One vault's listing, or a refusal for a vault the server lists nothing for.
 * @param vault The vault.
 * @returns The answer.
 */
function listingReply(vault: string): Response {
	const held = server.listings.get(vault);
	return held === undefined
		? answer(503, { success: false, code: "UNREACHABLE", error: "no listing" })
		: answer(200, held);
}

/**
 * One board's document, or a refusal for a board the vault has not got.
 * @param key The vault and the board.
 * @returns The answer.
 */
function documentReply(key: string): Response {
	const held = server.documents.get(key);
	return held === undefined ? answer(404, MISSING) : answer(200, { success: true, board: held });
}

/**
 * The listing of one vault, naming the repository it is in.
 * @param vault The vault.
 * @param repository Its repository identity, or undefined for an untracked vault.
 */
function listed(vault: string, repository: string | undefined): void {
	server.listings.set(vault, {
		success: true,
		levels: [],
		boards: [],
		...(repository === undefined ? {} : { repository }),
	});
}

/**
 * Both adapters, in a pane in the shop vault, over one cache.
 * @param target The drill-down.
 * @returns What the inspector reads once it has settled, what the double-click
 *   is answered, and the mounted hook.
 */
async function bothRead(target: DrillDown) {
	globalThis.fetch = Object.assign(serve, { preconnect: realFetch.preconnect });
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	/**
	 * The providers a pane gives its readers.
	 * @param props The hook's host.
	 * @param props.children What they wrap.
	 * @returns The providers.
	 */
	const wrapper = (props: { readonly children: ReactNode }) =>
		createElement(
			QueryClientProvider,
			{ client },
			createElement(
				PaneVaultContext,
				{ value: SHOP },
				createElement(RepositoryPlacesContext, { value: PLACES }, props.children),
			),
		);
	const mounted = renderHook(
		() => ({ inspector: useDrillTarget(target), read: useDrillTargetReader() }),
		{ wrapper },
	);
	await waitFor(() => {
		expect(mounted.result.current.inspector.kind).not.toBe("reading");
	});
	const doubleClick = await mounted.result.current.read(target);
	return { inspector: mounted.result.current.inspector, doubleClick, mounted };
}

/**
 * Where a target leads, as far as a test compares it.
 * @param reached The reading.
 * @returns Its kind, and for a destination the board, variant and vault it opens.
 */
function leads(reached: DrillTarget): unknown {
	return reached.kind === "ready"
		? { board: reached.board.name, variant: reached.variant.id, there: reached.there }
		: reached;
}

describe("where a drill-down leads", () => {
	test("a link without a repository, or to the vault's own, opens in that vault", async () => {
		server.documents.set(`${SHOP}|engine`, boardOf("engine"));
		listed(SHOP, OWN);
		const named: DrillDown = { board: "engine", variant: { kind: "named", name: "as built" } };
		const expected = { board: "engine", variant: "e1", there: undefined };

		const within = await bothRead(named);
		expect(leads(within.inspector)).toEqual(expected);
		expect(leads(within.doubleClick)).toEqual(expected);
		cleanup();

		const own = await bothRead({ ...named, repo: OWN });
		expect(leads(own.inspector)).toEqual(expected);
		expect(leads(own.doubleClick)).toEqual(expected);
	});

	test("another repository's board opens in its chosen checkout's vault", async () => {
		listed(SHOP, OWN);
		server.documents.set(`${PAYMENTS}|ledger`, boardOf("ledger"));
		const { inspector, doubleClick } = await bothRead({
			board: "ledger",
			variant: { kind: "current" },
			repo: OTHER,
		});
		const expected = {
			board: "ledger",
			variant: "e2",
			there: { vault: PAYMENTS, repository: OTHER },
		};
		expect(leads(inspector)).toEqual(expected);
		expect(leads(doubleClick)).toEqual(expected);
	});

	test("a repository this machine does not list, or cannot read, opens nothing", async () => {
		listed(SHOP, OWN);
		const unknown = await bothRead({
			board: "x",
			variant: { kind: "current" },
			repo: "github.com/acme/unknown",
		});
		expect(unknown.inspector).toEqual({ kind: "unregistered", repo: "github.com/acme/unknown" });
		expect(unknown.doubleClick).toEqual(unknown.inspector);
		cleanup();

		const gone = await bothRead({
			board: "x",
			variant: { kind: "current" },
			repo: "github.com/acme/gone",
		});
		const expected: DrillTarget = {
			kind: "unreachable",
			repo: "github.com/acme/gone",
			state: "gone",
		};
		expect(gone.inspector).toEqual(expected);
		expect(gone.doubleClick).toEqual(expected);
	});

	test("a failed listing of the pane's vault leads nowhere, and no other vault is guessed", async () => {
		// The shop vault cannot be listed, so whether the link is to its own
		// repository is not known. The payments vault would answer, and must not be read.
		server.documents.set(`${PAYMENTS}|ledger`, boardOf("ledger"));
		const { inspector, doubleClick } = await bothRead({
			board: "ledger",
			variant: { kind: "current" },
			repo: OTHER,
		});
		expect(inspector.kind).toBe("listing-failed");
		expect(doubleClick.kind).toBe("listing-failed");
		expect(server.asked.some((asked) => asked.includes("board=ledger"))).toBe(false);
	});

	test("a named variant that is not there is said, never swapped for the current one", async () => {
		server.documents.set(`${SHOP}|engine`, boardOf("engine"));
		const { inspector, doubleClick } = await bothRead({
			board: "engine",
			variant: { kind: "named", name: "as planned" },
		});
		expect(inspector).toEqual({ kind: "no-variant", asked: "as planned" });
		expect(doubleClick).toEqual(inspector);
	});

	test("a board that cannot be read is said by both", async () => {
		const { inspector, doubleClick } = await bothRead({
			board: "engine",
			variant: { kind: "current" },
		});
		expect(inspector.kind).toBe("unreadable");
		expect(doubleClick.kind).toBe("unreadable");
	});
});

test("a link to a renamed board hears its news under the name it has now", async () => {
	// The link says "engine"; the board answers to it as "Board Engine" (ADR 0036).
	const renamed = { ...boardOf("Board Engine"), formerNames: ["engine"] };
	server.documents.set(`${SHOP}|engine`, renamed);
	const { mounted } = await bothRead({ board: "engine", variant: { kind: "current" } });
	expect(leads(mounted.result.current.inspector)).toMatchObject({ variant: "e2" });

	// The board adopts its draft, and the news names the board as it is called now.
	const content = { nodes: [], edges: [] };
	server.documents.set(`${SHOP}|engine`, {
		...renamed,
		version: 2,
		current: "e1",
		variants: [
			{ id: "e1", name: "as built", lifecycle: "current", content },
			{ id: "e2", name: "shipped", lifecycle: "historical", content },
		],
	});
	act(() => {
		announceSemanticBoardChange(SHOP, "Board Engine", 2);
	});
	await waitFor(() => {
		expect(leads(mounted.result.current.inspector)).toMatchObject({ variant: "e1" });
	});
});

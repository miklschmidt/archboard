// Pictures a page draws itself: drawn ahead when the server says a board moved,
// and kept across page loads only while they are of the version the server has.
//
// What these catch: a changed board whose proposals are laid out only when
// somebody opens them, drawing ahead that lays out every picture at once, and a
// kept picture of an older version shown — or left in storage — after the page
// loads against a server that has moved on.

import { afterEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import { withFixtureOrders } from "@/ui/semantic-board-canvas/tests/fixture-orders";
import {
	announceSemanticBoardChange,
	createLocalPictureSource,
	semanticBoardKeys,
	semanticBoardListQuery,
	semanticRenderQuery,
	takePicturesFrom,
	type DrawBoard,
	type PictureStorage,
} from "@/ui/semantic-board-canvas/index";

/** One draw the page laid out. */
interface Draw {
	readonly version: number;
	readonly variant?: string | undefined;
	readonly view?: string | undefined;
	readonly theme: string;
}

/** What the fake server holds: the board's version, and whether it lists the board at all. */
const server = { version: 1, listed: true };

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
	server.version = 1;
	server.listed = true;
});

/**
 * The board document at the server's version, current architecture and one proposal.
 * @returns The document.
 */
function document(): Record<string, unknown> {
	const content = { nodes: [{ id: "n1", name: "board-io", kind: "module" }], edges: [] };
	return {
		schemaVersion: "2.0.0",
		kind: "semantic-board",
		id: "b1",
		name: "pipeline",
		level: "system",
		version: server.version,
		createdAt: "2026-09-11T00:00:00.000Z",
		updatedAt: "2026-09-11T00:00:00.000Z",
		views: [],
		current: "v1",
		variants: [
			{ id: "v1", name: "as it is", lifecycle: "current", content },
			{ id: "v2", name: "Semantic boards", lifecycle: "draft", parent: "v1", content },
		],
	};
}

/**
 * The vault checker's answer: the default policy, under one fingerprint.
 * @returns The answer.
 */
function vaultCheck(): Record<string, unknown> {
	return {
		success: true,
		policy: DEFAULT_SEMANTIC_POLICY,
		configurationValid: true,
		configurationFile: ".archboard/config.yaml",
		fingerprint: "policy",
		diagnostics: [],
	};
}

/**
 * The server's listing of its boards, at their versions.
 * @returns The listing.
 */
function listing(): Record<string, unknown> {
	const boards = server.listed
		? [{ name: "pipeline", key: "pipeline", version: server.version, opens: "v1", variants: [] }]
		: [];
	return { success: true, boards };
}

/**
 * The board route's answer.
 * @returns The answer.
 */
function boardRoute(): Record<string, unknown> {
	return { success: true, board: withFixtureOrders(document()) };
}

/** What each route the page reads answers, by the path it starts with; the listing last. */
const ROUTES: readonly [string, () => Record<string, unknown>][] = [
	["/api/semantic-boards/board", boardRoute],
	["/api/vault/check", vaultCheck],
	["/api/semantic-boards", listing],
];

/**
 * Answer the board, the vault check and the listing from `server`.
 * @param input The request.
 * @returns The reply.
 */
function fakeFetch(input: RequestInfo | URL): Promise<Response> {
	const url = input instanceof Request ? input.url : input.toString();
	const route = ROUTES.find(([path]) => url.startsWith(path));
	const body = route === undefined ? { success: false, error: "no such route" } : route[1]();
	return Promise.resolve(
		new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } }),
	);
}

/**
 * Storage that lives as long as the test, standing in for the browser's.
 * @returns The storage.
 */
function memoryStorage(): PictureStorage {
	const items = new Map<string, string>();
	return {
		/**
		 * How many entries are kept.
		 * @returns The count.
		 */
		get length() {
			return items.size;
		},
		/**
		 * One entry.
		 * @param key Its key.
		 * @returns Its value, or null.
		 */
		getItem: (key) => items.get(key) ?? null,
		/**
		 * Keep an entry.
		 * @param key Its key.
		 * @param value Its value.
		 */
		setItem: (key, value) => {
			items.set(key, value);
		},
		/**
		 * Remove an entry.
		 * @param key Its key.
		 */
		removeItem: (key) => {
			items.delete(key);
		},
		/**
		 * The key at a position.
		 * @param index The position.
		 * @returns The key, or null.
		 */
		key: (index) => [...items.keys()][index] ?? null,
	};
}

/**
 * A page that draws its own pictures with a stand-in renderer.
 * @param storage Where pictures are kept.
 * @returns The page's cache, every draw it laid out, and how many were ever laid out at once.
 */
function page(storage: PictureStorage): { client: QueryClient; draws: Draw[]; most: () => number } {
	globalThis.fetch = Object.assign(fakeFetch, { preconnect: realFetch.preconnect });
	const draws: Draw[] = [];
	let running = 0;
	let most = 0;
	/**
	 * Lay a board out after a moment, noting what was asked and how many were under way.
	 * @param board The board.
	 * @param choices The variant, view and theme.
	 * @returns A blank picture of that version.
	 */
	const draw: DrawBoard = async (board, choices) => {
		running += 1;
		most = Math.max(most, running);
		await new Promise((resolve) => setTimeout(resolve, 1));
		running -= 1;
		draws.push({ version: board.version, ...choices });
		return {
			ok: true,
			reply: {
				success: true,
				board: board.name,
				version: board.version,
				variant: { id: choices.variant ?? "v1", name: "state", lifecycle: "current" },
				theme: choices.theme,
				view: null,
				views: [],
				changes: null,
				waiting: null,
				width: 400,
				height: 300,
				svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>`,
				atlas: { nodes: {}, edges: {}, regions: {} },
			},
		};
	};
	takePicturesFrom(createLocalPictureSource({ draw, renderer: "build-1", storage }));
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	/**
	 * The most layouts ever under way at once.
	 * @returns The count.
	 */
	const mostAtOnce = (): number => most;
	return { client, draws, most: mostAtOnce };
}

/**
 * Wait, a turn of the loop at a time, until something holds.
 * @param holds What should come to hold.
 */
async function until(holds: () => boolean): Promise<void> {
	for (let turn = 0; turn < 200 && !holds(); turn += 1) {
		// oxlint-disable-next-line no-await-in-loop -- waiting on work that runs one draw at a time
		await new Promise((resolve) => setTimeout(resolve, 2));
	}
	expect(holds()).toBe(true);
}

// First in the file: a page's draw-ahead listens for as long as the page lives,
// so a later test's announcement would reach this page too.
test("an announced change draws the board's states ahead, one at a time, as this page reads them", async () => {
	const { client, draws, most } = page(memoryStorage());
	// The page has been reading the board whole and through one view, in the dark.
	await client.fetchQuery(semanticRenderQuery({ board: "pipeline", theme: "dark" }));
	await client.fetchQuery(
		semanticRenderQuery({ board: "pipeline", view: "scope1", theme: "dark" }),
	);
	draws.length = 0;

	server.version = 2;
	announceSemanticBoardChange("pipeline", 2);
	const proposal = { board: "pipeline", variant: "v2", theme: "dark" } as const;
	await until(() => draws.length === 4);

	// Every state, in every way it was read, from the version announced; the
	// current architecture first, and never two layouts at once.
	expect(draws.every((one) => one.version === 2 && one.theme === "dark")).toBe(true);
	expect(new Set(draws.map((one) => `${one.variant ?? ""}|${one.view ?? ""}`))).toEqual(
		new Set(["|", "|scope1", "v2|", "v2|scope1"]),
	);
	expect(draws[0]?.variant).toBeUndefined();
	expect(most()).toBe(1);
	// Opening the proposal now finds it drawn, without laying it out again.
	expect(client.getQueryData(semanticBoardKeys.render(proposal))).toMatchObject({ version: 2 });
	await client.fetchQuery(semanticRenderQuery(proposal));
	expect(draws).toHaveLength(4);
});

test("a page loading against a moved board forgets the kept picture and never shows it", async () => {
	const storage = memoryStorage();
	const request = { board: "pipeline", theme: "light" } as const;
	// A previous page load drew the board at version 1 and kept it.
	const before = page(storage);
	await before.client.fetchQuery(semanticRenderQuery(request));
	expect(storage.length).toBe(1);

	// Loaded again with nothing moved: the kept picture is shown, not drawn.
	const same = page(storage);
	await same.client.fetchQuery(semanticBoardListQuery());
	expect(await same.client.fetchQuery(semanticRenderQuery(request))).toMatchObject({ version: 1 });
	expect(same.draws).toHaveLength(0);

	// Loaded after the board moved on: listing the boards forgets the old picture…
	server.version = 2;
	const moved = page(storage);
	await moved.client.fetchQuery(semanticBoardListQuery());
	expect(storage.length).toBe(0);
	// …and the pane is shown the board as it is now.
	expect(await moved.client.fetchQuery(semanticRenderQuery(request))).toMatchObject({ version: 2 });
	expect(moved.draws.map((one) => one.version)).toEqual([2]);

	// Even when the listing has not come in yet, a kept picture of an older
	// version is drawn again rather than shown.
	server.version = 3;
	const early = page(storage);
	expect(await early.client.fetchQuery(semanticRenderQuery(request))).toMatchObject({ version: 3 });
	expect(early.draws.map((one) => one.version)).toEqual([3]);

	// A board the server no longer lists takes its pictures with it.
	server.listed = false;
	await page(storage).client.fetchQuery(semanticBoardListQuery());
	expect(storage.length).toBe(0);
});

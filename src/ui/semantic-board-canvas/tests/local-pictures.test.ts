// Pictures a page draws itself: drawn ahead when the page loads and when the server says a board moved,
// and kept across page loads only while they are of the version the server has.
//
// What these catch: a changed board whose proposals are laid out only when
// somebody opens them, drawing ahead that lays out every picture at once or in
// a theme the page does not show, a picture drawn ahead that has left the tab's
// cache by the time somebody opens it, and a kept picture of an older version
// shown — or left in storage — after the page loads against a server that has
// moved on.

import { afterEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";

import type { BoardListing } from "@/shared/semantic-board/index";
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
function listing(): BoardListing {
	const boards = server.listed
		? [
				{
					// Listed under its written name; panes and addresses ask by its key.
					name: "Pipeline",
					key: "pipeline",
					version: server.version,
					opens: "v1",
					variants: [],
					links: [],
					description: null,
				},
			]
		: [];
	return { success: true, levels: ["system", "service", "module"], boards };
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
 * @returns The storage, and how many pictures it keeps.
 */
function memoryStorage(): PictureStorage & { readonly size: () => number } {
	const items = new Map<string, unknown>();
	return {
		/**
		 * One kept picture.
		 * @param key Its key.
		 * @returns The picture, or nothing.
		 */
		get: (key) => Promise.resolve(items.get(key)),
		/**
		 * Keep a picture.
		 * @param key Its key.
		 * @param value The picture.
		 * @returns When it is kept.
		 */
		set: (key, value) => {
			items.set(key, value);
			return Promise.resolve();
		},
		/**
		 * Forget a picture.
		 * @param key Its key.
		 * @returns When it is gone.
		 */
		del: (key) => {
			items.delete(key);
			return Promise.resolve();
		},
		/**
		 * Every kept picture's key.
		 * @returns The keys.
		 */
		keys: () => Promise.resolve([...items.keys()]),
		/**
		 * How many pictures are kept.
		 * @returns The count.
		 */
		size: () => items.size,
	};
}

/**
 * A page that draws its own pictures with a stand-in renderer.
 * @param storage Where pictures are kept.
 * @param shows The theme the page shows, and how long its cache keeps what nobody observes.
 * @param shows.theme The theme on the page's root, or nothing before one is applied.
 * @param shows.gcTime The cache's default time to keep an unobserved query.
 * @returns The page's cache, every draw it laid out, and how many were ever laid out at once.
 */
function page(
	storage: PictureStorage,
	shows: { theme?: "light" | "dark"; gcTime?: number } = {},
): { client: QueryClient; draws: Draw[]; most: () => number } {
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
	takePicturesFrom(
		createLocalPictureSource({
			draw,
			renderer: "build-1",
			storage,
			/**
			 * The theme on the page's root.
			 * @returns It, or nothing before one is applied.
			 */
			theme: () => shows.theme,
		}),
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: shows.gcTime ?? 5 * 60_000 } },
	});
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
	await until(() => storage.size() === 1);

	// Loaded again with nothing moved: the kept picture is shown, not drawn.
	const same = page(storage);
	await same.client.fetchQuery(semanticBoardListQuery());
	expect(await same.client.fetchQuery(semanticRenderQuery(request))).toMatchObject({ version: 1 });
	expect(same.draws).toHaveLength(0);

	// Loaded after the board moved on: listing the boards forgets the old picture…
	server.version = 2;
	const moved = page(storage);
	await moved.client.fetchQuery(semanticBoardListQuery());
	await until(() => storage.size() === 0);
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
	// Kept under its own version's key, beside the older one until a listing forgets that.
	await until(() => storage.size() === 2);
	server.listed = false;
	await page(storage).client.fetchQuery(semanticBoardListQuery());
	await until(() => storage.size() === 0);
});

test("a page that loads draws every listed board ahead in the theme it shows, and never one it has kept", async () => {
	const storage = memoryStorage();
	const request = { board: "pipeline", theme: "dark" } as const;
	// Nothing kept yet, as after a new renderer build, and no picture read yet to
	// say which theme: listing the boards draws each one ahead, whole, in the
	// theme on the page, before anybody opens it.
	const first = page(storage, { theme: "dark" });
	await first.client.fetchQuery(semanticBoardListQuery());
	await until(() => first.draws.length === 1);
	expect(first.draws[0]).toMatchObject({ version: 1, theme: "dark" });
	expect(first.draws[0]?.variant).toBeUndefined();
	expect(first.draws[0]?.view).toBeUndefined();
	// Opening it finds it drawn, without laying it out again.
	await until(() => first.client.getQueryData(semanticBoardKeys.render(request)) !== undefined);
	await first.client.fetchQuery(semanticRenderQuery(request));
	expect(first.draws).toHaveLength(1);

	// Loaded again: the kept picture comes out of storage and nothing is laid out.
	await until(() => storage.size() === 1);
	const again = page(storage, { theme: "dark" });
	await again.client.fetchQuery(semanticBoardListQuery());
	await until(() => again.client.getQueryData(semanticBoardKeys.render(request)) !== undefined);
	expect(again.draws).toHaveLength(0);
});

test("a picture drawn ahead is still in the tab when somebody opens its board, however long after", async () => {
	// A cache that lets go of whatever nobody observes almost at once.
	const shortLived = page(memoryStorage(), { theme: "light", gcTime: 1 });
	const request = { board: "pipeline", theme: "light" } as const;
	await shortLived.client.fetchQuery(semanticBoardListQuery());
	await until(
		() => shortLived.client.getQueryData(semanticBoardKeys.render(request)) !== undefined,
	);
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(shortLived.client.getQueryData(semanticBoardKeys.render(request))).toMatchObject({
		version: 1,
	});
});

// Pictures a page draws itself: drawn ahead when the page loads and when the server says a board moved,
// and kept across page loads only while they are of the version the server has.
//
// What these catch: a changed board whose proposals are laid out only when
// somebody opens them, drawing ahead that lays out every picture at once or
// once per theme, a picture drawn ahead that has left the tab's
// cache by the time somebody opens it, and a kept picture of an older version
// shown — or left in storage — after the page loads against a server that has
// moved on.

import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { withFixtureOrders } from "#tests/ui/support/semantic-board-canvas/fixture-orders.ts";
import { announceSemanticBoardChange } from "#ui/state/semantic-board-canvas/board-changes.ts";
import {
	createLocalPictureSource,
	type DrawBoard,
} from "#ui/clients/semantic-board-canvas/reads/local-pictures.ts";
import { readAgain } from "#ui/clients/semantic-board-canvas/reads/read-again.ts";
import {
	semanticBoardKeys,
	semanticBoardListQuery,
	semanticRenderQuery,
} from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import { takePicturesFrom } from "#ui/clients/semantic-board-canvas/reads/picture-source.ts";
import { type PictureStorage } from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";
import type { BoardListingSchema } from "@archboard/board/board-listing";
import type { z } from "zod";

type BoardListing = z.infer<typeof BoardListingSchema>;

/** One draw the page laid out. */
interface Draw {
	readonly version: number;
	readonly variant?: string | undefined;
	readonly view?: string | undefined;
}

/** The vault every request names. */
const VAULT = "/work/archboard/.archboard/vault";

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
 * @param shows How long its cache keeps what nobody observes.
 * @param shows.gcTime The cache's default time to keep an unobserved query.
 * @returns The page's cache, every draw it laid out, and how many were ever laid out at once.
 */
function page(
	storage: PictureStorage,
	shows: { gcTime?: number } = {},
): { client: QueryClient; draws: Draw[]; most: () => number } {
	globalThis.fetch = Object.assign(fakeFetch, { preconnect: realFetch.preconnect });
	const draws: Draw[] = [];
	let running = 0;
	let most = 0;
	/**
	 * Lay a board out after a moment, noting what was asked and how many were under way.
	 * @param board The board.
	 * @param choices The variant and view.
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
				view: null,
				views: [],
				changes: null,
				waiting: null,
				width: 400,
				height: 300,
				svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>`,
				atlas: { nodes: {}, edges: {}, regions: {} },
				drawn: { nodes: [], edges: [], flows: [], steps: [] },
			},
		};
	};
	takePicturesFrom(createLocalPictureSource({ draw, renderer: "build-1", storage }));
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
	// The page has been reading the board whole and through one view.
	await client.fetchQuery(semanticRenderQuery({ vault: VAULT, board: "pipeline" }));
	await client.fetchQuery(semanticRenderQuery({ vault: VAULT, board: "pipeline", view: "scope1" }));
	draws.length = 0;

	server.version = 2;
	announceSemanticBoardChange(VAULT, "pipeline", 2);
	const proposal = { vault: VAULT, board: "pipeline", variant: "v2" } as const;
	await until(() => draws.length === 4);

	// Every state, in every way it was read, from the version announced; the
	// current architecture first, and never two layouts at once.
	expect(draws.every((one) => one.version === 2)).toBe(true);
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

test("reading a board again draws every picture a pane holds from the new document, however it names its variant", async () => {
	const { client } = page(memoryStorage());
	const asked = [
		{ vault: VAULT, board: "pipeline" },
		{ vault: VAULT, board: "pipeline", variant: "v2" },
		{ vault: VAULT, board: "pipeline", variant: "Semantic boards" },
	] as const;
	// Panes on the current variant, on a variant by id and on one by name.
	const observers = asked.map((request) => {
		const observer = new QueryObserver(client, semanticRenderQuery(request));
		observer.subscribe(() => undefined);
		return observer;
	});
	await until(() => observers.every((one) => one.getCurrentResult().data?.version === 1));

	// The board moves with nobody told, then every drawing and document is read
	// again: the documents first, because a drawing reads its board the moment
	// it is asked for again.
	server.version = 2;
	await readAgain(client, [semanticBoardKeys.documents, semanticBoardKeys.renders]);
	await until(() => observers.every((one) => one.getCurrentResult().data?.version === 2));
	for (const observer of observers) observer.destroy();
});

test("a page loading against a moved board forgets the kept picture and never shows it", async () => {
	const storage = memoryStorage();
	const request = { vault: VAULT, board: "pipeline" } as const;
	// A previous page load drew the board at version 1 and kept it.
	const before = page(storage);
	await before.client.fetchQuery(semanticRenderQuery(request));
	await until(() => storage.size() === 1);

	// Loaded again with nothing moved: the kept picture is shown, not drawn.
	const same = page(storage);
	await same.client.fetchQuery(semanticBoardListQuery(VAULT));
	expect(await same.client.fetchQuery(semanticRenderQuery(request))).toMatchObject({ version: 1 });
	expect(same.draws).toHaveLength(0);

	// Loaded after the board moved on: listing the boards forgets the old picture…
	server.version = 2;
	const moved = page(storage);
	await moved.client.fetchQuery(semanticBoardListQuery(VAULT));
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
	await page(storage).client.fetchQuery(semanticBoardListQuery(VAULT));
	await until(() => storage.size() === 0);
});

test("a page that loads draws every listed board ahead once, for both themes, and never one it has kept", async () => {
	const storage = memoryStorage();
	const request = { vault: VAULT, board: "pipeline" } as const;
	// Nothing kept yet, as after a new renderer build: listing the boards draws
	// each one ahead, whole, before anybody opens it. Once: a picture takes the
	// page's theme, so a render names none and none is drawn twice.
	const first = page(storage);
	await first.client.fetchQuery(semanticBoardListQuery(VAULT));
	await until(() => first.draws.length === 1);
	expect(first.draws[0]).toMatchObject({ version: 1 });
	expect(first.draws[0]).not.toHaveProperty("theme");
	expect(first.draws[0]?.variant).toBeUndefined();
	expect(first.draws[0]?.view).toBeUndefined();
	// Opening it finds it drawn, without laying it out again.
	await until(() => first.client.getQueryData(semanticBoardKeys.render(request)) !== undefined);
	await first.client.fetchQuery(semanticRenderQuery(request));
	expect(first.draws).toHaveLength(1);

	// Loaded again: the kept picture comes out of storage and nothing is laid out.
	await until(() => storage.size() === 1);
	const again = page(storage);
	await again.client.fetchQuery(semanticBoardListQuery(VAULT));
	await until(() => again.client.getQueryData(semanticBoardKeys.render(request)) !== undefined);
	expect(again.draws).toHaveLength(0);
});

test("a picture drawn ahead is still in the tab when somebody opens its board, however long after", async () => {
	// A cache that lets go of whatever nobody observes almost at once.
	const shortLived = page(memoryStorage(), { gcTime: 1 });
	const request = { vault: VAULT, board: "pipeline" } as const;
	await shortLived.client.fetchQuery(semanticBoardListQuery(VAULT));
	await until(
		() => shortLived.client.getQueryData(semanticBoardKeys.render(request)) !== undefined,
	);
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(shortLived.client.getQueryData(semanticBoardKeys.render(request))).toMatchObject({
		version: 1,
	});
});

test("two vaults with a board of one name are drawn ahead one board at a time, and kept apart", async () => {
	const other = "/work/payments/.archboard/vault";
	const storage = memoryStorage();
	/**
	 * The vault and version of every kept picture.
	 * @returns One `vault@version` for each.
	 */
	const kept = async (): Promise<string[]> =>
		(await storage.keys()).map((key) => {
			const parts: unknown = typeof key === "string" ? JSON.parse(key) : null;
			return Array.isArray(parts) ? `${String(parts[0])}@${String(parts[6])}` : "";
		});
	// The navigator lists every repository at once as the page loads.
	const first = page(storage);
	await Promise.all([
		first.client.fetchQuery(semanticBoardListQuery(VAULT)),
		first.client.fetchQuery(semanticBoardListQuery(other)),
	]);
	await until(() => first.draws.length === 2);
	// The sweeps share the renderer's one worker for drawing ahead, so a pane's
	// own drawing never waits behind them.
	expect(first.most()).toBe(1);
	await until(() => storage.size() === 2);

	// One vault's board moves on: its listing forgets its own old picture and
	// leaves the other vault's, which is of a board of the same name.
	server.version = 2;
	const moved = page(storage);
	await moved.client.fetchQuery(semanticBoardListQuery(VAULT));
	await until(() => moved.draws.length === 1);
	await until(() => storage.size() === 2);
	expect((await kept()).toSorted()).toEqual([`${other}@1`, `${VAULT}@2`].toSorted());
});

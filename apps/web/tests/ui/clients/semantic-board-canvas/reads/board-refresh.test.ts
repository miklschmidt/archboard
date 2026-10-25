// What this tab reads after something tells it a board moved, on a real cache
// whose reads take time.
//
// What these catch: an answer the server decided before a write landing after
// it and counting as fresh; a picture drawn from the document of before because
// the document was marked stale after the pictures; a board let go under the
// server's spelling leaving a reading asked by another spelling or a former
// name at the old version; a listing of one vault leaving a board drawn ahead
// at the version it was drawn at; and news of one vault reading a board of the
// same name in another.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { readBoardsFrom } from "#ui/clients/semantic-board-canvas/reads/board-reads.ts";
import {
	boardChanged,
	boardsChanged,
} from "#ui/clients/semantic-board-canvas/reads/board-refresh.ts";
import { takePicturesFrom } from "#ui/clients/semantic-board-canvas/reads/picture-source.ts";
import {
	semanticBoardDocumentQuery,
	semanticBoardListQuery,
	semanticRenderQuery,
} from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import type {
	SemanticRender,
	SemanticRenderRequest,
} from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";

const SHOP = "/work/shop/.archboard/vault";
const BILLING = "/work/billing/.archboard/vault";

/** The one board each vault holds, as the fake server has it now. */
interface Board {
	readonly name: string;
	readonly formerNames: readonly string[];
	version: number;
}

/** What the fake server holds, by vault. */
const server = new Map<string, Board>();
/** Every document read the server was asked for, as `vault|name`. */
const asked: string[] = [];
/** Answers held back until `release`, each decided when it was asked. */
let held: (() => void)[] = [];
/** Whether answers are held back. */
let holding = false;

const realFetch = globalThis.fetch;

beforeEach(() => {
	server.set(SHOP, { name: "Payments", formerNames: ["Old payments"], version: 1 });
	server.set(BILLING, { name: "Payments", formerNames: [], version: 1 });
	readBoardsFrom({
		document: readDocument,
		vaultCheck: notReadHere,
		codeFindings: notReadHere,
		locality: notReadHere,
	});
	takePicturesFrom({ draw: drawFromDocument });
});

afterEach(() => {
	globalThis.fetch = realFetch;
	asked.length = 0;
	held = [];
	holding = false;
});

/**
 * A read these tests never make.
 * @returns A refusal.
 */
function notReadHere(): Promise<never> {
	return Promise.reject(new Error("not read here"));
}

/**
 * What a cached document says: its name and version.
 * @param data What the cache holds.
 * @returns Each, when it says it.
 */
function said(data: unknown): { name: string | undefined; version: number | undefined } {
	const record = typeof data === "object" && data !== null ? data : {};
	const name: unknown = Reflect.get(record, "name");
	const version: unknown = Reflect.get(record, "version");
	return {
		name: typeof name === "string" ? name : undefined,
		version: typeof version === "number" ? version : undefined,
	};
}

/**
 * Whether a name opens the vault's board: its name or a former one, in any case.
 * @param board The board.
 * @param name The name asked for.
 * @returns True when it opens it.
 */
function opens(board: Board, name: string): boolean {
	return [board.name, ...board.formerNames].some((one) => one.toLowerCase() === name.toLowerCase());
}

/**
 * The board route: the board as it is when asked, answered a moment later or when released.
 * @param vault The vault.
 * @param name The name asked for.
 * @param signal Cancels the read.
 * @returns The document.
 */
function readDocument(vault: string, name: string, signal?: AbortSignal): Promise<unknown> {
	asked.push(`${vault}|${name}`);
	const board = server.get(vault);
	if (board === undefined || !opens(board, name)) {
		return Promise.reject(new Error(`no board ${name}`));
	}
	const answer = { ...board };
	const { promise, resolve, reject } = Promise.withResolvers<unknown>();
	signal?.addEventListener("abort", function cancelled() {
		reject(new Error("cancelled"));
	});
	/** Answer with what the server held when it was asked. */
	function land(): void {
		resolve(answer);
	}
	if (holding) held.push(land);
	else setTimeout(land, 1);
	return promise;
}

/**
 * Draw a picture from the board's document as this tab's cache holds it.
 * @param request What is asked for.
 * @param client The tab's cache.
 * @returns A blank picture of the document's board and version.
 */
async function drawFromDocument(
	request: SemanticRenderRequest,
	client: QueryClient,
): Promise<SemanticRender> {
	const document = said(
		await client.fetchQuery(semanticBoardDocumentQuery(request.vault, request.board)),
	);
	return {
		kind: "drawn",
		success: true,
		board: document.name ?? request.board,
		version: document.version ?? 0,
		variant: { id: "v1", name: "state", lifecycle: "current" },
		view: null,
		views: [],
		changes: null,
		waiting: null,
		width: 1,
		height: 1,
		svg: `<svg xmlns="http://www.w3.org/2000/svg"></svg>`,
		atlas: { nodes: {}, edges: {}, regions: {} },
		drawn: { nodes: [], edges: [], flows: [], steps: [] },
	};
}

/**
 * Answer every read held back so far, then answer at once from now on.
 */
function release(): void {
	holding = false;
	for (const land of held.splice(0)) land();
}

/**
 * Wait, a turn of the loop at a time, until something holds.
 * @param holds What should come to hold.
 */
async function until(holds: () => boolean): Promise<void> {
	for (let turn = 0; turn < 200 && !holds(); turn += 1) {
		// oxlint-disable-next-line no-await-in-loop -- waiting on reads that answer a moment later
		await new Promise((resolve) => setTimeout(resolve, 2));
	}
	expect(holds()).toBe(true);
}

/** What a pane does with news of its own reads: nothing these tests look at. */
function ignore(): void {}

/**
 * A pane showing one board of one vault by one name: its document and its picture.
 * @param client The tab's cache.
 * @param vault The vault.
 * @param name The name it asks by.
 * @returns The versions it shows, and how to stop showing it.
 */
function pane(
	client: QueryClient,
	vault: string,
	name: string,
): { versions: () => (number | undefined)[]; close: () => void } {
	const document = new QueryObserver(client, semanticBoardDocumentQuery(vault, name));
	const picture = new QueryObserver(client, semanticRenderQuery({ vault, board: name }));
	const stops = [document.subscribe(ignore), picture.subscribe(ignore)];
	/**
	 * The versions of the document and the picture on screen.
	 * @returns Both, while they are there.
	 */
	function versions(): (number | undefined)[] {
		return [
			said(document.getCurrentResult().data).version,
			picture.getCurrentResult().data?.version,
		];
	}
	/** Stop showing it. */
	function close(): void {
		for (const stop of stops) stop();
	}
	return { versions, close };
}

test("a changed board is read from after the change: an answer decided before it does not win", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const shown = pane(client, SHOP, "Payments");
	await until(() => shown.versions().join() === "1,1");

	// A read of the board is on the wire, and the server has answered it with
	// version 1, when an agent writes version 2 and the news arrives.
	holding = true;
	void client.refetchQueries({ queryKey: semanticBoardDocumentQuery(SHOP, "Payments").queryKey });
	await until(() => held.length === 1);
	server.get(SHOP)!.version = 2;
	const refreshed = boardChanged(client, SHOP, "payments");
	release();
	await refreshed;

	await until(() => shown.versions().join() === "2,2");
	// The answer from before landed late and was not taken for the board.
	await new Promise((resolve) => setTimeout(resolve, 10));
	expect(shown.versions()).toEqual([2, 2]);
	shown.close();
	client.clear();
});

test("a board let go under the server's spelling reads again what was asked by another spelling or a former name, in that vault only", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const spelled = pane(client, SHOP, "PAYMENTS");
	const former = pane(client, SHOP, "Old payments");
	const elsewhere = pane(client, BILLING, "payments");
	await until(() => [spelled, former, elsewhere].every((one) => one.versions().join() === "1,1"));
	asked.length = 0;

	// Both vaults' boards move on; the server reports one pane letting go of a
	// proposal of the shop's board, by the key it lists it under.
	server.get(SHOP)!.version = 2;
	server.get(BILLING)!.version = 2;
	await boardsChanged(client, SHOP, ["payments@proposed"]);

	await until(() => [spelled, former].every((one) => one.versions().join() === "2,2"));
	expect(elsewhere.versions()).toEqual([1, 1]);
	expect(asked.filter((one) => one.startsWith(BILLING))).toEqual([]);
	for (const one of [spelled, former, elsewhere]) one.close();
	client.clear();
});

test("a listing reads again a board this tab drew ahead at another version, in that vault only", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	// Drawn ahead at version 1 in both vaults, with no pane showing either.
	for (const vault of [SHOP, BILLING]) {
		// oxlint-disable-next-line no-await-in-loop -- one vault's board, then the other's
		await client.fetchQuery(semanticRenderQuery({ vault, board: "payments" }));
	}
	server.get(SHOP)!.version = 2;
	server.get(BILLING)!.version = 2;
	const listing = {
		success: true,
		levels: ["system"],
		boards: [
			{
				name: "Payments",
				key: "payments",
				version: 2,
				opens: "v1",
				variants: [],
				links: [],
				description: null,
			},
		],
	};
	globalThis.fetch = Object.assign(
		() =>
			Promise.resolve(
				new Response(JSON.stringify(listing), { headers: { "Content-Type": "application/json" } }),
			),
		{ preconnect: realFetch.preconnect },
	);

	await client.fetchQuery(semanticBoardListQuery(SHOP));

	// Opening the shop's board shows the version listed; the billing board,
	// whose vault was not listed, is still the one drawn ahead.
	const opened = await client.fetchQuery(semanticRenderQuery({ vault: SHOP, board: "payments" }));
	expect(opened.version).toBe(2);
	const other = await client.fetchQuery(semanticRenderQuery({ vault: BILLING, board: "payments" }));
	expect(other.version).toBe(1);
	client.clear();
});

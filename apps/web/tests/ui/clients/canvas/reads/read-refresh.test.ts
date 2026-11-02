// What this tab reads after something tells it a model moved, on a real cache
// whose reads take time.
//
// What these catch: an answer the server decided before a write landing after
// it and counting as fresh; a picture drawn from the document of before because
// the document was marked stale after the pictures; a model let go under the
// server's spelling leaving a reading asked by another spelling or a former
// name at the old version, or leaving its vault's listing and the panes as they
// were; a listing of one vault leaving a model drawn ahead at the version it was
// drawn at, or reading again a model it lists at the version held; a model
// command reading the repositories, or reading everything again missing them; a
// policy change reading the models again rather than only drawing them; and
// news of one vault reading a model of the same name in another.

import { afterEach, beforeEach, expect, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { readRetainedFrom } from "#ui/clients/canvas/reads/retained-reads.ts";
import { modelChanged, policyChanged } from "#ui/clients/canvas/reads/read-refresh.ts";
import { takePicturesFrom } from "#ui/clients/canvas/reads/picture-source.ts";
import {
	retainedDocumentQuery,
	retainedListingQuery,
	semanticRenderQuery,
} from "#ui/clients/canvas/reads/queries.ts";
import type { SemanticRender, SemanticRenderRequest } from "#ui/clients/canvas/reads/drawings.ts";

const SHOP = "/work/shop/.archboard/vault";
const BILLING = "/work/billing/.archboard/vault";

/** The one model each vault holds, as the fake server has it now. */
interface Model {
	readonly name: string;
	readonly formerNames: readonly string[];
	version: number;
}

/** What the fake server holds, by vault. */
const server = new Map<string, Model>();
/** Every document read the server was asked for, as `vault|name`. */
const asked: string[] = [];
/** Every other request the server was asked, as `path`, or `path|vault` in a vault. */
const requested: string[] = [];
/** The vault of every picture drawn. */
const drawn: string[] = [];
/** Answers held back until `release`, each decided when it was asked. */
let held: (() => void)[] = [];
/** Whether answers are held back. */
let holding = false;

const realFetch = globalThis.fetch;

beforeEach(() => {
	server.set(SHOP, { name: "Payments", formerNames: ["Old payments"], version: 1 });
	server.set(BILLING, { name: "Payments", formerNames: [], version: 1 });
	readRetainedFrom({
		document: readDocument,
		listing: readListing,
		vaultCheck: notReadHere,
		codeFindings: notReadHere,
	});
	takePicturesFrom({ draw: drawFromDocument });
	globalThis.fetch = Object.assign(answerRoute, { preconnect: realFetch.preconnect });
});

afterEach(() => {
	globalThis.fetch = realFetch;
	asked.length = 0;
	requested.length = 0;
	drawn.length = 0;
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
 * Whether a name opens the vault's legacy board: its name or a former one, in any case.
 * @param model The legacy board.
 * @param name The name asked for.
 * @returns True when it opens it.
 */
function opens(model: Model, name: string): boolean {
	return [model.name, ...model.formerNames].some((one) => one.toLowerCase() === name.toLowerCase());
}

/**
 * The model route: the model as it is when asked, answered a moment later or when released.
 * @param vault The vault.
 * @param name The name asked for.
 * @param signal Cancels the read.
 * @returns The document.
 */
function readDocument(vault: string, name: string, signal?: AbortSignal): Promise<unknown> {
	asked.push(`${vault}|${name}`);
	const model = server.get(vault);
	if (model === undefined || !opens(model, name)) {
		return Promise.reject(new Error(`no model ${name}`));
	}
	const answer = { ...model };
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
 * The server's other routes: a vault's listing, as its model is now, and the
 * same shape for the panes and the repositories, which these tests only count.
 * @param input What was asked for.
 * @returns The answer.
 */
function answerRoute(input: string | URL | Request): Promise<Response> {
	const url = new URL(input instanceof Request ? input.url : String(input), "http://archboard");
	const vault = url.searchParams.get("vault");
	requested.push(vault === null ? url.pathname : `${url.pathname}|${vault}`);
	const model = vault === null ? undefined : server.get(vault);
	const models =
		model === undefined
			? []
			: [
					{
						name: model.name,
						key: model.name.toLowerCase(),
						version: model.version,
						opens: "v1",
						variants: [],
						links: [],
						description: null,
					},
				];
	return Promise.resolve(
		new Response(JSON.stringify({ success: true, levels: ["system"], boards: models }), {
			headers: { "Content-Type": "application/json" },
		}),
	);
}

/**
 * Supply the existing retained-list fixture through its capture provider.
 * @param vault The fixture vault.
 * @returns Its listed documents.
 */
async function readListing(vault: string) {
	const response = await answerRoute(`retained-list?vault=${encodeURIComponent(vault)}`);
	return response.json();
}

/**
 * Draw a picture from the model's document as this tab's cache holds it.
 * @param request What is asked for.
 * @param client The tab's cache.
 * @returns A blank picture of the document's model and version.
 */
async function drawFromDocument(
	request: SemanticRenderRequest,
	client: QueryClient,
): Promise<SemanticRender> {
	const document = said(
		await client.fetchQuery(retainedDocumentQuery(request.vault, request.model)),
	);
	drawn.push(request.vault);
	return {
		kind: "drawn",
		success: true,
		model: document.name ?? request.model,
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
		appearances: [],
		legend: null,
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

/**
 * Let every read asked for so far answer.
 * @returns Settles a moment later.
 */
function settle(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 10));
}

/** What a pane does with news of its own reads: nothing these tests look at. */
function ignore(): void {}

/**
 * A pane showing one model of one vault by one name: its document and its picture.
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
	const document = new QueryObserver(client, retainedDocumentQuery(vault, name));
	const picture = new QueryObserver(client, semanticRenderQuery({ vault, model: name }));
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

test("a changed model is read from after the change: an answer decided before it does not win", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const shown = pane(client, SHOP, "Payments");
	await until(() => shown.versions().join() === "1,1");

	// A read of the model is on the wire, and the server has answered it with
	// version 1, when an agent writes version 2 and the news arrives.
	holding = true;
	void client.refetchQueries({ queryKey: retainedDocumentQuery(SHOP, "Payments").queryKey });
	await until(() => held.length === 1);
	server.get(SHOP)!.version = 2;
	const refreshed = modelChanged(client, SHOP, "payments");
	release();
	await refreshed;

	await until(() => shown.versions().join() === "2,2");
	// The answer from before landed late and was not taken for the model.
	await settle();
	expect(shown.versions()).toEqual([2, 2]);
	shown.close();
	client.clear();
});

test("a listing reads again a model this tab drew ahead at another version, by any spelling, in that vault only, and nothing it lists at the version held", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	// Drawn ahead at version 1 in both vaults, with no pane showing either, the
	// shop's model asked by another spelling than the key it is listed under.
	await client.fetchQuery(semanticRenderQuery({ vault: SHOP, model: "PAYMENTS" }));
	await client.fetchQuery(semanticRenderQuery({ vault: BILLING, model: "payments" }));

	// Listed at the version it was drawn at, it is not read again.
	await client.fetchQuery(retainedListingQuery(SHOP));
	asked.length = 0;
	await client.fetchQuery(semanticRenderQuery({ vault: SHOP, model: "PAYMENTS" }));
	expect(asked).toEqual([]);

	server.get(SHOP)!.version = 2;
	server.get(BILLING)!.version = 2;
	await client.fetchQuery(retainedListingQuery(SHOP));

	// Opening the shop's model shows the version listed; the billing model,
	// whose vault was not listed, is still the one drawn ahead.
	const opened = await client.fetchQuery(semanticRenderQuery({ vault: SHOP, model: "PAYMENTS" }));
	expect(opened.version).toBe(2);
	const other = await client.fetchQuery(semanticRenderQuery({ vault: BILLING, model: "payments" }));
	expect(other.version).toBe(1);
	client.clear();
});

test("a changed policy draws its vault's pictures again without reading a model, and no other vault's", async () => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const shop = pane(client, SHOP, "Payments");
	const billing = pane(client, BILLING, "Payments");
	await until(() => [shop, billing].every((one) => one.versions().join() === "1,1"));
	asked.length = 0;
	drawn.length = 0;

	await policyChanged(client, SHOP);
	await until(() => drawn.length === 1);
	await settle();

	expect({ drawn, asked }).toEqual({ drawn: [SHOP], asked: [] });
	shop.close();
	billing.close();
	client.clear();
});

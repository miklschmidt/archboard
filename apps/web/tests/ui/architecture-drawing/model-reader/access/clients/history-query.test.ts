// One query reads every history analysis from the route of its name. It spells the request as
// the route's query, in the request's own field order, reads a refusal as the read's error, and
// refuses an answer of another analysis. Invalidating a vault reaches it.
import { afterAll, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	ArchitectureReadError,
	historyQuery,
	invalidateModelQueries,
} from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";

const VAULT = "/work/shop/.archboard/vault";
const OTHER = "/work/blog/.archboard/vault";
const realFetch = globalThis.fetch;
/** The URL of each request, in the order they were sent. */
const asked: string[] = [];
/** What the route answers next. */
let reply: Response = Response.json({});

/**
 * Answer every request with the prepared response.
 * @param input The request URL.
 * @returns The prepared response.
 */
async function route(input: Parameters<typeof fetch>[0]): Promise<Response> {
	asked.push(input instanceof Request ? input.url : input.toString());
	return reply;
}
globalThis.fetch = Object.assign(route, { preconnect: realFetch.preconnect });

afterAll(() => {
	globalThis.fetch = realFetch;
});

/** A locality answer with one part, which no commit changed. */
const LOCALITY = {
	success: true,
	analysis: "locality",
	model: "Shop",
	state: { id: "Current", name: "As it is", lifecycle: "current" },
	revision: { digest: "a".repeat(64), files: [] },
	periods: [],
	commits: [],
	hotspots: [],
	coupling: [],
	leftOut: { largeCommits: 0 },
	skipped: [],
};

/**
 * Keep the whole answer.
 * @param answer The answer.
 * @returns The same answer.
 */
function whole<T>(answer: T): T {
	return answer;
}

/** The refusal of a vault that is being written. */
const BUSY = {
	success: false,
	code: "MODEL_BUSY",
	error: "The architecture is being written.",
	diagnostics: [{ code: "MODEL_BUSY", file: ".", message: "Busy.", recovery: "Retry." }],
};

test("the request is the route's query in its field order, and a refusal is the read's error", async () => {
	asked.length = 0;
	reply = Response.json(BUSY, { status: 409 });
	const read = new QueryClient().fetchQuery(
		historyQuery(
			VAULT,
			{ analysis: "refs", base: "main", head: "topic", state: "Current", ref: undefined },
			{ key: ["merge-base"], accept: whole },
		),
	);
	const failure = await read.catch((error: unknown) => error);
	expect(failure).toBeInstanceOf(ArchitectureReadError);
	expect(failure instanceof ArchitectureReadError && failure.failure.code).toBe("MODEL_BUSY");
	expect(asked).toEqual([
		`/api/architecture/refs?vault=${encodeURIComponent(VAULT)}&base=main&head=topic&state=Current`,
	]);
});

test("an answer of another analysis is refused", async () => {
	reply = Response.json(LOCALITY);
	const read = new QueryClient().fetchQuery(
		historyQuery(
			VAULT,
			{ analysis: "footprint", base: "main", state: "Current" },
			{ key: ["footprint"], accept: whole },
		),
	);
	expect(await read.catch((error: unknown) => error)).toEqual(
		new Error("The history response contains another analysis. Retry the read."),
	);
});

test("invalidating a vault reaches its history reads and no other vault's", async () => {
	const client = new QueryClient();
	const shop = historyQuery(VAULT, { analysis: "locality" }, { key: ["locality"], accept: whole });
	const blog = historyQuery(OTHER, { analysis: "locality" }, { key: ["locality"], accept: whole });
	reply = Response.json(LOCALITY);
	await client.fetchQuery(shop);
	reply = Response.json(LOCALITY);
	await client.fetchQuery(blog);
	await invalidateModelQueries(client, VAULT);
	expect(client.getQueryState(shop.queryKey)?.isInvalidated).toBe(true);
	expect(client.getQueryState(blog.queryKey)?.isInvalidated).toBe(false);
	await invalidateModelQueries(client);
	expect(client.getQueryState(blog.queryKey)?.isInvalidated).toBe(true);
});

// When a pane asks for a board's locality (ADR 0045): only when a person presses
// its read action, and never on a pick, a timer, a return to the tab or a
// reconnect. A walk of a year of Git is work for the server. The selection tab
// is drawn again for each pick, so each pick is a new subscription; the
// canonical code/history browser owner covers visible selection and real Git evidence.
//
// The query library decides when it loads whether it runs in a browser, and
// only a browser runs intervals. So this file registers the DOM before it loads
// anything that loads the library, and drives the clock by hand.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, jest, test } from "bun:test";

import type { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";
import type { z } from "zod";
type LocalityAnswer = Extract<
	z.infer<typeof ArchitectureHistoryResultSchema>,
	{ success: true; analysis: "locality" }
>;

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

const { QueryClient, QueryObserver, focusManager, onlineManager } =
	await import("@tanstack/react-query");
const { act, cleanup } = await import("@testing-library/react");
const { modelHistoryQuery } = await import("#ui/clients/architecture-model/history.ts");

afterAll(async () => {
	globalThis.fetch = realFetch;
	cleanup();
	jest.useRealTimers();
	await GlobalRegistrator.unregister();
});

/** The vault the pane is in. */
const VAULT = "/work/archboard/.archboard/vault";

/** The answer: one part read, which no commit changed. */
const ANSWER: LocalityAnswer = {
	success: true,
	analysis: "locality",
	model: "Pipeline",
	state: { id: "Current", name: "As it is", lifecycle: "current" },
	revision: { digest: "a".repeat(64), files: [] },
	periods: [],
	commits: [],
	hotspots: [
		{
			subject: { id: "a", kind: "node", name: "A" },
			repo: "example/pipeline",
			path: "src/a.ts",
			commits: [],
			count: 0,
		},
	],
	coupling: [],
	leftOut: { largeCommits: 0 },
	skipped: [],
};

/** The exact canonical architecture whose code history is requested. */
const MODEL: Parameters<typeof modelHistoryQuery>[1] = {
	manifest: {
		schemaVersion: 1,
		id: "Pipeline",
		name: "Pipeline",
		current: { id: "Current", name: "As it is" },
	},
	selectedState: ANSWER.state,
	revision: ANSWER.revision,
};
const realFetch = globalThis.fetch;

/**
 * Answer the actual canonical history transport without a Git process in this query owner.
 * @param input The canonical HTTP URL.
 * @returns The bounded history response.
 */
async function answerHistory(input: Parameters<typeof fetch>[0]): Promise<Response> {
	const address = new URL(input instanceof Request ? input.url : input, "http://localhost");
	if (address.pathname !== "/api/architecture/locality")
		throw new Error(`Unexpected history route ${address.pathname}`);
	asked += 1;
	return Response.json(ANSWER);
}
globalThis.fetch = Object.assign(answerHistory, { preconnect: realFetch.preconnect });

/** How many times the locality was asked. */
let asked = 0;

/**
 * Let time go by on the hand-driven clock, and what it sets off settle.
 * @param ms How long.
 */
async function pass(ms: number): Promise<void> {
	await act(async () => {
		jest.advanceTimersByTime(ms);
	});
	await act(async () => {
		jest.advanceTimersByTime(0);
	});
}

test("the locality waits for a request through every pick, timer, focus and reconnect", async () => {
	jest.useFakeTimers();
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const observer = new QueryObserver(client, modelHistoryQuery(VAULT, MODEL));
	const unsubscribe = observer.subscribe(() => undefined);
	await pass(60_000);
	await act(async () => {
		focusManager.setFocused(false);
		focusManager.setFocused(true);
		onlineManager.setOnline(false);
		onlineManager.setOnline(true);
	});
	await pass(0);
	expect(asked).toBe(0);
	await act(async () => {
		await observer.refetch();
	});
	expect(asked).toBe(1);
	expect(observer.getCurrentResult().data).toEqual(ANSWER);
	unsubscribe();
	client.clear();
	focusManager.setFocused(undefined);
});

test("a pane that moves to another repository shows none of the last one's history", async () => {
	jest.useFakeTimers();
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const observer = new QueryObserver(client, modelHistoryQuery(VAULT, MODEL));
	const unsubscribe = observer.subscribe(() => undefined);
	await act(async () => {
		await observer.refetch();
	});
	expect(observer.getCurrentResult().data).toEqual(ANSWER);

	// The same board in another checkout, whose history is its own.
	observer.setOptions(modelHistoryQuery("/work/archboard-next/.archboard/vault", MODEL));
	expect(observer.getCurrentResult().data).toBeUndefined();
	unsubscribe();
	client.clear();
});

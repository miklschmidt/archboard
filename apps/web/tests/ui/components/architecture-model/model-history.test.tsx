import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { createElement, type ComponentProps, type JSX } from "react";
import type { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";
import type { z } from "zod";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { ModelHistory } = await import("#ui/components/architecture-model/ModelHistory.tsx");

type HistoryAnswer = Extract<
	z.infer<typeof ArchitectureHistoryResultSchema>,
	{ success: true; analysis: "locality" }
>;
type Reading = ComponentProps<typeof ModelHistory>["model"];
const VAULT = "/work/pipeline/.archboard/vault";
const MODULES: Reading["modules"] = [
	["h", "Handler", "route"],
	["q", "Queue", "queue"],
	["l", "Ledger", "datastore"],
	["g", "Gateway", "route"],
	["w", "Worker", "job"],
	["orders", "Orders", "service"],
].map(([id, name, kind], order) => ({
	schemaVersion: 1,
	id: `Pipeline#${id}`,
	name: name!,
	kind: kind!,
	order,
	file: `${id}.module.json`,
	outgoing: [],
	...(id === "w" ? {} : { binding: { repo: "example/pipeline", path: `src/${id}.ts` } }),
}));
const MODEL: Reading = {
	manifest: {
		schemaVersion: 1,
		id: "Pipeline",
		name: "Pipeline",
		current: { id: "Current", name: "Implemented" },
	},
	selectedState: { id: "Current", name: "Implemented", lifecycle: "current" },
	revision: { digest: "a".repeat(64), files: [] },
	policy: DEFAULT_SEMANTIC_POLICY,
	modules: MODULES,
};
const realFetch = globalThis.fetch;
let response: HistoryAnswer | Promise<HistoryAnswer>;
let status = 200;
const requested: URL[] = [];
const picked: string[] = [];
const clients: InstanceType<typeof QueryClient>[] = [];

/**
 * Answer the canonical transport and record its explicit selectors.
 * @param input The request URL.
 * @returns The selected test response.
 */
async function answerHistory(input: Parameters<typeof fetch>[0]): Promise<Response> {
	const url = new URL(input instanceof Request ? input.url : input, "http://localhost");
	if (url.pathname !== "/api/architecture/locality")
		throw new Error(`Unexpected route ${url.pathname}`);
	requested.push(url);
	return status === 200
		? Response.json(await response)
		: Response.json({ success: false, error: "Git unavailable" }, { status });
}

beforeEach(() => {
	response = answer();
	status = 200;
	requested.length = 0;
	picked.length = 0;
	globalThis.fetch = Object.assign(answerHistory, { preconnect: realFetch.preconnect });
});
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	globalThis.fetch = realFetch;
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * Mount the actual history consumer independently from retained board rendering.
 * @param initial The chosen module identity.
 * @returns A model/selection update action.
 */
async function mountHistory(initial = "h") {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	/**
	 * Render a coherent selected module.
	 * @param id The local fixture identity.
	 * @param model The exact model metadata.
	 * @returns The real history component and its cache.
	 */
	const tree = (id: string, model: Reading): JSX.Element =>
		createElement(
			QueryClientProvider,
			{ client },
			createElement(ModelHistory, {
				vault: VAULT,
				model,
				module: model.modules.find((entry) => entry.id === `Pipeline#${id}`)!,
				/**
				 * Report the exact canonical partner identity.
				 * @param value The selected subject.
				 */
				onSelect: (value) => {
					picked.push(value);
				},
			}),
		);
	const mounted = render(tree(initial, MODEL));
	return {
		/**
		 * Update the selected module or its exact architecture revision.
		 * @param id The fixture module identity.
		 * @param model The coherent reading.
		 */
		choose: async (id: string, model: Reading = MODEL): Promise<void> => {
			await act(async () => {
				mounted.rerender(tree(id, model));
			});
		},
	};
}

/**
 * The commits of the period, newest first, as the answer lists them.
 */
const COMMITS = ["c6", "c5", "c4", "c3", "c2", "c1"].map((commit, index) => ({
	repo: "example/pipeline",
	commit,
	committedAt: `2026-09-${String(20 - index).padStart(2, "0")}T12:00:00Z`,
	subject: `change ${commit}`,
	files: 3,
}));

/**
 * One part the answer names.
 * @param id The part.
 * @param name What it is called.
 * @returns The subject, as the answer gives it.
 */
function subject(id: string, name: string): { id: string; kind: "node"; name: string } {
	return { id: `Pipeline#${id}`, kind: "node", name };
}

/**
 * One part the lens read.
 * @param id The part.
 * @param name What it is called.
 * @param commits The commits that changed it, newest first.
 * @returns The hotspot.
 */
function hotspot(
	id: string,
	name: string,
	commits: readonly string[],
): HistoryAnswer["hotspots"][number] {
	return {
		subject: subject(id, name),
		repo: "example/pipeline",
		path: `src/${id}.ts`,
		commits: [...commits],
		count: commits.length,
	};
}

/**
 * The route's answer for the pipeline's current variant. The handler changed
 * in all six commits; it changes with the queue, which a relationship joins to
 * it, and with the ledger, which nothing joins to it. The gateway changed in
 * none, the worker is bound to nothing, and Orders opens a board of its own.
 * @returns The route's success body.
 */
function answer(): HistoryAnswer {
	return {
		success: true,
		analysis: "locality",
		model: "Pipeline",
		state: MODEL.selectedState,
		revision: MODEL.revision,
		periods: [
			{
				repo: "example/pipeline",
				head: "c6",
				since: "2025-09-20T12:00:00.000Z",
				until: "2026-09-20T12:00:00.000Z",
			},
		],
		commits: COMMITS,
		hotspots: [
			hotspot("h", "Handler", ["c6", "c5", "c4", "c3", "c2", "c1"]),
			hotspot("q", "Queue", ["c6", "c5", "c4", "c3", "c2"]),
			hotspot("l", "Ledger", ["c5", "c4", "c3", "c2", "c1"]),
			hotspot("g", "Gateway", []),
		],
		coupling: [
			{
				subjects: [subject("h", "Handler"), subject("q", "Queue")],
				repo: "example/pipeline",
				commits: ["c6", "c5", "c4", "c3", "c2"],
				shared: 5,
				degree: 90,
				unjoined: false,
			},
			{
				subjects: [subject("l", "Ledger"), subject("h", "Handler")],
				repo: "example/pipeline",
				commits: ["c5", "c4", "c3", "c2", "c1"],
				shared: 5,
				degree: 90,
				unjoined: true,
			},
		],
		leftOut: { largeCommits: 2 },
		skipped: [
			{ subject: subject("w", "Worker"), reason: "unbound" },
			{ subject: subject("orders", "Orders"), reason: "checkout-unavailable" },
		],
	};
}

/**
 * One element of the history region, or null when it is not there.
 * @param slot Its slot.
 * @returns The element.
 */
function region(slot: string): Element | null {
	return document.querySelector(`[data-slot='semantic-inspector-history'] [data-slot='${slot}']`);
}

/**
 * The rows of one list of the region, by the attribute that names each.
 * @param slot The list's slot.
 * @param attribute What names a row.
 * @returns The names, in order.
 */
function rows(slot: string, attribute: string): (string | null)[] {
	return [...(region(slot)?.querySelectorAll(`[${attribute}]`) ?? [])].map((row) =>
		row.getAttribute(attribute),
	);
}

/**
 * The count a section of the region carries.
 * @param slot The section's slot.
 * @returns The count, or null when the section is not there.
 */
function count(slot: string): string | null {
	return region(slot)?.getAttribute("data-count") ?? null;
}

/**
 * The rows of the parts the picked part changes with.
 * @returns The rows, in order.
 */
function partnerRows(): HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>("[data-slot='semantic-inspector-partner']")];
}

test("canonical history shows bounded commits and exact coupled-subject callbacks", async () => {
	await mountHistory();
	await waitFor(() => expect(count("semantic-inspector-commits")).toBe("6"));
	expect(requested[0]?.searchParams.get("vault")).toBe(VAULT);
	expect(requested[0]?.searchParams.get("state")).toBe("Current");
	expect(rows("semantic-inspector-commit-list", "data-commit")).toEqual([
		"c6",
		"c5",
		"c4",
		"c3",
		"c2",
	]);
	await act(async () => {
		fireEvent.click(region("semantic-inspector-commits")!.querySelector("button[aria-expanded]")!);
	});
	expect(rows("semantic-inspector-commit-list", "data-commit")).toHaveLength(6);
	expect(count("semantic-inspector-partners")).toBe("2");
	expect(
		partnerRows().map((row) => [
			row.dataset["part"],
			row.dataset["shared"],
			row.dataset["unjoined"],
		]),
	).toEqual([
		["Pipeline#q", "5", "false"],
		["Pipeline#l", "5", "true"],
	]);
	expect(count("semantic-inspector-large-commits")).toBe("2");
	await act(async () => {
		fireEvent.click(partnerRows()[1]!);
	});
	expect(picked).toEqual(["Pipeline#l"]);
});

test("unbound modules ask nothing while skipped and unchanged modules remain distinct", async () => {
	const pane = await mountHistory("w");
	expect(document.querySelector('[data-slot="semantic-inspector-history"]')).toBeNull();
	expect(requested).toHaveLength(0);
	await pane.choose("orders");
	await waitFor(() =>
		expect(region("semantic-inspector-history-skipped")?.getAttribute("data-reason")).toBe(
			"checkout-unavailable",
		),
	);
	expect(region("semantic-inspector-commits")).toBeNull();
	await pane.choose("g");
	await waitFor(() => expect(count("semantic-inspector-commits")).toBe("0"));
	expect(region("semantic-inspector-history-skipped")).toBeNull();
	expect(region("semantic-inspector-partners")).toBeNull();
});

test("a refused history read retries only through the visible refresh action", async () => {
	status = 500;
	await mountHistory();
	await waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull());
	expect(requested).toHaveLength(1);
	status = 200;
	await act(async () => {
		fireEvent.click(document.querySelector('[data-slot="semantic-inspector-history"] button')!);
	});
	await waitFor(() => expect(count("semantic-inspector-commits")).toBe("6"));
	expect(requested).toHaveLength(2);
	expect(document.querySelector('[role="alert"]')).toBeNull();
});

test("another architecture revision never displays the previous revision's history", async () => {
	const pane = await mountHistory();
	await waitFor(() => expect(count("semantic-inspector-commits")).toBe("6"));
	const waiting = Promise.withResolvers<HistoryAnswer>();
	response = waiting.promise;
	const next = { ...MODEL, revision: { digest: "b".repeat(64), files: [] } };
	await pane.choose("h", next);
	await waitFor(() => expect(requested).toHaveLength(2));
	expect(region("semantic-inspector-commits")).toBeNull();
	waiting.resolve({
		...answer(),
		revision: next.revision,
		hotspots: [hotspot("h", "Handler", [])],
	});
	await waitFor(() => expect(count("semantic-inspector-commits")).toBe("0"));
});

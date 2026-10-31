// What the list across the model says in each state a read can reach: the interface stands at
// once, the history arrives with the answer, a failed read says what happened and reads again, and
// a module the lens did not read says why.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import type { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";
import type { z } from "zod";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { ModelMeasures } = await import("#ui/components/architecture-model/ModelMeasures.tsx");

type Props = ComponentProps<typeof ModelMeasures>;
type HistoryAnswer = Extract<
	z.infer<typeof ArchitectureHistoryResultSchema>,
	{ success: true; analysis: "locality" }
>;

const realFetch = globalThis.fetch;
const clients: InstanceType<typeof QueryClient>[] = [];
const REVISION = { digest: "a".repeat(64), files: [] };
const STATE = { id: "Current", name: "Implemented", lifecycle: "current" } as const;

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	globalThis.fetch = realFetch;
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/**
 * A module the answer names.
 * @param id Its identity.
 * @returns The subject.
 */
function subject(id: string) {
	return { kind: "node", id, name: id } as const;
}

/** The answer of a read: `api` changed in four commits, and `worker` binds no code. */
const ANSWER: HistoryAnswer = {
	success: true,
	analysis: "locality",
	model: "Shop",
	state: STATE,
	revision: REVISION,
	periods: [
		{
			repo: "example/shop",
			head: "c1",
			since: "2025-10-31T12:00:00.000Z",
			until: "2026-10-31T12:00:00.000Z",
		},
	],
	commits: [],
	hotspots: [
		{ subject: subject("api"), repo: "example/shop", path: "src", commits: [], count: 4 },
		{ subject: subject("route"), repo: "example/shop", path: "src/r.ts", commits: [], count: 0 },
	],
	coupling: [],
	leftOut: { largeCommits: 2 },
	skipped: [{ subject: subject("worker"), reason: "unbound" }],
};

const MODEL: Props["model"] = {
	manifest: { schemaVersion: 1, id: "Shop", name: "Shop", current: { id: "Current", name: "Now" } },
	selectedState: STATE,
	revision: REVISION,
	modules: [{ binding: { repo: "example/shop", path: "src" } }],
};

const PROJECTION: Props["projection"] = {
	complete: {
		nodes: [
			{ id: "api", name: "api", kind: "service", order: 1 },
			{ id: "route", name: "route", kind: "module", order: 2, parent: "api" },
			{ id: "worker", name: "worker", kind: "module", order: 3 },
		],
		edges: [{ id: "e", from: "worker", to: "route", kind: "call", order: 1, emphasis: "normal" }],
		flows: [],
		walkthroughs: [],
	},
};

/**
 * Answer the read as a test says.
 * @param answer The body of each read, in turn.
 * @returns How many reads came.
 */
function answering(...answer: readonly (() => Promise<Response>)[]): { reads: number } {
	const count = { reads: 0 };
	globalThis.fetch = Object.assign(
		async () => {
			const reply = answer[Math.min(count.reads, answer.length - 1)]!;
			count.reads += 1;
			return reply();
		},
		{ preconnect: realFetch.preconnect },
	);
	return count;
}

/**
 * Mount the list.
 * @param overrides What differs from a bound reading sorted by commits.
 * @returns The reader's choices of a module.
 */
function mount(overrides: Partial<Props> = {}): { readonly chosen: string[] } {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	const chosen: string[] = [];
	render(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(ModelMeasures, {
				vault: "/work/shop/.archboard/vault",
				model: MODEL,
				projection: PROJECTION,
				selected: null,
				measure: "commits",
				/**
				 * No test here changes the sort.
				 * @returns Nothing.
				 */
				onMeasure: () => undefined,
				/**
				 * Report the module a row chose.
				 * @param id The module.
				 */
				onChoose: (id) => {
					chosen.push(id);
				},
				...overrides,
			}),
		),
	);
	return { chosen };
}

/**
 * How the list stands.
 * @returns The state of its history.
 */
function history(): string | undefined {
	return document.querySelector<HTMLElement>('[data-slot="model-measures"]')?.dataset["history"];
}

/**
 * One row of the list.
 * @param id The module.
 * @returns The row.
 */
function row(id: string): HTMLElement {
	return document.querySelector<HTMLElement>(`[data-measure-row="${id}"]`)!;
}

test("the interface stands at once, and the history arrives with the answer", async () => {
	const waiting = Promise.withResolvers<Response>();
	answering(() => waiting.promise);
	mount();
	expect(history()).toBe("reading");
	expect(row("api").querySelector('[data-measure="entryPoints"]')?.getAttribute("data-count")).toBe(
		"1",
	);
	expect(row("api").querySelector('[data-measure="commits"]')).toBeNull();
	await act(async () => {
		waiting.resolve(Response.json(ANSWER));
		await waiting.promise;
	});
	await waitFor(() => expect(history()).toBe("read"));
	expect(row("api").querySelector('[data-slot="model-measure-sorted"]')?.textContent).toStartWith(
		"4",
	);
});

test("a module the read skipped says why, and a module no commit changed shows its count", async () => {
	answering(async () => Response.json(ANSWER));
	mount({ measure: "callers" });
	await waitFor(() => expect(history()).toBe("read"));
	expect(row("worker").querySelector("[data-not-read]")?.getAttribute("data-not-read")).toBe(
		"unbound",
	);
	expect(row("worker").querySelector('[data-measure="commits"]')).toBeNull();
	expect(row("route").querySelector('[data-measure="commits"]')?.getAttribute("data-count")).toBe(
		"0",
	);
});

test("every measure keeps its place on a row, whatever the row can say of it", async () => {
	answering(async () => Response.json(ANSWER));
	mount();
	await waitFor(() => expect(history()).toBe("read"));
	const cells = (id: string): number =>
		row(id).querySelector('[data-slot="model-measure-cells"]')!.childElementCount;
	expect(cells("api")).toBe(7);
	expect(cells("route")).toBe(7);
	expect(cells("worker")).toBe(7);
});

test("a row says its counts to assistive technology, because a bare number says nothing", async () => {
	answering(async () => Response.json(ANSWER));
	mount();
	await waitFor(() => expect(history()).toBe("read"));
	const label = row("api").getAttribute("aria-label")!;
	expect(label).toStartWith("api");
	expect(label).toContain("4");
	expect(row("worker").getAttribute("aria-label")).not.toContain("Commits");
});

test("the list says once why modules were not read", async () => {
	answering(async () => Response.json(ANSWER));
	mount();
	await waitFor(() => expect(history()).toBe("read"));
	const status = document.querySelector('[data-slot="model-measures-status"]')!;
	expect(status.textContent).toContain("1 ");
	expect(row("worker").textContent).not.toContain("Not read");
});

test("the bar of a row follows the sorted count, and a count of none has none", async () => {
	answering(async () => Response.json(ANSWER));
	mount();
	await waitFor(() => expect(history()).toBe("read"));
	const bar = (id: string) => row(id).querySelector<HTMLElement>('[data-slot="model-measure-bar"]');
	expect(bar("api")?.style.width).toContain("* 1)");
	expect(bar("route")).toBeNull();
	expect(bar("worker")).toBeNull();
});

test("a failed read says so and offers the read again, and the interface stays", async () => {
	const reads = answering(
		async () => Response.json({ success: false, error: "Git is gone" }, { status: 500 }),
		async () => Response.json(ANSWER),
	);
	mount();
	await waitFor(() => expect(history()).toBe("failed"));
	expect(document.querySelector('[role="alert"]')).not.toBeNull();
	expect(row("api").querySelector('[data-measure="entryPoints"]')).not.toBeNull();
	await act(async () => {
		fireEvent.click(document.querySelector('[data-slot="model-measures-read"]')!);
	});
	await waitFor(() => expect(history()).toBe("read"));
	expect(reads.reads).toBe(2);
});

test("a model with no binding says what history needs, reads nothing, and sorts by what it has", () => {
	const reads = answering(async () => Response.json(ANSWER));
	mount({ model: { ...MODEL, modules: [] } });
	expect(history()).toBe("unbound");
	expect(reads.reads).toBe(0);
	expect(row("api").querySelector('[data-slot="model-measure-sorted"]')?.textContent).toStartWith(
		"1",
	);
});

test("a reading with no module says so", () => {
	answering(async () => Response.json(ANSWER));
	mount({
		model: { ...MODEL, modules: [] },
		projection: { complete: { nodes: [], edges: [], flows: [], walkthroughs: [] } },
	});
	expect(document.querySelector('[data-slot="model-measures-empty"]')).not.toBeNull();
});

test("a row chooses its module", async () => {
	answering(async () => Response.json(ANSWER));
	const { chosen } = mount();
	await act(async () => {
		fireEvent.click(row("route"));
	});
	expect(chosen).toEqual(["route"]);
});

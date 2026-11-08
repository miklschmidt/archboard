// What a table of Measures says in each state a read can reach: the interface stands at once, the
// history arrives with the answer, a failed read says what happened and reads again, and a module
// the lens did not read says why. A column's head sorts the rows, and a row selects its module.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import type { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";
import type { z } from "zod";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { ModelMeasures } =
	await import("#ui/architecture-drawing/model-reader/reading/components/ModelMeasures.tsx");
const { kindLookOf } = await import("#ui/architecture-drawing/canvas/picture/rules/kind-look.ts");

type Props = ComponentProps<typeof ModelMeasures>;
type HistoryAnswer = Extract<
	z.infer<typeof ArchitectureHistoryResultSchema>,
	{ success: true; analysis: "locality" }
>;

const realFetch = globalThis.fetch;
const clients: InstanceType<typeof QueryClient>[] = [];
const REVISION = { digest: "a".repeat(64), files: [] };
/** The columns of each table, as the dialog gives them. */
const EXPOSES = ["entryPoints", "hiddenParts", "passThrough", "callers", "wholeModule"] as const;
const TOGETHER = ["together", "unjoined", "commits"] as const;
/** A table of history, sorted by its commits. */
const BY_COMMITS: Props["view"] = { measure: "commits", fewest: false, show: "all" };
const STATE = { id: "Current", name: "Implemented", lifecycle: "current" } as const;

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	globalThis.fetch = realFetch;
});
afterAll(async () => {
	// A read that settles after the last test leaves React work that needs the window.
	await Bun.sleep(1);
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
	policy: DEFAULT_SEMANTIC_POLICY,
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
 * Mount a table.
 * @param overrides What differs from a bound table of history sorted by commits.
 * @returns The reader's choices of a module, and of how the table stands.
 */
function mount(overrides: Partial<Props> = {}): {
	readonly chosen: (readonly [string, boolean])[];
	readonly views: Props["view"][];
} {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	const chosen: (readonly [string, boolean])[] = [];
	const views: Props["view"][] = [];
	render(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(ModelMeasures, {
				vault: "/work/shop/.archboard/vault",
				model: MODEL,
				projection: PROJECTION,
				label: "What changes together",
				keys: [...TOGETHER, ...EXPOSES],
				look: kindLookOf(DEFAULT_SEMANTIC_POLICY, new Map()),
				selected: null,
				view: BY_COMMITS,
				/**
				 * Report how the reader changed the table.
				 * @param view How it stands now.
				 */
				onView: (view) => {
					views.push(view);
				},
				/**
				 * Report the module a row chose.
				 * @param id The module.
				 * @param beside Whether it opens beside the reading.
				 */
				onChoose: (id, beside) => {
					chosen.push([id, beside]);
				},
				...overrides,
			}),
		),
	);
	return { chosen, views };
}

/**
 * How the table stands.
 * @returns The state of its history.
 */
function history(): string | undefined {
	return document.querySelector<HTMLElement>('[data-slot="model-measures"]')?.dataset["history"];
}

/**
 * One row of the table.
 * @param id The module.
 * @returns The row.
 */
function row(id: string): HTMLElement {
	return document.querySelector<HTMLElement>(`[data-measure-row="${id}"]`)!;
}

/**
 * The key of a row, which chooses its module.
 * @param id The module.
 * @returns The key.
 */
function button(id: string): HTMLButtonElement {
	return row(id).querySelector("button")!;
}

/**
 * The sorted count of a row.
 * @param id The module.
 * @returns The count, or nothing for a row with none.
 */
function sorted(id: string): string | null | undefined {
	return row(id).querySelector("[data-sorted]")?.textContent;
}

/**
 * How many counts a row holds, one for each column.
 * @param id The module.
 * @returns The count.
 */
function cells(id: string): number {
	return row(id).querySelectorAll("td").length;
}

/**
 * The modules of the table, in the order of its rows.
 * @returns Their identities.
 */
function order(): (string | null)[] {
	return [...document.querySelectorAll("[data-measure-row]")].map((one) =>
		one.getAttribute("data-measure-row"),
	);
}

/** A table of what a module exposes, which reads no history. */
const EXPOSED: Partial<Props> = {
	label: "What a module exposes",
	keys: EXPOSES,
	view: { measure: "entryPoints", fewest: false, show: "all" },
};

test("the interface stands at once and reads nothing", () => {
	const reads = answering(async () => Response.json(ANSWER));
	mount(EXPOSED);
	expect(history()).toBeUndefined();
	expect(reads.reads).toBe(0);
	expect(row("api").querySelector('[data-measure="entryPoints"]')?.getAttribute("data-count")).toBe(
		"1",
	);
	expect(row("api").querySelector('[data-measure="commits"]')).toBeNull();
});

test("the history arrives with the answer", async () => {
	const waiting = Promise.withResolvers<Response>();
	answering(() => waiting.promise);
	mount({ keys: TOGETHER });
	expect(history()).toBe("reading");
	expect(row("api").querySelector('[data-measure="commits"]')).toBeNull();
	await act(async () => {
		waiting.resolve(Response.json(ANSWER));
		await waiting.promise;
	});
	await waitFor(() => expect(history()).toBe("read"));
	expect(sorted("api")).toBe("4");
});

test("a module the read skipped says why, and a module no commit changed shows its count", async () => {
	answering(async () => Response.json(ANSWER));
	mount({ keys: TOGETHER });
	await waitFor(() => expect(history()).toBe("read"));
	expect(row("worker").querySelector("[data-not-read]")?.getAttribute("data-not-read")).toBe(
		"unbound",
	);
	expect(row("worker").querySelector('[data-measure="commits"]')).toBeNull();
	expect(row("route").querySelector('[data-measure="commits"]')?.getAttribute("data-count")).toBe(
		"0",
	);
});

test("every column keeps its place on a row, whatever the row can say of it", async () => {
	answering(async () => Response.json(ANSWER));
	mount({ keys: TOGETHER });
	await waitFor(() => expect(history()).toBe("read"));
	for (const id of ["api", "route", "worker"]) expect(cells(id)).toBe(3);
	cleanup();
	mount(EXPOSED);
	// Nothing in this model reaches a module as a whole, so To module has no column.
	for (const id of ["api", "route", "worker"]) expect(cells(id)).toBe(4);
	expect(document.querySelector('[data-measure-head="wholeModule"]')).toBeNull();
});

test("To module has its column once a caller reaches a module as a whole", () => {
	answering(async () => Response.json(ANSWER));
	const edge = {
		id: "w",
		from: "worker",
		to: "api",
		kind: "call",
		order: 1,
		emphasis: "normal",
	} as const;
	mount({ ...EXPOSED, projection: { complete: { ...PROJECTION.complete, edges: [edge] } } });
	for (const id of ["api", "route", "worker"]) expect(cells(id)).toBe(5);
	expect(row("api").querySelector('[data-measure="wholeModule"]')).not.toBeNull();
});

test("the fewest can come first, and a module with no count stays last", async () => {
	answering(async () => Response.json(ANSWER));
	mount({ keys: TOGETHER, view: { ...BY_COMMITS, fewest: true } });
	await waitFor(() => expect(history()).toBe("read"));
	expect(order()).toEqual(["route", "api", "worker"]);
});

test("the table shows the modules that a reader chose", async () => {
	answering(async () => Response.json(ANSWER));
	mount({ keys: TOGETHER });
	await waitFor(() => expect(history()).toBe("read"));
	expect(document.querySelector('[data-slot="model-measures-shown"]')).toBeNull();
	cleanup();
	mount({ keys: TOGETHER, view: { ...BY_COMMITS, show: "no-parts" } });
	await waitFor(() => expect(history()).toBe("read"));
	expect(order()).toEqual(["route", "worker"]);
	expect(document.querySelector('[data-slot="model-measures-shown"]')).not.toBeNull();
});

test("a column's head sorts the rows by it, and a second press turns the order round", async () => {
	answering(async () => Response.json(ANSWER));
	const { views } = mount({ keys: TOGETHER });
	await waitFor(() => expect(history()).toBe("read"));
	expect(
		document
			.querySelector('[data-measure-head="commits"]')
			?.closest("th")
			?.getAttribute("aria-sort"),
	).toBe("descending");
	await act(async () => {
		fireEvent.click(document.querySelector('[data-measure-head="commits"]')!);
		fireEvent.click(document.querySelector('[data-measure-head="together"]')!);
	});
	expect(views).toEqual([
		{ ...BY_COMMITS, fewest: true },
		{ ...BY_COMMITS, measure: "together" },
	]);
});

test("the table says once why modules were not read", async () => {
	answering(async () => Response.json(ANSWER));
	mount({ keys: TOGETHER });
	await waitFor(() => expect(history()).toBe("read"));
	const status = document.querySelector('[data-slot="model-measures-status"]')!;
	expect(status.textContent).toContain("1 ");
});

test("a failed read says so and offers the read again", async () => {
	const reads = answering(
		async () => Response.json({ success: false, error: "Git is gone" }, { status: 500 }),
		async () => Response.json(ANSWER),
	);
	mount({ keys: TOGETHER });
	await waitFor(() => expect(history()).toBe("failed"));
	expect(document.querySelector('[role="alert"]')).not.toBeNull();
	await act(async () => {
		fireEvent.click(document.querySelector('[data-slot="model-measures-read"]')!);
	});
	await waitFor(() => expect(history()).toBe("read"));
	expect(reads.reads).toBe(2);
});

test("a model with no binding says what history needs and reads nothing", () => {
	const reads = answering(async () => Response.json(ANSWER));
	mount({ keys: TOGETHER, model: { ...MODEL, modules: [] } });
	expect(history()).toBe("unbound");
	expect(reads.reads).toBe(0);
	expect(order()).toEqual(["api", "route", "worker"]);
});

test("a reading with no module says so", () => {
	answering(async () => Response.json(ANSWER));
	mount({
		...EXPOSED,
		projection: { complete: { nodes: [], edges: [], flows: [], walkthroughs: [] } },
	});
	expect(document.querySelector('[data-slot="model-measures-empty"]')).not.toBeNull();
});

test("a row chooses its module, beside the reading with Alt, and the keys walk the rows", async () => {
	answering(async () => Response.json(ANSWER));
	const { chosen } = mount({ ...EXPOSED, selected: "route" });
	// The rows hold one tab stop, on the module selected on the picture.
	expect(button("route").tabIndex).toBe(0);
	expect(button("api").tabIndex).toBe(-1);
	expect(button("route").getAttribute("aria-current")).toBe("true");
	await act(async () => {
		fireEvent.click(button("api"));
		fireEvent.click(button("worker"), { altKey: true });
	});
	await act(async () => {
		button("route").focus();
		fireEvent.keyDown(button("route"), { key: "End" });
	});
	const last = order().at(-1)!;
	expect(document.activeElement).toBe(button(last));
	await act(async () => {
		fireEvent.keyDown(button(last), { key: "Enter" });
	});
	expect(chosen).toEqual([
		["api", false],
		["worker", true],
		[last, false],
	]);
});

// A passing module shows what its switchboards count: the Width cell and the row button both
// name each operation and where it is picked.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import type { RememberedFindings } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import { defaultSemanticPolicy } from "@archboard/model/policy";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, render, waitFor } = await import("@testing-library/react");
const { ModelMeasures } =
	await import("#ui/architecture-drawing/model-reader/reading/components/ModelMeasures.tsx");
const { kindLookOf } = await import("#ui/architecture-drawing/canvas/picture/rules/kind-look.ts");
const { readRetainedFrom, retainedReads } =
	await import("#ui/architecture-drawing/canvas/picture/reads/clients/retained-reads.ts");
const { fetchCodeFindings } =
	await import("#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts");

type Props = ComponentProps<typeof ModelMeasures>;

const realFetch = globalThis.fetch;
const clients: InstanceType<typeof QueryClient>[] = [];
const REVISION = { digest: "a".repeat(64), files: [] };
/** The columns of each table, as the dialog gives them. */
const EXPOSES = ["entryPoints", "hiddenParts", "passThrough", "callers", "wholeModule"] as const;
const CODE = ["codeExports", "codeWidth", "codeValues", "codeLogic", "codeFindings"] as const;
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

const MODEL: Props["model"] = {
	manifest: { schemaVersion: 1, id: "Shop", name: "Shop", current: { id: "Current", name: "Now" } },
	selectedState: STATE,
	revision: REVISION,
	modules: [{ binding: { repo: "example/shop", path: "src" } }],
	policy: defaultSemanticPolicy(),
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
 * Answer the server as the code columns read it: the remembered passes from the findings route,
 * and every other route with nothing, while each address asked for is kept.
 * @param remembered What the server remembers.
 * @returns The addresses asked for, in turn.
 */
function remembering(remembered: RememberedFindings): string[] {
	const asked: string[] = [];
	readRetainedFrom({ ...retainedReads(), codeFindings: fetchCodeFindings });
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL) => {
			const url = String(input instanceof Request ? input.url : input);
			asked.push(url);
			return url.includes("/api/vault/code-findings")
				? Response.json({ success: true, ...remembered })
				: Response.json({ success: false, error: "not here" }, { status: 404 });
		},
		{ preconnect: realFetch.preconnect },
	);
	return asked;
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
				look: kindLookOf(defaultSemanticPolicy(), new Map()),
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
 * One row of the table.
 * @param id The module.
 * @returns The row.
 */
function row(id: string): HTMLElement {
	return document.querySelector<HTMLElement>(`[data-measure-row="${id}"]`)!;
}

/** A table of what a module exposes, which reads no history. */
const EXPOSED: Partial<Props> = {
	label: "What a module exposes",
	keys: EXPOSES,
	view: { measure: "entryPoints", fewest: false, show: "all" },
};

/** A table of what a module exposes in the model and in its code, as the dialog gives it. */
const EXPOSED_CODE: Partial<Props> = { ...EXPOSED, keys: [...EXPOSES, ...CODE] };

/** A module's exports by kind. */
type Exports = Record<"functions" | "classes" | "methods" | "values" | "types", number>;

/**
 * One module the pass measured: its `languages` judged or not, and its `exports` by kind.
 * @returns What the pass remembers of it.
 */
function measured(
	id: string,
	languages: { readonly judged: string[]; readonly unjudged: string[] },
	exports: Exports,
) {
	return {
		model: "Shop",
		state: "Current",
		subject: subject(id),
		repo: "example/shop",
		directory: `src/${id}`,
		languages: languages.judged,
		unjudged: languages.unjudged,
		exports,
		logic: exports.functions * 3,
		width: exports.functions + exports.classes + exports.methods + exports.values,
		switchboards: [],
	};
}

/**
 * The pass over this version of the reading: `api` is clean, `route` carries two findings, `store`
 * was read in part and holds none, and `worker` has no root file the check reads.
 */
const REMEMBERED: RememberedFindings = {
	readings: [],
	models: [
		{
			model: "Shop",
			state: "Current",
			revision: REVISION,
			checkedAt: "2026-11-19T12:00:00.000Z",
			findings: ["EXPOSED_VALUE", "MODULE_SHALLOW"].map((code) => ({
				code,
				severity: code === "EXPOSED_VALUE" ? "warning" : "information",
				file: "route.module.json",
				model: "Shop",
				state: "Current",
				subject: subject("route"),
				message: "route hands its insides to its callers.",
			})),
			depth: [
				measured(
					"api",
					{ judged: ["typescript"], unjudged: [] },
					{ functions: 2, classes: 1, methods: 2, values: 0, types: 3 },
				),
				measured(
					"route",
					{ judged: ["typescript"], unjudged: [] },
					{ functions: 0, classes: 0, methods: 0, values: 2, types: 0 },
				),
				measured(
					"store",
					{ judged: ["typescript"], unjudged: ["python"] },
					{ functions: 1, classes: 0, methods: 0, values: 0, types: 0 },
				),
			],
			skipped: [
				{
					reason: "exposure-unknown",
					model: "Shop",
					state: "Current",
					subject: subject("worker"),
				},
			],
		},
	],
};

/**
 * One cell of a row.
 * @param id The module.
 * @param measure The measure.
 * @returns The cell.
 */
function cell(id: string, measure: string): HTMLElement | null {
	return row(id).querySelector<HTMLElement>(`[data-measure="${measure}"]`);
}

test("a passing module exposes switchboard evidence on its Width cell and row button", async () => {
	const api = measured(
		"api",
		{ judged: ["typescript"], unjudged: [] },
		{ functions: 1, classes: 0, methods: 0, values: 0, types: 0 },
	);
	const depth = [
		{
			...api,
			logic: 8,
			width: 2,
			switchboards: [
				{
					name: "dispatch",
					key: "action",
					path: "src/api/index.ts",
					operations: [
						{ keys: ["open"], line: 4 },
						{ keys: ["close"], line: 8 },
					],
				},
			],
		},
	];
	const models = REMEMBERED.models?.map((one) => ({ ...one, depth, skipped: [] }));
	remembering({ readings: [], models });
	mount(EXPOSED_CODE);
	await waitFor(() => expect(cell("api", "codeWidth")?.dataset["count"]).toBe("2"));
	expect(cell("api", "codeFindings")?.dataset["code"]).toBe("clean");
	expect(cell("api", "codeWidth")?.textContent).toContain("open (src/api/index.ts:4)");
	expect(row("api").querySelector("button")?.title).toContain("close (src/api/index.ts:8)");
});

// What the Right panel says of a selected module's change partners: the modules that change in the
// same commits, strongest first, each with the commits it shares and a plain mark where no
// relationship joins the two. It reads the answer that Measures and About read, so it asks for
// nothing that they already hold, and it stands nowhere that has no history to read.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import type { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";
import type { z } from "zod";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { ModelChangesWith } = await import("#ui/components/architecture-model/ModelChangesWith.tsx");
const { modelHistoryQuery } = await import("#ui/clients/architecture-model/history.ts");

type Props = ComponentProps<typeof ModelChangesWith>;
type HistoryAnswer = Extract<
	z.infer<typeof ArchitectureHistoryResultSchema>,
	{ success: true; analysis: "locality" }
>;

const realFetch = globalThis.fetch;
const clients: InstanceType<typeof QueryClient>[] = [];
const REVISION = { digest: "a".repeat(64), files: [] };
const STATE = { id: "Current", name: "Implemented", lifecycle: "current" } as const;
const VAULT = "/work/shop/.archboard/vault";

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
	return { kind: "node", id, name: `Module ${id}` } as const;
}

/**
 * Two modules that change together.
 * @param other The module that the pair holds with `hub`.
 * @param shared How many commits they share.
 * @param unjoined Whether nothing in the model joins them.
 * @returns The pair.
 */
function pair(other: string, shared: number, unjoined: boolean): HistoryAnswer["coupling"][number] {
	return {
		subjects: [subject("hub"), subject(other)],
		repo: "example/shop",
		commits: [],
		shared,
		degree: 50,
		unjoined,
	};
}

/** The answer of a read: `hub` changes with `a` in fewer commits than with `b`, and `lone` with nothing. */
const ANSWER: HistoryAnswer = {
	success: true,
	analysis: "locality",
	model: "Shop",
	state: STATE,
	revision: REVISION,
	periods: [],
	commits: [],
	hotspots: ["hub", "a", "b", "lone"].map((id) => ({
		subject: subject(id),
		repo: "example/shop",
		path: `src/${id}`,
		commits: [],
		count: 9,
	})),
	coupling: [pair("a", 12, false), pair("b", 35, true)],
	leftOut: { largeCommits: 0 },
	skipped: [],
};

const MODEL: Props["model"] = {
	manifest: { schemaVersion: 1, id: "Shop", name: "Shop", current: { id: "Current", name: "Now" } },
	selectedState: STATE,
	revision: REVISION,
};

/**
 * Count the reads of the history.
 * @returns How many came.
 */
function counting(): { reads: number } {
	const count = { reads: 0 };
	globalThis.fetch = Object.assign(
		async () => {
			count.reads += 1;
			return Response.json(ANSWER);
		},
		{ preconnect: realFetch.preconnect },
	);
	return count;
}

/**
 * Mount the section.
 * @param overrides What differs from a bound `hub`.
 * @param held Whether the history is already held, as Measures holds it.
 * @returns The modules that a row selected.
 */
function mount(overrides: Partial<Props> = {}, held = false): { readonly selected: string[] } {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	if (held) client.setQueryData(modelHistoryQuery(VAULT, MODEL).queryKey, ANSWER);
	const selected: string[] = [];
	render(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(ModelChangesWith, {
				vault: VAULT,
				model: MODEL,
				module: { id: "hub", binding: { repo: "example/shop", path: "src/hub" } },
				/**
				 * Report the module a row selected.
				 * @param id The module.
				 */
				onSelect: (id) => {
					if (id !== null) selected.push(id);
				},
				...overrides,
			}),
		),
	);
	return { selected };
}

/**
 * The rows of the section.
 * @returns Each partner, with what its row says of it.
 */
function partners(): { part: string | null; unjoined: string | null }[] {
	return [...document.querySelectorAll("[data-part]")].map((one) => ({
		part: one.getAttribute("data-part"),
		unjoined: one.getAttribute("data-unjoined"),
	}));
}

test("a module lists the modules that change with it, the most shared commits first, each with its shared commits and a mark where nothing joins them", async () => {
	counting();
	mount();
	await waitFor(() => expect(partners()).toHaveLength(2));
	expect(partners()).toEqual([
		{ part: "b", unjoined: "true" },
		{ part: "a", unjoined: "false" },
	]);
	const rows = document.querySelectorAll<HTMLElement>("[data-part]");
	expect(rows[0]?.getAttribute("data-shared")).toBe("35");
	expect(rows[0]?.textContent).toContain("35");
	// The mark stands on the unjoined partner only.
	expect(rows[0]?.querySelector(".text-foreground")).not.toBeNull();
	expect(rows[1]?.querySelector(".text-foreground")).toBeNull();
});

test("a row selects its partner", async () => {
	counting();
	const { selected } = mount();
	await waitFor(() => expect(partners()).toHaveLength(2));
	await act(async () => {
		fireEvent.click(document.querySelector('[data-part="a"]')!);
	});
	expect(selected).toEqual(["a"]);
});

test("it asks for nothing when the history is already held", () => {
	const reads = counting();
	mount({}, true);
	expect(partners()).toHaveLength(2);
	expect(reads.reads).toBe(0);
});

test("it stands only for a bound module that has a partner to name", async () => {
	const reads = counting();
	mount({ module: { id: "hub" } });
	mount({ module: { id: "lone", binding: { repo: "example/shop", path: "src/lone" } } });
	await waitFor(() => expect(reads.reads).toBe(1));
	// Only the bound module that no other module changes with asks, and it has nothing to show.
	await Bun.sleep(5);
	expect(document.querySelector('[data-slot="model-panel-changes-with"]')).toBeNull();
});

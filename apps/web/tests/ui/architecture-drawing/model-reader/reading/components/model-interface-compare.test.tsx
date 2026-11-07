// What About's Interface section says of a module whose interface a proposal changed: one card for
// each state, the base first, with the entry points as rows and a part that the proposal hides as
// an outlined row on the proposal's card, which wears the changed chip.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement } from "react";
import type { Model } from "@archboard/model/content";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { cleanup, render } = await import("@testing-library/react");
const { ModelInterfaceCompare } =
	await import("#ui/architecture-drawing/model-reader/reading/components/ModelInterfaceCompare.tsx");

type Comparison = NonNullable<Model["comparison"]>;

const STOCK = { id: "Shop#Stock", name: "Stock API", kind: "service" };
const RESERVE = { id: "Shop#Reserve", name: "Reserve route", kind: "route" };
const RELEASE = { id: "Shop#Release", name: "Release route", kind: "route" };
const WORKER = { id: "Shop#Worker", name: "Fulfilment worker", kind: "job" };

/**
 * A module's counts and entry points in one state.
 * @param entries Its entry points.
 * @param hidden How many parts it hides.
 * @returns What the state says of it.
 */
function on(
	entries: (typeof RESERVE)[],
	hidden: number,
): Comparison["interfaceMeasures"]["containers"][number]["byState"][number] {
	const measures = {
		entryPoints: entries.length,
		hiddenParts: hidden,
		callers: 1,
		outgoing: 0,
		passThrough: 0,
	};
	return { holdsParts: true, measures, entryPoints: entries, passThrough: [] };
}

/** Queued fulfilment hides Release route and gains the worker as a caller. */
const COMPARISON = {
	reason: "predecessor",
	against: null,
	revision: { digest: "a".repeat(64), files: [] },
	interfaceChanges: {
		changed: [
			{
				container: STOCK,
				holdsParts: { before: true, after: true },
				entryPointsAdded: [],
				entryPointsRemoved: [],
				becameEntryPoints: [],
				becameHidden: [RELEASE],
				callersGained: [WORKER],
				callersLost: [],
			},
		],
		unchanged: [],
	},
	interfaceMeasures: {
		states: [
			{ state: { id: "v2", name: "Queued fulfilment", lifecycle: "draft" } },
			{ state: { id: "v1", name: "Synchronous checkout", lifecycle: "current" } },
		],
		containers: [{ container: STOCK, byState: [on([RESERVE], 1), on([RESERVE, RELEASE], 0)] }],
	},
	subjects: [],
} satisfies Comparison;

afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

/**
 * The cards, each as what its rows say.
 * @returns For each card: its chip, its entry rows and its hidden rows.
 */
function cards(): { chip: string; entries: string[]; hidden: string[] }[] {
	return [...document.querySelectorAll('[data-slot="model-interface-side"]')].map((card) => ({
		chip: card.querySelector('[data-slot="badge"]')?.textContent ?? "",
		entries: [...card.querySelectorAll('[data-part-role="entry"]')].map((row) => row.textContent),
		hidden: [...card.querySelectorAll('[data-part-role="hidden"]')].map((row) => row.textContent),
	}));
}

test("a changed interface sets the base beside the proposal, and the proposal's hidden part is an outlined row", () => {
	render(
		createElement(ModelInterfaceCompare, { model: { comparison: COMPARISON }, module: STOCK }),
	);
	expect(cards()).toEqual([
		{ chip: "Current", entries: ["Reserve route", "Release route"], hidden: [] },
		{ chip: "Proposal", entries: ["Reserve route"], hidden: ["Release route (hidden)"] },
	]);
	expect(document.body.textContent).toContain("Callers only here Fulfilment worker");
});

test("a module whose interface did not change has no cards", () => {
	render(
		createElement(ModelInterfaceCompare, {
			model: { comparison: COMPARISON },
			module: { id: "Shop#Gateway", name: "Gateway" },
		}),
	);
	expect(document.querySelector('[data-slot="model-interface-compare"]')).toBeNull();
});

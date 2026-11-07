// The rule behind the head of a proposal's change list: a module reads once, with what moved and
// the counts that differ, and a module the state lacks says so and keeps its place on a picture.

import { expect, test } from "bun:test";
import type { Model } from "@archboard/model/content";
import {
	interfaceRows,
	interfaceRowWords,
	interfaceSides,
} from "#ui/architecture-drawing/model-reader/rules/interface-changes.ts";
import { SHOP } from "#tests/ui/support/model-reader/scene.ts";

type Comparison = NonNullable<Model["comparison"]>;
type InterfaceChange = Comparison["interfaceChanges"]["changed"][number];
type Measured = Comparison["interfaceMeasures"]["containers"][number];

const PART = { id: "Shop#Queue", name: "Queue", kind: "service" };
const OTHER = { id: "Shop#Decode", name: "Decode", kind: "service" };

/**
 * What one module changed, with nothing moved until a test says so.
 * @param id The module.
 * @param moved What moved.
 * @returns The change.
 */
function changeOf(id: string, moved: Partial<InterfaceChange> = {}): InterfaceChange {
	return {
		container: { id, name: id, kind: "service" },
		holdsParts: { before: true, after: true },
		entryPointsAdded: [],
		entryPointsRemoved: [],
		becameEntryPoints: [],
		becameHidden: [],
		callersGained: [],
		callersLost: [],
		...moved,
	};
}

/**
 * One module's counts in one state.
 * @param callers Its callers.
 * @param outgoing Its outgoing relationships.
 * @returns The counts.
 */
function measuredOn(callers: number, outgoing: number): Measured["byState"][number] {
	const measures = { entryPoints: 2, hiddenParts: 1, callers, outgoing, passThrough: 0 };
	return { holdsParts: true, measures, entryPoints: [], passThrough: [] };
}

/**
 * A reading with its interface sections.
 * @param changed What the comparison reports.
 * @param containers The counts, the selected state first.
 * @returns The reading.
 */
function reading(changed: InterfaceChange[], containers: Measured[] = []): Model {
	return {
		...SHOP,
		comparison: {
			reason: "predecessor",
			against: null,
			revision: SHOP.revision,
			interfaceChanges: { changed, unchanged: [] },
			interfaceMeasures: { states: [], containers },
			subjects: [],
		},
	};
}

/** The parent of each module in the drawing of the comparison. */
const PARENTS = new Map([["Shop#Worker", undefined]]);

test("a module reads once, with only what moved, callers first", () => {
	const change = changeOf("Shop#Worker", {
		becameHidden: [OTHER],
		callersGained: [PART, OTHER],
		callersLost: [PART],
	});
	const rows = interfaceRows(reading([change]), PARENTS);
	expect(rows.map(({ id }) => id)).toEqual(["Shop#Worker"]);
	expect(rows[0]?.facts.map(({ key, names }) => [key, names])).toEqual([
		["callersGained", ["Queue", "Decode"]],
		["callersLost", ["Queue"]],
		["becameHidden", ["Decode"]],
	]);
});

test("a row's words keep every name, because the row cuts a long list", () => {
	const names = ["Ada", "Ben", "Cid", "Dee", "Eli", "Fay"];
	const callersGained = names.map((name) => ({ ...PART, id: `Shop#${name}`, name }));
	const [row] = interfaceRows(reading([changeOf("Shop#Worker", { callersGained })]), PARENTS);
	for (const name of names) expect(interfaceRowWords(row!)).toContain(name);
});

test("the counts that differ stand before and after, and the rest stay out", () => {
	const measured = {
		container: changeOf("Shop#Worker").container,
		byState: [measuredOn(3, 5), measuredOn(2, 5)],
	};
	const [row] = interfaceRows(reading([changeOf("Shop#Worker")], [measured]), PARENTS);
	expect(row?.measures).toMatchObject([{ key: "callers", before: 2, after: 3 }]);
});

test("a module with parts on one side says what it became and shows no count", () => {
	const measured = {
		container: changeOf("Shop#Worker").container,
		byState: [measuredOn(3, 5), { holdsParts: false as const }],
	};
	const holdsParts = { before: false, after: true };
	const change = changeOf("Shop#Worker", { holdsParts });
	const [row] = interfaceRows(reading([change], [measured]), PARENTS);
	expect(row?.facts.map(({ key }) => key)).toEqual(["nowHoldsParts"]);
	expect(row?.measures).toEqual([]);
});

test("a module the state lacks says so, and keeps its place in the drawing", () => {
	const change = changeOf("Shop#Gone", { holdsParts: { before: true, after: false } });
	const [row] = interfaceRows(reading([change]), new Map([["Shop#Gone", "Shop#Gateway"]]));
	expect(row?.facts.map(({ key }) => key)).toEqual(["notInState"]);
	expect(row?.scope).toBe("Shop#Gateway");
});

test("a comparison with no interface change has no rows", () => {
	expect(interfaceRows(reading([]), PARENTS)).toEqual([]);
});

test("a changed interface sets the base beside the state read, each with what only it has", () => {
	const change = changeOf("Shop#Worker", {
		becameHidden: [OTHER],
		becameEntryPoints: [PART],
		callersGained: [PART],
		callersLost: [OTHER],
	});
	const read = { ...measuredOn(1, 0), entryPoints: [PART] };
	const base = { ...measuredOn(2, 0), entryPoints: [OTHER] };
	const model = reading([change], [{ container: change.container, byState: [read, base] }]);
	const states = [
		{ state: { id: "v2", name: "Queued", lifecycle: "draft" as const } },
		{ state: { id: "v1", name: "Synchronous", lifecycle: "current" as const } },
	];
	const sides = interfaceSides(
		{
			...model.comparison!,
			interfaceMeasures: { states, containers: model.comparison!.interfaceMeasures.containers },
		},
		"Shop#Worker",
	);
	expect(
		sides?.map((side) => [side.state?.name, side.read, side.entries, side.hidden, side.callers]),
	).toEqual([
		["Synchronous", false, ["Decode"], ["Queue"], ["Decode"]],
		["Queued", true, ["Queue"], ["Decode"], ["Queue"]],
	]);
	expect(sides?.map((side) => side.measures?.callers)).toEqual([2, 1]);
	// A module whose interface did not change has no sides.
	expect(interfaceSides(model.comparison!, "Shop#Gateway")).toBeNull();
});

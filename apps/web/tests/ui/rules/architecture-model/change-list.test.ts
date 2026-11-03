// The rule behind a proposal's change list: every changed subject has a row under its owner and a
// place to open, and a reader's place follows the subject through a list that changes.

import { expect, test } from "bun:test";
import type { Model } from "@archboard/model/content";
import {
	changeAfter,
	changeList,
	namedField,
	placeIn,
	standingPlace,
	type ChangeList,
} from "#ui/rules/architecture-model/change-list.ts";
import { SHOP } from "#tests/ui/support/architecture-model/scene.ts";

type Subject = NonNullable<Model["comparison"]>["subjects"][number];
type Relationship = Model["relationships"][number];

/**
 * A relationship of the shop.
 * @param id Its identity.
 * @param from One end.
 * @param to The other end.
 * @returns The relationship.
 */
function relationship(id: string, from: string, to: string): Relationship {
	return { id, from, to, kind: "call", order: 0, emphasis: "normal" };
}

const FLOW: Model["collections"][number]["flows"][number] = {
	id: "Shop#Request",
	name: "Handle request",
	participants: ["Shop#Gateway", "Shop#Worker"],
	steps: [
		{ id: "Shop#Hand", from: "Shop#Gateway", to: "Shop#Worker", kind: "sync", label: "Hand" },
		{ id: "Shop#Done", from: "Shop#Worker", to: "Shop#Gateway", kind: "return", label: "Done" },
	],
};

const COLLECTION: Model["collections"][number] = {
	schemaVersion: 1,
	id: "Behavior",
	name: "Requests",
	file: "requests.flows.json",
	flows: [FLOW],
};

/** The base: the worker's queue still calls the gateway, and its flow has two steps. */
const BASE: Model = {
	...SHOP,
	relationships: [
		relationship("Shop#Calls", "Shop#Queue", "Shop#Gateway"),
		relationship("Shop#Stays", "Shop#Gateway", "Shop#Worker"),
	],
	collections: [COLLECTION],
};

/**
 * The proposal, which drops the queue with its relationship and a step, and moves the decoder.
 * @param subjects What its comparison reports.
 * @returns The reading.
 */
function proposal(subjects: readonly Subject[]): Model {
	return {
		...BASE,
		selectedState: { id: "Draft", name: "Queue", lifecycle: "draft" },
		modules: BASE.modules
			.filter((module) => module.id !== "Shop#Queue")
			.map((module) =>
				module.id === "Shop#Decode" ? { ...module, parent: "Shop#Worker" } : module,
			),
		relationships: BASE.relationships.filter((edge) => edge.id !== "Shop#Calls"),
		collections: [{ ...COLLECTION, flows: [{ ...FLOW, steps: FLOW.steps.slice(0, 1) }] }],
		comparison: {
			reason: "predecessor",
			against: BASE.selectedState ?? null,
			revision: BASE.revision,
			interfaceChanges: { changed: [], unchanged: [] },
			interfaceMeasures: { states: [], containers: [] },
			subjects: [...subjects],
		},
	};
}

const MOVE = { field: "parent", before: "Shop#Handler", after: "Shop#Worker" };
const MOVED: Subject = {
	id: "Shop#Decode",
	subjectKind: "module",
	kind: "changed",
	fields: [MOVE],
};
const QUEUE: Subject = { id: "Shop#Queue", subjectKind: "module", kind: "removed", fields: [] };
const CALLS: Subject = {
	id: "Shop#Calls",
	subjectKind: "relationship",
	kind: "removed",
	fields: [],
};
const DONE: Subject = { id: "Shop#Done", subjectKind: "step", kind: "removed", fields: [] };
const SAME: Subject = {
	id: "Shop#Stays",
	subjectKind: "relationship",
	kind: "unchanged",
	fields: [],
};

const LIST = changeList(proposal([MOVED, QUEUE, CALLS, DONE, SAME]), BASE);

/**
 * A list that holds only some of the changes of another.
 * @param list The list.
 * @param ids The changes that stay.
 * @returns The smaller list.
 */
function holding(list: ChangeList, ids: readonly string[]): ChangeList {
	const changes = list.changes.filter((change) => ids.includes(change.id));
	return { ...list, changes, positions: new Map(changes.map(({ id }, at) => [id, at])) };
}

test("a change stands under its owner, with structure before behavior", () => {
	expect(LIST.groups.map((group) => [group.id, group.changes.map(({ id }) => id)])).toEqual([
		["Shop#Decode", ["Shop#Decode"]],
		["Shop#Queue", ["Shop#Queue", "Shop#Calls"]],
		["Shop#Request", ["Shop#Done"]],
	]);
});

test("an unchanged subject has no row, and the walk counts every row once", () => {
	expect(LIST.positions.has("Shop#Stays")).toBe(false);
	expect(LIST.changes.map(({ id }) => LIST.positions.get(id))).toEqual([0, 1, 2, 3]);
});

test("each change opens where a reader sees it, also when the proposal removed it", () => {
	expect(LIST.changes.map(({ target }) => target)).toEqual([
		{ kind: "scope", scope: "Shop#Worker", subject: "Shop#Decode" },
		{ kind: "scope", scope: "Shop#Worker", subject: "Shop#Queue" },
		{ kind: "scope", scope: null, subject: "Shop#Calls" },
		{ kind: "flow", flow: "Shop#Request", subject: "Shop#Done" },
	]);
});

test("a reparented module names both parents, and a move to the roots has no identity to name", () => {
	const names = new Map([
		["Shop#Handler", "Handler"],
		["Shop#Worker", "Worker"],
	]);
	expect(namedField(MOVE, names)).toMatchObject({ before: "Handler", after: "Worker" });
	expect(typeof namedField({ ...MOVE, after: undefined }, names).after).toBe("string");
});

test("the place stays on its subject when the list changes around it", () => {
	const place = { id: "Shop#Calls", landed: true };
	const after = holding(LIST, ["Shop#Calls", "Shop#Done"]);
	expect(placeIn(place, LIST, after)).toEqual(place);
});

test("when the subject leaves, the next one that stayed waits for the reader to see it", () => {
	const after = holding(LIST, ["Shop#Decode", "Shop#Done"]);
	const place = placeIn({ id: "Shop#Queue", landed: true }, LIST, after);
	expect(place).toEqual({ id: "Shop#Done", landed: false });
	expect(changeAfter(after, place, 1)?.id).toBe("Shop#Done");
	expect(changeAfter(after, place, -1)?.id).toBe("Shop#Decode");
});

test("a place at the end of a list falls back, and an emptied list holds no place", () => {
	const place = { id: "Shop#Done", landed: true };
	expect(placeIn(place, LIST, holding(LIST, ["Shop#Decode"]))?.id).toBe("Shop#Decode");
	expect(placeIn(place, LIST, holding(LIST, []))).toBeNull();
});

test("a walk starts at the first change and stops at both ends", () => {
	expect(changeAfter(LIST, null, 1)?.id).toBe("Shop#Decode");
	expect(changeAfter(LIST, null, -1)).toBeUndefined();
	expect(changeAfter(LIST, { id: "Shop#Done", landed: true }, 1)).toBeUndefined();
});

test("selecting one change moves the place, and any other selection leaves it", () => {
	const place = { id: "Shop#Decode", landed: true };
	const chosen = new Set(["Shop#Calls"]);
	expect(standingPlace(LIST, place, chosen)).toEqual({ id: "Shop#Calls", landed: true });
	expect(standingPlace(LIST, place, new Set(["Shop#Gateway"]))).toEqual(place);
	expect(standingPlace(LIST, place, new Set(["Shop#Calls", "Shop#Done"]))).toEqual(place);
});

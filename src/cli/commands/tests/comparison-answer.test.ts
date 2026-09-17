import { describe, expect, test } from "bun:test";
import { comparisonAnswer, VariantComparisonResultSchema } from "@/cli/commands/semantic-compare";
import type { SemanticVariant, VariantContent } from "@/shared/semantic-board/index";

// What an agent is answered when it asks what a proposal changed. The reading
// itself belongs to `compareVariants` and is owned in the shared module; what
// is owned here is the answer: that every subject of both states is in it with
// its standing, and that a relationship whose end moved onto a replacing part
// comes back as one relationship that moved, carrying the part it now lands on.

/** The board as it stands: two callers, a lock file and the watcher on it. */
const BEFORE: VariantContent = {
	nodes: [
		{ id: "hold", name: "holdBoard", kind: "route" },
		{ id: "rel", name: "releaseHold", kind: "route" },
		{ id: "locks", name: "Lock files", kind: "datastore" },
		{ id: "watch", name: "Lock watcher", kind: "job" },
	],
	edges: [
		{ id: "e1", from: "hold", to: "locks", kind: "data", label: "create", emphasis: "normal" },
		{ id: "e2", from: "rel", to: "locks", kind: "data", label: "unlink", emphasis: "normal" },
		{ id: "e3", from: "watch", to: "locks", kind: "data", label: "poll", emphasis: "normal" },
	],
	flows: [
		{
			id: "f1",
			name: "Taking a board",
			participants: ["hold", "locks"],
			steps: [{ id: "s1", from: "hold", to: "locks", kind: "sync", label: "create exclusively" }],
		},
	],
	walkthroughs: [
		{
			id: "w1",
			name: "How leases work",
			beats: [
				{ id: "b1", heading: "The callers", body: "Two routes take and give back.", subjects: [] },
				{ id: "b2", heading: "The store", body: "A file per board.", subjects: ["locks"] },
			],
		},
	],
};

/**
 * The proposal: one table replaces the files and the watcher, and the two
 * calls that landed on the files now land on the table, keeping their ids.
 */
const AFTER: VariantContent = {
	nodes: [
		{ id: "hold", name: "holdBoard", kind: "route" },
		{ id: "rel", name: "releaseHold", kind: "route" },
		{ id: "table", name: "Lease table", kind: "datastore" },
	],
	edges: [
		{ id: "e1", from: "hold", to: "table", kind: "data", label: "create", emphasis: "normal" },
		{ id: "e2", from: "rel", to: "table", kind: "data", label: "unlink", emphasis: "normal" },
	],
	flows: [
		{
			id: "f1",
			name: "Taking a board",
			participants: ["hold", "table"],
			steps: [{ id: "s1", from: "hold", to: "table", kind: "sync", label: "create exclusively" }],
		},
	],
	walkthroughs: [
		{
			id: "w1",
			name: "How leases work",
			beats: [
				{ id: "b1", heading: "The callers", body: "Two routes take and give back.", subjects: [] },
				{ id: "b2", heading: "The store", body: "One row per board.", subjects: ["table"] },
			],
		},
	],
};

/**
 * One variant of the lease board.
 * @param id Its identity.
 * @param name What it is called.
 * @param content Its architecture.
 * @param parent The variant it came from, when it came from one.
 * @returns The variant.
 */
function variant(
	id: string,
	name: string,
	content: VariantContent,
	parent?: string,
): SemanticVariant {
	return {
		id,
		name,
		lifecycle: parent === undefined ? "current" : "draft",
		content,
		...(parent === undefined ? {} : { parent }),
	};
}

const BASELINE = variant("v1", "Lock files", BEFORE);
const PROPOSAL = variant("v2", "Lease table", AFTER, "v1");
const ANSWER = VariantComparisonResultSchema.parse(
	comparisonAnswer({ name: "Board lease", version: 4 }, PROPOSAL, BASELINE, []),
);

/**
 * How one subject stands in the answer.
 * @param entries The answer's entries of one kind.
 * @param id The subject.
 * @returns The entry.
 */
function standing<Entry extends { readonly id: string }>(
	entries: readonly Entry[],
	id: string,
): Entry {
	const found = entries.find((entry) => entry.id === id);
	if (found === undefined) throw new Error(`the answer says nothing about ${id}`);
	return found;
}

describe("the comparison an agent reads", () => {
	test("names which variant was compared against which", () => {
		expect(ANSWER.board).toBe("Board lease");
		expect(ANSWER.version).toBe(4);
		expect(ANSWER.variant).toEqual({ id: "v2", name: "Lease table", lifecycle: "draft" });
		expect(ANSWER.against).toEqual({ id: "v1", name: "Lock files", lifecycle: "current" });
	});

	test("every part of either state is in it, added, removed or left alone", () => {
		expect(Object.fromEntries(ANSWER.nodes.map((node) => [node.name, node.standing]))).toEqual({
			holdBoard: "unchanged",
			releaseHold: "unchanged",
			"Lease table": "added",
			"Lock files": "removed",
			"Lock watcher": "removed",
		});
	});

	test("a relationship whose end moved onto the replacing part reads as moved, not as a deletion", () => {
		const moved = standing(ANSWER.edges, "e1");
		expect(moved.standing).toBe("changed");
		expect(moved.fields).toEqual([{ field: "to", before: "locks", after: "table" }]);
		expect(moved.to).toBe("table");
		expect(moved.toName).toBe("Lease table");
		expect(moved.fromName).toBe("holdBoard");
		expect(standing(ANSWER.edges, "e2").fields.map((field) => field.field)).toEqual(["to"]);
	});

	test("a relationship the proposal took away still says which parts it joined", () => {
		const gone = standing(ANSWER.edges, "e3");
		expect(gone.standing).toBe("removed");
		expect(gone.fields).toEqual([]);
		expect([gone.fromName, gone.toName]).toEqual(["Lock watcher", "Lock files"]);
	});

	test("only the subject whose own fields moved is labelled", () => {
		// The step moved onto the table; the parts at its ends did not change.
		const step = standing(ANSWER.steps, "s1");
		expect(step.standing).toBe("changed");
		expect(step.fields.map((field) => field.field)).toEqual(["to"]);
		expect([step.flow, step.position, step.toName]).toEqual(["f1", 1, "Lease table"]);
		expect(standing(ANSWER.nodes, "hold").standing).toBe("unchanged");
		// The sequence itself changed only its cast, and says so rather than
		// carrying the step's change as well.
		expect(standing(ANSWER.flows, "f1").fields.map((field) => field.field)).toEqual([
			"participants",
		]);
	});

	test("a reworded beat is reported where it happened, with its place in the explanation", () => {
		const beat = standing(ANSWER.beats, "b2");
		expect(beat.standing).toBe("changed");
		expect(beat.fields.map((field) => field.field)).toEqual(["body", "subjects"]);
		expect([beat.walkthrough, beat.position, beat.heading]).toEqual(["w1", 2, "The store"]);
		expect(standing(ANSWER.beats, "b1").standing).toBe("unchanged");
		expect(standing(ANSWER.walkthroughs, "w1").standing).toBe("unchanged");
	});

	test("the answer is ordered the same way twice, so two readings can be compared", () => {
		const again = comparisonAnswer({ name: "Board lease", version: 4 }, PROPOSAL, BASELINE, []);
		expect(again).toEqual(ANSWER);
		expect(ANSWER.edges.map((edge) => edge.id)).toEqual(["e1", "e2", "e3"]);
	});
});

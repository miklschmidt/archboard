import { describe, expect, test } from "bun:test";
import { CliUsageError } from "#cli/protocol/contract/contract.ts";
import {
	comparisonAnswer,
	described,
	readAgainst,
	VariantComparisonResultSchema,
} from "#cli/operations/semantic/compare/compare.ts";
import {
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import type { VariantContent } from "@archboard/board/content";

// What an agent is answered when it asks what a proposal changed. The reading
// itself belongs to `compareVariants` and is owned in the shared module; what
// is owned here is the answer: that every subject of both states is in it with
// its standing, and that a relationship whose end moved onto a replacing part
// comes back as one relationship that moved, carrying the part it now lands on.

/** The board as it stands: two callers, a lock file and the watcher on it. */
const BEFORE: VariantContent = {
	nodes: [
		{ id: "hold", order: 1000, name: "holdBoard", kind: "route" },
		{ id: "rel", order: 2000, name: "releaseHold", kind: "route" },
		{ id: "locks", order: 3000, name: "Lock files", kind: "datastore" },
		{ id: "watch", order: 4000, name: "Lock watcher", kind: "job" },
	],
	edges: [
		{
			id: "e1",
			order: 1000,
			from: "hold",
			to: "locks",
			kind: "data",
			label: "create",
			emphasis: "normal",
		},
		{
			id: "e2",
			order: 2000,
			from: "rel",
			to: "locks",
			kind: "data",
			label: "unlink",
			emphasis: "normal",
		},
		{
			id: "e3",
			order: 3000,
			from: "watch",
			to: "locks",
			kind: "data",
			label: "poll",
			emphasis: "normal",
		},
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
		{ id: "hold", order: 1000, name: "holdBoard", kind: "route" },
		{ id: "rel", order: 2000, name: "releaseHold", kind: "route" },
		{ id: "table", order: 3000, name: "Lease table", kind: "datastore" },
	],
	edges: [
		{
			id: "e1",
			order: 1000,
			from: "hold",
			to: "table",
			kind: "data",
			label: "create",
			emphasis: "normal",
		},
		{
			id: "e2",
			order: 2000,
			from: "rel",
			to: "table",
			kind: "data",
			label: "unlink",
			emphasis: "normal",
		},
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

/**
 * The lease board with its lock files, its lease table and a second proposal
 * written on the lock files.
 * @param lifecycles Where each of the three stands.
 * @param current The one designated current, or none on a board nobody has built.
 * @returns The board.
 */
function lease(
	lifecycles: readonly [string, string, string],
	current: string | undefined,
): SemanticBoard {
	const [first, second, third] = lifecycles;
	return SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "bd",
		name: "Board lease",
		level: "system",
		version: 4,
		createdAt: "2026-09-27T00:00:00.000Z",
		updatedAt: "2026-09-27T00:00:00.000Z",
		...(current === undefined ? {} : { current }),
		variants: [
			{ ...BASELINE, lifecycle: first },
			{ ...PROPOSAL, lifecycle: second },
			{ ...variant("v3", "Watched locks", BEFORE, "v1"), lifecycle: third },
		],
	});
}

describe("which variant the comparison reads against", () => {
	const adopted = lease(["historical", "current", "draft"], "v2");
	const [historical, current, onHistory] = adopted.variants;

	test("history and a proposal on history read against the current variant", () => {
		expect(readAgainst(adopted, historical!, undefined).id).toBe("v2");
		expect(readAgainst(adopted, onHistory!, undefined).id).toBe("v2");
	});

	test("the current variant has nothing to be read against unless one is named", () => {
		expect(() => readAgainst(adopted, current!, undefined)).toThrow(CliUsageError);
		expect(readAgainst(adopted, current!, "Lock files").id).toBe("v1");
		// `current` names the designation, as it does for --variant.
		expect(readAgainst(adopted, historical!, "current").id).toBe("v2");
		// Naming the parent is how a superseded proposal is read for its own change.
		expect(readAgainst(adopted, onHistory!, "v1").id).toBe("v1");
		expect(() => readAgainst(adopted, onHistory!, "nowhere")).toThrow(CliUsageError);
	});

	test("on a board nobody has built a draft reads against the one it came from", () => {
		const unbuilt = lease(["draft", "draft", "draft"], undefined);
		expect(readAgainst(unbuilt, unbuilt.variants[1]!, undefined).id).toBe("v1");
		expect(() => readAgainst(unbuilt, unbuilt.variants[0]!, undefined)).toThrow(CliUsageError);
	});
});

test("a moved end is reported as where the variant it is read against lands it, named by that variant", () => {
	// History read against now: the other side is the later state, so its end is not what was.
	const history = { ...BASELINE, name: "As first built", lifecycle: "historical" as const };
	const now = { ...PROPOSAL, name: "As it is", lifecycle: "current" as const };
	const lines = described(comparisonAnswer({ name: "Board lease", version: 5 }, history, now, []));
	const moved = lines.find((line) => line.includes("holdBoard") && line.includes("changed"));
	expect(moved).toMatch(/to Lease table on "As it is"/);
});

/**
 * A lock store with a container: the routes call its acquire step, and the
 * watcher polls its files.
 * @param stated What differs between the two states.
 * @param stated.nodes The container's children.
 * @param stated.edges The relationships.
 * @returns The content.
 */
function store(stated: Pick<VariantContent, "nodes" | "edges">): VariantContent {
	return {
		nodes: [
			{ id: "hold", order: 1000, name: "holdBoard", kind: "route" },
			{ id: "watch", order: 2000, name: "Lock watcher", kind: "job" },
			{ id: "store", order: 3000, name: "Lock store", kind: "module" },
			...stated.nodes,
		],
		edges: stated.edges,
		flows: [],
		walkthroughs: [],
	};
}
const child = (id: string, name: string, order: number) => ({
	id,
	order,
	name,
	kind: "function",
	parent: "store",
});
const call = (id: string, from: string, to: string, order: number) => ({
	id,
	order,
	from,
	to,
	kind: "call",
	emphasis: "normal" as const,
});

describe("the interface changes an agent reads first", () => {
	const before = store({
		nodes: [child("acq", "acquire", 4000), child("rel", "release", 5000)],
		edges: [call("e1", "hold", "acq", 1000)],
	});
	// The watcher now polls release, and a new check step joins the interface.
	const after = store({
		nodes: [
			child("acq", "acquire", 4000),
			child("rel", "release", 5000),
			child("chk", "check", 6000),
		],
		edges: [
			call("e1", "hold", "acq", 1000),
			call("e2", "watch", "rel", 2000),
			call("e3", "hold", "chk", 3000),
		],
	});
	const answer = VariantComparisonResultSchema.parse(
		comparisonAnswer(
			{ name: "Board lease", version: 6 },
			variant("v2", "Watched", after, "v1"),
			variant("v1", "Lock files", before),
			[],
		),
	);
	const changed = answer.interfaceChanges.changed[0];

	test("each container says what its interface gained and lost, in the names of the variants", () => {
		expect(answer.interfaceChanges.changed).toHaveLength(1);
		expect(changed?.container.name).toBe("Lock store");
		expect(changed?.holdsParts).toEqual({ variant: true, against: true });
		expect(changed?.entryPointsAdded.map((part) => part.name)).toEqual(["check"]);
		expect(changed?.becameEntryPoints.map((part) => part.name)).toEqual(["release"]);
		expect(changed?.callersGained.map((part) => part.name)).toEqual(["Lock watcher"]);
		expect(changed?.entryPointsRemoved).toEqual([]);
		expect(changed?.becameHidden).toEqual([]);
		expect(changed?.callersLost).toEqual([]);
	});

	test("an interface change sets no standing: the part a caller reached is not changed", () => {
		expect(standing(answer.nodes, "rel").standing).toBe("unchanged");
		expect(standing(answer.nodes, "store").standing).toBe("unchanged");
		expect(standing(answer.edges, "e2").standing).toBe("added");
		expect(JSON.stringify(answer.interfaceChanges)).not.toContain("standing");
	});

	test("a container whose interface did not move is listed as read, so no change is a claim", () => {
		const same = comparisonAnswer(
			{ name: "Board lease", version: 6 },
			variant("v2", "Same", before, "v1"),
			variant("v1", "Lock files", before),
			[],
		);
		expect(same.interfaceChanges.changed).toEqual([]);
		expect(same.interfaceChanges.unchanged.map((part) => part.name)).toEqual(["Lock store"]);
	});

	test("the interface section is the first thing said, before the counts and the relationships", () => {
		const lines = described(answer);
		const interfaceAt = lines.findIndex((line) => line.includes("Lock store"));
		// Only the counts hold "2 added" (the two new relationships). Only the line of the new call
		// from holdBoard names holdBoard: it called the store already, so it is no caller gained.
		expect(interfaceAt).toBeGreaterThan(0);
		expect(interfaceAt).toBeLessThan(lines.findIndex((line) => line.includes("2 added")));
		expect(interfaceAt).toBeLessThan(lines.findIndex((line) => line.includes("holdBoard")));
		expect(Object.keys(answer).indexOf("interfaceChanges")).toBeLessThan(
			Object.keys(answer).indexOf("nodes"),
		);
	});
});

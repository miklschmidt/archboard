import { expect, test } from "bun:test";
import {
	recordRows,
	recordSections,
	type Checkpoint,
	type ListedState,
} from "#ui/architecture-drawing/model-reader/reading/rules/record-rows.ts";

const CURRENT: ListedState = {
	id: "Now",
	state: { lifecycle: "current", id: "Now", name: "Now", summary: "What stands" },
};

/**
 * A retained checkpoint.
 * @param id Its identity.
 * @param state The id of its state, or null for a planning model.
 * @param createdAt When it was saved.
 * @returns The row.
 */
function saved(id: string, state: string | null, createdAt: string): Checkpoint {
	return {
		id,
		createdAt,
		doing: "Saving",
		state: state === null ? null : { id: state, name: `Name of ${state}`, summary: "Said" },
	};
}

const NOTHING = {
	proposals: [],
	states: [CURRENT],
	checkpoints: [],
	unfolded: new Set<string>(),
	checkpoint: null,
	touches: new Map<string, string>(),
};

test("a run of checkpoints folds into its state, newest first, with a count and its time", () => {
	const [section] = recordSections({
		...NOTHING,
		checkpoints: [
			saved("older", "Now", "2026-01-01T10:00:00.000Z"),
			saved("newer", "Now", "2026-01-02T10:00:00.000Z"),
		],
	});
	const { head, held } = section!.entries[0]!;
	expect({ branch: head.branch, open: head.open, held }).toEqual({
		branch: true,
		open: false,
		held: [],
	});
	expect(head.words?.facts).toStartWith("2 saved · ");
	expect(head.words?.facts).toContain("2026");

	const unfolded = recordSections({
		...NOTHING,
		unfolded: new Set(["current"]),
		checkpoints: [
			saved("older", "Now", "2026-01-01T10:00:00.000Z"),
			saved("newer", "Now", "2026-01-02T10:00:00.000Z"),
		],
	});
	expect(recordRows(unfolded).map(({ id }) => id)).toEqual(["current", "newer", "older"]);
});

test("a checkpoint on screen opens the fold that holds it", () => {
	const sections = recordSections({
		...NOTHING,
		checkpoint: "held",
		checkpoints: [saved("held", "Now", "2026-01-01T10:00:00.000Z")],
	});
	expect(recordRows(sections).map(({ id }) => id)).toEqual(["current", "held"]);
});

test("a state the catalogue lacks keeps its own row, which opens its newest checkpoint", () => {
	const sections = recordSections({
		...NOTHING,
		checkpoints: [
			saved("newest", "Gone", "2026-01-02T10:00:00.000Z"),
			saved("oldest", "Gone", "2026-01-01T10:00:00.000Z"),
			saved("planning", null, "2026-01-01T09:00:00.000Z"),
		],
	});
	expect(sections.map(({ label }) => label)).toEqual(["Current", "Earlier"]);
	const [current, earlier] = sections;
	expect(current!.entries[0]!.head.words?.facts).toStartWith("1 saved");
	const { head } = earlier!.entries[0]!;
	expect(head).toMatchObject({ id: "Gone", stateId: null, checkpoint: "newest" });
	expect(head.words).toMatchObject({ lead: "Said", name: "Name of Gone" });
});

test("a draft folds its own checkpoints, and a row leads with the summary, then the name", () => {
	const draft: ListedState = {
		id: "Next",
		state: { lifecycle: "draft", id: "Next", name: "Called", summary: "Does this" },
	};
	const [section] = recordSections({
		...NOTHING,
		proposals: [draft],
		touches: new Map([["Next", "Touches Gateway"]]),
		checkpoints: [saved("kept", "Next", "2026-01-01T10:00:00.000Z")],
	});
	expect(section!.label).toBe("Proposals");
	const { head } = section!.entries[0]!;
	expect(head.words).toMatchObject({ lead: "Does this", name: "Called" });
	expect(head.words?.facts).toStartWith("Touches Gateway · 1 saved");
});

test("an exact address that the list does not hold still shows where the reader stands", () => {
	const sections = recordSections({ ...NOTHING, checkpoint: "unlisted" });
	expect(recordRows(sections).map(({ id }) => id)).toContain("unlisted");
});

test("no identity stands in the words of a row", () => {
	const [, earlier] = recordSections({
		...NOTHING,
		states: [CURRENT, { id: "x8f2Kq1Z", state: undefined }],
	});
	expect(earlier!.entries[0]!.head.words?.lead).not.toContain("x8f2Kq1Z");
});

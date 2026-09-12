// The architecture block of a brief, read back by the independent parser.
//
// The parser exists so that two readers have to agree on the bytes, which only
// works if it refuses what it does not understand. The distinction it has to
// get right is between a field that is legitimately absent — a pane that has
// drawn nothing has no variant, a root variant has nothing to differ from — and
// a field that is malformed. Silently treating the second as the first would
// show a person an architecture the brief never claimed.

import { describe, expect, test } from "bun:test";
import { parseCanonicalBrief } from "@/ui/voice-context/index";
import { canonicalBrief, SESSION_A } from "@/ui/voice-context/tests/support/fixtures";

/**
 * One canonical brief with its architecture block replaced.
 * @param architecture What to put in its place.
 * @returns The brief bytes.
 */
function withArchitecture(architecture: unknown): string {
	const brief: unknown = JSON.parse(canonicalBrief(SESSION_A));
	if (!isRecord(brief)) {
		throw new TypeError("The brief fixture is not an object.");
	}
	return JSON.stringify({ ...brief, architecture });
}

/**
 * Whether a value is a plain object, so the fixture can be rebuilt from it.
 * @param value The value.
 * @returns True for a non-null, non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The architecture of a brief that must parse.
 * @param text The brief bytes.
 * @returns Its architecture block.
 */
function architectureOf(
	text: string,
): NonNullable<ReturnType<typeof parseCanonicalBrief>>["architecture"] {
	const brief = parseCanonicalBrief(text);
	if (brief === null) {
		throw new TypeError("The brief did not parse.");
	}
	return brief.architecture;
}

/** An architecture block with every part present. */
const FULL = {
	variant: { id: "v1", name: "Queued ingest", lifecycle: "draft", against: "v0" },
	view: { id: "w1", name: "Overview", grammar: "data-flow" },
	selection: { count: 1, subjects: [{ kind: "node", id: "n1", name: "Gateway" }] },
	differences: {
		added: 2,
		removed: 0,
		changed: 1,
		subjects: [{ change: "added", kind: "node", id: "n2", name: "Queue" }],
	},
	reconciliation: {
		required: true,
		count: 1,
		blockedBy: null,
		issues: [
			{
				subject: "n1",
				what: "node",
				kind: "competing-field",
				field: "name",
				repair: "Say which name this proposal means.",
			},
		],
	},
} as const;

describe("canonical brief architecture", () => {
	test("reads back every part of a fully populated architecture", () => {
		const architecture = architectureOf(withArchitecture(FULL));

		expect(architecture.variant).toEqual({
			id: "v1",
			name: "Queued ingest",
			lifecycle: "draft",
			against: "v0",
		});
		expect(architecture.view).toEqual({ id: "w1", name: "Overview", grammar: "data-flow" });
		expect(architecture.selection).toEqual(FULL.selection);
		expect(architecture.differences).toEqual(FULL.differences);
		expect(architecture.reconciliation).toEqual(FULL.reconciliation);
	});

	test("accepts a pane that has drawn nothing and a variant with no predecessor", () => {
		const architecture = architectureOf(
			withArchitecture({ ...FULL, variant: null, view: null, differences: null }),
		);

		expect(architecture.variant).toBeNull();
		expect(architecture.view).toBeNull();
		expect(architecture.differences).toBeNull();
		// Absent is not the same as empty: the selection is still carried.
		expect(architecture.selection.subjects).toHaveLength(1);
	});

	test.each([
		["a variant with no lifecycle", { ...FULL, variant: { id: "v1", name: "n", against: null } }],
		[
			"a variant whose lifecycle is not one of the three",
			{ ...FULL, variant: { ...FULL.variant, lifecycle: "proposed" } },
		],
		[
			"a view drawn in a grammar the renderer has never heard of",
			{ ...FULL, view: { ...FULL.view, grammar: "flowchart" } },
		],
		[
			"a selected subject with no kind",
			{ ...FULL, selection: { count: 1, subjects: [{ id: "n1", name: "Gateway" }] } },
		],
		[
			"a selected subject whose kind is not a subject of a variant",
			{ ...FULL, selection: { count: 1, subjects: [{ kind: "lane", id: "n1", name: "Gateway" }] } },
		],
		[
			"differences whose counts are not counts",
			{ ...FULL, differences: { ...FULL.differences, added: -1 } },
		],
		[
			"an issue with no repair to act on",
			{
				...FULL,
				reconciliation: {
					...FULL.reconciliation,
					issues: [{ subject: "n1", what: "node", kind: "competing-field", field: null }],
				},
			},
		],
		[
			"an issue whose kind is not a disagreement the engine produces",
			{
				...FULL,
				reconciliation: {
					...FULL.reconciliation,
					issues: [{ ...FULL.reconciliation.issues[0], kind: "somebody-else-decided" }],
				},
			},
		],
		[
			"a selection that does not say how many were picked out",
			{ ...FULL, selection: { subjects: [] } },
		],
		[
			"a reconciliation that says nothing about whether there is work",
			{ ...FULL, reconciliation: { count: 1, blockedBy: null, issues: [] } },
		],
		["an architecture that is not an object at all", "everything is fine"],
	])("refuses %s", (_what, architecture) => {
		expect(parseCanonicalBrief(withArchitecture(architecture))).toBeNull();
	});

	test("refuses the whole selection when one subject of it is malformed", () => {
		const brief = withArchitecture({
			...FULL,
			selection: {
				count: 2,
				subjects: [
					{ kind: "node", id: "n1", name: "Gateway" },
					{ kind: "node", id: 7 },
				],
			},
		});

		expect(parseCanonicalBrief(brief)).toBeNull();
	});
});

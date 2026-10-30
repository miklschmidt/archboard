import { describe, expect, test } from "bun:test";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";
import type { DrawnBoard } from "@archboard/board/render-reply";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { markCounts } from "#shared/rules/render/key-marks.ts";
import { renderBoard } from "#runtime/operations/render.ts";
import { type BoardRenderChoices } from "#shared/rules/render/board.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { subjectGroups } from "#tests/runtime/support/drawn-subjects.ts";

// What a picture's key counts, and what its answer says it draws, are what the
// picture marks (TASK-497, TASK-496). A view's reading holds more than its
// grammar draws: a sequence view keeps the relationships between its
// participants and draws none, a flowchart draws neither parts nor
// relationships, and an architecture on a board with relationships draws no
// flow. A key that counted the reading said "Changed 3" over a picture that
// marked one step.
//
// What this catches: a key, a panel or an answer that counts or names a
// subject the picture does not draw.

/** The built architecture: a call between two parts, and the exchange that runs over it. */
const BUILT = {
	nodes: [
		{ id: "api", name: "Intake API", kind: "service" },
		{ id: "queue", name: "Work queue", kind: "module" },
	],
	edges: [{ id: "put", from: "api", to: "queue", kind: "data", label: "Enqueue" }],
	flows: [
		{
			id: "ingest",
			name: "Ingest",
			participants: ["api", "queue"],
			steps: [
				{ id: "ask", from: "api", to: "queue", label: "enqueue", kind: "sync" },
				{ id: "ack", from: "queue", to: "api", label: "ack", kind: "return" },
			],
		},
	],
};

/** The draft changes the part, the call and the first message, and adds a message. */
const DRAFT = {
	nodes: [
		{ id: "api", name: "Intake API", kind: "service", responsibility: "Takes every job" },
		{ id: "queue", name: "Work queue", kind: "module" },
	],
	edges: [{ id: "put", from: "api", to: "queue", kind: "data", label: "Enqueue a job" }],
	flows: [
		{
			id: "ingest",
			name: "Ingest",
			participants: ["api", "queue"],
			steps: [
				{ id: "ask", from: "api", to: "queue", label: "enqueue the job", kind: "sync" },
				{ id: "ack", from: "queue", to: "api", label: "ack", kind: "return" },
				{ id: "peek", from: "api", to: "queue", label: "peek", kind: "sync" },
			],
		},
	],
};

const BOARD = SemanticBoardSchema.parse({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: "board",
	name: "Ingest",
	level: "system",
	version: 1,
	createdAt: "2026-10-18T00:00:00.000Z",
	updatedAt: "2026-10-18T00:00:00.000Z",
	current: "built",
	views: [
		{
			id: "exchange",
			name: "Exchange",
			grammar: "sequence",
			scope: { kind: "selection", flows: ["ingest"] },
		},
		{
			id: "logic",
			name: "Logic",
			grammar: "flowchart",
			scope: { kind: "selection", flows: ["ingest"] },
		},
	],
	variants: [
		{ id: "built", name: "As built", lifecycle: "current", content: orderedFixture(BUILT) },
		{
			id: "draft",
			name: "Job queue",
			lifecycle: "draft",
			parent: "built",
			content: orderedFixture(DRAFT),
		},
	],
});

/**
 * Draw the draft as an export draws it, with its legend.
 * @param choices The view and comparison to draw.
 * @returns The drawn reply.
 */
async function drawn(
	choices: Pick<BoardRenderChoices, "view" | "comparison">,
): Promise<DrawnBoard> {
	const outcome = await renderBoard(
		BOARD,
		{ variant: "draft", theme: "light", legend: "horizontal", ...choices },
		DEFAULT_SEMANTIC_POLICY,
	);
	if (!outcome.ok || !("svg" in outcome.reply)) throw new Error("Expected a drawn board");
	return outcome.reply;
}

/**
 * The counts of the marks the drawing puts on its subjects, in the order a key lists them.
 * @param svg The document.
 * @returns How many drawn subjects stand added, changed and removed, leaving out none.
 */
function drawnMarks(svg: string): number[] {
	const standing = new Map(subjectGroups(svg).map((group) => [group.id, group.standing] as const));
	return (["added", "changed", "removed"] as const)
		.map((one) => [...standing.values()].filter((stands) => stands === one).length)
		.filter((count) => count > 0);
}

/**
 * The counts the drawn legend shows beside its marks, in its order.
 * @param svg The document.
 * @returns The counts.
 */
function legendMarks(svg: string): number[] {
	return [
		...svg.matchAll(/<g data-legend-entry="mark">[\s\S]*?<text [^>]*>(\d+)<\/text>\n?<\/g>/gu),
	].map((found) => Number(found[1]));
}

/**
 * The subjects the picture draws, by id.
 * @param reply The drawn reply.
 * @returns Their ids, sorted.
 */
function placedIds(reply: DrawnBoard): string[] {
	return [...new Set(Object.values(reply.atlas).flatMap((boxes) => Object.keys(boxes)))].toSorted();
}

const READINGS = [
	{ name: "the sequence view", view: "Exchange" },
	{ name: "the flowchart view", view: "Logic" },
	{ name: "the architecture of every part", view: "Everything" },
] as const;

describe("a key counts only the marks its picture draws", () => {
	for (const reading of READINGS) {
		test(`${reading.name}: the legend's counts are the drawn marks`, async () => {
			const reply = await drawn({ view: reading.view });
			expect(drawnMarks(reply.svg).length).toBeGreaterThan(0);
			expect(legendMarks(reply.svg)).toEqual(drawnMarks(reply.svg));
		});

		test(`${reading.name}: the answer's standing and drawn subjects are what it places`, async () => {
			const reply = await drawn({ view: reading.view });
			expect(Object.keys(reply.changes?.standing ?? {}).toSorted()).toEqual(placedIds(reply));
			expect(markCounts(reply.changes?.standing ?? {}).map(({ count }) => count)).toEqual(
				drawnMarks(reply.svg),
			);
			const named = Object.values(reply.drawn).flatMap((subjects) => subjects.map(({ id }) => id));
			expect(named.toSorted()).toEqual(placedIds(reply));
		});
	}

	test("each drawn subject is listed under the kind of subject it is", async () => {
		const sequence = await drawn({ view: "Exchange" });
		expect(sequence.drawn.edges).toEqual([]);
		expect(sequence.drawn.nodes.map(({ id }) => id).toSorted()).toEqual(["api", "queue"]);
		expect(sequence.drawn.steps.map(({ id }) => id).toSorted()).toEqual(["ack", "ask", "peek"]);
		const architecture = await drawn({ view: "Everything" });
		expect(architecture.drawn.flows).toEqual([]);
		expect(architecture.drawn.steps).toEqual([]);
		expect(architecture.drawn.edges.map(({ id }) => id)).toEqual(["put"]);
	});

	test("a picture without its comparison draws what the variant holds and marks nothing", async () => {
		const reply = await drawn({ view: "Exchange", comparison: false });
		expect(legendMarks(reply.svg)).toEqual([]);
		expect(drawnMarks(reply.svg)).toEqual([]);
		expect(Object.keys(reply.changes?.standing ?? {}).toSorted()).toEqual(placedIds(reply));
	});
});

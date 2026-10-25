// A picture drawn against a named variant (TASK-478.01).
//
// What these catch: a stacked proposal whose picture marks everything the proposals below it
// added, because it was read against the board's current variant; a picture of unbuilt work
// that is still framed "Planned"; a name that is not a variant, or is the drawn variant, drawn
// anyway; and a picture asked for with no variant to read against that no longer draws as it did.

import { expect, test } from "bun:test";
import { renderBoard } from "#runtime/operations/render.ts";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";
import type { SemanticRenderReply } from "@archboard/board/render-reply";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

const API = { id: "api", name: "Intake API", kind: "service" };
const QUEUE = { id: "queue", name: "Work queue", kind: "module" };
const WORKER = { id: "worker", name: "Worker", kind: "module" };
const CACHE = { id: "cache", name: "Result cache", kind: "module" };

/**
 * One variant of the stack.
 * @param id Its id, which its name is made from.
 * @param parent The variant it came from.
 * @param nodes What it states.
 * @param lifecycle Whether it is the current architecture.
 * @returns The variant, not yet checked.
 */
function variantOf(
	id: string,
	parent: string | undefined,
	nodes: readonly object[],
	lifecycle: "current" | "draft",
) {
	return {
		id,
		name: `Variant ${id}`,
		lifecycle,
		...(parent === undefined ? {} : { parent }),
		content: orderedFixture({ nodes }),
	};
}

/**
 * A stack of three variants, each one part larger than the one it came from.
 * @param built Whether the bottom of the stack is the current architecture.
 * @returns The board.
 */
function stack(built: boolean) {
	return SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "board",
		name: "Ingest",
		level: "system",
		version: 1,
		createdAt: "2026-10-15T00:00:00.000Z",
		updatedAt: "2026-10-15T00:00:00.000Z",
		...(built ? { current: "base" } : {}),
		variants: [
			variantOf("base", undefined, [API, QUEUE], built ? "current" : "draft"),
			variantOf("one", "base", [API, QUEUE, WORKER], "draft"),
			variantOf("two", "one", [API, QUEUE, WORKER, CACHE], "draft"),
		],
	});
}

/**
 * Draw one variant of the stack.
 * @param built Whether the bottom of the stack is the current architecture.
 * @param choices The variant, and the variant to read it against.
 * @param choices.variant The variant to draw.
 * @param choices.against The variant to read it against.
 * @returns The outcome of the render.
 */
function drawn(built: boolean, choices: { variant: string; against?: string }) {
	return renderBoard(stack(built), { theme: "light", ...choices }, DEFAULT_SEMANTIC_POLICY);
}

/**
 * The reply of a render that drew.
 * @param outcome The outcome.
 * @returns The reply.
 */
function replyOf(
	outcome: Awaited<ReturnType<typeof drawn>>,
): SemanticRenderReply & { svg: string } {
	if (!outcome.ok || !("svg" in outcome.reply)) throw new Error("Expected a drawn board");
	return outcome.reply;
}

/**
 * Which parts a picture marks as added.
 * @param reply What was drawn.
 * @returns Their ids, sorted.
 */
function added(reply: SemanticRenderReply): string[] {
	return Object.entries(reply.changes?.standing ?? {})
		.filter(([, standing]) => standing === "added")
		.map(([id]) => id)
		.toSorted();
}

test("a stacked proposal marks only what it adds over the proposal below it, not over the current architecture", async () => {
	const ordinary = replyOf(await drawn(true, { variant: "two" }));
	expect(ordinary.changes?.against.id).toBe("base");
	expect(added(ordinary)).toEqual(["cache", "worker"]);

	const stacked = replyOf(await drawn(true, { variant: "two", against: "one" }));
	expect(stacked.changes?.against.id).toBe("one");
	expect(added(stacked)).toEqual(["cache"]);
});

test("a picture drawn against a variant carries no planned frame, also on a board with no current variant", async () => {
	const framed = replyOf(await drawn(false, { variant: "two" }));
	expect(framed.svg).toContain('data-slot="planned-frame"');

	const against = replyOf(await drawn(false, { variant: "two", against: "one" }));
	expect(against.svg).not.toContain('data-slot="planned-frame"');
	expect(against.changes?.against.id).toBe("one");
	expect(added(against)).toEqual(["cache"]);
});

test("the variant to read against is found by name as well as by id", async () => {
	const byName = replyOf(await drawn(true, { variant: "two", against: "Variant one" }));
	expect(byName.changes?.against.id).toBe("one");
});

test("a variant the board lacks, and the drawn variant itself, are refused", async () => {
	const unknown = await drawn(true, { variant: "two", against: "nope" });
	expect(unknown).toMatchObject({ ok: false, code: "UNKNOWN_VARIANT" });
	const itself = await drawn(true, { variant: "two", against: "two" });
	expect(itself).toMatchObject({ ok: false, code: "UNKNOWN_VARIANT" });
});

import { expect, test } from "bun:test";
import { BoardCreateInputSchema, VariantEditInputSchema } from "#shared/protocol/board-input.ts";
import {
	HistoricalCorrectionInputSchema,
	HistoricalRevisionSchema,
} from "#shared/protocol/historical-correction.ts";
import { type SemanticBoard } from "#shared/schemas/board-document.ts";
import { acceptedBoard } from "#runtime/operations/write/accepted.ts";
import { correctHistoricalTransition } from "#runtime/operations/write/correction.ts";
import {
	createBoardTransition,
	editVariantTransition,
} from "#runtime/operations/write/transitions.ts";

const at = "2026-10-23T12:00:00Z";
const revisions = [{ repo: "example", commit: "a".repeat(40) }];

/** A superseded state with both an implemented successor and a draft descendant. */
function family(): SemanticBoard {
	const created = createBoardTransition(
		BoardCreateInputSchema.parse({
			name: "Example",
			level: "system",
			nodes: [{ name: "API", kind: "service" }],
		}),
	).apply(null, at);
	if (!created.ok) throw new Error(created.problem);
	const original = created.board.variants[0]!;
	return {
		...created.board,
		current: "next",
		variants: [
			{
				...original,
				lifecycle: "historical",
				summary: "Before",
				documents: [{ repo: "example", path: "README.md" }],
			},
			{ ...original, id: "next", name: "Implemented", parent: original.id },
			{ ...original, id: "draft", name: "Proposal", lifecycle: "draft", parent: original.id },
		],
		adoptions: [{ variant: "next", at, from: original.id }],
	};
}

test("ordinary edits refuse historical changes; correction reconciles drafts, preserves implemented history and records evidence", () => {
	const before = family();
	const historical = before.variants[0]!;
	const input = HistoricalCorrectionInputSchema.parse({
		variant: historical.name,
		reason: "The API responsibility was recorded incorrectly",
		revisions: revisions.map(({ repo, commit }) => ({ repo, commit: commit.toUpperCase() })),
		edit: {
			nodes: [
				{
					id: historical.content.nodes[0]!.id,
					name: "API",
					kind: "service",
					responsibility: "Accepts orders",
				},
			],
			summary: "Corrected",
			documents: [],
		},
	});
	const refused = editVariantTransition(
		VariantEditInputSchema.parse({ ...input.edit, variant: historical.id }),
	).apply(before, at);
	expect(refused).toMatchObject({ ok: false, code: "VARIANT_HISTORICAL" });
	const result = correctHistoricalTransition(input).apply(before, at);
	if (!result.ok) throw new Error(result.problem);
	const corrected = result.board.variants[0]!;
	expect(corrected.content.nodes[0]!.responsibility).toBe("Accepts orders");
	expect(corrected.summary).toBe("Corrected");
	expect(corrected.documents).toBeUndefined();
	expect(corrected.corrections).toEqual([{ at, reason: input.reason, revisions }]);
	expect({
		...corrected,
		content: historical.content,
		summary: historical.summary,
		documents: historical.documents,
		corrections: undefined,
	}).toEqual({
		...historical,
		summary: historical.summary,
		documents: historical.documents,
		corrections: undefined,
	});
	expect(result.board.variants[1]).toBe(before.variants[1]);
	expect(result.board.variants[2]!.content.nodes[0]!.responsibility).toBe("Accepts orders");
	expect(result.board.variants[2]!.corrections).toBeUndefined();
	expect(result.descendants).toMatchObject([{ variant: "draft", outcome: "merged" }]);
	expect(result.board.current).toBe(before.current);
	expect(result.board.adoptions).toBe(before.adoptions);
	expect(result.board.views).toBe(before.views);
	expect(result.board.level).toBe(before.level);
	expect(before.variants[0]!.corrections).toBeUndefined();
	expect(acceptedBoard(before, result.board, at, null)).toHaveProperty("board");
	const again = correctHistoricalTransition(input).apply(result.board, at);
	if (!again.ok) throw new Error(again.problem);
	expect(again.board.variants[0]!.corrections).toHaveLength(2);
});

const command = (variant: string) =>
	correctHistoricalTransition(
		HistoricalCorrectionInputSchema.parse({ variant, reason: "Correction", revisions, edit: {} }),
	);

test("correction requires a stated change to an existing historical variant", () => {
	const before = family();
	expect(command("Implemented").apply(before, at)).toMatchObject({
		ok: false,
		code: "VARIANT_NOT_HISTORICAL",
	});
	expect(command("Proposal").apply(before, at)).toMatchObject({
		ok: false,
		code: "VARIANT_NOT_HISTORICAL",
	});
	expect(command("Initial").apply(before, at)).toMatchObject({
		ok: false,
		code: "NOTHING_TO_CORRECT",
	});
	expect(command("absent").apply(before, at)).toMatchObject({ ok: false, code: "UNKNOWN_VARIANT" });
	expect(command("Initial").apply(null, at)).toMatchObject({ ok: false, code: "BOARD_MISSING" });
});

test("correction schema requires immutable evidence, reason and explicit target, and rejects shared edits", () => {
	const valid = { variant: "Initial", reason: "Correct a fact", revisions, edit: {} };
	for (const edit of [
		{ level: "module" },
		{ views: [] },
		{ removeViews: [] },
		{ variant: "other" },
	]) {
		expect(HistoricalCorrectionInputSchema.safeParse({ ...valid, edit }).success).toBe(false);
	}
	for (const invalid of [
		{ variant: undefined },
		{ reason: " " },
		{ revisions: [] },
		{ revisions: [...revisions, ...revisions] },
	]) {
		expect(HistoricalCorrectionInputSchema.safeParse({ ...valid, ...invalid }).success).toBe(false);
	}
	for (const commit of ["HEAD", "main", "a".repeat(39), "z".repeat(40)]) {
		expect(HistoricalRevisionSchema.safeParse({ repo: "example", commit }).success).toBe(false);
	}
	expect(
		HistoricalRevisionSchema.safeParse({ repo: "example", commit: "b".repeat(64) }).success,
	).toBe(true);
});

test("correction retains restoration confirmation guardrails", () => {
	const before = family();
	const successor = before.variants[1]!;
	const absent = { ...successor.content.nodes[0]!, id: "missing", name: "Worker" };
	successor.content = { ...successor.content, nodes: [...successor.content.nodes, absent] };
	const input = HistoricalCorrectionInputSchema.parse({
		variant: "Initial",
		reason: "The historical worker was omitted",
		revisions,
		edit: { nodes: [{ id: absent.id, name: absent.name, kind: absent.kind }] },
	});
	expect(correctHistoricalTransition(input).apply(before, at)).toMatchObject({
		ok: false,
		code: "RESTORE_UNCONFIRMED",
	});
	const result = correctHistoricalTransition({
		...input,
		edit: { ...input.edit, confirm: ["RESTORE_UNCONFIRMED"] },
	}).apply(before, at);
	if (!result.ok) throw new Error(result.problem);
	expect(result.board.variants[0]!.content.nodes.map((node) => node.id)).toContain(absent.id);
	expect(result.board.variants[1]).toBe(successor);
});

test("historical corrections preserve draft-local changes and stop at adopted successors", () => {
	const before = family();
	const historical = before.variants[0]!;
	const draft = structuredClone(before.variants[2]!);
	draft.content.nodes[0]!.description = "The proposal adds retries";
	const nested = { ...draft, id: "nested", name: "Nested proposal", parent: draft.id };
	const implementedDraft = { ...draft, id: "later", name: "After implementation", parent: "next" };
	before.variants = [historical, before.variants[1]!, draft, nested, implementedDraft];
	const input = HistoricalCorrectionInputSchema.parse({
		variant: historical.id,
		reason: "Correct the inherited responsibility",
		revisions,
		edit: { nodes: [{ ...historical.content.nodes[0]!, responsibility: "Accepts orders" }] },
	});
	const result = correctHistoricalTransition(input).apply(before, at);
	if (!result.ok) throw new Error(result.problem);
	for (const id of ["draft", "nested"]) {
		const changed = result.board.variants.find((variant) => variant.id === id)!;
		expect(changed.content.nodes[0]).toMatchObject({
			responsibility: "Accepts orders",
			description: "The proposal adds retries",
		});
		expect(changed.reconciliation).toBeUndefined();
	}
	expect(result.board.variants[1]).toBe(before.variants[1]);
	expect(result.board.variants[4]).toBe(implementedDraft);
	expect(result.descendants).toMatchObject([
		{ variant: "draft", outcome: "merged" },
		{ variant: "nested", outcome: "merged" },
	]);
	expect(acceptedBoard(before, result.board, at, null)).toHaveProperty("board");
});

test("historical corrections expose conflicting draft changes and block dependent drafts", () => {
	const before = family();
	const historical = before.variants[0]!;
	const draft = structuredClone(before.variants[2]!);
	draft.content.nodes[0]!.responsibility = "Queues orders";
	const nested = { ...draft, id: "nested", name: "Nested proposal", parent: draft.id };
	before.variants = [historical, before.variants[1]!, draft, nested];
	const input = HistoricalCorrectionInputSchema.parse({
		variant: historical.id,
		reason: "Correct the inherited responsibility",
		revisions,
		edit: { nodes: [{ ...historical.content.nodes[0]!, responsibility: "Accepts orders" }] },
	});
	const result = correctHistoricalTransition(input).apply(before, at);
	if (!result.ok) throw new Error(result.problem);
	expect(result.descendants).toMatchObject([
		{ variant: "draft", outcome: "conflicted" },
		{ variant: "nested", outcome: "blocked", blockedBy: "draft" },
	]);
	expect(result.board.variants[2]!.content.nodes[0]!.responsibility).toBe("Queues orders");
	expect(result.board.variants[2]!.reconciliation?.issues).toMatchObject([
		{
			field: "responsibility",
			kind: "competing-field",
			mine: "Queues orders",
			theirs: "Accepts orders",
		},
	]);
	expect(result.board.variants[3]!.reconciliation?.blockedBy).toBe("draft");
	expect(result.board.variants[1]).toBe(before.variants[1]);
	expect(acceptedBoard(before, result.board, at, null)).toHaveProperty("board");
	const summarized = correctHistoricalTransition(
		HistoricalCorrectionInputSchema.parse({ ...input, edit: { summary: "The first API" } }),
	).apply(result.board, at);
	if (!summarized.ok) throw new Error(summarized.problem);
	expect(summarized.board.variants.slice(1)).toEqual(result.board.variants.slice(1));
	expect(summarized.descendants).toEqual([]);
});

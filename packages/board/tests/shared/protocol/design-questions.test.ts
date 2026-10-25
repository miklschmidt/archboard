// The answer of the design questions (ADR 0044, ADR 0057): the boards it read
// and skipped, and for each question the containers and parts behind its two
// counts. The CLI and the pane parse one schema, and nothing in it can hold a
// score, a combined number or a verdict.

import { describe, expect, test } from "bun:test";
import {
	DesignQuestionsReplySchema,
	designQuestionsReply,
	type BoardAtVariant,
} from "#shared/protocol/design-questions.ts";
import { VariantContentSchema } from "#shared/schemas/content.ts";
import { withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

const node = (name: string, parent?: string) => ({
	id: name.toLowerCase(),
	name,
	kind: "module",
	...(parent === undefined ? {} : { parent }),
});

/**
 * A board read at a variant that holds some nodes and relationships.
 * @param name The board.
 * @param stated The nodes and relationships.
 * @returns The board at its variant.
 */
function boardAt(name: string, stated: Record<string, unknown>): BoardAtVariant {
	return {
		name,
		version: 3,
		variant: {
			id: `${name}-v`,
			name: "Current architecture",
			content: VariantContentSchema.parse(withFixtureOrders(stated)),
		},
	};
}

// Shop: Cart passes the call on, and both its parts are reached. Vault: nothing reaches it.
const shop = boardAt("Shop", {
	nodes: [node("Shop"), node("Cart", "shop"), node("Web"), node("Disk")],
	edges: [
		{ id: "e1", from: "web", to: "cart", kind: "call" },
		{ id: "e2", from: "cart", to: "disk", kind: "call" },
	],
});
const vault = boardAt("Vault", {
	nodes: [node("Vault"), node("Keys", "vault"), node("Locks", "vault")],
	edges: [],
});

describe("the design questions answer", () => {
	const reply = designQuestionsReply(
		[shop, vault],
		[
			{ reason: "no-current-variant", board: "Planned" },
			{ reason: "board-unreadable", board: "Broken", detail: "not a board" },
		],
	);

	test("it names the boards it read at the variant it read, and the boards it skipped with the reason", () => {
		expect(reply.boards).toEqual([
			{ board: "Shop", variant: { id: "Shop-v", name: "Current architecture" }, version: 3 },
			{ board: "Vault", variant: { id: "Vault-v", name: "Current architecture" }, version: 3 },
		]);
		expect(reply.skipped).toEqual([
			{ reason: "no-current-variant", board: "Planned" },
			{ reason: "board-unreadable", board: "Broken", detail: "not a board" },
		]);
	});

	test("each question lists its boards, containers and parts, and counts containers and parts", () => {
		const { passThroughEntryPoints, containersWithNoHiddenPart, containersWithNoEntryPoint } =
			reply.questions;
		expect(passThroughEntryPoints).toMatchObject({ containers: 1, parts: 1 });
		expect(passThroughEntryPoints.results).toEqual([
			{
				board: "Shop",
				container: { id: "shop", name: "Shop", kind: "module" },
				parts: [{ id: "cart", name: "Cart", kind: "module" }],
			},
		]);
		expect(containersWithNoHiddenPart).toMatchObject({ containers: 1, parts: 1 });
		expect(containersWithNoHiddenPart.results.map((one) => one.board)).toEqual(["Shop"]);
		expect(containersWithNoEntryPoint).toMatchObject({ containers: 1, parts: 2 });
		expect(containersWithNoEntryPoint.results[0]?.board).toBe("Vault");
		expect(containersWithNoEntryPoint.results[0]?.parts.map((part) => part.name)).toEqual([
			"Keys",
			"Locks",
		]);
	});

	test("a vault with nothing to read answers empty questions, not no questions", () => {
		const empty = designQuestionsReply([], []);
		expect(empty.questions.passThroughEntryPoints).toEqual({
			containers: 0,
			parts: 0,
			results: [],
		});
		expect(empty.boards).toEqual([]);
	});

	test("the schema accepts the answer and refuses a score, a verdict or a combined number anywhere in it", () => {
		expect(DesignQuestionsReplySchema.safeParse(reply).success).toBe(true);
		const { passThroughEntryPoints } = reply.questions;
		const [result] = passThroughEntryPoints.results;
		const withExtra = [
			{ ...reply, score: 7 },
			{ ...reply, questions: { ...reply.questions, total: 3 } },
			{
				...reply,
				questions: {
					...reply.questions,
					passThroughEntryPoints: { ...passThroughEntryPoints, verdict: "shallow" },
				},
			},
			{
				...reply,
				questions: {
					...reply.questions,
					passThroughEntryPoints: {
						...passThroughEntryPoints,
						results: [{ ...result, depth: 0.2 }],
					},
				},
			},
		];
		for (const answer of withExtra) {
			expect(DesignQuestionsReplySchema.safeParse(answer).success).toBe(false);
		}
	});
});

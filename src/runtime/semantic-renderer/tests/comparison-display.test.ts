import { expect, test } from "bun:test";

import { renderBoard } from "@/runtime/semantic-renderer/index";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";

test("a plain proposal drawing omits comparison marks and removed context", async () => {
	const before = orderedFixture({
		nodes: [
			{ id: "kept", name: "Service", kind: "service" },
			{ id: "old", name: "Old worker", kind: "module" },
		],
	});
	const after = orderedFixture({
		nodes: [
			{ id: "kept", name: "Service", kind: "service" },
			{ id: "new", name: "New worker", kind: "module" },
		],
	});
	const board = SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "board",
		name: "Workers",
		level: "system",
		version: 1,
		createdAt: "2026-09-20T00:00:00.000Z",
		updatedAt: "2026-09-20T00:00:00.000Z",
		current: "current",
		variants: [
			{ id: "current", name: "Current", lifecycle: "current", content: before },
			{ id: "draft", name: "Draft", lifecycle: "draft", parent: "current", content: after },
		],
	});
	const decorated = await renderBoard(
		board,
		{ variant: "draft", theme: "light", fonts: "linked" },
		DEFAULT_SEMANTIC_POLICY,
	);
	const plain = await renderBoard(
		board,
		{ variant: "draft", theme: "light", fonts: "linked", comparison: false },
		DEFAULT_SEMANTIC_POLICY,
	);
	if (!decorated.ok || !plain.ok || !("svg" in decorated.reply) || !("svg" in plain.reply)) {
		throw new Error("Expected two drawn proposals");
	}
	expect(decorated.reply.svg).toContain('data-semantic-standing="removed"');
	expect(decorated.reply.svg).toContain('data-semantic-id="old"');
	expect(plain.reply.svg).not.toContain("data-semantic-standing");
	expect(plain.reply.svg).not.toContain('data-semantic-id="old"');
	expect(plain.reply.svg).toContain('data-semantic-id="new"');
	expect(plain.reply.changes).toEqual(decorated.reply.changes);
	expect(plain.reply.variant).toEqual(decorated.reply.variant);
});

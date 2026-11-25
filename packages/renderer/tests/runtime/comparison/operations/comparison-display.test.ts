import { expect, test } from "bun:test";

import { renderArchitecture, renderLegacyBoard } from "#runtime/bun-renderer/operations/render.ts";
import { bothModes } from "#tests/runtime/support/comparison-modes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { LegacyBoardSchema, LEGACY_BOARD_SCHEMA_VERSION } from "@archboard/model/legacy-board";
import { defaultSemanticPolicy } from "@archboard/model/policy";

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
	const document = LegacyBoardSchema.parse({
		schemaVersion: LEGACY_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "document",
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
	const decorated = await renderLegacyBoard(
		document,
		{ variant: "draft", theme: "light" },
		defaultSemanticPolicy(),
	);
	const plain = await renderLegacyBoard(
		document,
		{ variant: "draft", theme: "light", comparison: false },
		defaultSemanticPolicy(),
	);
	if (!decorated.ok || !plain.ok || !("svg" in decorated.reply) || !("svg" in plain.reply)) {
		throw new Error("Expected two drawn proposals");
	}
	expect(decorated.reply.svg).toContain('data-semantic-standing="removed"');
	expect(decorated.reply.svg).toContain('data-semantic-id="old"');
	expect(plain.reply.svg).not.toContain("data-semantic-standing");
	expect(plain.reply.svg).not.toContain('data-semantic-id="old"');
	expect(plain.reply.svg).toContain('data-semantic-id="new"');
	// Both are read against the same variant; each says how what it draws stands.
	expect(plain.reply.changes?.against).toEqual(decorated.reply.changes?.against);
	expect(plain.reply.changes?.standing).toEqual({ kept: "unchanged", new: "added" });
	expect(plain.reply.variant).toEqual(decorated.reply.variant);
});

const plainNodes = ["a", "b", "c"].map((id) => ({ id, name: id, kind: "module" }));
const keptNodes = plainNodes.filter(({ id }) => id !== "b");
const removedCalls = [
	{ id: "ab", from: "a", to: "b", kind: "call" },
	{ id: "bc", from: "b", to: "c", kind: "call" },
];
const keptStep = { id: "ac", from: "a", to: "c", kind: "sync", label: "Keep this call" };

test.each([
	{
		name: "an intermediary and its routes",
		current: { nodes: plainNodes, edges: removedCalls },
		draft: { nodes: keptNodes, edges: [] },
		comparedEdges: ["ab", "bc"],
	},
	{
		name: "a labeled route between retained cards",
		current: {
			nodes: keptNodes,
			edges: [{ id: "old", from: "a", to: "c", kind: "call", label: "Removed label rows" }],
		},
		draft: { nodes: keptNodes, edges: [] },
		comparedEdges: ["old"],
	},
	{
		name: "the last child of a former container",
		current: {
			nodes: [...keptNodes, { id: "b", name: "Child", kind: "module", parent: "a" }],
			edges: [{ id: "bc", from: "b", to: "c", kind: "call" }],
		},
		draft: { nodes: keptNodes, edges: [] },
		comparedEdges: ["bc"],
	},
	{
		name: "flow messages and their removed participant",
		current: {
			nodes: plainNodes,
			flows: [
				{
					id: "flow",
					name: "Calls",
					participants: ["a", "b", "c"],
					steps: [
						...removedCalls.map((edge) => ({ ...edge, kind: "sync", label: edge.id })),
						keptStep,
					],
				},
			],
		},
		draft: {
			nodes: keptNodes,
			flows: [{ id: "flow", name: "Calls", participants: ["a", "c"], steps: [keptStep] }],
		},
		comparedEdges: ["ab", "ac", "bc"],
	},
])(
	"plain Blocks reserves no space for $name",
	async ({ current, draft: content, comparedEdges }) => {
		const draft = orderedFixture(content);
		const drawings = await bothModes(current, draft, {
			view: { grammar: "architecture", scope: { kind: "all" } },
		});
		const visible = await renderArchitecture({
			content: draft,
			policy: defaultSemanticPolicy(),
		});
		expect(drawings.plain.atlas).toEqual(visible.atlas);
		expect([drawings.plain.width, drawings.plain.height]).toEqual([visible.width, visible.height]);
		expect(Object.keys(drawings.compared.atlas.nodes).toSorted()).toEqual(
			current.nodes.map(({ id }) => id).toSorted(),
		);
		expect(Object.keys(drawings.compared.atlas.edges).toSorted()).toEqual([...comparedEdges]);
	},
);

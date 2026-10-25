import { expect, test } from "bun:test";
import { renderArchitecture, renderBoard } from "#runtime/operations/render.ts";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { arrangementOf } from "#tests/runtime/support/drawn-atlas.ts";

test("a nested proposal lays out its comparison content fresh and retains subject standing", async () => {
	const retained = [
		{ id: "cloud", name: "Cloud", kind: "system" },
		{ id: "cluster", name: "Cluster", kind: "service", parent: "cloud" },
		{ id: "cert", name: "Certificates", kind: "module", parent: "cluster" },
		{ id: "workers", name: "Workers", kind: "module", parent: "cluster" },
	];
	const content = {
		nodes: [
			...retained,
			{ id: "trust", name: "Device trust", kind: "service", parent: "cluster" },
			{ id: "custody", name: "Key custody", kind: "module", parent: "trust" },
			{ id: "kms", name: "Key management", kind: "external" },
		],
		edges: [{ id: "keys", from: "kms", to: "custody", kind: "data", label: "Signing key" }],
	};
	const board = SemanticBoardSchema.parse({
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "board",
		name: "Nested proposal",
		level: "system",
		version: 1,
		createdAt: "2026-09-19T00:00:00.000Z",
		updatedAt: "2026-09-19T00:00:00.000Z",
		current: "current",
		variants: [
			{
				id: "current",
				name: "Current",
				lifecycle: "current",
				content: orderedFixture({ nodes: retained }),
			},
			{
				id: "draft",
				name: "Draft",
				lifecycle: "draft",
				parent: "current",
				content: orderedFixture(content),
			},
		],
	});
	const proposal = await renderBoard(
		board,
		// Every nested part, which the overview would close.
		{ variant: "draft", view: "Everything", theme: "light" },
		DEFAULT_SEMANTIC_POLICY,
	);
	if (!proposal.ok || !("svg" in proposal.reply)) throw new Error("Expected a drawn proposal");
	const fresh = await renderArchitecture({
		content: board.variants[1]!.content,
		theme: "light",
		policy: DEFAULT_SEMANTIC_POLICY,
	});
	// The proposal's pins may move the drawing in from the page's edge; its
	// arrangement is the fresh one's.
	expect(arrangementOf(proposal.reply)).toEqual(arrangementOf(fresh));
	expect(proposal.reply.changes?.standing).toEqual({
		cloud: "unchanged",
		cluster: "unchanged",
		cert: "unchanged",
		workers: "unchanged",
		trust: "added",
		custody: "added",
		kms: "added",
		keys: "added",
	});
});

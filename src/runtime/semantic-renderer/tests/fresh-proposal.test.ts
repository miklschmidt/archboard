import { expect, test } from "bun:test";
import { renderArchitecture, renderBoard } from "@/runtime/semantic-renderer/index";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@/shared/semantic-board/index";
import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";

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
			{ id: "current", name: "Current", lifecycle: "current", content: { nodes: retained } },
			{ id: "draft", name: "Draft", lifecycle: "draft", parent: "current", content },
		],
	});
	const proposal = await renderBoard(
		board,
		{ variant: "draft", theme: "light", fonts: "linked" },
		DEFAULT_SEMANTIC_POLICY,
	);
	if (!proposal.ok || !("svg" in proposal.reply)) throw new Error("Expected a drawn proposal");
	const fresh = await renderArchitecture({
		content: board.variants[1]!.content,
		theme: "light",
		fonts: "linked",
		policy: DEFAULT_SEMANTIC_POLICY,
	});
	expect(proposal.reply.atlas).toEqual(fresh.atlas);
	expect([proposal.reply.width, proposal.reply.height]).toEqual([fresh.width, fresh.height]);
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

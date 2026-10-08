import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_SEMANTIC_POLICY,
	PaletteColorSchema,
	type SemanticPolicy,
} from "@/shared/semantic-policy/index";
import type * as Store from "@/runtime/semantic-board-store/index";
import type * as Contract from "@/shared/semantic-board/index";

const callerVault = process.env["ARCHBOARD_VAULT"];
const vault = mkdtempSync(join(tmpdir(), "archboard-policy-"));
process.env["ARCHBOARD_VAULT"] = vault;
let store: typeof Store;
let contract: typeof Contract;
const writer = { kind: "agent" as const };
let serial = 0;
let name = "";
const policy: SemanticPolicy = {
	levels: ["context", "detail"],
	nodeKinds: {
		api: { name: "API", icon: "RiServerLine", color: "blue" },
		worker: { name: "Worker", icon: "RiTerminalLine" },
	},
	relationshipKinds: { request: { name: "Request", dash: "solid", arrowhead: "filled" } },
	groups: {},
};
beforeAll(async () => {
	store = await import("@/runtime/semantic-board-store/index");
	contract = await import("@/shared/semantic-board/index");
	expect(store.locateSemanticBoard("test").file.startsWith(vault)).toBe(true);
});
beforeEach(() => {
	serial++;
	name = `policy-${serial}`;
	save(policy);
});
afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(vault, { recursive: true, force: true });
});
function save(value: SemanticPolicy) {
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(value));
}
async function create(kind = "api", level = "context") {
	return store.writeSemanticBoard({
		board: name,
		writer,
		transition: store.createBoardTransition(
			contract.BoardCreateInputSchema.parse({ name, level, nodes: [{ name: "Gateway", kind }] }),
		),
	});
}
function read() {
	const result = store.readSemanticBoard(name);
	if (!result.ok) throw new Error(result.problem);
	return result;
}
async function edit(input: unknown) {
	return store.writeSemanticBoard({
		board: name,
		writer,
		expectedVersion: read().board.version,
		transition: store.editVariantTransition(contract.VariantEditInputSchema.parse(input)),
	});
}

test("custom vocabulary admits configured kinds and rejects newly authored unknown references", async () => {
	expect(
		contract.BoardCreateInputSchema.safeParse({
			name,
			level: "context",
			nodes: [
				{ name: "Gateway", kind: "api" },
				{ name: "Worker", kind: "worker" },
			],
			edges: [{ from: "Gateway", to: "Worker" }],
		}).success,
	).toBe(false);
	expect((await create()).outcome).toBe("applied");
	const node = read().board.variants[0]!.content.nodes[0]!;
	expect((await edit({ nodes: [{ ...node, kind: "typo" }] })).outcome).toBe("rejected");
	expect((await edit({ level: "unknown" })).outcome).toBe("rejected");
	expect(
		(
			await edit({
				nodes: [{ name: "Worker", kind: "worker" }],
				edges: [{ from: "Gateway", to: "Worker", kind: "typo" }],
			})
		).outcome,
	).toBe("rejected");
});

test("removed definitions remain readable and editable, and cloning them preserves warnings", async () => {
	await create();
	save({ ...policy, nodeKinds: { worker: policy.nodeKinds["worker"]! } });
	expect(read().warnings.some((issue) => issue.code === "UNKNOWN_VOCABULARY")).toBe(true);
	const node = read().board.variants[0]!.content.nodes[0]!;
	expect((await edit({ nodes: [{ ...node, name: "Renamed" }] })).outcome).toBe("applied");
	expect((await edit({ nodes: [{ name: "Another", kind: "api" }] })).outcome).toBe("rejected");
	const branch = await store.writeSemanticBoard({
		board: name,
		writer,
		expectedVersion: read().board.version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ name: "Proposal", from: "current" }),
		),
	});
	expect(branch.outcome).toBe("applied");
});

test("an unknown kind names the node or the relationship that states it", async () => {
	expect(
		(
			await store.writeSemanticBoard({
				board: name,
				writer,
				transition: store.createBoardTransition(
					contract.BoardCreateInputSchema.parse({
						name,
						level: "context",
						nodes: [
							{ name: "Gateway", kind: "api" },
							{ name: "Worker", kind: "worker" },
						],
						edges: [{ from: "Gateway", to: "Worker", kind: "request" }],
					}),
				),
			})
		).outcome,
	).toBe("applied");
	save({
		...policy,
		nodeKinds: { worker: policy.nodeKinds["worker"]! },
		relationshipKinds: { event: { name: "Event", dash: "dashed", arrowhead: "open" } },
	});
	const { content } = read().board.variants[0]!;
	const gateway = content.nodes.find((node) => node.name === "Gateway")!;
	const request = content.edges[0]!;
	const subjects = read()
		.warnings.filter((issue) => issue.code === "UNKNOWN_VOCABULARY")
		.map((issue) => issue.subject);
	expect(subjects).toHaveLength(2);
	expect(subjects).toContainEqual({ kind: "node", id: gateway.id, name: "Gateway" });
	const relationship = subjects.find((subject) => subject?.kind === "edge");
	expect(relationship?.id).toBe(request.id);
	// A relationship has no name of its own, so it is called by the parts at its ends.
	expect(relationship?.name).toContain("Gateway");
	expect(relationship?.name).toContain("Worker");
});

test("an unknown level is about the board, so it names no subject", async () => {
	await create("api", "detail");
	save({ ...policy, levels: ["context"] });
	const levelWarning = read().warnings.find((issue) => issue.path === "level");
	expect(levelWarning?.code).toBe("UNKNOWN_VOCABULARY");
	expect(levelWarning?.subject).toBeUndefined();
});

test("a historical removed kind cannot authorize a newly authored reference in an existing variant", async () => {
	await create();
	const node = read().board.variants[0]!.content.nodes[0]!;
	await store.writeSemanticBoard({
		board: name,
		writer,
		expectedVersion: read().board.version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ name: "Proposal", from: "current" }),
		),
	});
	await edit({ variant: "Proposal", nodes: [{ ...node, kind: "worker" }] });
	save({ ...policy, nodeKinds: { worker: policy.nodeKinds["worker"]! } });
	expect((await edit({ variant: "Proposal", nodes: [{ ...node, kind: "api" }] })).outcome).toBe(
		"rejected",
	);
});

test("a removed definition is reported on frozen history too, because config.yaml can answer it", async () => {
	// A vocabulary warning is not a content diagnostic: its subject is the vault
	// configuration, and defining the value again is an accepted write that
	// clears it. History is still drawn with that vocabulary, so a frozen
	// variant referring to a definition nobody configures any more is a real gap
	// the vault should keep saying out loud (TASK-259).
	await create();
	await store.writeSemanticBoard({
		board: name,
		writer,
		expectedVersion: read().board.version,
		transition: store.branchVariantTransition(
			contract.BoardBranchInputSchema.parse({ name: "Worker instead", from: "current" }),
		),
	});
	const node = read().board.variants[0]!.content.nodes[0]!;
	expect(
		(await edit({ variant: "Worker instead", nodes: [{ ...node, kind: "worker" }] })).outcome,
	).toBe("applied");
	const adopted = await store.writeSemanticBoard({
		board: name,
		writer,
		expectedVersion: read().board.version,
		transition: store.adoptVariantTransition(
			contract.BoardAdoptInputSchema.parse({ variant: "Worker instead" }),
		),
	});
	expect(adopted.outcome).toBe("applied");
	const frozen = read().board.variants.find((variant) => variant.lifecycle === "historical");
	expect(frozen?.content.nodes[0]?.kind).toBe("api");

	save({ ...policy, nodeKinds: { worker: policy.nodeKinds["worker"]! } });
	const warnings = read().warnings.filter((issue) => issue.code === "UNKNOWN_VOCABULARY");
	expect(warnings.map((issue) => issue.variant)).toContain(frozen?.id);
}, 30_000);

test("missing, malformed, invalid-color and unknown-icon policies activate coherent defaults and recover", async () => {
	const file = join(vault, ".archboard/config.yaml");
	const healthy = store.readSemanticBoardConfiguration(vault);
	for (const content of [
		"levels: [",
		Bun.YAML.stringify({ ...policy, nodeKinds: { api: { name: "API", icon: "RiMadeUpLine" } } }),
		Bun.YAML.stringify({
			...policy,
			nodeKinds: { api: { name: "API", icon: "RiServerLine", color: "#ff0000" } },
		}),
	]) {
		writeFileSync(file, content);
		const fallback = store.readSemanticBoardConfiguration(vault);
		expect(fallback.ok).toBe(false);
		expect(fallback.configuration).toEqual(DEFAULT_SEMANTIC_POLICY);
		expect(fallback.diagnostics).toHaveLength(1);
		expect(fallback.fingerprint).not.toBe(healthy.fingerprint);
	}
	rmSync(file);
	expect((await create("custom", "custom")).outcome).toBe("applied");
	expect(read().warnings[0]?.code).toBe("INVALID_CONFIG");
	expect(contract.BoardCreateInputSchema.safeParse({ name: "Missing level" }).success).toBe(false);
	save(policy);
	expect(store.readSemanticBoardConfiguration(vault).ok).toBe(true);
	expect(read().warnings.some((issue) => issue.code === "UNKNOWN_VOCABULARY")).toBe(true);
});

test("the shared checker refuses a group without a color and routes the repair to its key", () => {
	// archboard check and /api/vault/check both answer with this checker; a
	// group is drawn in its colour (ADR 0038), so one without is invalid policy.
	save({ ...policy, groups: { payments: { name: "Payments", color: "blue" } } });
	expect(store.checkSemanticVault(vault).configurationValid).toBe(true);
	writeFileSync(
		join(vault, ".archboard/config.yaml"),
		Bun.YAML.stringify({ ...policy, groups: { payments: { name: "Payments" } } }),
	);
	const result = store.checkSemanticVault(vault);
	expect(result.configurationValid).toBe(false);
	const refusal = result.diagnostics.find((issue) => issue.code === "INVALID_CONFIG");
	expect(refusal?.file).toBe(join(vault, ".archboard/config.yaml"));
	expect(refusal?.path).toBe("groups.payments.color");
	for (const color of PaletteColorSchema.options) expect(refusal?.message).toContain(color);
});

test("the shared checker reports unreadable files and every variant alongside healthy boards", async () => {
	await create();
	writeFileSync(join(vault, "broken.semantic.json"), "{");
	writeFileSync(join(vault, "bad@name.semantic.json"), "{}");
	const result = store.checkSemanticVault(vault);
	expect(result.configurationValid).toBe(true);
	expect(result.diagnostics.filter((issue) => issue.severity === "error")).toHaveLength(2);
	expect(result.diagnostics.some((issue) => issue.file.endsWith("broken.semantic.json"))).toBe(
		true,
	);
	expect(result.diagnostics.some((issue) => issue.file.endsWith("bad@name.semantic.json"))).toBe(
		true,
	);
	rmSync(join(vault, "broken.semantic.json"));
	rmSync(join(vault, "bad@name.semantic.json"));
});

test("configuration fallback preserves reference syntax while allowing unknown vocabulary names", async () => {
	rmSync(join(vault, ".archboard/config.yaml"));
	expect(contract.NodeKindSchema.safeParse("payment service").success).toBe(false);
	expect(contract.EdgeKindSchema.safeParse("???").success).toBe(false);
	expect((await create("new-service")).outcome).toBe("applied");
	expect(read().board.variants[0]?.content.nodes[0]?.kind).toBe("new-service");
});

test("the checker reports colliding board identities and still reads each actual file", async () => {
	await create();
	const source = read().board;
	const upper = join(vault, "Payments.semantic.json");
	// Padding keeps both files distinct on a case-insensitive filesystem,
	// while address normalization still gives them the same board identity.
	const lower = join(vault, " payments .semantic.json");
	writeFileSync(upper, JSON.stringify({ ...source, name: "Payments" }));
	writeFileSync(lower, JSON.stringify({ ...source, name: "payments", level: "retired" }));
	const result = store.checkSemanticVault(vault);
	const duplicate = result.diagnostics.find((issue) => issue.code === "DUPLICATE_BOARD");
	expect(duplicate?.severity).toBe("error");
	expect(duplicate?.message).toContain(upper);
	expect(duplicate?.message).toContain(lower);
	expect(
		result.diagnostics.some((issue) => issue.file === lower && issue.code === "UNKNOWN_VOCABULARY"),
	).toBe(true);
	rmSync(upper);
	rmSync(lower);
});

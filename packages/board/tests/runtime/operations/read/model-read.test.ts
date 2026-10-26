import { afterEach, expect, test } from "bun:test";
import {
	cpSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
	readFileSync,
	symlinkSync,
	renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readArchitectureModel } from "@archboard/board/store-read";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function fixture(): string {
	const home = mkdtempSync(join(tmpdir(), "archboard-model-read-"));
	homes.push(home);
	const vault = join(home, ".archboard/vault");
	cpSync(
		fileURLToPath(
			new URL("../../../../../../examples/canonical-model/.archboard/vault", import.meta.url),
		),
		vault,
		{
			recursive: true,
		},
	);
	const git = Bun.spawnSync(["git", "init", "--quiet", home]);
	if (git.exitCode !== 0) throw new Error(git.stderr.toString());
	return vault;
}

function edit(vault: string, file: string, change: Record<string, unknown>): void {
	const at = join(vault, file);
	const value = JSON.parse(readFileSync(at, "utf8"));
	writeFileSync(at, JSON.stringify({ ...value, ...change }));
}

test("one model read returns ordered roots, authored details and source-owned relationships", () => {
	const result = readArchitectureModel(fixture(), "Public API");
	expect(result.success).toBe(true);
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.manifest.current?.documents).toEqual([
		{ repo: "github.com/acme/shop", path: "docs/design.md" },
	]);
	expect(result.roots).toEqual(["Shop#Worker", "Shop#Gateway"]);
	expect(result.selectedModule).toBe("Shop#Gateway");
	expect(result.modules.map((module) => module.id)).toEqual([
		"Shop#Worker",
		"Shop#Gateway",
		"Shop#Handler",
	]);
	const gateway = result.modules[1]!;
	expect(gateway).toMatchObject({
		id: "Shop#Gateway",
		file: "gateway.module.json",
		name: "Gateway",
		order: 20,
		responsibility: "Accepts shopping requests",
		description: "Authenticates callers and sends shopping requests to the worker.",
		groups: ["public"],
		binding: { repo: "github.com/acme/shop", path: "src/gateway.ts" },
		documents: [{ repo: "github.com/acme/shop", path: "docs/gateway.md", commit: "abc123" }],
	});
	expect(result.relationships).toEqual([
		{
			...gateway.outgoing[0]!,
			from: "Shop#Gateway",
		},
	]);
	expect(result.relationships[0]).toMatchObject({
		id: "Shop#Dispatch",
		to: "Shop#Worker",
		order: 10,
		label: "Dispatch request",
		description: "Sends the accepted request",
		emphasis: "hero",
		traffic: { speed: 90, volume: 2 },
		anchor: { repo: "github.com/acme/shop", path: "src/gateway.ts", symbol: "dispatch" },
	});
	expect(result.policy.groups["public"]?.name).toBe("Public interface");
	expect(result.revision.files.map((file) => file.path)).toEqual([
		".archboard/config.yaml",
		"gateway.module.json",
		"internal/handler.module.json",
		"model.json",
		"worker.module.json",
	]);
});

test("names resolve only once and ambiguity offers qualified identities", () => {
	const vault = fixture();
	const file = join(vault, "worker.module.json");
	const worker = JSON.parse(readFileSync(file, "utf8"));
	writeFileSync(file, JSON.stringify({ ...worker, name: "Gateway" }));
	const ambiguous = readArchitectureModel(vault, "Gateway");
	expect(ambiguous).toMatchObject({
		success: false,
		code: "MODULE_AMBIGUOUS",
		diagnostics: [{ code: "MODULE_AMBIGUOUS", subjects: ["Shop#Worker", "Shop#Gateway"] }],
	});
	expect(readArchitectureModel(vault, "Shop#Gateway")).toMatchObject({
		success: true,
		selectedModule: "Shop#Gateway",
	});
	expect(readArchitectureModel(vault, "Missing")).toMatchObject({
		success: false,
		code: "MODULE_NOT_FOUND",
	});
});

test("duplicate definitions refuse the entire read with both source paths", () => {
	const vault = fixture();
	cpSync(join(vault, "worker.module.json"), join(vault, "duplicate.module.json"));
	const result = readArchitectureModel(vault);
	expect(result.success).toBe(false);
	if (result.success) throw new Error("A duplicate definition became readable");
	expect(result.code).toBe("MODEL_INVALID");
	expect(result.diagnostics).toContainEqual(
		expect.objectContaining({
			code: "DUPLICATE_ID",
			file: "worker.module.json",
			subjects: ["Shop#Worker"],
		}),
	);
	expect(result.diagnostics[0]?.recovery).toContain("duplicate.module.json");
});

test("containment is a forest and every local relationship target exists", () => {
	const vault = fixture();
	edit(vault, "gateway.module.json", { parent: "Shop#Handler" });
	const cycle = readArchitectureModel(vault);
	expect(cycle).toMatchObject({ success: false, code: "MODEL_INVALID" });
	if (cycle.success) throw new Error("A containment cycle became readable");
	expect(cycle.diagnostics).toContainEqual(expect.objectContaining({ code: "CONTAINMENT_CYCLE" }));
	edit(vault, "gateway.module.json", { parent: "Shop#Absent" });
	const missingParent = readArchitectureModel(vault);
	if (missingParent.success) throw new Error("A missing parent became readable");
	expect(missingParent.diagnostics).toContainEqual(
		expect.objectContaining({
			code: "MISSING_LOCAL_TARGET",
			subjects: ["Shop#Gateway", "Shop#Absent"],
			path: "parent",
		}),
	);
	edit(vault, "gateway.module.json", { parent: undefined });
	rmSync(join(vault, "worker.module.json"));
	const missingTarget = readArchitectureModel(vault);
	if (missingTarget.success) throw new Error("A dangling relationship became readable");
	expect(missingTarget.diagnostics).toContainEqual(
		expect.objectContaining({
			code: "MISSING_LOCAL_TARGET",
			subjects: ["Shop#Dispatch", "Shop#Worker"],
			path: "outgoing.0.to",
		}),
	);
});

test("unsupported versions and malformed discovered files refuse a coherent read", () => {
	const vault = fixture();
	edit(vault, "worker.module.json", { schemaVersion: 99 });
	const version = readArchitectureModel(vault);
	if (version.success) throw new Error("An unsupported version became readable");
	expect(version.diagnostics).toContainEqual(
		expect.objectContaining({
			code: "UNSUPPORTED_FORMAT",
			file: "worker.module.json",
			path: "schemaVersion",
		}),
	);
	writeFileSync(join(vault, "worker.module.json"), "{");
	const malformed = readArchitectureModel(vault);
	if (malformed.success) throw new Error("Malformed JSON became readable");
	expect(malformed.diagnostics).toContainEqual(
		expect.objectContaining({
			code: "MALFORMED_JSON",
			file: "worker.module.json",
		}),
	);
});

test("discovery refuses legacy authority, unsupported authored formats and linked paths", () => {
	const vault = fixture();
	const legacy = join(vault, "legacy.semantic.json");
	writeFileSync(legacy, "{}");
	expect(readArchitectureModel(vault)).toMatchObject({ success: false, code: "LEGACY_AUTHORITY" });
	rmSync(legacy);
	const future = join(vault, "future.walkthrough.json");
	writeFileSync(future, '{"schemaVersion":1}');
	const unsupported = readArchitectureModel(vault);
	if (unsupported.success) throw new Error("An unsupported authored collection was ignored");
	expect(unsupported.diagnostics).toContainEqual(
		expect.objectContaining({
			code: "UNSUPPORTED_FORMAT",
			file: "future.walkthrough.json",
		}),
	);
	rmSync(future);
	symlinkSync(join(vault, "worker.module.json"), join(vault, "linked.module.json"));
	const linked = readArchitectureModel(vault);
	if (linked.success) throw new Error("A linked definition was followed");
	expect(linked.diagnostics).toContainEqual(expect.objectContaining({ code: "UNSAFE_PATH" }));
});

test("canonical reads require a valid policy and configured module vocabulary", () => {
	const vault = fixture();
	edit(vault, "worker.module.json", { kind: "typo", groups: ["unknown"] });
	const unknown = readArchitectureModel(vault);
	if (unknown.success) throw new Error("Unknown vocabulary became readable");
	expect(unknown.diagnostics.map((diagnostic) => diagnostic.path)).toEqual(["kind", "groups.0"]);
	writeFileSync(join(vault, ".archboard/config.yaml"), "bad: [");
	const invalid = readArchitectureModel(vault);
	if (invalid.success) throw new Error("Invalid policy used bundled defaults");
	expect(invalid.diagnostics).toContainEqual(expect.objectContaining({ code: "INVALID_POLICY" }));
});

test("file moves retain qualified identities and revisions cover exact bytes, policy and discovery", () => {
	const vault = fixture();
	const first = readArchitectureModel(vault);
	if (!first.success) throw new Error(JSON.stringify(first));
	const source = readFileSync(join(vault, "gateway.module.json"));
	renameSync(join(vault, "gateway.module.json"), join(vault, "internal/moved.module.json"));
	const moved = readArchitectureModel(vault, "Shop#Gateway");
	if (!moved.success) throw new Error(JSON.stringify(moved));
	expect(moved.modules.map((module) => module.id)).toEqual(
		first.modules.map((module) => module.id),
	);
	expect(moved.relationships).toEqual(first.relationships);
	expect(moved.revision.digest).not.toBe(first.revision.digest);
	expect(moved.revision.files).toContainEqual({
		path: "internal/moved.module.json",
		sha256: first.revision.files.find((file) => file.path === "gateway.module.json")!.sha256,
	});
	writeFileSync(
		join(vault, "internal/moved.module.json"),
		Buffer.concat([source, Buffer.from("\n")]),
	);
	const whitespace = readArchitectureModel(vault);
	if (!whitespace.success) throw new Error(JSON.stringify(whitespace));
	expect(whitespace.modules).toEqual(moved.modules);
	expect(whitespace.revision.digest).not.toBe(moved.revision.digest);
	expect(readFileSync(join(vault, "internal/moved.module.json"))).toEqual(
		Buffer.concat([source, Buffer.from("\n")]),
	);
	writeFileSync(join(vault, "notes.md"), "Unrelated documentation");
	expect(readArchitectureModel(vault)).toEqual(whitespace);
	const policyPath = join(vault, ".archboard/config.yaml");
	writeFileSync(policyPath, `${readFileSync(policyPath, "utf8")}\n`);
	const policy = readArchitectureModel(vault);
	if (!policy.success) throw new Error(JSON.stringify(policy));
	expect(policy.revision.digest).not.toBe(whitespace.revision.digest);
});

test("origin namespaces distinguish reused local ids and dependencies can cycle", () => {
	const vault = fixture();
	edit(vault, "worker.module.json", {
		id: "Old/Family#Gateway",
		outgoing: [{ id: "Old/Family#Return", to: "Shop#Gateway", kind: "call", order: 1 }],
	});
	edit(vault, "gateway.module.json", {
		outgoing: [{ id: "Shop#Dispatch", to: "Old/Family#Gateway", kind: "call", order: 1 }],
	});
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		roots: ["Old/Family#Gateway", "Shop#Gateway"],
	});
	edit(vault, "model.json", { retiredIds: ["Shop#Dispatch"] });
	const retired = readArchitectureModel(vault);
	if (retired.success) throw new Error("A retired identity became live");
	expect(retired.diagnostics).toContainEqual(
		expect.objectContaining({
			code: "RETIRED_ID",
			subjects: ["Shop#Dispatch"],
		}),
	);
});

test("a model without current architecture cannot expose current module definitions", () => {
	const vault = fixture();
	edit(vault, "model.json", { current: null });
	const misplaced = readArchitectureModel(vault);
	if (misplaced.success) throw new Error("Undesignated module definitions appeared current");
	expect(misplaced.diagnostics).toContainEqual(
		expect.objectContaining({ code: "NO_CURRENT_STATE" }),
	);
	for (const file of ["gateway.module.json", "worker.module.json", "internal/handler.module.json"])
		rmSync(join(vault, file));
	expect(readArchitectureModel(vault)).toMatchObject({
		success: true,
		manifest: { current: null },
		roots: [],
		modules: [],
		relationships: [],
	});
});

test("relationships have one identity and derive their source from their containing module", () => {
	const vault = fixture();
	edit(vault, "worker.module.json", {
		outgoing: [{ id: "Shop#Dispatch", to: "Shop#Gateway", kind: "call", order: 1 }],
	});
	const duplicate = readArchitectureModel(vault);
	if (duplicate.success) throw new Error("A relationship acquired two owners");
	expect(duplicate.diagnostics).toContainEqual(
		expect.objectContaining({ code: "DUPLICATE_ID", subjects: ["Shop#Dispatch"] }),
	);
	edit(vault, "worker.module.json", {
		outgoing: [
			{ id: "Shop#Return", from: "Shop#Handler", to: "Shop#Gateway", kind: "call", order: 1 },
		],
	});
	const source = readArchitectureModel(vault);
	if (source.success) throw new Error("A relationship supplied a second source");
	expect(source.diagnostics).toContainEqual(
		expect.objectContaining({ code: "INVALID_DOCUMENT", file: "worker.module.json" }),
	);
});

test("module identity wins over names and authored positions determine outgoing order", () => {
	const vault = fixture();
	edit(vault, "worker.module.json", { name: "Shop#Gateway" });
	edit(vault, "gateway.module.json", {
		outgoing: [
			{ id: "Shop#Later", to: "Shop#Worker", kind: "call", order: 20 },
			{ id: "Shop#Early", to: "Shop#Worker", kind: "call", order: 10 },
		],
	});
	const result = readArchitectureModel(vault, "Shop#Gateway");
	if (!result.success) throw new Error(JSON.stringify(result));
	expect(result.selectedModule).toBe("Shop#Gateway");
	expect(result.relationships.map((relationship) => relationship.id)).toEqual([
		"Shop#Early",
		"Shop#Later",
	]);
});

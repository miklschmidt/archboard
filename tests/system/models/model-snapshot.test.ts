import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ModelSnapshotSchema } from "@archboard/model/contract";
import { readArchitectureModel } from "@archboard/model/store-read";
import { structureDiagnostics } from "@archboard/model/vault-policy";
import { claimArchitectureSubjects, editArchitectureModule } from "@archboard/model/store-write";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { holderOf, vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-model-snapshot-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;

beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Snapshot Author"],
		["config", "user.email", "snapshot@example.test"],
		["config", "commit.gpgsign", "false"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed model"],
	]) {
		const result = Bun.spawnSync(["git", "-C", home, ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	const configurationFile = join(vault, ".archboard/config.yaml");
	const configuration = readFileSync(configurationFile, "utf8");
	writeFileSync(configurationFile, configuration.replace("RiServerLine", "RiAnchorLine"));
	const current = readArchitectureModel(vault);
	if (!current.success || !current.manifest.current) throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "proposing a draft to snapshot",
		subjects: ["Shop", "Shop#Gateway"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	const created = await editArchitectureModule(vault, {
		target,
		expectedRevision: current.revision,
		operationId: "snapshot-draft",
		writer: "agent",
		claim: claimed.claim.id,
		doing: "proposing queued requests",
		proposal: { type: "create", name: "Queued" },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Queues accepted requests." },
			},
		],
	});
	if (!created.success) throw new Error(JSON.stringify(created));
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
});

afterAll(async () => {
	await server?.dispose();
	rmSync(home, { recursive: true, force: true });
});

function snapshot(...args: string[]) {
	if (server === undefined) throw new Error("The server did not start");
	return runServerCli({ repoRoot, server, args: ["model", "snapshot", ...args], input: undefined });
}

test("a snapshot holds a draft, its comparison state, the vault check and the policy's icons", () => {
	const first = snapshot("--state", "Queued", "--out", "first.json");
	const second = snapshot("--state", "Queued", "--out", "second.json");
	expect(first.status, first.stderr).toBe(0);
	expect(second.status, second.stderr).toBe(0);
	const file = join(holderOf(vault), "first.json");
	expect(JSON.parse(first.stdout)).toMatchObject({ success: true, file, format: 1 });
	const bytes = readFileSync(file);
	expect(bytes.equals(readFileSync(join(holderOf(vault), "second.json")))).toBeTrue();
	expect(bytes.toString()).not.toContain(home);

	const parsed = ModelSnapshotSchema.parse(JSON.parse(bytes.toString()));
	const version = Bun.spawnSync([join(repoRoot, "bin/archboard"), "--version"]);
	expect(parsed.cliVersion).toBe(version.stdout.toString().trim());
	expect(parsed.reading.selectedState).toMatchObject({ name: "Queued", lifecycle: "draft" });
	expect(parsed.comparisonReading?.selectedState).toMatchObject({ lifecycle: "current" });
	expect(parsed.comparisonReading?.comparison).toBeUndefined();
	expect(parsed.comparisonReading?.revision).toEqual(parsed.reading.comparison?.revision);
	for (const policy of [
		parsed.check.policy,
		parsed.reading.policy,
		parsed.comparisonReading!.policy,
	])
		for (const kind of Object.values(policy.nodeKinds))
			expect(parsed.icons[kind.icon], kind.icon).not.toBeEmpty();
});

test("a retained state keeps its icons when the current policy names different icons", async () => {
	const draft = await readArchitectureModel(vault, undefined, undefined, { state: "Queued" });
	if (!draft.success || !draft.selectedState?.baseline) throw new Error(JSON.stringify(draft));
	const file = join(vault, ".archboard/config.yaml");
	const configuration = readFileSync(file, "utf8");
	try {
		writeFileSync(file, configuration.replace("RiAnchorLine", "RiRocketLine"));
		const result = snapshot(
			"--state",
			draft.selectedState.baseline,
			"--against",
			"current",
			"--out",
			"retained.json",
		);
		expect(result.status, result.stderr).toBe(0);
		const parsed = ModelSnapshotSchema.parse(
			JSON.parse(readFileSync(join(holderOf(vault), "retained.json"), "utf8")),
		);
		expect(parsed.reading.policy.nodeKinds["service"]?.icon).toBe("RiAnchorLine");
		expect(parsed.comparisonReading?.policy.nodeKinds["service"]?.icon).toBe("RiRocketLine");
		expect(parsed.icons["RiAnchorLine"]).not.toBeEmpty();
		expect(parsed.icons["RiRocketLine"]).not.toBeEmpty();
	} finally {
		writeFileSync(file, configuration);
	}
});

test("a retained snapshot checks its exact checkpoint after the live state changes", async () => {
	const draft = await readArchitectureModel(vault, undefined, undefined, { state: "Queued" });
	if (!draft.success || !draft.selectedState?.baseline) throw new Error(JSON.stringify(draft));
	const current = readArchitectureModel(vault);
	if (!current.success) throw new Error(JSON.stringify(current));
	const { file, ...handler } = current.modules.find((module) => module.id === "Shop#Handler")!;
	const path = join(vault, file);
	const original = readFileSync(path);
	try {
		writeFileSync(path, JSON.stringify({ ...handler, outgoing: [] }));
		const changed = readArchitectureModel(vault);
		if (!changed.success) throw new Error(JSON.stringify(changed));
		expect(
			structureDiagnostics(changed).some((item) => item.code === "ROOT_UNCONNECTED"),
		).toBeTrue();
		const result = snapshot(
			"--state",
			draft.selectedState.baseline,
			"--out",
			"retained-check.json",
		);
		expect(result.status, result.stderr).toBe(0);
		const parsed = ModelSnapshotSchema.parse(
			JSON.parse(readFileSync(join(holderOf(vault), "retained-check.json"), "utf8")),
		);
		expect(parsed.reading.relationships.some((edge) => edge.id === "Shop#Dispatch")).toBeTrue();
		expect(parsed.check.diagnostics).toBeEmpty();
	} finally {
		writeFileSync(path, original);
	}
});

test("a state that compares nothing has no comparison reading, and a refused read writes no file", () => {
	const current = snapshot("--out", "current.json");
	expect(current.status, current.stderr).toBe(0);
	const parsed = ModelSnapshotSchema.parse(
		JSON.parse(readFileSync(join(holderOf(vault), "current.json"), "utf8")),
	);
	expect(parsed.reading.selectedState).toMatchObject({ lifecycle: "current" });
	expect(parsed.comparisonReading).toBeNull();

	const missing = snapshot("--state", "missing", "--out", "missing.json");
	expect(missing.status).toBe(2);
	expect(JSON.parse(missing.stdout)).toMatchObject({ success: false, code: "STATE_NOT_FOUND" });
	expect(existsSync(join(holderOf(vault), "missing.json"))).toBeFalse();
});

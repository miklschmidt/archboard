import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { ArchitectureModelReadSchema } from "@archboard/board/model";
import { LegacyInventoryReadSchema } from "@archboard/board/migration";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-migration-surface-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
beforeAll(async () => {
	server = await startOwnedServer({
		serverPath: join(repoRoot, "apps/server/src/server.ts"),
		vault,
	});
});
afterAll(async () => {
	await server?.dispose();
	rmSync(home, { recursive: true, force: true });
});

function cli(args: string[], input?: unknown) {
	if (server === undefined) throw new Error("The server did not start");
	return runServerCli({
		repoRoot,
		server,
		args,
		input: input === undefined ? undefined : JSON.stringify(input),
	});
}

function result(stdout: string) {
	const { vault: _vault, ...answer } = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
	return LegacyInventoryReadSchema.parse(answer);
}

test("CLI planning and preview share explicit vaults and preserve structured stale refusals", async () => {
	const original = JSON.parse(
		readFileSync(
			join(repoRoot, "examples/legacy-migration/originals/System.semantic.json"),
			"utf8",
		),
	);
	original.id = "Shop";
	original.name = "Shop";
	original.variants[0].content.nodes[0].responsibility = "Accepts requests";
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	writeFileSync(join(vault, "Shop.semantic.json"), JSON.stringify(original));
	const listed = cli(["model", "inventory", "--origin", "Shop"]);
	expect(listed.status, listed.stderr).toBe(0);
	const inventory = result(listed.stdout);
	if (!inventory.success) throw new Error(JSON.stringify(inventory));
	const request = { plan: inventory.plan, expectedPlan: inventory.planRevision };
	const saved = cli(["model", "plan", "--doing", "Record the identity choices"], request);
	expect(saved.status, saved.stderr).toBe(0);
	const written = result(saved.stdout);
	expect(written).toMatchObject({
		success: true,
		source: inventory.source,
		plan: inventory.plan,
		planRevision: expect.any(String),
	});
	expect(result(cli(["model", "inventory", "--origin", "Shop"]).stdout)).toEqual(written);
	const preview = cli(["model", "read", "--preview", "Shop"]);
	expect(preview.status, preview.stderr).toBe(0);
	const { vault: _previewVault, ...previewAnswer } = z
		.record(z.string(), z.unknown())
		.parse(JSON.parse(preview.stdout));
	const candidate = ArchitectureModelReadSchema.parse(previewAnswer);
	expect(candidate).toMatchObject({
		success: true,
		modules: [expect.objectContaining({ name: "API", responsibility: "Accepts requests" })],
		migrationPreview: {
			source: inventory.source,
			planRevision: written.success ? written.planRevision : null,
			plannedBoards: [],
		},
	});
	const http = await fetch(
		`${server!.base}/api/architecture/model?${new URLSearchParams({ vault, preview: "Shop" })}`,
	);
	expect(http.status).toBe(200);
	expect(ArchitectureModelReadSchema.parse(await http.json())).toEqual(candidate);
	const file = join(vault, inventory.boards[0]!.file);
	writeFileSync(file, `${readFileSync(file, "utf8")}\n`);
	const refusedPreview = cli(["model", "read", "--preview", "Shop"]);
	expect(refusedPreview.status).toBe(2);
	expect(JSON.parse(refusedPreview.stdout)).toMatchObject({
		success: false,
		code: "MAPPING_STALE",
	});
	const stale = cli(["model", "plan", "--doing", "Try an outdated plan"], request);
	expect(stale.status).toBe(2);
	expect(result(stale.stdout)).toMatchObject({ success: false, code: "MAPPING_STALE" });
});

test("CLI and HTTP retain original migration history and open its exact board coverage", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-migration-history-surface-"));
	try {
		const addressed = vaultIn(root);
		mkdirSync(join(addressed, ".archboard"), { recursive: true });
		writeFileSync(
			join(addressed, ".archboard/config.yaml"),
			Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY),
		);
		for (const args of [
			["init", "--quiet"],
			["config", "user.name", "Fixture"],
			["config", "user.email", "fixture@example.com"],
			["config", "commit.gpgsign", "false"],
		]) {
			const configured = Bun.spawnSync(["git", "-C", root, ...args]);
			if (configured.exitCode !== 0) throw new Error(configured.stderr.toString());
		}
		const content = {
			nodes: [
				{ id: "Api", name: "API", kind: "module", responsibility: "Accepts requests", order: 10 },
			],
			edges: [],
			flows: [],
			walkthroughs: [
				{
					id: "Tour",
					name: "Tour",
					beats: [
						{
							id: "Start",
							heading: "API",
							body: "Accept requests",
							subjects: ["Api"],
							view: "Primary",
						},
					],
				},
			],
		};
		const document = {
			schemaVersion: "2.4.0",
			kind: "semantic-board",
			id: "Family",
			name: "Shop",
			formerNames: ["Store"],
			level: "service",
			version: 1,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			current: "Now",
			views: [
				{ id: "Primary", name: "API", grammar: "architecture", scope: { kind: "all" } },
				{ id: "Backup", name: "Saved reading", grammar: "architecture", scope: { kind: "all" } },
			],
			variants: [
				{ id: "Old", name: "Before", lifecycle: "historical", content },
				{ id: "Now", name: "Implemented", lifecycle: "current", parent: "Old", content },
			],
		};
		writeFileSync(join(addressed, "Shop.semantic.json"), JSON.stringify(document));
		const inventory = result(cli(["model", "inventory", "--origin", "Shop", "-C", root]).stdout);
		if (!inventory.success) throw new Error(JSON.stringify(inventory));
		const saved = result(
			cli(["model", "plan", "--doing", "Record original mappings", "-C", root], {
				plan: inventory.plan,
				expectedPlan: null,
			}).stdout,
		);
		if (!saved.success) throw new Error(JSON.stringify(saved));
		const retained = cli([
			"model",
			"retain",
			"--migration",
			"Shop",
			"--expected-plan",
			saved.planRevision!,
			"--expect-revision",
			saved.source.digest,
			"--operation-id",
			"originals-1",
			"--writer",
			"fixture",
			"--doing",
			"Retain original history",
			"-C",
			root,
		]);
		expect(retained.status, retained.stderr).toBe(0);
		const { vault: _vault, ...answer } = JSON.parse(retained.stdout);
		const repeated = await fetch(`${server!.base}/api/architecture/checkpoints`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				vault: addressed,
				target: "migration",
				origin: "Shop",
				expectedPlan: saved.planRevision,
				expectedRevision: saved.source.digest,
				operationId: "originals-1",
				writer: "fixture",
				doing: "Retain original history",
				dependencies: [],
			}),
		});
		expect(repeated.status).toBe(200);
		expect(await repeated.json()).toEqual(answer);
		const selectors = {
			vault: addressed,
			preview: "Shop",
			checkpoint: answer.checkpoint.id,
			state: "Shop/Family#Old",
			legacyAddress: "Store@Before",
			bookmark: "Shop/Family#Backup",
			walkthrough: "Shop/Family#Tour",
			shared: "true",
		};
		const response = await fetch(
			`${server!.base}/api/architecture/model?${new URLSearchParams(selectors)}`,
		);
		expect(response.status).toBe(200);
		const reading = ArchitectureModelReadSchema.parse(await response.json());
		const command = cli([
			"model",
			"read",
			"--preview",
			"Shop",
			"--checkpoint",
			answer.checkpoint.id,
			"--state",
			"Shop/Family#Old",
			"--legacy-address",
			"Store@Before",
			"--bookmark",
			"Shop/Family#Backup",
			"--walkthrough",
			"Shop/Family#Tour",
			"--shared",
			"-C",
			root,
		]);
		expect(command.status, command.stderr).toBe(0);
		const { vault: _address, ...cliReading } = JSON.parse(command.stdout);
		expect(cliReading).toEqual(reading);
		expect(reading).toMatchObject({
			selectedState: { id: "Old", lifecycle: "historical" },
			playback: {
				checkpoint: answer.checkpoint.id,
				beats: [{ id: "Shop/Family#Start", status: "ready" }],
			},
			migrationPreview: {
				selected: { legacy: "Shop/Family#Old", board: "Family", completeModel: false },
				originals: [{ source: JSON.stringify(document) }],
				bookmark: { id: "Shop/Family#Backup" },
				resolvedAddress: { address: "Store@Before", state: "Shop/Family#Old" },
			},
		});
		const invalid = await fetch(`${server!.base}/api/architecture/checkpoints`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				vault: addressed,
				target: "migration",
				expectedRevision: saved.source.digest,
				operationId: "missing-origin",
				writer: "fixture",
				doing: "Retain original history",
			}),
		});
		expect(invalid.status).toBe(400);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

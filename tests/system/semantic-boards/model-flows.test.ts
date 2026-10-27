import { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";
import { readRenderRecipe } from "@archboard/renderer/recipe";
import { everyStep } from "@archboard/board/flow";
import { z } from "zod";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	ArchitectureModelReadSchema,
	ArchitectureClaimResultSchema,
	ArchitectureModuleEditResultSchema,
} from "@archboard/board/model";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-flow-surface-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Flow Author"],
		["config", "user.email", "flow@example.test"],
		["config", "commit.gpgsign", "false"],
		["remote", "add", "origin", "https://github.com/acme/shop.git"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed flows"],
	]) {
		const result = Bun.spawnSync(["git", "-C", home, ...args]);
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
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
	if (!server) throw new Error("Server unavailable");
	return runServerCli({
		repoRoot,
		server,
		args,
		input: input === undefined ? undefined : JSON.stringify(input),
	});
}
test("CLI authors independent flows and renders explicit sequence and flowchart selections through HTTP", async () => {
	const currentCli = cli(["model", "read"]);
	expect(currentCli.status, currentCli.stderr).toBe(0);
	const current = ArchitectureModelReadSchema.parse(answer(currentCli.stdout));
	if (!current.success || current.manifest.current === null)
		throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claimCli = cli(["model", "claim"], {
		target,
		writer: "surface-agent",
		reason: "authoring independent behavior",
		subjects: ["Shop", "Shop#Gateway", "Shop#Worker"],
	});
	expect(claimCli.status, claimCli.stderr).toBe(0);
	const claim = ArchitectureClaimResultSchema.parse(answer(claimCli.stdout));
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const editCli = cli(["model", "edit", "--doing", "authoring independent behavior"], {
		target,
		expectedRevision: current.revision,
		operationId: "surface-flows",
		writer: "surface-agent",
		claim: claim.claim.id,
		changes: [
			{ type: "add-collection", name: "Behavior" },
			{
				type: "add-flow",
				collection: "Behavior",
				flow: {
					name: "Request",
					participants: ["Shop#Worker", "Shop#Gateway"],
					steps: [
						{
							from: "Shop#Gateway",
							to: "Shop#Worker",
							kind: "sync",
							label: "Dispatch",
							note: "Authenticated",
							repeat: 3,
						},
						{
							kind: "decision",
							question: "Ready?",
							alternatives: [
								{
									label: "yes",
									steps: [
										{
											kind: "loop",
											condition: "More",
											steps: [
												{
													from: "Shop#Worker",
													to: "Shop#Gateway",
													kind: "return",
													label: "Result",
												},
											],
										},
									],
								},
								{ label: "no", steps: [] },
							],
						},
					],
				},
			},
		],
	});
	expect(editCli.status, editCli.stderr).toBe(0);
	const edit = ArchitectureModuleEditResultSchema.parse(answer(editCli.stdout));
	if (!edit.success) throw new Error(JSON.stringify(edit));
	const read = cli(["model", "read"]);
	const model = ArchitectureModelReadSchema.parse(answer(read.stdout));
	if (!model.success) throw new Error(JSON.stringify(model));
	const flow = model.collections[0]!.flows[0]!;
	const release = cli(["model", "release"], { claim: claim.claim.id, writer: "surface-agent" });
	expect(release.status, release.stderr).toBe(0);
	const fullClaim = cli(["model", "claim"], {
		target,
		writer: "surface-agent",
		reason: "editing behavior",
		subjects: [
			"Shop",
			"Shop#Worker",
			"Shop#Gateway",
			flow.id,
			...everyStep(flow.steps).map((step) => step.id),
		],
	});
	const claimed = ArchitectureClaimResultSchema.parse(answer(fullClaim.stdout));
	if (!claimed.success || !server) throw new Error(fullClaim.stdout);
	const editedHttp = await fetch(`${server.base}/api/architecture/module`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			vault,
			target,
			expectedRevision: model.revision,
			operationId: "edit-surface-flow",
			writer: "surface-agent",
			doing: "renaming the flow",
			claim: claimed.claim.id,
			changes: [
				{ type: "edit-flow", subject: flow.id, set: { name: "Renamed request" } },
				{ type: "edit-step", subject: flow.steps[0]!.id, set: { note: "Updated evidence" } },
			],
		}),
	});
	expect(editedHttp.status).toBe(200);
	expect(ArchitectureModuleEditResultSchema.parse(await editedHttp.json())).toMatchObject({
		success: true,
	});
	const selectedCli = cli(["model", "read", "--flow", flow.id]);
	expect(selectedCli.status, selectedCli.stderr).toBe(0);
	expect(answer(selectedCli.stdout)).toMatchObject({ success: true, selectedFlow: flow.id });
	for (const grammar of ["sequence", "flowchart"]) {
		const path = join(home, `${grammar}.svg`);
		const rendered = cli([
			"model",
			"render",
			"--flow",
			flow.id,
			"--grammar",
			grammar,
			"--checkpoint",
			edit.checkpoint.id,
			"--out",
			path,
		]);
		expect(rendered.status, rendered.stderr).toBe(0);
		expect(JSON.parse(rendered.stdout)).toMatchObject({
			success: true,
			flow: flow.id,
			grammar,
			width: expect.any(Number),
			height: expect.any(Number),
			placed: expect.arrayContaining([flow.id, flow.steps[0]!.id]),
		});
		expect(readFileSync(path, "utf8")).toMatch(/<svg\s/u);
	}
	const missingPath = join(home, "missing.svg");
	writeFileSync(missingPath, "existing artifact");
	const missing = cli([
		"model",
		"render",
		"--grammar",
		"sequence",
		"--out",
		join(home, "missing.svg"),
	]);
	expect(missing.status, missing.stderr).toBe(2);
	expect(JSON.parse(missing.stdout)).toMatchObject({ success: false, code: "FLOW_REQUIRED" });
	expect(readFileSync(missingPath, "utf8")).toBe("existing artifact");
}, 30000);

function answer(stdout: string) {
	const { vault: _vault, ...result } = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
	return result;
}

test("structural exports use canonical recursive scope and preserve reproducible selectors", async () => {
	const out = join(home, "architecture.svg");
	const rendered = cli(["model", "render", "--module", "Gateway", "--out", out]);
	expect(rendered.status, rendered.stderr).toBe(0);
	const receipt = answer(rendered.stdout);
	expect(receipt).toMatchObject({ success: true, model: "Shop", grammar: "architecture" });
	expect(readFileSync(out, "utf8")).toContain("Shop#Handler");
	const recipe = readRenderRecipe(readFileSync(out));
	expect(recipe).toMatchObject({
		kind: "recipe",
		recipe: {
			recipe: 2,
			model: { id: "Shop" },
			reading: { module: "Shop#Gateway", grammar: "architecture" },
			vault: { repo: "github.com/acme/shop" },
		},
	});
	const png = join(home, "architecture.png");
	const rasterized = cli(["model", "rasterize", "--module", "Gateway", "--out", png]);
	expect(rasterized.status, rasterized.stderr).toBe(0);
	expect(answer(rasterized.stdout)).toMatchObject({
		success: true,
		model: "Shop",
		state: "Current",
		grammar: "architecture",
		source: { renderer: "semantic-renderer", motion: "paused-at-start" },
	});
	expect(readRenderRecipe(readFileSync(png))).toMatchObject({
		kind: "recipe",
		recipe: { recipe: 2, model: { id: "Shop" } },
	});
	Bun.spawnSync(["git", "-C", home, "add", "architecture.svg", "architecture.png"]);
	const embeds = cli(["check", "embeds"]);
	expect(embeds.status, embeds.stderr).toBe(0);
	expect(answer(embeds.stdout)).toMatchObject({ embeds: { findings: [], fixed: [] } });
	const inspected = cli(["check", "code"]);
	expect(inspected.status).not.toBeNull();
	expect([0, 1]).toContain(inspected.status!);
	expect(answer(inspected.stdout)).toMatchObject({
		code: {
			models: [{ model: "Shop", state: "Current", revision: expect.any(Object) }],
			findings: expect.arrayContaining([
				expect.objectContaining({
					code: "ANCHOR_PATH_MISSING",
					model: "Shop",
					state: "Current",
					file: "gateway.module.json",
				}),
			]),
		},
	});
	const request = await fetch(
		`${server!.base}/api/architecture/render?${new URLSearchParams({ vault, module: "Gateway" })}`,
	);
	expect(request.status).toBe(200);
	expect(await request.json()).toMatchObject({
		success: true,
		grammar: "architecture",
		placed: expect.arrayContaining(["Shop#Handler"]),
	});
});

test("retired board writers and claims cannot change a vault through HTTP or CLI", async () => {
	const before = cli(["model", "read"]);
	for (const route of [
		"create",
		"edit",
		"branch",
		"adopt",
		"shelve",
		"resolve",
		"rename",
		"discard",
		"move",
		"track-embed",
		"correct",
	]) {
		const response = await fetch(`${server!.base}/api/semantic-boards/${route}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ vault, board: "retired", doing: "Try retired authoring" }),
		});
		expect([404, 410]).toContain(response.status);
	}
	const old = cli([
		"semantic",
		"new",
		"retired",
		"--level",
		"module",
		"--doing",
		"Try retired authoring",
	]);
	expect(old.status).toBe(2);
	expect(cli(["model", "read"]).stdout).toBe(before.stdout);
});

test("canonical locality and branch footprint retain source analysis without a live board reader", () => {
	mkdirSync(join(home, "src"), { recursive: true });
	writeFileSync(join(home, "src/gateway.ts"), "export function dispatch(){ return 1; }\n");
	for (const args of [
		["add", "src"],
		["commit", "--quiet", "-m", "test: add bound source"],
	]) {
		const ran = Bun.spawnSync(["git", "-C", home, ...args]);
		if (ran.exitCode !== 0) throw new Error(ran.stderr.toString());
	}
	const sourceHead = Bun.spawnSync(["git", "-C", home, "rev-parse", "HEAD"]).stdout.toString();
	const locality = cli(["model", "locality"]);
	expect(locality.status, locality.stderr).toBe(0);
	expect(answer(locality.stdout)).toMatchObject({
		success: true,
		model: "Shop",
		state: { id: "Current" },
		revision: expect.any(Object),
		hotspots: expect.any(Array),
	});
	const footprint = cli(["model", "footprint", "--base", "HEAD~1"]);
	expect(footprint.status, footprint.stderr).toBe(0);
	expect(answer(footprint.stdout)).toMatchObject({
		success: true,
		model: "Shop",
		state: { id: "Current" },
		base: "HEAD~1",
		repositories: expect.any(Array),
	});
	const local = ArchitectureHistoryResultSchema.parse(answer(locality.stdout));
	const branch = ArchitectureHistoryResultSchema.parse(answer(footprint.stdout));
	if (!local.success || local.analysis !== "locality" || !branch.success || !("changed" in branch))
		throw new Error(JSON.stringify({ local, branch }));
	expect(local.hotspots.map((part) => part.subject.id)).toContain("Shop#Gateway");
	expect(branch.changed.map((part) => part.subject.id)).toContain("Shop#Gateway");
	expect(Bun.spawnSync(["git", "-C", home, "rev-parse", "HEAD"]).stdout.toString()).toBe(
		sourceHead,
	);
	const refused = cli(["model", "footprint", "--base", "HEAD", "--state", "Missing"]);
	expect(refused.status, refused.stderr).toBe(2);
	expect(answer(refused.stdout)).toMatchObject({ success: false, code: "STATE_NOT_FOUND" });
});

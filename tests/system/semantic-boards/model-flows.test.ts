import { everyStep } from "@archboard/board/flow";
import { z } from "zod";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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

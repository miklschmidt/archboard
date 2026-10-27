import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	ArchitectureModelReadSchema,
	ArchitectureModuleEditResultSchema,
} from "@archboard/board/model";
import {
	claimArchitectureSubjects,
	releaseArchitectureClaim,
	editArchitectureModule,
} from "@archboard/board/store-write";
import { readArchitectureModel, readArchitectureClaims } from "@archboard/board/store-read";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-proposal-surface-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Proposal Author"],
		["config", "user.email", "proposal@example.test"],
		["config", "commit.gpgsign", "false"],
		["remote", "add", "origin", "https://github.com/acme/shop.git"],
		["add", "."],
		["commit", "--quiet", "-m", "test: seed model"],
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

test("normal CLI and server create list select and compare explicit compact drafts", async () => {
	if (server === undefined) throw new Error("The server did not start");
	const current = readArchitectureModel(vault);
	if (!current.success || !current.manifest.current) throw new Error(JSON.stringify(current));
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claimed = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "testing proposal adapters",
		subjects: ["Shop", "Shop#Gateway"],
	});
	if (!claimed.success) throw new Error(JSON.stringify(claimed));
	const request = {
		target,
		expectedRevision: current.revision,
		operationId: "surface-proposal",
		writer: "agent",
		claim: claimed.claim.id,
		proposal: { type: "create", name: "Queued" },
		changes: [
			{
				type: "edit-module",
				subject: "Shop#Gateway",
				set: { description: "Queues accepted requests." },
			},
		],
	};
	const createdCli = runServerCli({
		repoRoot,
		server,
		args: ["model", "edit", "--doing", "proposing queued requests"],
		input: JSON.stringify(request),
	});
	expect(createdCli.status, createdCli.stderr).toBe(0);
	const { vault: _address, ...receipt } = JSON.parse(createdCli.stdout);
	const created = ArchitectureModuleEditResultSchema.parse(receipt);
	if (!created.success) throw new Error(JSON.stringify(created));
	const listedCli = runServerCli({
		repoRoot,
		server,
		args: ["model", "proposals"],
		input: undefined,
	});
	expect(listedCli.status, listedCli.stderr).toBe(0);
	const listed = JSON.parse(listedCli.stdout);
	expect(listed.proposals).toHaveLength(1);
	expect(listed.selectedState).toMatchObject({ id: "Current", lifecycle: "current" });
	const query = new URLSearchParams({ vault, state: "Queued" });
	const response = await fetch(`${server.base}/api/architecture/model?${query}`);
	expect(response.status).toBe(200);
	const selected = ArchitectureModelReadSchema.parse(await response.json());
	expect(selected).toMatchObject({
		success: true,
		selectedState: { name: "Queued", lifecycle: "draft" },
		comparison: { reason: "current" },
	});
	const comparedCli = runServerCli({
		repoRoot,
		server,
		args: ["model", "compare", "--state", "Queued", "--against", "current"],
		input: undefined,
	});
	expect(comparedCli.status, comparedCli.stderr).toBe(0);
	const compared = JSON.parse(comparedCli.stdout);
	expect(compared.comparison).toMatchObject({
		reason: "explicit",
		against: { id: "Current", lifecycle: "current" },
	});
	const missing = runServerCli({
		repoRoot,
		server,
		args: ["model", "read", "--state", "missing"],
		input: undefined,
	});
	expect(missing.status).toBe(2);
	expect(JSON.parse(missing.stdout)).toMatchObject({ success: false, code: "STATE_NOT_FOUND" });
	const invalid = await fetch(
		`${server.base}/api/architecture/model?${query}&checkpoint=${created.checkpoint.id}`,
	);
	expect(invalid.status).toBe(400);
	const catalogue = await fetch(
		`${server.base}/api/architecture/proposals?${new URLSearchParams({ vault })}`,
	);
	expect(catalogue.status).toBe(200);
	expect(ArchitectureModelReadSchema.parse(await catalogue.json())).toMatchObject({
		success: true,
		proposals: listed.proposals,
	});
}, 20_000);

test("CLI and HTTP preserve family standing, blocked refusal and complete settlement", async () => {
	if (server === undefined) throw new Error("The server did not start");
	const initial = readArchitectureModel(vault);
	if (!initial.success) throw new Error(JSON.stringify(initial));
	const draft = initial.proposals[0]!;
	async function claim(state: string, subjects: string[]) {
		const claims = readArchitectureClaims(vault);
		if (!claims.success) throw new Error(JSON.stringify(claims));
		for (const value of claims.claims)
			await releaseArchitectureClaim(vault, { claim: value.id, writer: value.writer });
		const target = { model: "Shop", state };
		const result = await claimArchitectureSubjects(vault, {
			target,
			writer: "agent",
			reason: "adapter family contract",
			subjects,
		});
		if (!result.success) throw new Error(JSON.stringify(result));
		const model = readArchitectureModel(vault);
		if (!model.success) throw new Error(JSON.stringify(model));
		return {
			target,
			writer: "agent",
			claim: result.claim.id,
			operationId: crypto.randomUUID(),
			expectedRevision: model.revision,
		};
	}
	const child = await editArchitectureModule(vault, {
		...(await claim(draft.id, ["Shop", draft.id])),
		doing: "create dependent draft",
		proposal: { type: "create", name: "Child" },
		changes: [],
	});
	if (!child.success || child.target.state === null) throw new Error(JSON.stringify(child));
	const edited = runServerCli({
		repoRoot,
		server,
		args: ["model", "edit", "--doing", "advance predecessor"],
		input: JSON.stringify({
			...(await claim("Current", ["Shop", "Shop#Gateway", draft.id, child.target.state])),
			changes: [
				{
					type: "edit-module",
					subject: "Shop#Gateway",
					set: { description: "Dispatches immediately." },
				},
			],
		}),
	});
	expect(edited.status, edited.stderr).toBe(0);
	const { vault: _address, ...rawReceipt } = JSON.parse(edited.stdout);
	expect(ArchitectureModuleEditResultSchema.parse(rawReceipt)).toMatchObject({
		success: true,
		reconciliation: true,
	});
	const query = new URLSearchParams({ vault, state: draft.id });
	const read = await fetch(`${server.base}/api/architecture/model?${query}`);
	expect(read.status).toBe(200);
	expect(ArchitectureModelReadSchema.parse(await read.json())).toMatchObject({
		success: true,
		selectedState: {
			id: draft.id,
			standing: {
				issues: expect.arrayContaining([expect.objectContaining({ kind: "competing-field" })]),
			},
		},
	});
	const pending = {
		...(await claim(draft.id, ["Shop", "Shop#Gateway", draft.id, child.target.state])),
		proposal: { type: "edit" },
		changes: [],
		doing: "edit blocked child",
		target: { model: "Shop", state: child.target.state },
	};
	const blocked = await fetch(`${server.base}/api/architecture/module`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ ...pending, vault }),
	});
	expect(blocked.status).toBe(409);
	expect(await blocked.json()).toMatchObject({
		success: false,
		code: "PROPOSAL_BLOCKED",
		applied: false,
	});
	const { doing: _doing, ...cliPending } = pending;
	const refused = runServerCli({
		repoRoot,
		server,
		args: ["model", "edit", "--doing", "edit blocked child"],
		input: JSON.stringify(cliPending),
	});
	expect(refused.status).toBe(2);
	expect(JSON.parse(refused.stdout)).toMatchObject({ success: false, code: "PROPOSAL_BLOCKED" });
	const settled = await fetch(`${server.base}/api/architecture/module`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			...pending,
			vault,
			target: { model: "Shop", state: draft.id },
			operationId: "surface-settle",
			doing: "settle complete proposal",
			proposal: {
				type: "settle",
				resolutions: [{ subject: "Shop#Gateway", field: "description", take: "theirs" }],
			},
		}),
	});
	expect(settled.status).toBe(200);
	expect(ArchitectureModuleEditResultSchema.parse(await settled.json())).toMatchObject({
		success: true,
		reconciliation: false,
	});
});

test("CLI and HTTP preserve completed lifecycle states and forced comparison receipts", async () => {
	if (server === undefined) throw new Error("The server did not start");
	const initial = readArchitectureModel(vault);
	if (!initial.success) throw new Error(JSON.stringify(initial));
	const parent = initial.proposals.find((entry) => entry.name === "Queued")!;
	const child = initial.proposals.find((entry) => entry.name === "Child")!;
	async function lifecycleInput(state: string) {
		const claims = readArchitectureClaims(vault);
		if (!claims.success) throw new Error(JSON.stringify(claims));
		for (const value of claims.claims)
			await releaseArchitectureClaim(vault, { claim: value.id, writer: value.writer });
		const target = { model: "Shop", state };
		const claimed = await claimArchitectureSubjects(vault, {
			target,
			writer: "agent",
			reason: "adapter lifecycle contract",
			subjects: ["Shop", "Shop#Gateway", parent.id, child.id].filter(
				(id) => id !== child.id || state === child.id,
			),
		});
		if (!claimed.success) throw new Error(JSON.stringify(claimed));
		const model = readArchitectureModel(vault);
		if (!model.success) throw new Error(JSON.stringify(model));
		return {
			target,
			writer: "agent",
			claim: claimed.claim.id,
			operationId: crypto.randomUUID(),
			expectedRevision: model.revision,
			changes: [],
		};
	}
	const shelved = await fetch(`${server.base}/api/architecture/module`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			...(await lifecycleInput(child.id)),
			vault,
			doing: "shelve dependent proposal",
			proposal: { type: "shelve", reason: "Retain the alternative." },
		}),
	});
	expect(shelved.status).toBe(200);
	expect(ArchitectureModuleEditResultSchema.parse(await shelved.json())).toMatchObject({
		success: true,
		selectedState: { id: child.id, lifecycle: "shelved" },
	});
	const input = await lifecycleInput(parent.id);
	const refused = await fetch(`${server.base}/api/architecture/module`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			...input,
			vault,
			doing: "adopt queued routing",
			proposal: { type: "adopt", force: true, reason: "The queue is implemented." },
		}),
	});
	expect(refused.status).toBe(409);
	expect(await refused.json()).toMatchObject({
		success: false,
		code: "COMPARISON_REQUIRED",
		applied: false,
	});
	const comparison = runServerCli({
		repoRoot,
		server,
		args: ["model", "compare", "--state", parent.id, "--against", "current"],
		input: undefined,
	});
	expect(comparison.status, comparison.stderr).toBe(0);
	const content = JSON.stringify({
		...input,
		proposal: {
			type: "adopt",
			force: true,
			reason: "The queue is implemented.",
			comparison: JSON.parse(comparison.stdout).comparison,
		},
	});
	const cli = {
		repoRoot,
		server,
		args: ["model", "edit", "--doing", "adopt queued routing"],
		input: content,
	};
	const adopted = runServerCli(cli);
	expect(adopted.status, adopted.stderr).toBe(0);
	const { vault: _vault, ...raw } = JSON.parse(adopted.stdout);
	expect(ArchitectureModuleEditResultSchema.parse(raw)).toMatchObject({
		success: true,
		selectedState: { id: parent.id, lifecycle: "current" },
		checkpoint: { lifecycle: { type: "adopt", previous: { state: { id: "Current" } } } },
	});
	const retry = runServerCli(cli);
	expect(retry.status, retry.stderr).toBe(0);
	expect(JSON.parse(retry.stdout)).toEqual(JSON.parse(adopted.stdout));
	const reopened = runServerCli({
		repoRoot,
		server,
		args: ["model", "read", "--state", child.id],
		input: undefined,
	});
	expect(reopened.status, reopened.stderr).toBe(0);
	expect(JSON.parse(reopened.stdout)).toMatchObject({
		success: true,
		selectedState: { id: child.id, lifecycle: "shelved" },
		states: expect.arrayContaining([
			expect.objectContaining({ id: "Current", lifecycle: "historical" }),
		]),
	});
}, 20_000);

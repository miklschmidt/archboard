import { ArchitectureHistoryResultSchema } from "@archboard/code-intel/history";
import { z } from "zod";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
	ArchitectureModelReadSchema,
	ArchitectureClaimResultSchema,
	ArchitectureCheckpointRetainSchema,
} from "@archboard/model/contract";
import { startOwnedServer, type OwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const home = mkdtempSync(join(tmpdir(), "archboard-footprint-surface-"));
const vault = vaultIn(home);
let server: OwnedServer | undefined;
beforeAll(async () => {
	cpSync(join(repoRoot, "examples/canonical-model/.archboard/vault"), vault, { recursive: true });
	// A module bound to a directory, and a module bound to a file inside it.
	for (const [id, name, path, order] of [
		["Wkspace", "Workspace", "libs/workspace", 40],
		["Install", "Installation", "libs/workspace/src/installation.ts", 50],
	] as const) {
		writeFileSync(
			join(vault, `${id.toLowerCase()}.module.json`),
			JSON.stringify({
				schemaVersion: 1,
				id: `Shop#${id}`,
				name,
				kind: "module",
				order,
				binding: { repo: "github.com/acme/shop", path },
				outgoing: [],
			}),
		);
	}
	mkdirSync(join(home, "libs/workspace/src"), { recursive: true });
	writeFileSync(join(home, "libs/workspace/README.md"), "Workspace.\n");
	writeFileSync(join(home, "libs/workspace/src/installation.ts"), "export const installed = 1;\n");
	for (const args of [
		["init", "--quiet"],
		["config", "user.name", "Footprint Author"],
		["config", "user.email", "footprint@example.test"],
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
function cli(args: string[], input?: unknown) {
	if (!server) throw new Error("Server unavailable");
	return runServerCli({
		repoRoot,
		server,
		args,
		input: input === undefined ? undefined : JSON.stringify(input),
	});
}
function answer(stdout: string) {
	const { vault: _vault, ...result } = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
	return result;
}

test("canonical locality and branch footprint retain source analysis without a live model reader", () => {
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
	// A base no checkout can read is a failure that names it, not a clean exit.
	const unread = cli(["model", "footprint", "--base", "no-such-base"]);
	expect(unread.status).toBe(2);
	expect(unread.stderr).toContain("no-such-base");
	const local = ArchitectureHistoryResultSchema.parse(answer(locality.stdout));
	const branch = ArchitectureHistoryResultSchema.parse(answer(footprint.stdout));
	if (!local.success || local.analysis !== "locality" || !branch.success || !("changed" in branch))
		throw new Error(JSON.stringify({ local, branch }));
	expect(local.hotspots.map((part) => part.subject.id)).toContain("Shop#Gateway");
	expect(branch.changed.map((part) => part.subject.id)).toContain("Shop#Gateway");
	const current = ArchitectureModelReadSchema.parse(answer(cli(["model", "read"]).stdout));
	if (!current.success) throw new Error(JSON.stringify(current));
	const retained = ArchitectureCheckpointRetainSchema.parse(
		answer(
			cli([
				"model",
				"retain",
				"--operation-id",
				"history-comparison",
				"--writer",
				"surface-agent",
				"--expect-revision",
				current.revision.digest,
				"--doing",
				"Retain source comparison",
			]).stdout,
		),
	);
	if (!retained.success) throw new Error(JSON.stringify(retained));
	for (const command of [["locality"], ["footprint", "--base", "HEAD~1"]]) {
		const exact = cli(["model", ...command, "--against", retained.checkpoint.id]);
		expect(exact.status, exact.stdout + exact.stderr).toBe(0);
		expect(ArchitectureHistoryResultSchema.parse(answer(exact.stdout))).toMatchObject({
			success: true,
			model: "Shop",
		});
	}
	expect(Bun.spawnSync(["git", "-C", home, "rev-parse", "HEAD"]).stdout.toString()).toBe(
		sourceHead,
	);
	const refused = cli(["model", "footprint", "--base", "HEAD", "--state", "Missing"]);
	expect(refused.status, refused.stderr).toBe(2);
	expect(answer(refused.stdout)).toMatchObject({ success: false, code: "STATE_NOT_FOUND" });

	// The gate: the commit changed Gateway and its Handler, and the draft names only Gateway.
	if (current.manifest.current === null) throw new Error("The model has no Current");
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claim = ArchitectureClaimResultSchema.parse(
		answer(
			cli(["model", "claim"], {
				target,
				writer: "surface-agent",
				reason: "proposing the gateway",
				subjects: ["Shop", "Shop#Gateway"],
			}).stdout,
		),
	);
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const retainedRead = ArchitectureModelReadSchema.parse(answer(cli(["model", "read"]).stdout));
	if (!retainedRead.success) throw new Error(JSON.stringify(retainedRead));
	const proposed = cli(["model", "edit", "--doing", "proposing the gateway"], {
		target,
		expectedRevision: retainedRead.revision,
		operationId: "footprint-gate-draft",
		writer: "surface-agent",
		claim: claim.claim.id,
		proposal: { type: "create", name: "Gateway only" },
		changes: [{ type: "edit-module", subject: "Shop#Gateway", set: { description: "Gated." } }],
	});
	expect(proposed.status, proposed.stderr).toBe(0);
	const release = cli(["model", "release"], { claim: claim.claim.id, writer: "surface-agent" });
	expect(release.status, release.stderr).toBe(0);
	const draft = ["model", "footprint", "--base", "HEAD~1", "--state", "Gateway only"];
	expect(cli(draft).status).toBe(0);
	const outside = cli([...draft, "--fail-outside"]);
	expect(outside.status, outside.stderr).toBe(1);
	expect(answer(outside.stdout)).toMatchObject({
		changedNotNamed: [
			expect.objectContaining({ subject: expect.objectContaining({ id: "Shop#Handler" }) }),
		],
	});
	const inside = cli([
		"model",
		"footprint",
		"--base",
		"HEAD",
		"--state",
		"Gateway only",
		"--fail-outside",
	]);
	expect(inside.status, inside.stderr).toBe(0);
	// A file that no module is bound to is flagged and never fails the gate. The vault is not flagged.
	mkdirSync(join(home, "docs"), { recursive: true });
	writeFileSync(join(home, "docs/notes.md"), "Notes.\n");
	for (const args of [
		["add", "-A"],
		["commit", "--quiet", "-m", "docs: notes, and the draft"],
	]) {
		const ran = Bun.spawnSync(["git", "-C", home, ...args]);
		if (ran.exitCode !== 0) throw new Error(ran.stderr.toString());
	}
	const committed = Bun.spawnSync(["git", "-C", home, "diff", "--name-only", "HEAD~1", "HEAD"]);
	expect(committed.stdout.toString()).toContain(".proposal.json");
	const flagged = cli([...draft, "--fail-outside"]);
	expect(flagged.status, flagged.stderr).toBe(0);
	expect(answer(flagged.stdout)).toMatchObject({
		unboundFiles: [expect.objectContaining({ path: "docs/notes.md" })],
	});
	expect(flagged.stderr).toContain(
		"Not bound: 1 changed file that no module is bound to: docs/notes.md.",
	);
	expect(cli(["model", "footprint", "--base", "HEAD~1", "--fail-outside"]).status).toBe(2);
	expect(
		cli(["model", "footprint", "--base", "HEAD~1", "--state", "current", "--fail-outside"]).status,
	).toBe(2);
}, 30_000);

test("a directory module passes the gate only when the modules inside it bind each file it changed", () => {
	const current = ArchitectureModelReadSchema.parse(answer(cli(["model", "read"]).stdout));
	if (!current.success || current.manifest.current === null) throw new Error("No Current");
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claim = ArchitectureClaimResultSchema.parse(
		answer(
			cli(["model", "claim"], {
				target,
				writer: "held-agent",
				reason: "proposing the installation",
				subjects: ["Shop", "Shop#Install"],
			}).stdout,
		),
	);
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const read = ArchitectureModelReadSchema.parse(answer(cli(["model", "read"]).stdout));
	if (!read.success) throw new Error(JSON.stringify(read));
	const proposed = cli(["model", "edit", "--doing", "proposing the installation"], {
		target,
		expectedRevision: read.revision,
		operationId: "footprint-held-draft",
		writer: "held-agent",
		claim: claim.claim.id,
		proposal: { type: "create", name: "Installation only" },
		changes: [{ type: "edit-module", subject: "Shop#Install", set: { description: "Gated." } }],
	});
	expect(proposed.status, proposed.stderr).toBe(0);
	let commits = 0;

	/**
	 * Commit a change to some files of the workspace, and run the gate over that commit.
	 * @param files The files to change, below `libs/workspace`.
	 * @returns The gate's run.
	 */
	function gate(...files: string[]) {
		commits += 1;
		for (const file of files) writeFileSync(join(home, "libs/workspace", file), `${commits}\n`);
		for (const args of [
			["add", "libs"],
			["commit", "--quiet", "-m", `test: change ${files.join(", ")}`],
		]) {
			const ran = Bun.spawnSync(["git", "-C", home, ...args]);
			if (ran.exitCode !== 0) throw new Error(ran.stderr.toString());
		}
		const ran = cli([
			"model",
			"footprint",
			"--base",
			"HEAD~1",
			"--state",
			"Installation only",
			"--fail-outside",
		]);
		const parsed = z
			.object({
				changedNotNamed: z.array(
					z.object({ subject: z.object({ name: z.string() }), holds: z.array(z.string()) }),
				),
			})
			.parse(answer(ran.stdout));
		const holds = Object.fromEntries(
			parsed.changedNotNamed.map((part) => [part.subject.name, part.holds]),
		);
		return { status: ran.status, stderr: ran.stderr, holds };
	}

	const inner = gate("src/installation.ts");
	expect(inner.status, inner.stderr).toBe(0);
	expect(inner.holds).toEqual({ Workspace: ["Shop#Install"] });

	const outer = gate("README.md");
	expect(outer.status, outer.stderr).toBe(1);
	expect(outer.holds).toEqual({ Workspace: [] });
	expect(outer.stderr).toContain("Changed outside the draft: Workspace.");

	const both = gate("src/installation.ts", "README.md");
	expect(both.status, both.stderr).toBe(1);
	expect(both.holds).toEqual({ Workspace: [] });
	expect(both.stderr).toContain("1 changed outside the plan");
	expect(both.stderr).toContain("Changed outside the draft: Workspace.");
	const released = cli(["model", "release"], { claim: claim.claim.id, writer: "held-agent" });
	expect(released.status, released.stderr).toBe(0);
}, 30_000);

/**
 * A change that adds a module bound into the shop.
 * @param name The module's name.
 * @param order Its order.
 * @param path The path it binds.
 * @param symbol The declaration it binds, if any.
 * @returns The change.
 */
function bound(name: string, order: number, path: string, symbol?: string) {
	return {
		type: "add-module",
		module: {
			name,
			kind: "module",
			order,
			binding: { repo: "github.com/acme/shop", path, ...(symbol === undefined ? {} : { symbol }) },
		},
	};
}

test("a module the draft adds is preexisting when the branch adds none of its bound code", () => {
	/**
	 * Write some files and commit them.
	 * @param subject The commit's subject.
	 * @param files Each file and its text.
	 */
	function commit(subject: string, files: Record<string, string>) {
		for (const [file, text] of Object.entries(files)) {
			mkdirSync(join(home, file, ".."), { recursive: true });
			writeFileSync(join(home, file), text);
		}
		for (const args of [
			["add", ...Object.keys(files)],
			["commit", "--quiet", "-m", subject],
		]) {
			const ran = Bun.spawnSync(["git", "-C", home, ...args]);
			if (ran.exitCode !== 0) throw new Error(ran.stderr.toString());
		}
	}
	commit("test: the code at the base", {
		"tools/cli/main.ts": "export const main = 1;\n",
		"tools/cli/args.ts": "export const args = 1;\n",
		"tools/plugins/core.ts": "export const core = 1;\n",
		"lib/store.ts": "export function load() {\n\treturn 1;\n}\n",
	});
	const base = Bun.spawnSync(["git", "-C", home, "rev-parse", "HEAD"]).stdout.toString().trim();
	commit("test: the branch", {
		"tools/cli/main.ts": "export const main = 2;\n",
		"tools/plugins/extra.ts": "export const extra = 1;\n",
		"src/report.ts": "export const report = 1;\n",
		"lib/store.ts":
			"export function load() {\n\treturn 1;\n}\n\nexport function save() {\n\treturn 2;\n}\n",
	});

	const current = ArchitectureModelReadSchema.parse(answer(cli(["model", "read"]).stdout));
	if (!current.success || current.manifest.current === null) throw new Error("No Current");
	const target = { model: current.manifest.id, state: current.manifest.current.id };
	const claim = ArchitectureClaimResultSchema.parse(
		answer(
			cli(["model", "claim"], {
				target,
				writer: "adding-agent",
				reason: "adding modules",
				subjects: ["Shop"],
			}).stdout,
		),
	);
	if (!claim.success) throw new Error(JSON.stringify(claim));
	const read = ArchitectureModelReadSchema.parse(answer(cli(["model", "read"]).stdout));
	if (!read.success) throw new Error(JSON.stringify(read));
	const proposed = cli(["model", "edit", "--doing", "adding modules"], {
		target,
		expectedRevision: read.revision,
		operationId: "footprint-preexisting-draft",
		writer: "adding-agent",
		claim: claim.claim.id,
		proposal: { type: "create", name: "Adds modules" },
		changes: [
			// The branch changes code that was there at the base, and adds none.
			bound("Cli", 60, "tools/cli"),
			// The branch leaves this code alone.
			bound("Args", 61, "tools/cli/args.ts"),
			bound("Load", 62, "lib/store.ts", "load"),
			// The branch adds this code: a new file, a new file in a directory, a new declaration.
			bound("Report", 63, "src/report.ts"),
			bound("Plugins", 64, "tools/plugins"),
			bound("Save", 65, "lib/store.ts", "save"),
		],
	});
	expect(proposed.status, proposed.stderr).toBe(0);
	const released = cli(["model", "release"], { claim: claim.claim.id, writer: "adding-agent" });
	expect(released.status, released.stderr).toBe(0);

	const draft = ["model", "footprint", "--base", base, "--state", "Adds modules"];
	const listed = cli(draft);
	expect(listed.status, listed.stderr).toBe(0);
	const parsed = z
		.object({
			preexisting: z.array(z.object({ subject: z.object({ name: z.string() }) })),
			namedAndChanged: z.array(
				z.object({ subject: z.object({ name: z.string() }), newSource: z.boolean() }),
			),
		})
		.parse(answer(listed.stdout));
	expect(parsed.preexisting.map(({ subject }) => subject.name).toSorted()).toEqual([
		"Args",
		"Cli",
		"Load",
	]);
	expect(
		Object.fromEntries(parsed.namedAndChanged.map((part) => [part.subject.name, part.newSource])),
	).toMatchObject({ Cli: false, Report: true, Plugins: true, Save: true });

	const gated = cli([...draft, "--fail-preexisting"]);
	expect(gated.status, gated.stderr).toBe(1);
	for (const name of ["Args", "Cli", "Load"]) expect(gated.stderr).toContain(name);
	expect(cli(["model", "footprint", "--base", base, "--fail-preexisting"]).status).toBe(2);
}, 30_000);

test("a footprint with a head reads the vault at that head, and --model-at checkout reads the vault on disk", () => {
	const draftCommit = Bun.spawnSync([
		"git",
		"-C",
		home,
		"log",
		"--diff-filter=A",
		"--format=%H",
		"-1",
		"--",
		"*.proposal.json",
	])
		.stdout.toString()
		.trim();
	const before = `${draftCommit}~1`;
	const draft = ["model", "footprint", "--base", before, "--state", "Gateway only"];

	// The draft is in the vault at `draftCommit`, which names it, and not in the vault before it.
	const atHead = cli([...draft, "--head", draftCommit]);
	expect(atHead.status, atHead.stderr).toBe(0);
	expect(answer(atHead.stdout)).toMatchObject({
		vaultRead: { at: "ref", ref: draftCommit, commit: draftCommit },
	});
	const missing = cli([...draft, "--head", before]);
	expect(missing.status).toBe(2);
	expect(answer(missing.stdout)).toMatchObject({ success: false, code: "STATE_NOT_FOUND" });

	// The vault on disk has the draft whatever the head is, and an absent head reads it too.
	const onDisk = cli([...draft, "--head", before, "--model-at", "checkout"]);
	expect(onDisk.status, onDisk.stderr).toBe(0);
	expect(answer(onDisk.stdout)).toMatchObject({ vaultRead: { at: "checkout" } });
	expect(answer(cli(draft).stdout)).toMatchObject({ vaultRead: { at: "checkout" } });

	expect(cli([...draft, "--model-at", "elsewhere"]).status).not.toBe(0);
}, 30_000);

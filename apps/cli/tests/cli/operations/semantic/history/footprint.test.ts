// `archboard semantic footprint` from its arguments to its streams and exit
// status (ADR 0045): it asks the footprint route with the board, the base and
// the proposal, prints the answer, and never fails for what a footprint finds.
// A refusal of the route keeps the exit status its code declares. Only the
// Archboard server is a stand-in.

import { afterAll, expect, spyOn, test } from "bun:test";
import { z } from "zod";
import { FootprintReplySchema } from "@archboard/code-intel/history";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";

/** The footprint route's reply. */
type FootprintReply = z.infer<typeof FootprintReplySchema>;

const subject = (id: string, name: string) => ({ kind: "node" as const, id, name });
const reply: FootprintReply = {
	success: true,
	board: "Orders",
	version: 4,
	base: "origin/main",
	against: { id: "v1", name: "Built" },
	proposal: { id: "v2", name: "TASK-1" },
	repositories: [
		{
			status: "read",
			repo: "github.com/test/orders",
			base: "a".repeat(40),
			mergeBase: "a".repeat(40),
			head: "c".repeat(40),
			commits: 3,
		},
	],
	commits: [
		{
			repo: "github.com/test/orders",
			commit: "b".repeat(40),
			committedAt: "2026-10-02T00:00:00.000Z",
			subject: "change the ledger",
			files: 40,
			large: true,
		},
	],
	namedAndChanged: [],
	changedNotNamed: [
		{
			subject: subject("pL", "Ledger"),
			repo: "github.com/test/orders",
			path: "src/ledger.ts",
			commits: ["b".repeat(40)],
			named: [],
		},
	],
	namedNotChanged: [
		{
			subject: subject("pC", "Cache"),
			repo: "github.com/test/orders",
			path: "src/cache.ts",
			commits: [],
			named: [{ by: "part", status: "added" }],
		},
	],
	skipped: [{ subject: subject("pU", "Customer"), reason: "unbound", named: [] }],
};

const vault = makeStandInVault();
let service = "";
const asked: URL[] = [];
let refusal: { status: number; code: string } | undefined;
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/health") return Response.json({ service, status: "ok" });
		asked.push(new URL(vault.unnamed(url), url));
		if (url.pathname !== "/api/semantic-boards/footprint") {
			return Response.json(
				{ success: false, error: `unexpected ${url.pathname}` },
				{ status: 404 },
			);
		}
		if (refusal !== undefined) {
			return Response.json(
				{ success: false, code: refusal.code, error: "refused" },
				{ status: refusal.status },
			);
		}
		return Response.json(reply);
	},
});
const url = `http://127.0.0.1:${server.port}`;
const environment = {
	ARCHBOARD_URL: process.env["ARCHBOARD_URL"],
	ARCHBOARD_NO_AUTOSTART: process.env["ARCHBOARD_NO_AUTOSTART"],
};
process.env["ARCHBOARD_URL"] = url;
process.env["ARCHBOARD_NO_AUTOSTART"] = "1";
// Imported only now, because the CLI reads where its server is as it loads.
const [config, client, { runCli }] = await Promise.all([
	import("@archboard/server-lifecycle/config"),
	import("@archboard/server-lifecycle/server-client"),
	import("#cli/operations/invocation/run.ts"),
]);
if (config.ARCHBOARD_URL !== url) {
	throw new Error(
		`The CLI loaded before this file pointed it at its stand-in server. Run it in its own process: bun test --isolate ${import.meta.path}`,
	);
}
service = client.ARCHBOARD_SERVICE_NAME;

afterAll(async () => {
	for (const [key, value] of Object.entries(environment)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	await server.stop(true);
	vault.restore();
});

/**
 * Run the CLI and capture what it wrote and how it exited.
 * @param argv The arguments.
 * @returns Its two streams and its exit code.
 */
async function run(argv: string[]): Promise<{ stdout: string; stderr: string; exited: unknown }> {
	const exitCode = process.exitCode;
	let stdout = "";
	let stderr = "";
	const out = spyOn(process.stdout, "write").mockImplementation((chunk) => {
		stdout += String(chunk);
		return true;
	});
	const err = spyOn(process.stderr, "write").mockImplementation((chunk) => {
		stderr += String(chunk);
		return true;
	});
	let exited: unknown;
	// A run that succeeds leaves the exit code as it found it, so each run starts from 0.
	process.exitCode = 0;
	try {
		await runCli(vault.argv(argv));
		exited = process.exitCode;
	} finally {
		out.mockRestore();
		err.mockRestore();
		process.exitCode = exitCode ?? 0;
	}
	return { stdout, stderr, exited };
}

test("the command asks the footprint route with the board, the base and the proposal, and prints what it answered", async () => {
	refusal = undefined;
	asked.length = 0;
	const { stdout, stderr, exited } = await run([
		"semantic",
		"footprint",
		"Orders",
		"--base",
		"origin/main",
		"--variant",
		"TASK-1",
	]);
	expect(exited).toBe(0);
	expect(asked.map((one) => Object.fromEntries(one.searchParams))).toEqual([
		{ board: "Orders", base: "origin/main", variant: "TASK-1" },
	]);
	const { vault: named, ...printed } = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
	expect(named).toMatchObject({ path: vault.path, origin: "-C" });
	expect(FootprintReplySchema.parse(printed)).toEqual(reply);
	const lines = stderr.split("\n");
	expect(lines.some((line) => line.includes("Ledger") && line.includes("src/ledger.ts"))).toBe(
		true,
	);
	expect(lines.some((line) => line.includes("Cache") && line.includes("src/cache.ts"))).toBe(true);
});

test("without --variant the command names no proposal", async () => {
	asked.length = 0;
	await run(["semantic", "footprint", "Orders", "--base", "main"]);
	expect(asked.map((one) => Object.fromEntries(one.searchParams))).toEqual([
		{ board: "Orders", base: "main" },
	]);
});

test("--head and --against are carried to the route, and a head the route cannot resolve is refused with exit 2", async () => {
	asked.length = 0;
	await run([
		"semantic",
		"footprint",
		"Orders",
		"--base",
		"main",
		"--head",
		"feat/layer-two",
		"--variant",
		"Layer two",
		"--against",
		"Layer one",
	]);
	expect(asked.map((one) => Object.fromEntries(one.searchParams))).toEqual([
		{
			board: "Orders",
			base: "main",
			head: "feat/layer-two",
			variant: "Layer two",
			against: "Layer one",
		},
	]);
	refusal = { status: 422, code: "HEAD_UNRESOLVED" };
	const { exited, stdout } = await run([
		"semantic",
		"footprint",
		"Orders",
		"--base",
		"main",
		"--head",
		"nope",
	]);
	refusal = undefined;
	expect(exited).toBe(2);
	expect(stdout).toBe("");
});

test("a refusal of the route keeps the exit status its code declares", async () => {
	refusal = { status: 422, code: "NOTHING_TO_COMPARE" };
	const { exited, stdout } = await run([
		"semantic",
		"footprint",
		"Orders",
		"--base",
		"main",
		"--variant",
		"Built",
	]);
	refusal = undefined;
	expect(exited).toBe(2);
	expect(stdout).toBe("");
});

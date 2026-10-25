// `archboard semantic locality` from its arguments to its streams and exit
// status (ADR 0045): it asks the locality route with what the command line
// named, prints the answer, and writes nothing. Only the Archboard server is a
// stand-in.

import { afterAll, expect, spyOn, test } from "bun:test";
import { z } from "zod";
import { LocalityReplySchema, type LocalityAnswer } from "@archboard/code-intel/history";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";

const answer: LocalityAnswer = {
	board: "Orders",
	version: 4,
	variant: { id: "v1", name: "Built", lifecycle: "current" },
	periods: [
		{
			repo: "github.com/test/orders",
			head: "c".repeat(40),
			since: "2025-10-01T00:00:00.000Z",
			until: "2026-10-01T00:00:00.000Z",
		},
	],
	commits: [
		{
			repo: "github.com/test/orders",
			commit: "b".repeat(40),
			committedAt: "2026-09-02T00:00:00.000Z",
			subject: "change the ledger",
			files: 3,
		},
	],
	hotspots: [
		{
			subject: { kind: "node", id: "pL", name: "Ledger" },
			repo: "github.com/test/orders",
			path: "src/ledger.ts",
			commits: ["b".repeat(40)],
			count: 1,
		},
		{
			subject: { kind: "node", id: "pC", name: "Checkout" },
			repo: "github.com/test/orders",
			path: "src/checkout.ts",
			commits: [],
			count: 0,
		},
	],
	coupling: [
		{
			subjects: [
				{ kind: "node", id: "pL", name: "Ledger" },
				{ kind: "node", id: "pC", name: "Checkout" },
			],
			repo: "github.com/test/orders",
			commits: ["1", "2", "3", "4", "5"].map((digit) => digit.repeat(40)),
			shared: 5,
			// No 1 in it, so only the hotspot line names Ledger beside a 1.
			degree: 47,
			unjoined: true,
		},
	],
	leftOut: { largeCommits: 2 },
	skipped: [{ subject: { kind: "node", id: "pU", name: "Customer" }, reason: "unbound" }],
};

const vault = makeStandInVault();
let service = "";
let refuse = false;
const asked: string[] = [];
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const asking = new URL(request.url);
		const { pathname } = asking;
		if (pathname === "/health") return Response.json({ service, status: "ok" });
		asked.push(vault.unnamed(asking));
		if (pathname !== "/api/semantic-boards/locality") {
			return Response.json({ success: false, error: `unexpected ${pathname}` }, { status: 404 });
		}
		if (refuse) {
			return Response.json(
				{ success: false, code: "UNKNOWN_VARIANT", error: "No such variant." },
				{ status: 422 },
			);
		}
		return Response.json({ success: true, ...answer });
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
const [config, { runCli }] = await Promise.all([
	import("@archboard/server-lifecycle/config"),
	import("#cli/operations/invocation/run.ts"),
]);
if (config.ARCHBOARD_URL !== url) {
	throw new Error(
		`The CLI loaded before this file pointed it at its stand-in server. Run it in its own process: bun test --isolate ${import.meta.path}`,
	);
}
service = "archboard-server";

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

test("it asks the locality route for the board, the draft and the start it was given, and prints the answer", async () => {
	refuse = false;
	asked.length = 0;
	const { stdout, stderr, exited } = await run([
		"semantic",
		"locality",
		"Orders",
		"--variant",
		"Read cache",
		"--since",
		"2026-01-31",
	]);
	expect(exited).toBe(0);
	expect(asked).toHaveLength(1);
	const query = new URL(`http://x${asked[0]}`).searchParams;
	expect(Object.fromEntries(query)).toEqual({
		board: "Orders",
		variant: "Read cache",
		since: "2026-01-31",
	});
	const { vault: named, ...printed } = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
	expect(named).toMatchObject({ path: vault.path, origin: "-C" });
	expect(LocalityReplySchema.parse(printed)).toEqual({ success: true, ...answer });
	const lines = stderr.split("\n");
	expect(lines.some((line) => line.includes("Ledger") && line.includes("1"))).toBe(true);
	expect(lines.some((line) => /Ledger.*Checkout/u.test(line) && line.includes("47"))).toBe(true);
});

test("a board with no variant or start named asks for neither", async () => {
	asked.length = 0;
	const { exited } = await run(["semantic", "locality", "Orders"]);
	expect(exited).toBe(0);
	expect(Object.fromEntries(new URL(`http://x${asked[0]}`).searchParams)).toEqual({
		board: "Orders",
	});
});

test("a start that is not a date is a usage error and asks the server nothing", async () => {
	asked.length = 0;
	const { stdout, exited } = await run(["semantic", "locality", "Orders", "--since", "last week"]);
	expect(exited).toBe(2);
	expect(stdout).toBe("");
	expect(asked).toEqual([]);
});

test("a variant the server cannot read is a usage error and prints no answer", async () => {
	refuse = true;
	const { stdout, stderr, exited } = await run([
		"semantic",
		"locality",
		"Orders",
		"--variant",
		"x",
	]);
	expect(exited).toBe(2);
	expect(stdout).toBe("");
	expect(stderr).toContain("No such variant.");
});

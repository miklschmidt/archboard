// `archboard semantic questions` from its arguments to its streams and exit
// status (ADR 0044, ADR 0059): it asks the design questions route with each
// board it was told to narrow to, prints the answer the route gave, and never
// fails for what the questions find. A refusal of the route keeps the exit
// status its code declares. Only the Archboard server is a stand-in.

import { afterAll, expect, spyOn, test } from "bun:test";
import { z } from "zod";
import { DesignQuestionsReplySchema } from "@archboard/board/design-questions";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";

const subject = (id: string, name: string) => ({ id, name, kind: "module" });
const reply = DesignQuestionsReplySchema.parse({
	success: true,
	boards: [{ board: "Shop", variant: { id: "v1", name: "Built" }, version: 4 }],
	skipped: [{ reason: "no-current-variant", board: "Plan" }],
	questions: {
		passThroughEntryPoints: {
			containers: 1,
			parts: 1,
			results: [
				{ board: "Shop", container: subject("pS", "Shop"), parts: [subject("pC", "Cart")] },
			],
		},
		containersWithNoHiddenPart: { containers: 0, parts: 0, results: [] },
		containersWithNoEntryPoint: { containers: 0, parts: 0, results: [] },
	},
});

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
		if (url.pathname !== "/api/vault/design-questions") {
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

test("without --board the command names no board, and prints the answer of the route beside the vault", async () => {
	refusal = undefined;
	asked.length = 0;
	const { stdout, exited } = await run(["semantic", "questions"]);
	expect(exited).toBe(0);
	expect(asked.map((one) => one.searchParams.getAll("board"))).toEqual([[]]);
	const { vault: named, ...printed } = z.record(z.string(), z.unknown()).parse(JSON.parse(stdout));
	expect(named).toMatchObject({ path: vault.path, origin: "-C" });
	expect(DesignQuestionsReplySchema.parse(printed)).toEqual(reply);
});

test("every --board is sent to the route, in order", async () => {
	asked.length = 0;
	const { exited } = await run([
		"semantic",
		"questions",
		"--board",
		"Shop",
		"--board",
		"Plan",
		"--board=Cart",
	]);
	expect(exited).toBe(0);
	expect(asked.map((one) => one.searchParams.getAll("board"))).toEqual([["Shop", "Plan", "Cart"]]);
});

test("a board the route does not know is refused with the exit status the contract declares, and prints no answer", async () => {
	refusal = { status: 404, code: "BOARD_MISSING" };
	const { stdout, exited } = await run(["semantic", "questions", "--board", "Shpo"]);
	refusal = undefined;
	expect(exited).toBe(2);
	expect(stdout).toBe("");
});

// `archboard semantic render` and `semantic rasterize` when the render drew
// nothing: a view that names nothing the variant holds is refused with its own
// code (declared by both commands, so the exit status proves the thrown code
// matches), and an empty board keeps its usage refusal. Only the Archboard
// server is a stand-in.

import { afterAll, expect, spyOn, test } from "bun:test";
import type { NothingDrawn } from "@archboard/board/render-reply";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";

const vault = makeStandInVault();
let service = "";
let answer: NothingDrawn;
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/health") return Response.json({ service, status: "ok" });
		if (url.pathname !== "/api/semantic-boards/render") {
			return Response.json(
				{ success: false, error: `unexpected ${url.pathname}` },
				{ status: 404 },
			);
		}
		return Response.json(answer);
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
 * The server's answer when nothing was drawn.
 * @param empty Why nothing was drawn.
 * @param viewName The view asked for, or null for the overview.
 * @returns The answer.
 */
function nothingDrawn(empty: NothingDrawn["empty"], viewName: string | null): NothingDrawn {
	return {
		success: true,
		board: "Endpoint Gateway",
		version: 3,
		variant: { id: "v2", name: "Proposal", lifecycle: "draft" },
		view: viewName === null ? null : { id: "w1", name: viewName, grammar: "sequence" },
		views: [],
		changes: null,
		waiting: null,
		empty,
	};
}

/**
 * Run the CLI and capture what it wrote and how it exited.
 * @param argv The arguments.
 * @returns Its stderr, its stdout and its exit code.
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

for (const command of ["render", "rasterize"]) {
	test(`semantic ${command} on a view that draws nothing names the view and the variant, as a refusal and not a usage mistake`, async () => {
		answer = nothingDrawn("VIEW_EMPTY_ON_VARIANT", "Login flow");
		const { exited, stdout, stderr } = await run([
			"semantic",
			command,
			"Endpoint Gateway",
			"--view",
			"Login flow",
			"--variant",
			"Proposal",
		]);
		expect(exited).toBe(2);
		expect(stdout).toBe("");
		expect(stderr).toContain("Login flow");
		expect(stderr).toContain("Proposal");
		expect(stderr).not.toContain("Usage:");
	});

	test(`semantic ${command} on a board with nothing on it keeps the usage refusal`, async () => {
		answer = nothingDrawn("NOTHING_TO_RENDER", null);
		const { exited, stdout, stderr } = await run(["semantic", command, "Endpoint Gateway"]);
		expect(exited).toBe(2);
		expect(stdout).toBe("");
		expect(stderr).toContain("Usage:");
	});
}

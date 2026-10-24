// `archboard semantic render` and `semantic rasterize` against a server that
// cannot give a picture its render recipe (ADR 0057): a server started before
// the recipe existed draws an SVG without one, and a server whose Git did not
// answer refuses the render. Both commands refuse, with the exit status their
// contract declares for the code, and give out nothing. Only the Archboard
// server is a stand-in; the real server's recipe is proven by
// tests/system/semantic-boards/render-recipe.test.ts.

import { afterAll, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";

const vault = makeStandInVault();
const scratch = mkdtempSync(join(tmpdir(), "archboard-recipe-refusal-"));
let service = "";
let answer: () => Response;
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
		return answer();
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
const [config, client, { runCli }, { semanticRenderContract }, { semanticRasterizeContract }] =
	await Promise.all([
		import("@archboard/server-lifecycle/config"),
		import("@archboard/server-lifecycle/server-client"),
		import("#cli/operations/invocation/run.ts"),
		import("#cli/operations/semantic/draw/render.ts"),
		import("#cli/operations/semantic/draw/rasterize.ts"),
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
	rmSync(scratch, { recursive: true, force: true });
});

const box = { x: 0, y: 0, width: 10, height: 10 };

/** The server's answer for a drawn board whose SVG carries no render recipe. */
function pictureWithoutRecipe(): Response {
	return Response.json({
		success: true,
		board: "Endpoint Gateway",
		version: 3,
		variant: { id: "v1", name: "Current", lifecycle: "current" },
		view: null,
		views: [],
		changes: null,
		waiting: null,
		svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><metadata>nothing</metadata></svg>',
		width: 10,
		height: 10,
		atlas: { nodes: { n1: box }, edges: {}, regions: {} },
		drawn: { nodes: [], edges: [], flows: [], steps: [] },
	});
}

/** The server's answer when Git did not say which repository holds the vault. */
function gitDidNotAnswer(): Response {
	return Response.json(
		{ success: false, code: "VAULT_REPOSITORY_UNKNOWN", error: "Git did not answer in time." },
		{ status: 500 },
	);
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

/**
 * The exit status a contract declares for a refusal code.
 * @param refusals The contract's refusals.
 * @param code The refusal code.
 * @returns The declared exit status.
 */
function declaredExit(refusals: readonly { code: string; exit: number }[], code: string): number {
	const declared = refusals.find((refusal) => refusal.code === code);
	if (declared === undefined) throw new Error(`${code} is not declared`);
	return declared.exit;
}

test("semantic render refuses a server picture without a recipe, on stdout and into a file", async () => {
	answer = pictureWithoutRecipe;
	const refusal = declaredExit(semanticRenderContract.refusals, "RENDER_RECIPE_UNAVAILABLE");
	const file = join(scratch, "board.svg");
	for (const args of [[], ["--out", file]]) {
		const { exited, stdout, stderr } = await run([
			"semantic",
			"render",
			"Endpoint Gateway",
			...args,
		]);
		expect(exited).toBe(refusal);
		expect(exited).not.toBe(0);
		expect(stdout).toBe("");
		expect(stderr).not.toContain("Usage:");
	}
	expect(existsSync(file)).toBe(false);
});

test("semantic rasterize refuses a server picture without a recipe before it gives out a bitmap", async () => {
	answer = pictureWithoutRecipe;
	const refusal = declaredExit(semanticRasterizeContract.refusals, "RASTER_FAILED");
	const { exited, stdout } = await run(["semantic", "rasterize", "Endpoint Gateway"]);
	expect(exited).toBe(refusal);
	expect(stdout).toBe("");
});

for (const [command, contract] of [
	["render", semanticRenderContract],
	["rasterize", semanticRasterizeContract],
] as const) {
	test(`semantic ${command} refuses when the server's Git did not say which repository holds the vault`, async () => {
		answer = gitDidNotAnswer;
		const refusal = declaredExit(contract.refusals, "VAULT_REPOSITORY_UNKNOWN");
		const { exited, stdout, stderr } = await run(["semantic", command, "Endpoint Gateway"]);
		expect(exited).toBe(refusal);
		expect(exited).not.toBe(0);
		expect(stdout).toBe("");
		expect(stderr).not.toBe("");
	});
}

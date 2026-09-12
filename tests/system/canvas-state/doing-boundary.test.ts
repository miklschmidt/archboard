import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester } from "./support/http.ts";

// Every agent write to a board says what it is doing, or it does not happen
// (TASK-095). The rule is about the write boundary rather than about any one
// command, so this crosses the whole of it against a real canvas: the three
// semantic write routes, a claim that does not stand in for the step, a line
// that is not a line, and the command line that carries it.

const repoRoot = resolve(import.meta.dir, "../../..");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
	bin: { archboard: string };
};
const executable = join(repoRoot, packageJson.bin.archboard);

interface Refusal {
	success?: boolean;
	code?: string;
	error?: string;
}

interface BoardReply {
	board?: { version: number };
}

describe.serial("doing write boundary", () => {
	test("refuses every undescribed agent write without changing the board", async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-doing-boundary-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = join(root, "vault");
		const canvas = await startOwnedCanvas({
			serverPath: join(repoRoot, "src/server.ts"),
			vault,
			env: { LOG_FILE_PATH: join(root, "canvas.log") },
		});
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);
		const boardFile = join(vault, "payments.semantic.json");

		// A create that says nothing is refused, and says how to say it: on the
		// command line, on the API, and that a claim's reason is not this.
		const silent = await request<Refusal>("/api/semantic-boards/create", {
			method: "POST",
			doing: false,
			body: { board: "payments", create: { nodes: [], edges: [] } },
		});
		expect(silent.status).toBe(400);
		expect(silent.body.code).toBe("DOING_REQUIRED");
		expect(silent.body.error).toContain("--doing");
		expect(silent.body.error).toContain("?doing=");
		expect(silent.body.error).toMatch(/overall reason/);
		expect(silent.body.error).toMatch(/step/);
		// Refused before anything was written: no file, not even an empty one.
		expect(existsSync(boardFile)).toBeFalse();

		const created = await request("/api/semantic-boards/create", {
			method: "POST",
			doing: "starting the payment path",
			body: { board: "payments", create: { nodes: [{ name: "Gateway", kind: "service" }] } },
		});
		expect(created.status).toBe(200);
		const beforeClaim = readFileSync(boardFile);

		// A claim is the overall reason and does not stand in for the step: a
		// write under one still says what it is doing, or it does not land.
		const claim = await request<{ claim?: { holder?: { reason?: string } } }>(
			"/api/semantic-boards/claim?board=payments",
			{ method: "POST", doing: false, body: { reason: "reworking the payment path" } },
		);
		expect(claim.status).toBe(200);
		expect(claim.body.claim?.holder?.reason).toBe("reworking the payment path");
		const claimedWithoutDoing = await request<Refusal>(
			"/api/semantic-boards/edit?expectVersion=1",
			{
				method: "POST",
				doing: false,
				body: { board: "payments", edit: { nodes: [{ name: "Ledger", kind: "datastore" }] } },
			},
		);
		expect(claimedWithoutDoing.status).toBe(400);
		expect(claimedWithoutDoing.body.code).toBe("DOING_REQUIRED");
		expect(claimedWithoutDoing.body.error).toMatch(/overall reason/);
		expect(readFileSync(boardFile)).toEqual(beforeClaim);
		await request("/api/semantic-boards/claim/release?board=payments", {
			method: "POST",
			doing: false,
		});

		// A line that is only whitespace says nothing, and a paragraph is not a
		// line: this goes on a wall, and the cap is said out loud.
		const whitespace = await request<Refusal>(
			"/api/semantic-boards/edit?expectVersion=1&doing=%20%20%20",
			{ method: "POST", doing: false, body: { board: "payments", edit: {} } },
		);
		expect(whitespace.status).toBe(400);
		expect(whitespace.body.code).toBe("DOING_REQUIRED");
		const paragraph = await request<Refusal>(
			`/api/semantic-boards/edit?expectVersion=1&doing=${"x".repeat(141)}`,
			{ method: "POST", doing: false, body: { board: "payments", edit: {} } },
		);
		expect(paragraph.status).toBe(400);
		expect(paragraph.body.code).toBe("DOING_REQUIRED");
		expect(paragraph.body.error).toContain("140");

		// Every write route, not just the one that happened to be tested.
		const routes: Array<[string, unknown]> = [
			["/api/semantic-boards/create", { board: "ledger", create: {} }],
			[
				"/api/semantic-boards/edit?expectVersion=1",
				{ board: "payments", edit: { nodes: [{ name: "Queue", kind: "queue" }] } },
			],
			[
				"/api/semantic-boards/branch?expectVersion=1",
				{ board: "payments", branch: { from: "current", name: "Queued ingest" } },
			],
		];
		for (const [path, body] of routes) {
			const refusal = await request<Refusal>(path, { method: "POST", doing: false, body });
			expect({ path: path.split("?")[0], status: refusal.status, code: refusal.body.code }).toEqual(
				{ path: path.split("?")[0], status: 400, code: "DOING_REQUIRED" },
			);
		}
		// Nothing any of them asked for is on the board, or in the vault.
		expect(existsSync(join(vault, "ledger.semantic.json"))).toBeFalse();
		expect(
			(await request<BoardReply>("/api/semantic-boards/board?board=payments")).body.board,
		).toMatchObject({ version: 1 });

		// And the same boundary from the command line, where the line is typed.
		const cli = (args: string[], input = "") =>
			spawnSync(executable, args, {
				encoding: "utf8",
				input,
				env: {
					...process.env,
					EXPRESS_SERVER_URL: canvas.base,
					EXCALIDRAW_NO_AUTOSTART: "1",
					ARCHBOARD_VAULT: vault,
					LOG_LEVEL: "error",
				},
			});
		const bare = cli(["semantic", "new", "orders"]);
		expect(bare.status).not.toBe(0);
		expect(`${bare.stdout}${bare.stderr}`).toMatch(/says nothing about what it is doing/);
		expect(existsSync(join(vault, "orders.semantic.json"))).toBeFalse();
		const said = cli(["semantic", "new", "orders", "--doing", "starting the orders board"]);
		expect(said.status).toBe(0);
		expect(existsSync(join(vault, "orders.semantic.json"))).toBeTrue();
		expect(cli(["help"]).stdout).toContain("--doing");
	}, 20_000);
});

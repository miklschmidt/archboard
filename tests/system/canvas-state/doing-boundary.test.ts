import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester } from "./support/http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
	bin: { archboard: string };
};
const executable = join(repoRoot, packageJson.bin.archboard);
const box = (id: string, x = 10) => ({
	id,
	type: "rectangle",
	x,
	y: 10,
	width: 60,
	height: 40,
});

interface Refusal {
	success?: boolean;
	code?: string;
	error?: string;
	count?: number;
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
		await request("/api/boards/new", { method: "POST", body: { board: "payments" } });

		const silent = await request<Refusal>("/api/elements?board=payments", {
			method: "POST",
			doing: false,
			body: box("a"),
		});
		expect(silent.status).toBe(400);
		expect(silent.body.code).toBe("DOING_REQUIRED");
		expect(silent.body.error).toContain("--doing");
		expect(silent.body.error).toContain("?doing=");
		expect(silent.body.error).toMatch(/overall reason/);
		expect(silent.body.error).toMatch(/step/);
		expect((await request<Refusal>("/api/elements?board=payments")).body.count).toBe(0);

		const whitespace = await request<Refusal>("/api/elements?board=payments&doing=%20%20%20", {
			method: "POST",
			doing: false,
			body: box("a"),
		});
		expect(whitespace.status).toBe(400);
		expect(whitespace.body.code).toBe("DOING_REQUIRED");

		const paragraph = await request<Refusal>(
			`/api/elements?board=payments&doing=${"x".repeat(141)}`,
			{ method: "POST", doing: false, body: box("a") },
		);
		expect(paragraph.status).toBe(400);
		expect(paragraph.body.code).toBe("DOING_REQUIRED");
		expect(paragraph.body.error).toContain("140");

		const routes: Array<[string, string, unknown]> = [
			["POST", "/api/elements/batch?board=payments", { elements: [box("b")] }],
			["POST", "/api/elements/changes?board=payments", { origin: "agent", upserts: [box("c")] }],
			["PUT", "/api/elements/a?board=payments", { x: 5 }],
			["DELETE", "/api/elements/clear?board=payments", undefined],
			["POST", "/api/boards/save?board=payments", {}],
			["POST", "/api/elements/from-mermaid?board=payments", { mermaidDiagram: "graph TD; A-->B;" }],
		];
		for (const [method, path, body] of routes) {
			const refusal = await request<Refusal>(path, { method, doing: false, body });
			expect({
				method,
				path: path.split("?")[0],
				status: refusal.status,
				code: refusal.body.code,
			}).toEqual({
				method,
				path: path.split("?")[0],
				status: 400,
				code: "DOING_REQUIRED",
			});
		}
		expect((await request<Refusal>("/api/elements?board=payments")).body.count).toBe(0);

		const cli = (args: string[]) =>
			spawnSync(executable, args, {
				encoding: "utf8",
				input: "",
				env: {
					...process.env,
					EXPRESS_SERVER_URL: canvas.base,
					EXCALIDRAW_NO_AUTOSTART: "1",
					ARCHBOARD_VAULT: vault,
					LOG_LEVEL: "error",
				},
			});
		const bare = cli(["add", "--board", "payments", "--one", JSON.stringify(box("d"))]);
		expect(bare.status).not.toBe(0);
		expect(`${bare.stdout}${bare.stderr}`).toMatch(/says nothing about what it is doing/);
		const said = cli([
			"add",
			"--board",
			"payments",
			"--doing",
			"adding a box from a shell",
			"--one",
			JSON.stringify(box("d", 800)),
		]);
		expect(said.status).toBe(0);
		expect(cli(["help"]).stdout).toContain("--doing");

		const human = await request<Refusal>("/api/elements/changes?board=payments", {
			method: "POST",
			doing: false,
			body: {
				clientId: "pane-human",
				upserts: [{ ...box("human"), type: "ellipse" }],
				deletes: [],
			},
		});
		expect(human.status).toBe(200);
		const save = await request<Refusal>("/api/boards/save?board=payments&clientId=pane-human", {
			method: "POST",
			doing: false,
			body: {},
		});
		const clear = await request<Refusal>("/api/elements/clear?board=payments&clientId=pane-human", {
			method: "DELETE",
			doing: false,
		});
		expect([save.status, clear.status]).toEqual([200, 200]);
	}, 20_000);
});

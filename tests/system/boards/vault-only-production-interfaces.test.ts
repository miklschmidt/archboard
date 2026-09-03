import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { parseBoardKey, renderBoardNote } from "../../../src/runtime/engine/board.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const root = mkdtempSync(join(tmpdir(), "archboard-vault-only-"));
const vault = join(root, "vault");
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;

const emptyScene = {
	type: "excalidraw",
	version: 2,
	source: "archboard",
	elements: [],
	files: {},
	appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
};

function note(board: string, declared = board): string {
	return renderBoardNote(emptyScene, null, parseBoardKey(declared));
}

function putNote(board: string, content = note(board)): string {
	const file = join(vault, `${board}.excalidraw.md`);
	writeFileSync(file, content);
	return file;
}

interface Refusal {
	code?: string;
	reason?: string;
	error?: string;
	files?: string[];
}

beforeAll(async () => {
	mkdirSync(vault);
	putNote("payments");
	putNote("payments@option-a");
	canvas = await startOwnedCanvas({ serverPath: join(repoRoot, "src/server.ts"), vault });
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	try {
		await canvas?.dispose();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

describe.serial("vault-only production interfaces", () => {
	test("uses a persisted note through representative interfaces without a browser or open step", async () => {
		const initial = await request<{
			open: Array<{ key: string }>;
			onScreen: unknown[];
		}>("/api/boards");
		expect(initial.body.open.map((entry) => entry.key)).not.toContain("payments");
		expect(initial.body.onScreen).toEqual([]);

		const reads = [
			["elements", "/api/elements?board=payments"],
			["query", "/api/elements/search?board=payments&type=rectangle"],
			["identity", "/api/boards/info?board=payments"],
			["preview", "/api/boards/preview?board=payments"],
			["export files", "/api/files?board=payments"],
		] as const;
		for (const [name, url] of reads) {
			const result = await request<{ success?: boolean }>(url);
			expect(result.status, name).toBe(200);
			expect(result.body.success, name).not.toBeFalse();
		}

		const changed = await request<{ fingerprint: { version: number } }>(
			"/api/elements?board=payments",
			{
				method: "POST",
				body: { id: "node", type: "rectangle", x: 0, y: 0, width: 120, height: 60 },
			},
		);
		expect(changed.status).toBe(200);
		const changedVersion = changed.body.fingerprint.version;

		const snapshot = await request<{ elementCount: number }>("/api/snapshots?board=payments", {
			method: "POST",
			body: { name: "vault-only" },
		});
		expect(snapshot).toMatchObject({ status: 200, body: { elementCount: 1 } });

		const imported = await request<{ fingerprint: { version: number } }>(
			"/api/elements/batch?board=payments",
			{
				method: "POST",
				body: {
					elements: [{ id: "imported", type: "ellipse", x: 20, y: 20, width: 80, height: 50 }],
					files: [],
					mutation: "replace-scene",
				},
			},
		);
		expect(imported.status).toBe(200);
		expect(imported.body.fingerprint.version).toBe(changedVersion + 1);

		const branched = await request<{ board: string; version: number; file: string }>(
			"/api/boards/save?board=payments",
			{ method: "POST", body: { name: "payments@review" } },
		);
		expect(branched).toMatchObject({
			status: 200,
			body: { board: "payments@review", version: 1 },
		});
		expect(readFileSync(branched.body.file, "utf8")).toContain("board: payments");

		const comparison = await request<{ success: boolean; from: { board: string } }>(
			"/api/boards/compare?from=payments&to=payments@review",
		);
		expect(comparison).toMatchObject({
			status: 200,
			body: { success: true, from: { board: "payments" } },
		});

		const inspection = spawnSync(
			"timeout",
			[
				"--signal=TERM",
				"--kill-after=5s",
				"20s",
				join(repoRoot, "bin/canvas"),
				"check",
				"--board",
				"payments",
			],
			{
				cwd: repoRoot,
				encoding: "utf8",
				env: { ...process.env, ARCHBOARD_VAULT: vault, EXCALIDRAW_NO_AUTOSTART: "1" },
			},
		);
		expect(inspection.status, inspection.stderr).toBe(0);
		expect(JSON.parse(inspection.stdout)).toMatchObject({ board: "payments" });
	});

	test("creates the canonical empty note without changing pane state", async () => {
		const before = await request<{ panes: unknown[] }>("/api/panes");
		const created = await request<{
			board: string;
			file: string;
			version: number;
			created: boolean;
			saved: boolean;
			pane?: unknown;
		}>("/api/boards/new", {
			method: "POST",
			body: { board: "Created", level: "service", pane: "right" },
		});
		expect(created).toMatchObject({
			status: 200,
			body: { board: "created", created: true, saved: true, version: 1 },
		});
		expect(created.body.pane).toBeUndefined();
		expect(readFileSync(created.body.file, "utf8")).toMatch(
			/^---[\s\S]*^board: Created$[\s\S]*^version: 1$/m,
		);
		expect(
			readdirSync(vault).some(
				(name) => name.includes("Created.excalidraw.md.") && name.endsWith(".tmp"),
			),
		).toBeFalse();
		expect(await request("/api/panes")).toEqual(before);
	});

	test("returns one browser-independent resolution refusal family", async () => {
		putNote("Case", note("Case"));
		putNote("case", note("case"));
		putNote("conflict", note("conflict", "other"));
		putNote("broken", note("broken").replace('"elements": []', '"elements":'));

		const cases = [
			["missing", "/api/elements?board=absent", "missing"],
			["ambiguous", "/api/elements?board=case", "ambiguous"],
			["malformed address", "/api/elements?board=../escape", "malformed"],
			["malformed note", "/api/elements?board=broken", "malformed"],
			["conflicting", "/api/elements?board=conflict", "conflicting"],
		] as const;
		for (const [name, url, reason] of cases) {
			const result = await request<Refusal>(url);
			expect(result.status, name).toBeGreaterThanOrEqual(400);
			expect(result.body, name).toMatchObject({
				code: "BOARD_RESOLUTION_FAILED",
				reason,
			});
			expect(result.body.error, name).not.toMatch(/open (?:a )?pane|open it first/i);
		}
	});

	test("preserves first-write version and foreign-write conflict semantics", async () => {
		putNote("conflict-write");
		const first = await request<{ fingerprint: { version: number } }>(
			"/api/elements?board=conflict-write",
			{
				method: "POST",
				body: { id: "first", type: "rectangle", x: 0, y: 0, width: 40, height: 40 },
			},
		);
		expect(first.body.fingerprint.version).toBe(1);
		const info = await request<{ file: string }>("/api/boards/info?board=conflict-write");
		const foreign = `${readFileSync(info.body.file, "utf8")}\n<!-- foreign -->\n`;
		writeFileSync(info.body.file, foreign);
		const refused = await request<Refusal>("/api/elements?board=conflict-write", {
			method: "POST",
			body: { id: "late", type: "ellipse", x: 0, y: 0, width: 20, height: 20 },
		});
		expect(refused.status).toBe(409);
		expect(readFileSync(info.body.file, "utf8")).toBe(foreign);
		await request("/api/boards/open", {
			method: "POST",
			body: { board: "conflict-write", reload: true },
		});
	});
});

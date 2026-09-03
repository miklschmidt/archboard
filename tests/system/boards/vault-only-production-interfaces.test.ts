import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { listBoards, parseBoardKey, renderBoardNote } from "../../../src/runtime/engine/board.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const root = mkdtempSync(join(tmpdir(), "archboard-vault-only-"));
const vault = join(root, "vault");
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
const additionalCanvases: OwnedCanvas[] = [];

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

function runCli(
	args: string[],
	options: { input?: string; expectedStatus?: number } = {},
): { stdout: string; stderr: string } {
	const result = spawnSync(
		"timeout",
		["--signal=TERM", "--kill-after=5s", "20s", join(repoRoot, "bin/canvas"), ...args],
		{
			cwd: repoRoot,
			encoding: "utf8",
			input: options.input,
			env: {
				...process.env,
				ARCHBOARD_VAULT: vault,
				EXPRESS_SERVER_URL: canvas.base,
				EXCALIDRAW_NO_AUTOSTART: "1",
			},
		},
	);
	expect(result.status, result.stderr).toBe(options.expectedStatus ?? 0);
	return { stdout: result.stdout, stderr: result.stderr };
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
		await Promise.allSettled([
			canvas.dispose(),
			...additionalCanvases.map((owned) => owned.dispose()),
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

describe.serial("vault-only production interfaces", () => {
	test("completes the named-board production workflow with zero browser clients and no open step", async () => {
		const healthBefore = await request<{ websocket_clients: number }>("/health");
		expect(healthBefore.body.websocket_clients).toBe(0);
		const initial = await request<{
			boards: Array<{ key: string }>;
		}>("/api/boards");
		expect(initial.body.boards.map((entry) => entry.key)).toContain("payments");
		expect(initial.body).not.toHaveProperty("open");
		expect(initial.body).not.toHaveProperty("onScreen");

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
		const afterReads = await request<{ boards: Array<{ key: string }> }>("/api/boards");
		expect(afterReads.body.boards.map((entry) => entry.key)).toContain("payments");
		expect(afterReads.body).not.toHaveProperty("open");
		expect(afterReads.body).not.toHaveProperty("onScreen");

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

		const comparison = await request<{
			success: boolean;
			from: { board: string };
			to: { board: string };
		}>("/api/boards/compare?from=payments&to=payments@review");
		expect(comparison).toMatchObject({
			status: 200,
			body: { success: true, from: { board: "payments" } },
		});
		for (const side of [comparison.body.from, comparison.body.to]) {
			expect(side).not.toHaveProperty("source");
			expect(side).not.toHaveProperty("onScreen");
			expect(side).not.toHaveProperty("loadedAt");
		}

		const workflowBoard = "zero-client-workflow";
		expect(
			JSON.parse(runCli(["board", "new", workflowBoard, "--level", "service"]).stdout),
		).toMatchObject({
			board: workflowBoard,
			created: true,
		});
		const crossingElements = [
			{
				id: "left",
				type: "rectangle",
				x: 1_000,
				y: 100,
				width: 100,
				height: 80,
				label: { text: "Left" },
			},
			{
				id: "right",
				type: "rectangle",
				x: 1_250,
				y: 100,
				width: 100,
				height: 80,
				label: { text: "Right" },
			},
			{
				id: "route",
				type: "arrow",
				x: 1_100,
				y: 140,
				points: [
					[0, 0],
					[150, 0],
				],
				start: { id: "left" },
				end: { id: "right" },
			},
			{
				id: "crossh",
				type: "line",
				x: 600,
				y: 500,
				points: [
					[0, 0],
					[200, 0],
				],
			},
			{
				id: "crossv",
				type: "line",
				x: 700,
				y: 440,
				points: [
					[0, 0],
					[0, 120],
				],
			},
		];
		const added = JSON.parse(
			runCli(["add", "--board", workflowBoard, "--doing", "drawing the inspected path"], {
				input: JSON.stringify(crossingElements),
			}).stdout,
		) as { elements: unknown[] };
		expect(added.elements.length).toBeGreaterThanOrEqual(crossingElements.length);

		const converted = JSON.parse(
			runCli(["mermaid", "--board", workflowBoard, "--doing", "adding the service flow"], {
				input: "graph LR; Client --> API; API --> Store;",
			}).stdout,
		) as { board: string; count: number };
		expect(converted).toMatchObject({ board: workflowBoard });
		expect(converted.count).toBeGreaterThan(0);

		const artifacts = join(root, "zero-client-artifacts");
		mkdirSync(artifacts);
		const png = join(artifacts, "board.png");
		const svg = join(artifacts, "board.svg");
		expect(
			JSON.parse(runCli(["render", "--board", workflowBoard, "--out", png]).stdout),
		).toMatchObject({ board: workflowBoard, format: "png", file: png });
		expect(
			JSON.parse(
				runCli(["render", "--board", workflowBoard, "--out", svg, "--format", "svg"]).stdout,
			),
		).toMatchObject({ board: workflowBoard, format: "svg", file: svg });
		expect(readFileSync(png).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
		expect(readFileSync(svg, "utf8")).toContain("<svg");

		const inspection = JSON.parse(runCli(["check", "--board", workflowBoard]).stdout) as {
			board: string;
			findings: Array<{ focusBBox?: unknown }>;
		};
		expect(inspection.board).toBe(workflowBoard);
		expect(inspection.findings.some((finding) => finding.focusBBox !== undefined)).toBeTrue();
		const findingDirectory = join(artifacts, "findings");
		mkdirSync(findingDirectory);
		const findings = JSON.parse(
			runCli(["render-findings", "--board", workflowBoard, "--out", findingDirectory]).stdout,
		) as { board: string; entries: Array<{ status: string }> };
		expect(findings.board).toBe(workflowBoard);
		expect(
			findings.entries.some((entry) => entry.status === "rendered"),
			JSON.stringify(findings),
		).toBeTrue();

		expect(
			JSON.parse(runCli(["snapshot", "save", "before-review", "--board", workflowBoard]).stdout),
		).toMatchObject({ name: "before-review" });
		const branch = `${workflowBoard}@review`;
		expect(
			JSON.parse(
				runCli([
					"board",
					"save",
					"--board",
					workflowBoard,
					"--variant",
					"review",
					"--doing",
					"branching the review",
				]).stdout,
			),
		).toMatchObject({ board: branch, savedFrom: workflowBoard });
		const exported = join(artifacts, "review.excalidraw");
		expect(
			JSON.parse(runCli(["export", "--board", branch, "--out", exported]).stdout),
		).toMatchObject({ file: exported });
		expect(JSON.parse(readFileSync(exported, "utf8"))).toMatchObject({ type: "excalidraw" });
		const description = runCli(["describe", "--board", branch]).stdout;
		expect(description).toContain("Client");
		const finalNote = readFileSync(join(vault, `${branch}.excalidraw.md`), "utf8");
		expect(finalNote).toContain(`variant: review`);
		expect(finalNote).toContain("Client");

		const healthAfter = await request<{ websocket_clients: number }>("/health");
		expect(healthAfter.body.websocket_clients).toBe(0);
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
			body: { board: "Created", level: "service" },
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

		const retiredPane = await request<Refusal>("/api/boards/new", {
			method: "POST",
			body: { board: "RetiredPane", pane: "right" },
		});
		expect(retiredPane.status).toBe(400);
		expect(retiredPane.body.error).toContain('Unrecognized key: "pane"');
		expect(listBoards(vault).some((entry) => entry.key === "retiredpane")).toBeFalse();
	});

	test("keeps browser-session state out of board inventory", async () => {
		putNote("read-then-open");
		expect((await request("/api/elements?board=read-then-open")).status).toBe(200);
		const beforeOpen = await request<{ boards: Array<{ key: string }> }>("/api/boards");
		expect(beforeOpen.body.boards.map((entry) => entry.key)).toContain("read-then-open");
		expect(beforeOpen.body).not.toHaveProperty("open");
		expect(beforeOpen.body).not.toHaveProperty("onScreen");
		const opened = await request<{ source: string }>("/api/boards/open", {
			method: "POST",
			body: { board: "read-then-open" },
		});
		expect(opened).toMatchObject({ status: 200, body: { source: "vault" } });
		const afterOpen = await request<{ boards: Array<{ key: string }> }>("/api/boards");
		expect(afterOpen.body.boards).toEqual(beforeOpen.body.boards);
		expect(afterOpen.body).not.toHaveProperty("open");
		expect(afterOpen.body).not.toHaveProperty("onScreen");
	});

	test("serializes normalized creation and establishes a waiting baseline under lock", async () => {
		const other = await startOwnedCanvas({ serverPath: join(repoRoot, "src/server.ts"), vault });
		additionalCanvases.push(other);
		const otherRequest = createJsonRequester(other);
		for (const [first, second, key] of [
			["CaseRace", "caserace", "caserace"],
			["Cafe\u0301", "Café", "café"],
		] as const) {
			const outcomes = await Promise.all([
				request("/api/boards/new", { method: "POST", body: { board: first } }),
				otherRequest("/api/boards/new", { method: "POST", body: { board: second } }),
			]);
			expect(outcomes.map((outcome) => outcome.status).toSorted()).toEqual([200, 409]);
			expect(listBoards(vault).filter((entry) => entry.key === key)).toHaveLength(1);
		}

		putNote("waited-write");
		const waiterOpened = await otherRequest<{ source: string }>("/api/boards/open", {
			method: "POST",
			body: { board: "waited-write" },
		});
		expect(waiterOpened).toMatchObject({ status: 200, body: { source: "vault" } });
		const held = await request("/api/boards/hold?board=waited-write", {
			method: "POST",
			body: { clientId: "baseline-holder" },
		});
		expect(held.status).toBe(200);
		const waiting = otherRequest<{ fingerprint?: { version: number }; code?: string }>(
			"/api/elements?board=waited-write",
			{
				method: "POST",
				body: { id: "waiter", type: "rectangle", x: 60, y: 0, width: 40, height: 40 },
			},
		);
		let admitted = false;
		for (let attempt = 0; attempt < 100 && !admitted; attempt += 1) {
			const health = await otherRequest<{
				application: { activeMutations: Array<{ name: string }> };
			}>("/health");
			admitted = health.body.application.activeMutations.some((entry) =>
				entry.name.includes("board-lock wait"),
			);
		}
		expect(admitted).toBeTrue();
		const holderWrite = await request<{ fingerprint: { version: number } }>(
			"/api/elements?board=waited-write",
			{
				method: "POST",
				body: {
					id: "holder",
					type: "rectangle",
					x: 0,
					y: 0,
					width: 40,
					height: 40,
					clientId: "baseline-holder",
				},
			},
		);
		expect(holderWrite.body.fingerprint.version).toBe(1);
		await request("/api/boards/hold/release?board=waited-write", {
			method: "POST",
			body: { clientId: "baseline-holder" },
		});
		const waited = await waiting;
		expect(waited).toMatchObject({ status: 200, body: { fingerprint: { version: 2 } } });
		const document = await otherRequest<{ elements: Array<{ id: string }> }>(
			"/api/elements?board=waited-write",
		);
		expect(document.body.elements.map((element) => element.id).toSorted()).toEqual([
			"holder",
			"waiter",
		]);
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

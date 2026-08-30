import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";

interface PreviewBody {
	success: boolean;
	board?: string;
	fingerprint?: string;
	elements?: Array<{
		id: string;
		type: string;
		link?: string | null;
		customData?: {
			archboard?: { binding?: { repo: string; path: string; branch?: string; commit?: string } };
		};
	}>;
	files?: Record<string, unknown>;
	code?: string;
	error?: string;
}

interface BoardsBody {
	open: Array<{ key: string }>;
}

interface BoardBody {
	file?: string;
}

interface HealthBody {
	boards_open: number;
	websocket_clients: number;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-board-preview-"));
const vault = path.join(fixtureRoot, "vault");
const checkout = path.join(fixtureRoot, "checkout");
const registry = path.join(fixtureRoot, "state", "repos.json");
const repository = "github.com/acme/preview-fixture";
const binding = { repo: repository, path: "src/index.ts", branch: "main" } as const;
const humanLink = "https://human.example/architecture";
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
let alphaFile = "";

beforeAll(async () => {
	fs.mkdirSync(vault, { recursive: true });
	fs.mkdirSync(path.join(checkout, "src"), { recursive: true });
	fs.mkdirSync(path.dirname(registry), { recursive: true });
	fs.writeFileSync(path.join(checkout, "src", "index.ts"), "export {};\n");
	for (const args of [
		["init", "-q"],
		["remote", "add", "origin", `https://${repository}.git`],
	]) {
		const result = Bun.spawnSync(["git", ...args], { cwd: checkout, stderr: "pipe" });
		if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	}
	fs.writeFileSync(
		registry,
		JSON.stringify([
			{ repo: repository, root: checkout, source: "declared", addedAt: "2026-01-01" },
		]),
	);
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
		env: { ARCHBOARD_REPOS: registry },
	});
	request = createJsonRequester(canvas);
	expect(
		(await request("/api/boards/new", { method: "POST", body: { board: "alpha" } })).status,
	).toBe(200);
	expect(
		(
			await request("/api/elements?board=alpha", {
				method: "POST",
				body: {
					id: "alpha-box",
					type: "rectangle",
					x: 20,
					y: 30,
					width: 180,
					height: 90,
					link: humanLink,
					customData: { archboard: { binding } },
				},
			})
		).status,
	).toBe(200);
	const saved = await request<BoardBody>("/api/boards/save?board=alpha", { method: "POST" });
	expect(saved.status).toBe(200);
	alphaFile = saved.body.file ?? "";
	expect(alphaFile).not.toBe("");
	await canvas.restart();
});

afterAll(async () => {
	await canvas?.dispose();
	fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

function expectPortableBinding(preview: PreviewBody): void {
	expect(preview.elements?.[0]?.customData?.archboard?.binding).toEqual(binding);
	expect(preview.elements?.[0]?.link).toBe(humanLink);
	const json = JSON.stringify(preview);
	expect(json).not.toContain(checkout);
	expect(json).not.toContain("file://");
	expect(json).not.toContain("/api/code-targets/open");
	expect(json).not.toContain("opaque:");
}

describe("read-only board preview", () => {
	test("reads a vault-only canonical scene without opening, focusing, claiming or writing it", async () => {
		const noteBefore = fs.readFileSync(alphaFile);
		const modifiedBefore = fs.statSync(alphaFile).mtimeMs;
		const listingBefore = (await request<BoardsBody>("/api/boards")).body;
		const healthBefore = (await request<HealthBody>("/health")).body;
		const locksBefore = fs.existsSync(path.join(vault, ".archboard", "locks"))
			? fs.readdirSync(path.join(vault, ".archboard", "locks"))
			: [];

		const preview = await request<PreviewBody>("/api/boards/preview?board=alpha");
		expect(preview.status).toBe(200);
		expect(preview.body).toMatchObject({
			success: true,
			board: "alpha",
			files: {},
			elements: [{ id: "alpha-box", type: "rectangle" }],
		});
		expect(preview.body.fingerprint).toMatch(/^[a-f\d]{64}$/);
		expectPortableBinding(preview.body);

		const listingAfter = (await request<BoardsBody>("/api/boards")).body;
		const healthAfter = (await request<HealthBody>("/health")).body;
		const locksAfter = fs.existsSync(path.join(vault, ".archboard", "locks"))
			? fs.readdirSync(path.join(vault, ".archboard", "locks"))
			: [];
		expect(listingAfter.open).toEqual(listingBefore.open);
		expect(healthAfter.boards_open).toBe(healthBefore.boards_open);
		expect(healthAfter.websocket_clients).toBe(healthBefore.websocket_clients);
		expect(locksAfter).toEqual(locksBefore);
		expect(fs.readFileSync(alphaFile)).toEqual(noteBefore);
		expect(fs.statSync(alphaFile).mtimeMs).toBe(modifiedBefore);
	});

	test("invalidates the fingerprint from current open content", async () => {
		const cold = await request<PreviewBody>("/api/boards/preview?board=alpha");
		expect(
			(await request("/api/boards/open", { method: "POST", body: { board: "alpha" } })).status,
		).toBe(200);
		const opened = await request<PreviewBody>("/api/boards/preview?board=alpha");
		expect(opened.status).toBe(200);
		expectPortableBinding(opened.body);
		expect(
			(
				await request("/api/elements?board=alpha", {
					method: "POST",
					body: { id: "alpha-note", type: "text", x: 50, y: 150, text: "changed" },
				})
			).status,
		).toBe(200);
		const changed = await request<PreviewBody>("/api/boards/preview?board=alpha");
		expect(changed.status).toBe(200);
		expect(changed.body.elements?.map((element) => element.type)).toEqual(["rectangle", "text"]);
		expect(changed.body.fingerprint).not.toBe(cold.body.fingerprint);
	});

	test("returns explicit empty, unavailable and missing states without leaking a vault path", async () => {
		const scratch = await request<PreviewBody>("/api/boards/preview?board=scratch");
		expect(scratch.status).toBe(200);
		expect(scratch.body).toMatchObject({
			success: true,
			board: "scratch",
			elements: [],
			files: {},
		});

		const malformedFile = path.join(vault, "malformed.excalidraw.md");
		fs.writeFileSync(
			malformedFile,
			'---\nboard: malformed\nvariant: current\n---\n\n# Excalidraw Data\n\n%%\n## Drawing\n```json\n{"type":"excalidraw","version":2,"elements":[{"id":"bad","type":"rectangle"}],"appState":{}}\n```\n%%\n',
		);
		const malformed = await request<PreviewBody>("/api/boards/preview?board=malformed");
		expect(malformed.status).toBe(422);
		expect(malformed.body).toMatchObject({
			success: false,
			code: "BOARD_PREVIEW_UNAVAILABLE",
			error: 'Preview unavailable for board "malformed".',
		});
		expect(malformed.body.error).not.toContain(vault);

		const missing = await request<PreviewBody>("/api/boards/preview?board=absent");
		expect(missing.status).toBe(404);
		expect(missing.body.code).toBe("BOARD_PREVIEW_NOT_FOUND");
	});
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { inspectBoard } from "../../../src/runtime/board-inspection/index.ts";
import { makeIdentity, renderBoardNote, vaultPathFor } from "../../../src/runtime/engine/board.ts";
import type { ServerElement } from "../../../src/runtime/engine/types.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import {
	openTestPane,
	type PaneMessage,
	type TestPane,
	waitForPaneMessage,
} from "./support/pane-websocket.ts";

interface FindingMessage extends PaneMessage {
	sourceBoard?: string;
	elements?: ServerElement[];
	files?: Record<string, { dataURL?: string }>;
	findings?: Array<{ findingIndex: number; focusBBox: unknown }>;
}

interface FindingExport {
	sourceFingerprint?: string;
	sourceRenderable?: boolean;
	report?: { coverage?: string };
	results?: Array<{ findingIndex: number; data?: string; failure?: string }>;
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-pane-addressing-findings-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;
let left: TestPane;
let right: TestPane;
const findingElements = [
	{
		id: "fone",
		type: "text",
		x: 20,
		y: 40,
		width: 100,
		height: 20,
		text: "First",
		fontFamily: 99,
		fontSize: 20,
		isDeleted: false,
	},
	{
		id: "ftwo",
		type: "text",
		x: 240,
		y: 80,
		width: 80,
		height: 20,
		text: "Second",
		fontFamily: 99,
		fontSize: 20,
		isDeleted: false,
	},
	{
		id: "fimage",
		type: "image",
		x: 500,
		y: 600,
		width: 32,
		height: 32,
		fileId: "finding-file",
		isDeleted: false,
	},
] as unknown as ServerElement[];

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
	});
	request = createJsonRequester(canvas);
	const findingIdentity = makeIdentity({ board: "finding-source" });
	fs.writeFileSync(
		vaultPathFor(findingIdentity, vault),
		renderBoardNote(
			{
				type: "excalidraw",
				version: 2,
				elements: findingElements,
				appState: {},
				files: {
					"finding-file": {
						id: "finding-file",
						mimeType: "image/png",
						dataURL: "data:image/png;base64,UElYRUw=",
						created: 1,
					},
				},
			},
			null,
			findingIdentity,
		),
	);
	const unrenderableIdentity = makeIdentity({ board: "finding-unrenderable" });
	const unrenderable = renderBoardNote(
		{
			type: "excalidraw",
			version: 2,
			elements: [{ id: "safe", type: "rectangle", x: 10, y: 20, width: 40, height: 30 }],
			appState: {},
			files: {},
		},
		null,
		unrenderableIdentity,
	).replace(/"id"\s*:\s*"safe"/, '"id":""');
	fs.writeFileSync(vaultPathFor(unrenderableIdentity, vault), unrenderable);
	left = await openTestPane(canvas.base, request, "finding-left", 0, {
		primary: true,
		focused: true,
	});
	right = await openTestPane(canvas.base, request, "finding-right", 640);
});

afterAll(async () => {
	await Promise.all([left.close(), right.close()]);
	await canvas?.dispose();
});

function inspectionFingerprint(board: string): string {
	const source =
		'import { readBoardInspectionSnapshot } from "./src/runtime/engine/board-io.ts";' +
		"console.log(readBoardInspectionSnapshot(process.env.ARCHBOARD_TEST_BOARD).fingerprint);";
	const child = Bun.spawnSync([process.execPath, "-e", source], {
		cwd: repoRoot,
		env: { ...process.env, ARCHBOARD_VAULT: vault, ARCHBOARD_TEST_BOARD: board },
	});
	if (child.exitCode !== 0) throw new Error(child.stderr.toString());
	return child.stdout.toString().trim();
}

describe("pane finding addressing", () => {
	test("correlates focused findings without adopting their off-screen board", async () => {
		const report = inspectBoard(findingElements);
		const leftBoard = left.board();
		const leftStart = left.since();
		const rightStart = right.since();
		const pending = request<FindingExport>("/api/export/findings?board=finding-source", {
			method: "POST",
			body: { policy: {} },
		});
		const message = (await waitForPaneMessage(left, leftStart, "export_findings_request")) as
			| FindingMessage
			| undefined;
		expect(message).toMatchObject({
			sourceBoard: "finding-source",
			elements: findingElements,
			files: { "finding-file": { dataURL: "data:image/png;base64,UElYRUw=" } },
		});
		expect(message?.findings).toEqual(
			report.findings.map((finding, findingIndex) => ({
				findingIndex,
				focusBBox: finding.focusBBox,
			})),
		);
		expect(left.board()).toBe(leftBoard);
		expect(
			left.seen
				.slice(leftStart)
				.every((entry) => entry.type !== "initial_elements" && entry.type !== "board_switched"),
		).toBeTrue();
		expect(
			right.seen.slice(rightStart).every((entry) => entry.type !== "export_findings_request"),
		).toBeTrue();

		const first = await request("/api/export/findings/result", {
			method: "POST",
			body: { requestId: message?.requestId, findingIndex: 0, data: "Zmlyc3Q=" },
		});
		const duplicate = await request("/api/export/findings/result", {
			method: "POST",
			body: { requestId: message?.requestId, findingIndex: 0, data: "ZHVwbGljYXRl" },
		});
		const outside = await request("/api/export/findings/result", {
			method: "POST",
			body: { requestId: message?.requestId, findingIndex: 99, data: "d3Jvbmc=" },
		});
		await request("/api/export/findings/result", {
			method: "POST",
			body: { requestId: message?.requestId, findingIndex: 1, error: "synthetic failure" },
		});
		expect(first.status).toBe(200);
		expect(duplicate.status).toBe(409);
		expect(outside.status).toBe(400);
		const exported = await pending;
		expect(exported.status).toBe(200);
		expect(exported.body.sourceFingerprint).toBe(inspectionFingerprint("finding-source"));
		expect(exported.body.results).toEqual([
			{ findingIndex: 0, data: "Zmlyc3Q=" },
			{ findingIndex: 1, failure: "browser-export-failed" },
		]);

		const unrenderableStart = left.since();
		const unrenderable = await request<FindingExport>(
			"/api/export/findings?board=finding-unrenderable",
			{ method: "POST", body: { policy: {} } },
		);
		expect(unrenderable.status).toBe(200);
		expect(unrenderable.body).toMatchObject({
			sourceRenderable: false,
			report: { coverage: "indeterminate" },
			results: [],
		});
		expect(
			left.seen.slice(unrenderableStart).every((entry) => entry.type !== "export_findings_request"),
		).toBeTrue();
	});
});

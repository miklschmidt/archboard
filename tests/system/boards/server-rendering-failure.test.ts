import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";
import { TEST_BOARD_RENDERING_CASE_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";

const root = resolve(import.meta.dir, "../../..");
const vault = mkdtempSync(join(tmpdir(), "archboard-server-rendering-failure-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;

beforeAll(async () => {
	copyFileSync(
		join(root, "docs/design/server-rendering-boundary-fixtures/board.excalidraw.md"),
		join(vault, "render-proof.excalidraw.md"),
	);
	canvas = await startOwnedCanvas({
		serverPath: join(root, "src/server.ts"),
		vault,
		env: { ARCHBOARD_RENDERER_CHROMIUM: join(vault, "missing-chromium") },
	});
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	await canvas?.dispose();
});

describe("server renderer failure", () => {
	test(
		"returns an actionable public failure and keeps no renderer resources",
		async () => {
			const failed = await request<{ code?: string; error?: string }>(
				"/api/render/board?board=render-proof",
				{ method: "POST", body: { format: "png" } },
			);
			expect(failed.status).toBe(503);
			expect(failed.body.code).toBe("BOARD_RENDERER_FAILED");
			expect(failed.body.error).toContain("requires the local chromium executable");
			const health = await request<{
				renderer: {
					active: boolean;
					queued: number;
					chromiumPid: number | null;
					profile: string | null;
				};
			}>("/health");
			expect(health.body.renderer).toMatchObject({
				active: false,
				queued: 0,
				chromiumPid: null,
				profile: null,
			});
		},
		TEST_BOARD_RENDERING_CASE_TIMEOUT_MS,
	);
});

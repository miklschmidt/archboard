import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { TEST_SERVER_RENDERING_FAILURE_CASE_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import type { OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";

const { join } = path;
const root = path.resolve(import.meta.dir, "../../..");
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
	await canvas.dispose();
});

describe("server renderer failure", () => {
	test(
		"returns an actionable public failure and keeps no Chromium resources",
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
					chromiumStarts: number;
					chromiumPid: number | null;
					tempRoot: string | null;
					profile: string | null;
					fixturePort: number | null;
				};
			}>("/health");
			expect(health.body.renderer).toMatchObject({
				active: false,
				queued: 0,
				chromiumStarts: 0,
				chromiumPid: null,
				tempRoot: null,
				profile: null,
			});
			const { fixturePort } = health.body.renderer;
			if (fixturePort === null) {
				throw new Error("The failed renderer did not expose its fixture port.");
			}
			await canvas.dispose();
			let probe: ReturnType<typeof Bun.serve> | null = null;
			try {
				probe = Bun.serve({
					hostname: "127.0.0.1",
					port: fixturePort,
					fetch: () => new Response("released"),
				});
				expect(probe.port).toBe(fixturePort);
			} finally {
				if (probe !== null) {
					await probe.stop(true);
				}
			}
		},
		TEST_SERVER_RENDERING_FAILURE_CASE_TIMEOUT_MS,
	);
});

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { TEST_BOARD_RENDERER_FIXTURE_TIMEOUT_MS } from "../../../shared/timing/timing.ts";
import { createRendererFixture } from "../index.ts";

const rendererEntry = resolve(import.meta.dir, "../../../../dist/frontend/renderer.html");

test(
	"the renderer fixture serves only its entry and canonical built assets",
	async () => {
		const rendererHtml = readFileSync(rendererEntry, "utf8");
		const asset = rendererHtml.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
		if (!asset) throw new Error("The built renderer entry names no runtime asset.");
		const fixture = await createRendererFixture();
		try {
			for (const [path, status] of [
				["/renderer.html", 200],
				[asset, 200],
				["/assets/%2e%2e/index.html", 404],
				["/assets/%252e%252e%252findex.html", 404],
				["/assets/", 404],
				["/index.html", 404],
			] as const) {
				const response = await fetch(`http://127.0.0.1:${fixture.port}${path}`);
				expect(response.status, path).toBe(status);
			}
		} finally {
			await fixture.close();
		}
		expect(fixture.listening()).toBeFalse();
	},
	TEST_BOARD_RENDERER_FIXTURE_TIMEOUT_MS,
);

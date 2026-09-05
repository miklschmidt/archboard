import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { TEST_BOARD_RENDERER_FIXTURE_TIMEOUT_MS } from "../../../shared/timing/timing.ts";
import { createRendererFixture, RendererFixtureError } from "../index.ts";

const rendererEntry = resolve(import.meta.dir, "../../../../dist/frontend/renderer.html");

async function expectPortReleased(port: number): Promise<void> {
	let probe: ReturnType<typeof Bun.serve> | null = null;
	try {
		probe = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("released") });
		expect(probe.port).toBe(port);
	} finally {
		if (probe) {
			await probe.stop(true);
		}
	}
}

function writeBuild(
	root: string,
	name: string,
	options: { entryTarget?: string; assetsTarget?: string } = {},
): string {
	const buildRoot = join(root, name);
	mkdirSync(buildRoot);
	if (options.entryTarget) {
		symlinkSync(options.entryTarget, join(buildRoot, "renderer.html"));
	} else {
		writeFileSync(
			join(buildRoot, "renderer.html"),
			'<script type="module" src="/assets/app.js"></script>',
		);
	}
	if (options.assetsTarget) {
		symlinkSync(options.assetsTarget, join(buildRoot, "assets"));
	} else {
		mkdirSync(join(buildRoot, "assets"));
		writeFileSync(join(buildRoot, "assets/app.js"), "export const built = true;\n");
	}
	return buildRoot;
}

test(
	"the renderer fixture serves only canonical built targets",
	async () => {
		const rendererHtml = readFileSync(rendererEntry, "utf8");
		const asset = rendererHtml.match(/(?:src|href)="(\/assets\/[^"]+)"/)?.[1];
		if (!asset) {
			throw new Error("The built renderer entry names no runtime asset.");
		}
		const fixture = await createRendererFixture();
		const port = fixture.port;
		try {
			for (const [label, path, status] of [
				["built entry", "/renderer.html", 200],
				["built asset", asset, 200],
				["encoded input normalized to the entry", "/assets/%2e%2e/renderer.html", 200],
				["encoded input normalized outside the allowlist", "/assets/%2e%2e/index.html", 404],
				["encoded separators resolving outside assets", "/assets/%2e%2e%2findex.html", 404],
				["double-encoded input with no canonical target", "/assets/%252e%252e%252findex.html", 404],
				["asset directory", "/assets/", 404],
				["unrelated target", "/index.html", 404],
			] as const) {
				const response = await fetch(`http://127.0.0.1:${fixture.port}${path}`);
				expect(response.status, label).toBe(status);
			}
		} finally {
			await fixture.close();
		}
		expect(fixture.listening()).toBeFalse();
		await expectPortReleased(port);
	},
	TEST_BOARD_RENDERER_FIXTURE_TIMEOUT_MS,
);

test(
	"the renderer fixture rejects top-level canonical escapes before listening",
	async () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-renderer-fixture-escape-"));
		try {
			const outsideEntry = join(root, "outside.html");
			writeFileSync(outsideEntry, "outside entry");
			const outsideAssets = join(root, "outside-assets");
			mkdirSync(outsideAssets);
			writeFileSync(join(outsideAssets, "app.js"), "outside asset");
			for (const [description, buildRoot] of [
				["entry", writeBuild(root, "entry-escape", { entryTarget: outsideEntry })],
				["asset directory", writeBuild(root, "assets-escape", { assetsTarget: outsideAssets })],
			] as const) {
				let listened = false;
				const outcome = await createRendererFixture({
					buildRoot,
					afterListen: () => {
						listened = true;
					},
				}).catch((error: unknown): Error =>
					error instanceof Error ? error : new Error(String(error)),
				);
				if (!(outcome instanceof Error)) {
					await outcome.close();
					throw new Error(`The renderer fixture accepted the escaping ${description}.`);
				}
				const failure = outcome;
				expect(failure).toBeInstanceOf(RendererFixtureError);
				expect(failure).toHaveProperty("code", "RENDERER_FIXTURE_INVALID_BUILD");
				expect(failure).toHaveProperty("message", expect.stringContaining(description));
				expect(failure).toHaveProperty("message", expect.stringContaining("resolves outside"));
				expect(listened).toBeFalse();
			}
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
	TEST_BOARD_RENDERER_FIXTURE_TIMEOUT_MS,
);

test(
	"the renderer fixture refuses an inner asset symlink escape",
	async () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-renderer-fixture-inner-"));
		try {
			const buildRoot = writeBuild(root, "build");
			const outsideAsset = join(root, "outside.js");
			writeFileSync(outsideAsset, "outside asset");
			symlinkSync(outsideAsset, join(buildRoot, "assets/escape.js"));
			const fixture = await createRendererFixture({ buildRoot });
			const port = fixture.port;
			try {
				expect((await fetch(`${fixture.url}`)).status).toBe(200);
				expect((await fetch(`http://127.0.0.1:${port}/assets/app.js`)).status).toBe(200);
				expect((await fetch(`http://127.0.0.1:${port}/assets/%61pp.js`)).status).toBe(200);
				expect((await fetch(`http://127.0.0.1:${port}/assets/escape.js`)).status).toBe(404);
			} finally {
				await fixture.close();
			}
			expect(fixture.listening()).toBeFalse();
			await expectPortReleased(port);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	},
	TEST_BOARD_RENDERER_FIXTURE_TIMEOUT_MS,
);

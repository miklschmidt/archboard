import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createCliHttpDouble } from "./support/cli-http-double.ts";
import { createPackageCliOwner, packageFailure } from "./support/package-cli.ts";

const objectSchema = z.record(z.string(), z.unknown());
const parse = (text: string) => objectSchema.parse(JSON.parse(text));
const element = { id: "shape1", type: "rectangle", x: 0, y: 0, width: 100, height: 80 };

describe("package import and replacement", () => {
	test("resolves imports from the caller cwd and writes once", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
			writeFileSync(
				join(owner.outside, "contract.excalidraw"),
				JSON.stringify({ type: "excalidraw", version: 2, elements: [element] }),
			);
			const before = http.requests.length;
			const result = await owner.run(
				["import", "contract.excalidraw", "--board", "contract", "--doing", "importing scene"],
				{ url: http.url },
			);
			expect(result, packageFailure(result)).toMatchObject({ status: 0, stderr: "" });
			expect(parse(result.stdout).imported).toBe(1);
			expect(http.writesSince(before)).toHaveLength(1);
		} finally {
			http.dispose();
			await owner.dispose();
		}
	});

	test("marks replace imports and snapshot restores as one replacement batch", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
			const file = {
				id: "replace-file",
				dataURL: "data:image/png;base64,cmVwbGFjZQ==",
				mimeType: "image/png",
				created: 1,
			};
			writeFileSync(
				join(owner.outside, "replace.excalidraw"),
				JSON.stringify({
					type: "excalidraw",
					version: 2,
					elements: [{ ...element, id: "replace-image", type: "image", fileId: file.id }],
					files: { [file.id]: file },
				}),
			);
			const before = http.requests.length;
			const replaced = await owner.run(
				[
					"import",
					"replace.excalidraw",
					"--replace",
					"--board",
					"contract",
					"--doing",
					"replacing scene",
				],
				{ url: http.url },
			);
			expect(replaced.status).toBe(0);
			expect(parse(replaced.stdout)).toEqual({
				success: true,
				imported: 1,
				files: 1,
				mode: "replace",
			});
			const write = http.writesSince(before)[0];
			expect(write?.url.pathname).toBe("/api/elements/batch");
			expect(write?.body).toMatchObject({ mutation: "replace-scene", files: [file] });
			const restoreBefore = http.requests.length;
			const restored = await owner.run(
				[
					"snapshot",
					"restore",
					"package-scene",
					"--board",
					"contract",
					"--doing",
					"restoring snapshot",
				],
				{ url: http.url },
			);
			expect(restored.status).toBe(0);
			expect(http.writesSince(restoreBefore)[0]?.body).toMatchObject({
				mutation: "replace-scene",
				files: [],
			});
		} finally {
			http.dispose();
			await owner.dispose();
		}
	});
});

describe("package output and refusals", () => {
	test("keeps held presentation on the declared streams", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
			const query = await owner.run(["query", "--board", "held"], { url: http.url });
			expect(Array.isArray(JSON.parse(query.stdout))).toBe(true);
			expect(query.stderr).toBe("held board diagnostic\n");
			const update = await owner.run(
				["update", "shape1", "--set", '{"x":3}', "--board", "held", "--doing", "held update"],
				{ url: http.url },
			);
			expect(parse(update.stdout).held).toMatchObject({ board: "held" });
			expect(update.stderr).toBe("held board diagnostic\n");
			const raw = await owner.run(["export", "--board", "held"], { url: http.url });
			expect(raw.stderr).toBe("");
			expect(parse(raw.stdout).source).toBe("archboard");
		} finally {
			http.dispose();
			await owner.dispose();
		}
	});

	test("commits no partial artifact after malformed responses or prerequisites", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
			const malformedHeld = join(owner.outside, "malformed.excalidraw");
			const held = await owner.run(
				["export", "--board", "invalid-held-read", "--out", malformedHeld],
				{ url: http.url },
			);
			expect(held.status).toBe(1);
			expect(held.stdout).toBe("");
			expect(existsSync(malformedHeld)).toBe(false);
			const malformedOut = join(owner.outside, "malformed-findings");
			mkdirSync(malformedOut);
			const malformed = await owner.run(
				["render-findings", "--board", "malformed-render", "--out", malformedOut],
				{ url: http.url },
			);
			expect(malformed.status).toBe(1);
			expect(malformed.stdout).toBe("");
			expect(readdirSync(malformedOut)).toEqual([]);
			const nonEmpty = join(owner.outside, "non-empty");
			mkdirSync(nonEmpty);
			writeFileSync(join(nonEmpty, "owned.txt"), "keep");
			const before = http.requests.length;
			const refused = await owner.run(
				["render-findings", "--board", "contract", "--out", nonEmpty],
				{ url: http.url },
			);
			expect(refused.status).toBe(2);
			expect(http.requests).toHaveLength(before);
		} finally {
			http.dispose();
			await owner.dispose();
		}
	});

	test("preserves usage, missing-doing, unavailable, and version refusal exits", async () => {
		const owner = createPackageCliOwner();
		const http = createCliHttpDouble();
		try {
			const doing = await owner.run(
				["add", "--one", JSON.stringify(element), "--board", "contract"],
				{ url: http.url },
			);
			expect(doing.status).toBe(1);
			expect(doing.stdout).toBe("");
			expect(doing.stderr).toMatch(/Error: doing required/);
			const version = await owner.run(
				[
					"update",
					"refuse",
					"--set",
					'{"x":10}',
					"--document",
					"--board",
					"contract",
					"--doing",
					"version refusal",
				],
				{ url: http.url },
			);
			expect(version.status).toBe(5);
			expect(version.stdout).toBe("");
			expect(version.stderr).toContain('"code": "BOARD_VERSION_CONFLICT"');
			const usage = await owner.run(["delete", "--board", "contract", "--doing", "invalid"], {
				url: http.url,
			});
			expect(usage.status).toBe(2);
			expect(usage.stdout).toBe("");
			expect(usage.stderr).toMatch(/Error:.*\nUsage: archboard delete/s);
			const unavailable = await owner.run(["status"], { url: "http://127.0.0.1:1" });
			expect(unavailable.status).toBe(3);
			expect(unavailable.stderr).toBe("");
			expect(parse(unavailable.stdout).running).toBe(false);
		} finally {
			http.dispose();
			await owner.dispose();
		}
	});

	test("keeps local export validation before server contact", async () => {
		const owner = createPackageCliOwner();
		try {
			const raw = await owner.run(["export", "ignored", "--board", "contract"], {
				url: "http://127.0.0.1:1",
			});
			expect(raw.status).toBe(3);
			const invalid = await owner.run(["export", "--format", "invalid"], {
				url: "http://127.0.0.1:1",
			});
			expect(invalid.status).toBe(2);
			const target = join(owner.outside, "unsafe.excalidraw.md");
			writeFileSync(target, "ordinary note");
			const overwrite = await owner.run(["export", "--out", target], { url: "http://127.0.0.1:1" });
			expect(overwrite.status).toBe(2);
			expect(readFileSync(target, "utf8")).toBe("ordinary note");
		} finally {
			await owner.dispose();
		}
	});
});

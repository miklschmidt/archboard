import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ExportReceiptSchema } from "../../../src/cli/command-contract/export.ts";
import { QueryResultSchema } from "../../../src/cli/command-contract/query.ts";
import { UpdateResultSchema } from "../../../src/cli/command-contract/update.ts";
import { ImportResultSchema } from "../../../src/cli/commands/scene.ts";
import { SnapshotRestoreResultSchema } from "../../../src/cli/commands/snapshot.ts";
import { createCliHttpDouble } from "./support/cli-http-double.ts";
import { createPackageCliOwner, packageFailure } from "./support/package-cli.ts";

const rawExportSchema = z.object({
	type: z.literal("excalidraw"),
	version: z.number(),
	source: z.literal("archboard"),
	elements: z.array(z.unknown()),
});
const unavailableStatusSchema = z.object({ running: z.literal(false) }).passthrough();
const element = { id: "shape1", type: "rectangle", x: 0, y: 0, width: 100, height: 80 };

async function closedUrl(): Promise<string> {
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
	const url = server.url.origin;
	await server.stop(true);
	return url;
}

describe("package import and replacement", () => {
	test("resolves imports from the caller cwd and writes once", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		writeFileSync(
			join(owner.outside, "contract.excalidraw"),
			JSON.stringify({ type: "excalidraw", version: 2, elements: [element] }),
		);
		const before = http.requests.length;
		const result = await owner.run(
			["import", "contract.excalidraw", "--board", "contract", "--doing", "importing scene"],
			{ url: http.url },
		);
		const diagnostic = packageFailure(result);
		expect(result.status, diagnostic).toBe(0);
		expect(result.stderr, diagnostic).toBe("");
		expect(ImportResultSchema.parse(JSON.parse(result.stdout)), diagnostic).toMatchObject({
			imported: 1,
		});
		expect(http.writesSince(before), diagnostic).toHaveLength(1);
	});

	test("marks replace imports and snapshot restores as one replacement batch", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
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
		let before = http.requests.length;
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
		let diagnostic = packageFailure(replaced);
		expect(replaced.status, diagnostic).toBe(0);
		expect(ImportResultSchema.parse(JSON.parse(replaced.stdout)), diagnostic).toEqual({
			success: true,
			imported: 1,
			files: 1,
			mode: "replace",
		});
		const write = http.writesSince(before)[0];
		expect(write?.url.pathname, diagnostic).toBe("/api/elements/batch");
		expect(write?.body, diagnostic).toMatchObject({ mutation: "replace-scene", files: [file] });
		before = http.requests.length;
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
		diagnostic = packageFailure(restored);
		expect(restored.status, diagnostic).toBe(0);
		expect(
			SnapshotRestoreResultSchema.parse(JSON.parse(restored.stdout)),
			diagnostic,
		).toBeDefined();
		expect(http.writesSince(before)[0]?.body, diagnostic).toMatchObject({
			mutation: "replace-scene",
			files: [],
		});
	});
});

describe("package output and refusals", () => {
	test("keeps held presentation on declared streams", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const query = await owner.run(["query", "--board", "held"], { url: http.url });
		let diagnostic = packageFailure(query);
		expect(query.status, diagnostic).toBe(0);
		expect(QueryResultSchema.parse(JSON.parse(query.stdout)), diagnostic).toBeArray();
		expect(query.stderr, diagnostic).toBe("held board diagnostic\n");
		const update = await owner.run(
			["update", "shape1", "--set", '{"x":3}', "--board", "held", "--doing", "held update"],
			{ url: http.url },
		);
		diagnostic = packageFailure(update);
		expect(update.status, diagnostic).toBe(0);
		expect(UpdateResultSchema.parse(JSON.parse(update.stdout)).held, diagnostic).toMatchObject({
			board: "held",
		});
		expect(update.stderr, diagnostic).toBe("held board diagnostic\n");
		const raw = await owner.run(["export", "--board", "held"], { url: http.url });
		diagnostic = packageFailure(raw);
		expect(raw.status, diagnostic).toBe(0);
		expect(raw.stderr, diagnostic).toBe("");
		expect(rawExportSchema.parse(JSON.parse(raw.stdout)).source, diagnostic).toBe("archboard");
		const file = await owner.run(["export", "--out", "held.excalidraw", "--board", "held"], {
			url: http.url,
		});
		diagnostic = packageFailure(file);
		expect(file.status, diagnostic).toBe(0);
		expect(ExportReceiptSchema.parse(JSON.parse(file.stdout)).held, diagnostic).toMatchObject({
			board: "held",
		});
		expect(file.stderr, diagnostic).toBe("held board diagnostic\n");
	});

	test("rejects malformed held state before stdout or artifact presentation", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const malformedRead = await owner.run(["query", "--board", "invalid-held-read"], {
			url: http.url,
		});
		let diagnostic = packageFailure(malformedRead);
		expect(malformedRead.status, diagnostic).toBe(1);
		expect(malformedRead.stdout, diagnostic).toBe("");
		expect(malformedRead.stderr.includes("held board diagnostic"), diagnostic).toBeFalse();
		const target = join(owner.outside, "malformed.excalidraw");
		const malformedFile = await owner.run(
			["export", "--board", "invalid-held-read", "--out", target],
			{ url: http.url },
		);
		diagnostic = packageFailure(malformedFile);
		expect(malformedFile.status, diagnostic).toBe(1);
		expect(malformedFile.stdout, diagnostic).toBe("");
		expect(malformedFile.stderr.includes("held board diagnostic"), diagnostic).toBeFalse();
		expect(existsSync(target), diagnostic).toBeFalse();
	});

	test("preserves usage, doing, unavailable, and version refusal exits", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const doing = await owner.run(
			["add", "--one", JSON.stringify(element), "--board", "contract"],
			{ url: http.url },
		);
		let diagnostic = packageFailure(doing);
		expect(doing.status, diagnostic).toBe(1);
		expect(doing.stdout, diagnostic).toBe("");
		expect(doing.stderr, diagnostic).toMatch(/Error: doing required/);
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
		diagnostic = packageFailure(version);
		expect(version.status, diagnostic).toBe(5);
		expect(version.stdout, diagnostic).toBe("");
		expect(version.stderr, diagnostic).toContain('"code": "BOARD_VERSION_CONFLICT"');
		const usage = await owner.run(["delete", "--board", "contract", "--doing", "invalid"], {
			url: http.url,
		});
		diagnostic = packageFailure(usage);
		expect(usage.status, diagnostic).toBe(2);
		expect(usage.stdout, diagnostic).toBe("");
		expect(usage.stderr, diagnostic).toMatch(/Error:.*\nUsage: archboard delete/s);
		const unavailable = await owner.run(["status"], { url: await closedUrl() });
		diagnostic = packageFailure(unavailable);
		expect(unavailable.status, diagnostic).toBe(3);
		expect(unavailable.stderr, diagnostic).toBe("");
		expect(unavailableStatusSchema.parse(JSON.parse(unavailable.stdout)), diagnostic).toBeDefined();
	});

	test("exports raw, literal, and inferred destinations through their public contracts", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		const raw = await owner.run(["export", "ignored", "--board", "contract"], { url: http.url });
		let diagnostic = packageFailure(raw);
		expect(raw.status, diagnostic).toBe(0);
		expect(raw.stderr, diagnostic).toBe("");
		expect(rawExportSchema.parse(JSON.parse(raw.stdout)).source, diagnostic).toBe("archboard");
		const literal = await owner.run(["export", "--out=-", "--board", "contract"], {
			url: http.url,
		});
		diagnostic = packageFailure(literal);
		expect(literal.status, diagnostic).toBe(0);
		expect(literal.stderr, diagnostic).toBe("");
		expect(ExportReceiptSchema.parse(JSON.parse(literal.stdout)).file, diagnostic).toBe(
			join(owner.outside, "-"),
		);
		const inferredPath = join(owner.outside, "inferred.excalidraw.md");
		const inferred = await owner.run(["export", "--out", inferredPath, "--board", "contract"], {
			url: http.url,
		});
		diagnostic = packageFailure(inferred);
		expect(inferred.status, diagnostic).toBe(0);
		expect(ExportReceiptSchema.parse(JSON.parse(inferred.stdout)).format, diagnostic).toBe(
			"obsidian",
		);
		expect(readFileSync(inferredPath, "utf8"), diagnostic).toMatch(/^---\n.*excalidraw-plugin:/s);
	});

	test("keeps format and overwrite refusals local and leaves targets unchanged", async () => {
		await using resources = new AsyncDisposableStack();
		const http = resources.use(createCliHttpDouble());
		const owner = resources.use(createPackageCliOwner());
		let before = http.contacts.length;
		const invalid = await owner.run(["export", "--format", "invalid"], { url: http.url });
		let diagnostic = packageFailure(invalid);
		expect(invalid.status, diagnostic).toBe(2);
		expect(invalid.stdout, diagnostic).toBe("");
		expect(http.contacts.slice(before), diagnostic).toEqual([]);
		const target = join(owner.outside, "unsafe.excalidraw.md");
		writeFileSync(target, "ordinary note");
		before = http.contacts.length;
		const overwrite = await owner.run(["export", "--out", target], { url: http.url });
		diagnostic = packageFailure(overwrite);
		expect(overwrite.status, diagnostic).toBe(2);
		expect(overwrite.stdout, diagnostic).toBe("");
		expect(http.contacts.slice(before), diagnostic).toEqual([]);
		expect(readFileSync(target, "utf8"), diagnostic).toBe("ordinary note");
	});
});

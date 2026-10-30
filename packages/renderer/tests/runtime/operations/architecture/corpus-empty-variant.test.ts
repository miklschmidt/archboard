import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

test("the corpus draws removed whole-board content and skips empty plain variants", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-corpus-empty-"));
	try {
		const vault = join(root, ".archboard", "vault");
		mkdirSync(join(vault, ".archboard"), { recursive: true });
		mkdirSync(join(root, "examples"));
		writeFileSync(
			join(vault, ".archboard", "config.yaml"),
			JSON.stringify(DEFAULT_SEMANTIC_POLICY),
		);
		const board = SemanticBoardSchema.parse({
			schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
			kind: "semantic-board",
			id: "board",
			name: "Example",
			level: "module",
			version: 1,
			createdAt: "2026-10-16T00:00:00.000Z",
			updatedAt: "2026-10-16T00:00:00.000Z",
			views: [],
			current: "full",
			variants: [
				{
					id: "bare",
					name: "Bare",
					lifecycle: "draft",
					content: orderedFixture({}),
				},
				{
					id: "full",
					name: "Full",
					lifecycle: "current",
					content: orderedFixture({ nodes: [{ id: "node", name: "Module", kind: "module" }] }),
				},
			],
		});
		writeFileSync(join(vault, "Example.semantic.json"), JSON.stringify(board));
		const out = join(root, "corpus");
		const child = Bun.spawn(
			[
				process.execPath,
				fileURLToPath(new URL("../../../../../../scripts/render-corpus.ts", import.meta.url)),
				"render",
				out,
				"--engines",
				"track",
				"--themes",
				"light",
				"--comparison",
				"on,off",
				"--jobs",
				"1",
			],
			{ cwd: root, stdout: "ignore", stderr: "pipe" },
		);
		const [status, errors] = await Promise.all([child.exited, new Response(child.stderr).text()]);
		expect(status, errors).toBe(0);
		const keys = Object.keys(JSON.parse(readFileSync(join(out, "corpus.json"), "utf8")));
		expect(keys).toHaveLength(6);
		for (const view of ["(whole board)", "overview"]) {
			const readings = keys
				.map((key) => key.split(" | "))
				.filter((fields) => fields[3] === view)
				.map((fields) => [fields[2], fields[6]]);
			expect(readings).toEqual([
				["Bare", "comparison"],
				["Full", "comparison"],
				["Full", "plain"],
			]);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

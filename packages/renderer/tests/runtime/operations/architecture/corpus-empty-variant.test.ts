import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SemanticBoardSchema, SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

test("the corpus keeps nonempty drawings when another variant is empty", async () => {
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
					lifecycle: "draft",
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
				"off",
				"--jobs",
				"1",
			],
			{ cwd: root, stdout: "ignore", stderr: "pipe" },
		);
		const [status, errors] = await Promise.all([child.exited, new Response(child.stderr).text()]);
		expect(status, errors).toBe(0);
		const keys = Object.keys(JSON.parse(readFileSync(join(out, "corpus.json"), "utf8")));
		expect(keys).toHaveLength(2);
		expect(keys.map((key) => key.split(" | ")[2])).toEqual(["Full", "Full"]);
		expect(keys.map((key) => key.split(" | ")[3]).toSorted()).toEqual([
			"(whole board)",
			"overview",
		]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

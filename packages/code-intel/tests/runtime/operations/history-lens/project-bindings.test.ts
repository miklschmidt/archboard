// Every history reading treats a .NET project file as its whole directory,
// including non-C# files and descendants. The code-check C# owner holds the
// same binding to the project’s code; both use the shared filesOfBinding rule.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LensModule from "#tests/runtime/support/history-lens/lens.ts";
import { BoardBehindSchema } from "#shared/protocol/code-check.ts";
import { FootprintAnswerSchema } from "#shared/protocol/footprint.ts";
import { LocalityAnswerSchema } from "#shared/protocol/locality.ts";
import {
	currentVariant,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
} from "@archboard/board/document";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-project-history-"));
const root = join(scratch, "shop");
const registry = join(scratch, "repos.json");
const globalConfig = join(scratch, "gitconfig");
const repo = "github.com/test/project-history";
const vault = join(root, "vault");
const file = join(vault, "Shop.semantic.json");
process.env["ARCHBOARD_REPOS"] = registry;
let lens: typeof LensModule;
let base = "";

const board = SemanticBoardSchema.parse({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: "board1",
	name: "Shop",
	level: "system",
	version: 1,
	createdAt: "2026-09-27T00:00:00.000Z",
	updatedAt: "2026-09-27T00:00:00.000Z",
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					{
						id: "project",
						name: "Project",
						kind: "module",
						order: 1000,
						binding: { repo, path: "src/Shop/Shop.csproj" },
					},
					{
						id: "nested",
						name: "Nested",
						kind: "module",
						order: 2000,
						binding: { repo, path: "src/Shop/sub/Ledger.cs" },
					},
					{
						id: "other",
						name: "Other",
						kind: "module",
						order: 3000,
						binding: { repo, path: "src/Other.cs" },
					},
				],
			},
		},
	],
});

/** Run Git with an isolated identity and configuration. */
function git(...args: string[]): string {
	const run = Bun.spawnSync(["git", ...args], {
		cwd: root,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: globalConfig,
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Owner",
			GIT_AUTHOR_EMAIL: "owner@example.com",
			GIT_COMMITTER_NAME: "Owner",
			GIT_COMMITTER_EMAIL: "owner@example.com",
		},
	});
	if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	return run.stdout.toString().trim();
}

/** Commit all fixture files. */
function commit(subject: string): string {
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", subject);
	return git("rev-parse", "HEAD");
}

beforeAll(async () => {
	mkdirSync(join(root, "src/Shop/sub"), { recursive: true });
	mkdirSync(vault);
	writeFileSync(globalConfig, "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${repo}.git`);
	writeFileSync(
		registry,
		JSON.stringify([{ repo, root, source: "declared", addedAt: "2026-09-27T00:00:00.000Z" }]),
	);
	writeFileSync(join(root, "src/Shop/Shop.csproj"), "<Project />\n");
	writeFileSync(join(root, "src/Shop/sub/Ledger.cs"), "first\n");
	writeFileSync(join(root, "src/Shop/settings.json"), "{}\n");
	writeFileSync(join(root, "src/Other.cs"), "first\n");
	writeFileSync(file, JSON.stringify(board));
	base = commit("create the board and project");
	for (let at = 1; at <= 5; at += 1) {
		writeFileSync(join(root, "src/Shop/sub/Ledger.cs"), `${at}\n`);
		writeFileSync(join(root, "src/Other.cs"), `${at}\n`);
		commit(`change source ${at}`);
	}
	writeFileSync(join(root, "src/Shop/settings.json"), '{"enabled":true}\n');
	commit("change project settings");
	lens = await import("#tests/runtime/support/history-lens/lens.ts");
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

test("Behind counts every changed file in a project directory after the board changed", async () => {
	const [read] = await lens.createBehindReading().read(vault, [{ board, file }]);
	const answer = BoardBehindSchema.parse(read);
	if (!("parts" in answer)) throw new Error("no last change");
	expect(answer.lastChange).toMatchObject({ kind: "commit", commit: base });
	expect(answer.parts.find((part) => part.subject.id === "project")?.commits).toHaveLength(6);
});

test("hotspots and coupling use the project directory and omit overlapping bindings", async () => {
	const current = currentVariant(board);
	if (current === undefined) throw new Error("no current variant");
	const answer = LocalityAnswerSchema.parse(
		await lens.createVariantLocality().read(vault, board, current, new Date("2000-01-01")),
	);
	expect(answer.hotspots.find((part) => part.subject.id === "project")?.commits).toHaveLength(7);
	const pairs = answer.coupling.map((pair) => pair.subjects.map((subject) => subject.id));
	expect(pairs).toContainEqual(["project", "other"]);
	expect(pairs).not.toContainEqual(["project", "nested"]);
});

test("a footprint includes source-only and settings changes in a project directory", async () => {
	const current = currentVariant(board);
	if (current === undefined) throw new Error("no current variant");
	const answer = FootprintAnswerSchema.parse(
		await lens.readVariantFootprint({ vault, board, against: current, base }),
	);
	if (answer.proposal !== null) throw new Error("no proposal expected");
	expect(answer.changed.find((part) => part.subject.id === "project")?.commits).toHaveLength(6);
});

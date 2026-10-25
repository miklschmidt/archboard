// Locality and footprint share declaration attribution (TASK-448). The real
// Git history distinguishes edits inside shared files, follows renamed and
// deleted declarations, and resolves repeated nested local Terraform modules.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type * as LensModule from "#tests/runtime/support/history-lens/lens.ts";
import {
	FootprintAnswerSchema,
	type FootprintAnswer,
	type FootprintPart,
} from "#shared/protocol/footprint.ts";
import { LocalityAnswerSchema, type LocalityAnswer } from "#shared/protocol/locality.ts";
import {
	currentVariant,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
} from "@archboard/board/document";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-symbol-history-"));
const root = join(scratch, "shop");
const registry = join(scratch, "repos.json");
const globalConfig = join(scratch, "gitconfig");
const repo = "github.com/test/symbol-history";
process.env["ARCHBOARD_REPOS"] = registry;
let locality: LocalityAnswer;
let footprint: FootprintPart[];
let footprintCommits: FootprintAnswer["commits"];
let base = "";
let firstOnly = "";
let secondOnly = "";
let unrelated = "";
let renamed = "";
let deleted = "";
let large = "";
let firstTS = "";
let secondTS = "";
let notes = "";
let introduced = "";
let mixedEdit = "";
let extensionRename = "";
let renamedEdit = "";
let firstAdapters = "";
let secondAdapters = "";
let ambiguousEdit = "";
const together: string[] = [];
const definitions: string[] = [];

const adapters = [
	{
		id: "py",
		path: "src/shared.py",
		first: "first",
		second: "second",
		source: (first: number, second: number) =>
			`def first():\n    return ${first}\n\ndef second():\n    return ${second}\n`,
	},
	{
		id: "cs",
		path: "src/Shared.cs",
		first: "Ledger.First",
		second: "Ledger.Second",
		source: (first: number, second: number) =>
			`public class Ledger {\n  public int First() { return ${first}; }\n  public int Second() { return ${second}; }\n}\n`,
	},
	{
		id: "c",
		path: "src/shared.c",
		first: "first",
		second: "second",
		source: (first: number, second: number) =>
			`int first(void) { return ${first}; }\nint second(void) { return ${second}; }\n`,
	},
	{
		id: "sw",
		path: "src/Shared.swift",
		first: "first",
		second: "second",
		source: (first: number, second: number) =>
			`public func first() -> Int { return ${first} }\npublic func second() -> Int { return ${second} }\n`,
	},
];

const bindings = [
	["first", "infra", "aws_s3_bucket.first"],
	["alias", "infra/resources.tf", "aws_s3_bucket.first"],
	["second", "infra/resources.tf", "aws_s3_bucket.second"],
	["all", "infra"],
	["nestedA", "infra", "module.a.module.inner.aws_sqs_queue.this"],
	["nestedB", "infra", "module.b.module.inner.aws_sqs_queue.this"],
	["missing", "infra", "aws_s3_bucket.missing"],
	["notes", "notes.txt", "entry"],
	["tsFirst", "src/shared.ts", "first"],
	["tsSecond", "src/shared.ts", "second"],
	["mixedTS", "mixed-lang", "first"],
	["inlineA", "src/inline.ts", "first"],
	["inlineB", "src/inline.ts", "second"],
	["reused", "src/destination.ts", "first"],
	["mixed", "mixed", "aws_s3_bucket.later"],
	["ext", "src/renamed.ts", "first"],
	["ambig", "src/duplicates.py", "repeated"],
	...adapters.flatMap(
		(adapter) =>
			[
				[`${adapter.id}First`, adapter.path, adapter.first],
				[`${adapter.id}Second`, adapter.path, adapter.second],
			] as const,
	),
] as const;

const board = SemanticBoardSchema.parse({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: "board1",
	name: "Shop",
	level: "system",
	version: 1,
	createdAt: "2026-10-07T00:00:00.000Z",
	updatedAt: "2026-10-07T00:00:00.000Z",
	current: "v1",
	variants: [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: bindings.map(([id, path, symbol], index) => ({
					id,
					name: id,
					kind: "module",
					order: (index + 1) * 1000,
					binding: { repo, path, ...(symbol === undefined ? {} : { symbol }) },
				})),
			},
		},
	],
});

/** Run fixture Git without the caller's identity or global configuration. */
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

/** Write a repository-relative fixture file. */
function write(path: string, text: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true });
	writeFileSync(join(root, path), text);
}

/** Commit the fixture and keep the exact id used by the answer contract. */
function commit(subject: string): string {
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", subject);
	return git("rev-parse", "HEAD");
}

/** Two unrelated declarations share one file, with room for rename detection. */
function resources(first: number | undefined, second: number): string {
	return [
		...(first === undefined
			? []
			: [
					'resource "aws_s3_bucket" "first" {',
					`  bucket = "first-${first}"`,
					'  tags = { team = "orders", environment = "test" }',
					"}",
					"",
				]),
		'resource "aws_s3_bucket" "second" {',
		`  bucket = "second-${second}"`,
		'  tags = { team = "billing", environment = "test" }',
		"}",
		"",
	].join("\n");
}

beforeAll(async () => {
	mkdirSync(root);
	writeFileSync(globalConfig, "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${repo}.git`);
	writeFileSync(
		registry,
		JSON.stringify([{ repo, root, source: "declared", addedAt: "2026-10-07T00:00:00.000Z" }]),
	);
	write("infra/main.tf", resources(0, 0));
	write(
		"infra/modules.tf",
		'module "a" {\n  source = "../modules/shared"\n}\nmodule "b" {\n  source = "../modules/shared"\n}\n',
	);
	write("modules/shared/main.tf", 'module "inner" {\n  source = "../inner"\n}\n');
	write("modules/inner/main.tf", 'resource "aws_sqs_queue" "this" {\n  name = "queue-0"\n}\n');
	write("infra/unrelated.tf", 'output "unrelated" {\n  value = 0\n}\n');
	write(
		"src/shared.ts",
		"export function first() { return 0; }\nexport function second() { return 0; }\n",
	);
	write("notes.txt", "first\n");
	write("src/duplicates.py", "def repeated():\n    return 0\n\ndef repeated():\n    return 0\n");
	write("mixed/main.tf", 'output "unrelated" {\n  value = 0\n}\n');
	write("mixed/README.md", "Configuration notes for a later change\n");
	write("mixed-lang/main.tf", 'output "unrelated" {\n  value = 0\n}\n');
	write(
		"mixed-lang/shared.ts",
		"export function first() { return 0; }\nexport function second() { return 0; }\n",
	);
	write(
		"src/inline.ts",
		'const greeting = "😀"; export function first() { return 0; } export function second() { return 0; }\n',
	);
	write(
		"src/renamed.txt",
		"export function first() { return 0; }\nexport function second() { return 0; }\n",
	);
	for (const adapter of adapters) write(adapter.path, adapter.source(0, 0));
	write("src/origin.ts", "export function first() { return 0; }\n");
	write("src/destination.ts", "export function first() { return 777; }\n");
	base = commit("create declarations");
	rmSync(join(root, "src/destination.ts"));
	commit("retire an unrelated earlier file at the future rename destination");
	write("infra/main.tf", resources(1, 0));
	firstOnly = commit("change first resource");
	write("infra/main.tf", resources(1, 1));
	secondOnly = commit("change second resource");
	for (let at = 2; at <= 6; at += 1) {
		write("infra/main.tf", resources(at, at));
		together.push(commit(`change distinct resources together ${at}`));
	}
	write("infra/unrelated.tf", 'output "unrelated" {\n  value = 1\n}\n');
	unrelated = commit("change an unrelated root declaration");
	renameSync(join(root, "infra/main.tf"), join(root, "infra/resources.tf"));
	renamed = commit("rename shared resource file");
	write("infra/resources.tf", resources(undefined, 6));
	deleted = commit("delete first declaration while keeping its file");
	for (let at = 1; at <= 5; at += 1) {
		write(
			"modules/inner/main.tf",
			`resource "aws_sqs_queue" "this" {\n  name = "queue-${at}"\n}\n`,
		);
		definitions.push(commit(`change repeated nested definition ${at}`));
	}
	write(
		"src/shared.ts",
		"export function first() { return 1; }\nexport function second() { return 0; }\n",
	);
	write(
		"mixed-lang/shared.ts",
		"export function first() { return 1; }\nexport function second() { return 0; }\n",
	);
	write(
		"src/inline.ts",
		'const greeting = "😀"; export function first() { return 1; } export function second() { return 0; }\n',
	);
	write("src/origin.ts", "export function first() { return 1; }\n");
	firstTS = commit("change first TypeScript function");
	write(
		"src/shared.ts",
		"export function first() { return 1; }\nexport function second() { return 2; }\n",
	);
	write(
		"mixed-lang/shared.ts",
		"export function first() { return 1; }\nexport function second() { return 2; }\n",
	);
	write(
		"src/inline.ts",
		'const greeting = "😀"; export function first() { return 1; } export function second() { return 2; }\n',
	);
	secondTS = commit("change second TypeScript function");
	write("notes.txt", "second\n");
	notes = commit("change an unsupported symbol's file");
	write(
		"mixed/main.tf",
		'output "unrelated" {\n  value = 0\n}\nresource "aws_s3_bucket" "later" {\n  bucket = "later-0"\n}\n',
	);
	introduced = commit("introduce a previously unresolved declaration");
	write(
		"mixed/main.tf",
		'output "unrelated" {\n  value = 1\n}\nresource "aws_s3_bucket" "later" {\n  bucket = "later-0"\n}\n',
	);
	commit("change its neighbor after declaration resolution");
	write(
		"mixed/main.tf",
		'output "unrelated" {\n  value = 1\n}\nresource "aws_s3_bucket" "later" {\n  bucket = "later-1"\n}\n',
	);
	mixedEdit = commit("change the newly resolved declaration");
	renameSync(join(root, "src/renamed.txt"), join(root, "src/renamed.ts"));
	renameSync(join(root, "src/origin.ts"), join(root, "src/destination.ts"));
	extensionRename = commit("give a previously unsupported file its language extension");
	write(
		"src/renamed.ts",
		"export function first() { return 1; }\nexport function second() { return 0; }\n",
	);
	renamedEdit = commit("change a declaration after language recognition");
	write(
		"src/renamed.ts",
		"export function first() { return 1; }\nexport function second() { return 2; }\n",
	);
	commit("change its neighbor after language recognition");
	for (const adapter of adapters) write(adapter.path, adapter.source(1, 0));
	firstAdapters = commit("change first declarations in general language adapters");
	for (const adapter of adapters) write(adapter.path, adapter.source(1, 2));
	secondAdapters = commit("change their unrelated neighboring declarations");
	write("src/duplicates.py", "def repeated():\n    return 0\n\ndef repeated():\n    return 1\n");
	ambiguousEdit = commit("change one of two declarations sharing the same symbol");
	write("infra/resources.tf", resources(undefined, 7));
	for (let at = 0; at < 31; at += 1) write(`bulk/${at}.txt`, "bulk\n");
	large = commit("change second resource in a large commit");
	const lens: typeof LensModule = await import("#tests/runtime/support/history-lens/lens.ts");
	const current = currentVariant(board);
	if (current === undefined) throw new Error("no current variant");
	locality = LocalityAnswerSchema.parse(
		await lens.createLocalityReading().read(scratch, board, current, new Date("2000-01-01")),
	);
	const request = { vault: scratch, board, against: current, base };
	const answer = FootprintAnswerSchema.parse(await lens.readVariantFootprint(request));
	if (answer.proposal !== null) throw new Error("no proposal expected");
	footprint = answer.changed;
	footprintCommits = answer.commits;
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

/** Assert the same reading, apart from locality's creation and size policies. */
function histories(id: string, commits: readonly string[], extra: readonly string[] = []): void {
	const hotspot = locality.hotspots.find((part) => part.subject.id === id);
	expect(hotspot?.commits).toEqual([...commits, base]);
	expect(hotspot?.count).toBe(commits.length + 1);
	expect(footprint.find((part) => part.subject.id === id)?.commits).toEqual([...extra, ...commits]);
}

test("shared Terraform files attribute only edits of the bound declaration, including rename history and deletion", () => {
	const first = [deleted, renamed, ...together.toReversed(), firstOnly];
	histories("first", first);
	histories("alias", first);
	histories("second", [renamed, ...together.toReversed(), secondOnly], [large]);
	for (const parts of [locality.hotspots, footprint]) {
		expect(parts.find((part) => part.subject.id === "first")).toMatchObject({
			attribution: { mode: "symbol", symbol: "aws_s3_bucket.first" },
		});
	}
});

test("qualified local-module instances share nested definition edits outside the bound root directory", () => {
	histories("nestedA", definitions.toReversed());
	histories("nestedB", definitions.toReversed());
	for (const parts of [locality.hotspots, footprint]) {
		expect(parts.find((part) => part.subject.id === "nestedA")).toMatchObject({
			attribution: { mode: "symbol", symbol: "module.a.module.inner.aws_sqs_queue.this" },
		});
	}
});

test("distinct symbols sharing a path can couple while aliases of one declaration cannot", () => {
	const pairs = locality.coupling.map((pair) => pair.subjects.map((subject) => subject.id));
	expect(pairs).toContainEqual(["first", "second"]);
	expect(pairs).toContainEqual(["alias", "second"]);
	expect(pairs).not.toContainEqual(["first", "alias"]);
	expect(pairs).not.toContainEqual(["nestedA", "nestedB"]);
	expect(pairs).not.toContainEqual(["second", "all"]);
	const pair = locality.coupling.find(
		(one) => one.subjects.map((subject) => subject.id).join() === "first,second",
	);
	expect(pair?.commits).toEqual([renamed, ...together.toReversed(), base]);
});

test("a symbol-less directory retains path history and unresolved symbols explicitly fall back to that history", () => {
	const commits = [deleted, renamed, unrelated, ...together.toReversed(), secondOnly, firstOnly];
	histories("all", commits, [large]);
	histories("missing", commits, [large]);
	expect(locality.hotspots.find((part) => part.subject.id === "all")).toMatchObject({
		attribution: { mode: "path" },
	});
	expect(footprint.find((part) => part.subject.id === "all")).toMatchObject({
		attribution: { mode: "path" },
	});
	expect(locality.hotspots.find((part) => part.subject.id === "missing")).toMatchObject({
		attribution: {
			mode: "path",
			symbol: "aws_s3_bucket.missing",
			fallback: [{ reason: "unresolved", commits: [...commits, base] }],
		},
	});
	expect(footprint.find((part) => part.subject.id === "missing")).toMatchObject({
		attribution: {
			mode: "path",
			symbol: "aws_s3_bucket.missing",
			fallback: [{ reason: "unresolved", commits: [large, ...commits] }],
		},
	});
});

test("unsupported symbols label their path-wide fallback in both readings", () => {
	histories("notes", [notes]);
	expect(locality.hotspots.find((part) => part.subject.id === "notes")).toMatchObject({
		attribution: {
			mode: "path",
			symbol: "entry",
			fallback: [{ reason: "unsupported", commits: [notes, base] }],
		},
	});
	expect(footprint.find((part) => part.subject.id === "notes")).toMatchObject({
		attribution: {
			mode: "path",
			symbol: "entry",
			fallback: [{ reason: "unsupported", commits: [notes] }],
		},
	});
});

test("TypeScript functions isolate edits within their shared file", () => {
	histories("tsFirst", [firstTS]);
	histories("tsSecond", [secondTS]);
	histories("mixedTS", [firstTS]);
	histories("reused", [extensionRename, firstTS]);
	histories("inlineA", [firstTS]);
	histories("inlineB", [secondTS]);
});

test("distinct declarations with the same symbol in one file explicitly fall back to path history", () => {
	histories("ambig", [ambiguousEdit]);
	for (const parts of [locality.hotspots, footprint]) {
		const part = parts.find((one) => one.subject.id === "ambig");
		expect(part?.attribution).toMatchObject({
			mode: "path",
			symbol: "repeated",
			fallback: [{ reason: "unsupported" }],
		});
	}
});

test("earlier absence of a later resolved declaration excludes unrelated history", () => {
	expect(locality.hotspots.find((part) => part.subject.id === "mixed")?.commits).toEqual([
		mixedEdit,
		introduced,
	]);
	expect(footprint.find((part) => part.subject.id === "mixed")?.commits).toEqual([
		mixedEdit,
		introduced,
	]);
	for (const parts of [locality.hotspots, footprint]) {
		expect(parts.find((part) => part.subject.id === "mixed")?.attribution).toEqual({
			mode: "symbol",
			symbol: "aws_s3_bucket.later",
		});
	}
});

test("a recognized declaration keeps explicit mixed attribution for its unsupported former file", () => {
	histories("ext", [renamedEdit, extensionRename]);
	expect(locality.hotspots.find((part) => part.subject.id === "ext")?.attribution).toEqual({
		mode: "mixed",
		symbol: "first",
		fallback: [{ reason: "unsupported", commits: [extensionRename, base] }],
	});
	expect(footprint.find((part) => part.subject.id === "ext")?.attribution).toEqual({
		mode: "mixed",
		symbol: "first",
		fallback: [{ reason: "unsupported", commits: [extensionRename] }],
	});
});

test("Python, C#, C and Swift adapters isolate declarations from neighboring edits", () => {
	for (const adapter of adapters) {
		histories(`${adapter.id}First`, [firstAdapters]);
		histories(`${adapter.id}Second`, [secondAdapters]);
		for (const parts of [locality.hotspots, footprint]) {
			expect(parts.find((part) => part.subject.id === `${adapter.id}First`)?.attribution).toEqual({
				mode: "symbol",
				symbol: adapter.first,
			});
		}
	}
});

test("locality leaves large declaration changes out while footprint keeps and marks them", () => {
	expect(locality.leftOut.largeCommits).toBe(1);
	expect(locality.commits.some((entry) => entry.commit === large)).toBe(false);
	expect(footprintCommits.find((entry) => entry.commit === large)).toMatchObject({ large: true });
	expect(footprint.find((part) => part.subject.id === "first")?.commits).not.toContain(large);
});

// The locality size filter must also filter precision before coupling, while
// footprint reads every commit and the bindings of the proposal (TASK-448).
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as LensModule from "#tests/runtime/support/history-lens/lens.ts";
import { FootprintAnswerSchema } from "#shared/protocol/footprint.ts";
import { LocalityAnswerSchema } from "#shared/protocol/locality.ts";
import {
	currentVariant,
	SEMANTIC_BOARD_SCHEMA_VERSION,
	SemanticBoardSchema,
} from "@archboard/board/document";

const callerRepos = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-attribution-boundary-"));
const root = join(scratch, "checkout");
const registry = join(scratch, "repos.json");
const globalConfig = join(scratch, "gitconfig");
const repo = "github.com/test/attribution-boundary";
process.env["ARCHBOARD_REPOS"] = registry;
let lens: typeof LensModule;
let base = "";
const large: string[] = [];
const together: string[] = [];
let firstOnly = "";
let clock = 1_790_000_000;

const board = SemanticBoardSchema.parse({
	schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
	kind: "semantic-board",
	id: "bd",
	name: "Boundary",
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
				nodes: ["first", "second", "missing"].map((symbol, index) => ({
					id: symbol,
					name: symbol,
					kind: "module",
					order: (index + 1) * 1000,
					binding: { repo, path: "shared.ts", symbol },
				})),
			},
		},
	],
});

/** Run fixture Git without the caller's configuration. */
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
			GIT_AUTHOR_DATE: `@${clock} +0000`,
			GIT_COMMITTER_DATE: `@${clock} +0000`,
		},
	});
	if (run.exitCode !== 0) throw new Error(run.stderr.toString());
	return run.stdout.toString().trim();
}

/** Commit an edit at a deterministic time. */
function commit(subject: string): string {
	clock += 60;
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", subject);
	return git("rev-parse", "HEAD");
}

/** Two independent declarations occupy the same file. */
function source(first: number, second: number): string {
	return `export function first() { return ${first}; }\nexport function second() { return ${second}; }\n`;
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
	writeFileSync(join(root, "README.md"), "fixture\n");
	base = commit("base");
	writeFileSync(join(root, "shared.txt"), source(0, 0));
	for (let at = 0; at < 30; at += 1) writeFileSync(join(root, `${at}.txt`), "zero\n");
	large.push(commit("unsupported declarations in a large commit"));
	renameSync(join(root, "shared.txt"), join(root, "shared.ts"));
	for (let at = 0; at < 30; at += 1) writeFileSync(join(root, `${at}.txt`), "one\n");
	large.push(commit("recognize declarations in a large rename"));
	for (let at = 1; at <= 5; at += 1) {
		writeFileSync(join(root, "shared.ts"), source(at, at));
		together.push(commit(`precise declaration changes ${at}`));
	}
	writeFileSync(join(root, "shared.ts"), source(6, 5));
	firstOnly = commit("first declaration alone");
	lens = await import("#tests/runtime/support/history-lens/lens.ts");
});

afterAll(() => {
	if (callerRepos === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = callerRepos;
	rmSync(scratch, { recursive: true, force: true });
});

test("large fallback commits do not suppress coupling among precise ordinary commits", async () => {
	const current = currentVariant(board);
	if (current === undefined) throw new Error("missing current variant");
	const locality = LocalityAnswerSchema.parse(
		await lens.createLocalityReading().read(scratch, board, current, undefined),
	);
	const footprint = FootprintAnswerSchema.parse(
		await lens.readVariantFootprint({ vault: scratch, board, against: current, base }),
	);
	if (footprint.proposal !== null) throw new Error("unexpected proposal");
	const pair = locality.coupling.find(
		(entry) => entry.subjects.map((subject) => subject.id).join() === "first,second",
	);
	expect(pair?.commits).toEqual(together.toReversed());
	expect(locality.leftOut.largeCommits).toBe(2);
	for (const symbol of ["first", "second"]) {
		const hotspot = locality.hotspots.find((entry) => entry.subject.id === symbol);
		expect(hotspot?.attribution).toEqual({ mode: "symbol", symbol });
		expect(hotspot?.commits).toEqual([
			...(symbol === "first" ? [firstOnly] : []),
			...together.toReversed(),
		]);
		expect(footprint.changed.find((entry) => entry.subject.id === symbol)?.attribution).toEqual({
			mode: "mixed",
			symbol,
			fallback: [{ reason: "unsupported", commits: large.toReversed() }],
		});
	}
	expect(footprint.commits.filter((entry) => entry.large).map((entry) => entry.commit)).toEqual(
		large.toReversed(),
	);
});

test("footprint uses a proposal's changed symbol binding for the same subject id", async () => {
	const current = currentVariant(board);
	if (current === undefined) throw new Error("missing current variant");
	const proposal = SemanticBoardSchema.parse({
		...board,
		variants: [
			...board.variants,
			{
				id: "v2",
				name: "Proposal",
				lifecycle: "draft",
				parent: current.id,
				content: {
					nodes: current.content.nodes.map((node) =>
						node.id === "first"
							? { ...node, binding: { repo, path: "shared.ts", symbol: "second" } }
							: node,
					),
				},
			},
		],
	}).variants[1];
	if (proposal === undefined) throw new Error("missing proposal");
	const answer = FootprintAnswerSchema.parse(
		await lens.readVariantFootprint({ vault: scratch, board, against: current, proposal, base }),
	);
	if (answer.proposal === null) throw new Error("proposal was not read");
	const changed = answer.namedAndChanged.find((entry) => entry.subject.id === "first");
	expect(changed?.commits).toEqual([...together.toReversed(), ...large.toReversed()]);
	expect(changed?.attribution?.symbol).toBe("second");
	expect(changed?.named).toEqual([{ by: "part", status: "changed" }]);
	expect(changed?.commits).not.toContain(firstOnly);
});

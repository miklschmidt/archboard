// Model-free owner of a whole Claude grading pass: a fake `claude` reads the
// listed pictures and answers with a structured verdict, and the harness
// files verdicts and read receipts, resumes one session across chunks, sums
// per-call usage, refuses a wrong version, and files a call that read outside
// the workspace or returned no answer as an error.
import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	availableGraders,
	filedVerdict,
	gradeBatch,
	graderLayout,
	graderUsage,
	inputDigest,
	loadSuite,
	type GradingOptions,
} from "@/runtime/skill-evaluation/index";
import { suppliedCaptures } from "@/runtime/skill-evaluation/audit";

const checkout = path.resolve(import.meta.dir, "../../../..");
const loaded = loadSuite(path.join(checkout, "evals"));
const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const png = (width = 1, height = 1): Buffer => {
	const bytes = Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=",
		"base64",
	);
	bytes.writeUInt32BE(width, 16);
	bytes.writeUInt32BE(height, 20);
	return bytes;
};

const RUNS = ["run-0000000001", "run-0000000002"] as const;

/**
 * A batch with two bundled runs, one with a tiled capture, and a fake claude.
 * @param mode What the fake does wrong, if anything.
 * @param version What the fake says its version is.
 * @returns The batch root and the grading options.
 */
function batch(mode = "grade", version = loaded.graders.claude.version) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-claude-grading-"));
	roots.push(root);
	fs.writeFileSync(
		path.join(root, "batch.json"),
		JSON.stringify({
			salt: "s",
			provenance: {
				inputs: inputDigest(loaded),
				implementation: "i",
				baseline: "b",
				candidate: "c",
				bun: Bun.version,
			},
			arms: ["candidate"],
			scenarios: ["S02"],
			repetitions: 2,
			codexExecutable: "codex",
			pins: loaded.pins,
		}),
	);
	RUNS.forEach((run, index) => {
		const directory = path.join(root, "runs", "candidate", "S02", String(index + 1));
		fs.mkdirSync(path.join(directory, "captures"), { recursive: true });
		const width = index === 0 ? 1601 : 1;
		fs.writeFileSync(path.join(directory, "captures/main.png"), png(width));
		const tiles =
			width === 1
				? []
				: [
						{ x: 0, y: 0, width: 1600, height: 1, file: "captures/tile-0.png" },
						{ x: 1600, y: 0, width: 1, height: 1, file: "captures/tile-1.png" },
					];
		for (const tile of tiles) fs.writeFileSync(path.join(directory, tile.file), png(tile.width));
		fs.writeFileSync(
			path.join(directory, "bundle.json"),
			JSON.stringify({
				run,
				revision: "3.0.0",
				captures: [
					{
						label: "overview",
						ok: true,
						file: "captures/main.png",
						provenance: { width, height: 1 },
						tiles,
					},
				],
			}),
		);
	});
	// The pinned Flask checkout is staged only when absent; a `.git` marker stands in for it.
	fs.mkdirSync(path.join(root, "graders", "workspace", "flask", "3.0.0", ".git"), {
		recursive: true,
	});
	const log = path.join(root, "fake-claude.log");
	const executable = path.join(root, "claude");
	fs.writeFileSync(
		executable,
		`#!/bin/sh\nFAKE_CLAUDE_MODE=${mode} FAKE_CLAUDE_VERSION=${version} FAKE_CLAUDE_LOG=${log} exec "${process.execPath}" "${path.join(import.meta.dir, "fake-claude.ts")}" "$@"\n`,
		{ mode: 0o755 },
	);
	const options: GradingOptions = {
		batchRoot: root,
		checkout,
		cache: path.join(root, "absent-cache"),
		loaded,
		chunkSize: 1,
		signal: new AbortController().signal,
		log: () => {},
		grader: "claude",
		executable,
	};
	return { root, options, log };
}

test("a Claude pass files every verdict with read receipts, resumes one session, and sums per-call usage", async () => {
	const { root, options, log } = batch();
	const graded = await gradeBatch(options);
	expect(graded.session.runner).toBe("claude");
	expect(graded.session.version).toBe(loaded.graders.claude.version);
	expect(graded.session.settings?.["model"]).toBe(loaded.graders.claude.model);
	expect(graded.session.calls.map((call) => call.error)).toEqual([null, null]);
	expect(graded.session.calls.map((call) => call.graded)).toEqual([[RUNS[0]], [RUNS[1]]]);
	const argvs = fs
		.readFileSync(log, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line) as string[]);
	const grading = argvs.filter((argv) => !argv.includes("--version"));
	expect(grading[0]).toContain("--session-id");
	expect(grading[1]).toContain("--resume");
	expect(grading[1]?.[grading[1].indexOf("--resume") + 1]).toBe(graded.session.threadId ?? "");
	for (const run of RUNS) {
		expect(filedVerdict(root, "claude", run)?.summary).toBe(`graded ${run}`);
		expect(suppliedCaptures(root, "claude", run)).toEqual(["overview"]);
	}
	const perCall = { input: 17, cached: 5, cacheWrite: 2, output: 3, reasoning: 1, total: 20 };
	expect(graded.session.calls[0]?.callUsage).toEqual(perCall);
	expect(graded.session.calls[1]?.raw?.costUsd).toBe(0.25);
	expect(graded.usage).toEqual({
		...perCall,
		input: 34,
		cached: 10,
		cacheWrite: 4,
		output: 6,
		reasoning: 2,
		total: 40,
	});
	expect(graderUsage(root, "claude")).toEqual(graded.usage);
	expect(availableGraders(root)).toEqual(["claude"]);
	expect(graderLayout(root, "claude").legacy).toBe(false);
	const events = fs.readFileSync(graded.session.calls[0]?.eventsFile ?? "", "utf8");
	expect(events).toContain("base64 characters omitted");
	// A second pass has nothing left to grade and starts no call.
	const again = await gradeBatch(options);
	expect(again.session.calls).toHaveLength(2);
});

test("a capture whose tile the grader never opened has no receipt, so its visual verdict cannot stand", async () => {
	const { root, options } = batch("skip-tiles");
	const graded = await gradeBatch(options);
	expect(graded.session.calls.map((call) => call.error)).toEqual([null, null]);
	expect(suppliedCaptures(root, "claude", RUNS[0])).toEqual([]);
	expect(suppliedCaptures(root, "claude", RUNS[1])).toEqual(["overview"]);
});

test.each([
	["outside-read", "read outside the workspace"],
	["no-output", "no structured output"],
	["refuse-schema", "claude exited 1; Error: --json-schema is not a valid JSON Schema"],
])("a call in mode %s is an error, not a verdict", async (mode, reason) => {
	const { root, options } = batch(mode);
	const graded = await gradeBatch(options);
	for (const call of graded.session.calls) {
		expect(call.error).toContain(reason);
		expect(call.graded).toEqual([]);
	}
	expect(filedVerdict(root, "claude", RUNS[0])).toBeNull();
});

test("an executable that is not the pinned version is refused before any call", async () => {
	const { options, log } = batch("grade", "0.0.1");
	await expect(gradeBatch(options)).rejects.toThrow(/requires claude .*reports 0\.0\.1/u);
	expect(fs.readFileSync(log, "utf8").trim().split("\n")).toHaveLength(1);
});

test("a batch graded before there was a choice keeps its single grader directory as Codex", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-legacy-layout-"));
	roots.push(root);
	fs.mkdirSync(path.join(root, "grader", "verdicts"), { recursive: true });
	fs.writeFileSync(
		path.join(root, "grader", "session.json"),
		JSON.stringify({ threadId: "t", calls: [] }),
	);
	expect(graderLayout(root, "codex")).toMatchObject({
		legacy: true,
		root: path.join(root, "grader"),
		workspace: path.join(root, "grader", "workspace"),
	});
	expect(graderLayout(root, "claude")).toMatchObject({
		legacy: false,
		root: path.join(root, "graders", "claude"),
		workspace: path.join(root, "graders", "workspace"),
	});
	expect(availableGraders(root)).toEqual(["codex"]);
});

// Math that callers repeat on an export (TASK-646.06): `EXPOSED_VALUE_COMPUTED`.
//
// The checkout `shop` holds a canonical vault. `timing` exports durations and
// a getter. `codex` and `relay` compute the restart backoff on
// `PROCESS_MS` with their own names, in another operand order, and `relay`
// through local variables. `codex` and `worker` compute the same jitter on the
// getter `jitterMs`. `worker` and `server` compare and mask `DEADLINE_MS`,
// which is no math, and compute different math on `STEP_MS`. Only `server`
// computes on `LIMIT`.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";
import type * as CodeCheckRun from "#runtime/api/code-check-run.ts";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { git as fixtureGit, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-module-depth-computed-")));
const shop = join(scratch, "shop");
const vault = join(shop, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let codeCheck: ReturnType<typeof CodeCheckRun.createCodeCheck>;

/**
 * Run Git in the checkout.
 * @param args Git's arguments.
 */
function git(...args: string[]): void {
	fixtureGit(scratch, shop, ...args);
}

/**
 * One module of the model, bound to its directory.
 * @param id Its id in the model.
 * @param order Its order.
 */
function module(id: string, order: number): void {
	write(vault, {
		[`${id}.module.json`]: JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${id}`,
			name: id,
			kind: "module",
			order,
			binding: { repo: SHOP, path: `src/${id.toLowerCase()}` },
			outgoing: [],
		}),
	});
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"src/timing/index.ts": [
			"export const PROCESS_MS = Object.freeze({ restartBase: 1000, restartMax: 30_000 });",
			"export const DEADLINE_MS = 5000;",
			"export const STEP_MS = 10;",
			"export const LIMIT = 3;",
			"export function jitterMs(): number {",
			"\treturn 50;",
			"}",
			"",
		].join("\n"),
		"src/codex/main.ts": [
			'import { jitterMs, PROCESS_MS } from "../timing";',
			"export function delay(attempt: number): number {",
			"\treturn Math.min(PROCESS_MS.restartMax, PROCESS_MS.restartBase * 2 ** attempt);",
			"}",
			"export function spread(seed: number): number {",
			"\treturn jitterMs() * seed + 1;",
			"}",
			"",
		].join("\n"),
		"src/relay/main.ts": [
			'import { PROCESS_MS } from "../timing";',
			"const { restartMax } = PROCESS_MS;",
			"export function wait(tries: number): number {",
			"\tconst base = PROCESS_MS.restartBase;",
			"\treturn Math.min(2 ** tries * base, restartMax);",
			"}",
			"",
		].join("\n"),
		"src/worker/main.ts": [
			'import { DEADLINE_MS, jitterMs, STEP_MS } from "../timing";',
			"export function late(elapsed: number, flags: number): boolean {",
			"\treturn elapsed === DEADLINE_MS || (flags & DEADLINE_MS) > 0;",
			"}",
			"export function noise(n: number): number {",
			"\treturn (1 + n * jitterMs());",
			"}",
			"export const next = STEP_MS * 2;",
			"",
		].join("\n"),
		"src/server/main.ts": [
			'import { DEADLINE_MS, LIMIT, STEP_MS } from "../timing";',
			"export function due(now: number): boolean {",
			"\treturn now !== DEADLINE_MS && (now | DEADLINE_MS) > 0;",
			"}",
			"export const later = STEP_MS + 2;",
			"export const most = LIMIT + 1;",
			"",
		].join("\n"),
	});
	write(vault, {
		"model.json": JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Built", name: "Built" },
		}),
		".archboard/config.yaml": Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY),
	});
	module("Timing", 10);
	module("Codex", 20);
	module("Relay", 30);
	module("Worker", 40);
	module("Server", 50);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [SHOP]: shop });
	codeCheck = (await import("#runtime/api/code-check-run.ts")).createCodeCheck();
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Run the code check over the vault.
 * @returns The answer.
 */
async function check(): Promise<CodeCheckAnswer> {
	const answer = await codeCheck.run({
		vault,
		variant: undefined,
		everyDraft: false,
		plans: [],
		signal: new AbortController().signal,
	});
	if (!("states" in answer)) throw new Error(answer.error);
	return answer;
}

/**
 * The findings on Timing's values, as the export each names, its code and its severity.
 * @param answer The answer.
 * @returns Each finding.
 */
function onTiming(answer: CodeCheckAnswer) {
	return answer.findings
		.filter((each) => each.subject?.name === "Timing" && each.export !== undefined)
		.map((each) => [each.export, each.code, each.severity]);
}

test("math that two modules write on one export is a warning, whatever their names, operand order or local variable", async () => {
	const answer = await check();
	expect(onTiming(answer)).toEqual([
		["PROCESS_MS", "EXPOSED_VALUE_COMPUTED", "warning"],
		// Comparing and masking is no math, and different math is no repeat.
		["DEADLINE_MS", "EXPOSED_VALUE", "warning"],
		["STEP_MS", "EXPOSED_VALUE", "warning"],
		["LIMIT", "EXPOSED_VALUE", "warning"],
		// A getter whose result two modules compute on.
		["jitterMs", "EXPOSED_VALUE_COMPUTED", "warning"],
	]);
});

test("the finding lists every caller line that writes the math", async () => {
	const answer = await check();
	const lines = (name: string) =>
		answer.findings
			.find((each) => each.code === "EXPOSED_VALUE_COMPUTED" && each.export === name)
			?.evidence?.map((each) => [each.from, each.path, each.line]);
	// Both restart values: `codex` reads them in one line, `relay` through its locals.
	expect(lines("PROCESS_MS")).toEqual([
		["Shop#Codex", "src/codex/main.ts", 3],
		["Shop#Relay", "src/relay/main.ts", 5],
	]);
	expect(lines("jitterMs")).toEqual([
		["Shop#Codex", "src/codex/main.ts", 6],
		["Shop#Worker", "src/worker/main.ts", 6],
	]);
});

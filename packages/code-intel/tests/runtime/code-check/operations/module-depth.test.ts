// The code check measures each bound TypeScript module from its code and
// judges its exports (TASK-646.04): it counts the exports by kind and the
// pieces of logic behind them, warns of an exported value that outside code
// reads, and names a module whose every value export carries such a finding
// shallow, as information. It marks the modules that the branch touched,
// working tree included, when it is asked or the model's policy turns the gate
// on, and its severities never depend on who asks.
//
// The checkout `shop` holds a canonical vault and its modules: `timing`
// exports a frozen group of durations, made by a call, and a plain duration,
// which the server and the worker read; `clock` exports a getter over a hidden
// value; `config` exports a value the server reads beside a function, a value
// read only as a type and one only a test reads; `ledger` exports a class; and
// `kit` is bound through its index, with a part inside it; `mixed` holds
// TypeScript and Python, and `docs` holds no code. The branch `work`
// changes `timing` and `kit`'s part in the working tree, after its commits.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";
import type * as CodeCheckRun from "#runtime/api/code-check-run.ts";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { git as fixtureGit, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-module-depth-")));
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
 * Write the vault's policy.
 * @param gate Whether the policy turns the shallow-module gate on.
 */
function policy(gate: boolean): void {
	write(vault, {
		".archboard/config.yaml": Bun.YAML.stringify({
			...DEFAULT_SEMANTIC_POLICY,
			...(gate ? { codeCheck: { failShallowModules: true } } : {}),
		}),
	});
}

/**
 * One module of the model, bound to code in the checkout.
 * @param id Its id in the model.
 * @param path Its bound path.
 * @param order Its order.
 * @param parent The module that holds it, if any.
 */
function module(id: string, path: string, order: number, parent?: string): void {
	write(vault, {
		[`${id}.module.json`]: JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${id}`,
			name: id,
			kind: "module",
			order,
			binding: { repo: SHOP, path },
			...(parent === undefined ? {} : { parent: `Shop#${parent}` }),
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
			"function durations<T extends Record<string, number>>(values: T): Readonly<T> {",
			"\treturn Object.freeze(values);",
			"}",
			"const SCALE = 2;",
			"export const RETRY_MS = durations({ base: 100 * SCALE, max: 5000 });",
			"export const IDLE_MS = 9;",
			"export type Duration = number;",
			"export interface Window {",
			"\treadonly ms: Duration;",
			"}",
			"",
		].join("\n"),
		"src/server/retry.ts": [
			'import { IDLE_MS, RETRY_MS } from "../timing";',
			"export function retry(attempt: number): number {",
			"\treturn Math.min(RETRY_MS.base * 2 ** attempt, RETRY_MS.max);",
			"}",
			"export function idle(): number {",
			"\treturn IDLE_MS;",
			"}",
			"",
		].join("\n"),
		"src/worker/backoff.ts":
			'import { RETRY_MS } from "../timing";\nexport function backoff(): number {\n\treturn RETRY_MS.max;\n}\n',
		"src/clock/index.ts":
			"const TICK_MS = 5;\nexport function tickMs(): number {\n\treturn TICK_MS;\n}\n",
		"src/server/tick.ts":
			'import { tickMs } from "../clock";\nexport function tick(): number {\n\treturn tickMs();\n}\n',
		"src/config/index.ts": [
			"export const LIMIT = 3;",
			"export const SHAPE = { wide: true };",
			"export const FIXTURE = 1;",
			"export function limit(): number {",
			"\treturn LIMIT;",
			"}",
			"",
		].join("\n"),
		"src/server/config.ts": [
			'import { LIMIT, SHAPE } from "../config";',
			"export function read(shape: typeof SHAPE): number {",
			"\treturn LIMIT + Number(shape.wide);",
			"}",
			"",
		].join("\n"),
		"tests/config.test.ts": 'import { FIXTURE } from "../src/config";\nconsole.log(FIXTURE);\n',
		"src/ledger/index.ts":
			"export class Ledger {\n\tpost(): number {\n\t\treturn 1;\n\t}\n\tprivate hide(): void {}\n}\n",
		"src/server/ledger.ts":
			'import { Ledger } from "../ledger";\nexport function post(): number {\n\treturn new Ledger().post();\n}\n',
		"src/kit/index.ts": 'export { add } from "./lib/math";\n',
		"src/kit/lib/math.ts":
			"export function add(a: number, b: number): number {\n\treturn a + b;\n}\n",
		"src/mixed/index.ts": "export function wave(): number {\n\treturn 1;\n}\n",
		"src/mixed/__init__.py": "def wave():\n    return 1\n",
		"docs/guide.md": "# Guide\n",
		"src/server/kit.ts":
			'import { add } from "../kit";\nexport function sum(): number {\n\treturn add(1, 2);\n}\n',
	});
	write(vault, {
		"model.json": JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Built", name: "Built" },
		}),
	});
	policy(false);
	module("Server", "src/server", 10);
	module("Worker", "src/worker", 20);
	module("Timing", "src/timing", 30);
	module("Clock", "src/clock", 40);
	module("Config", "src/config", 50);
	module("Ledger", "src/ledger", 60);
	module("Kit", "src/kit/index.ts", 70);
	module("Math", "src/kit/lib/math.ts", 80, "Kit");
	module("Mixed", "src/mixed", 90);
	module("Docs", "docs", 100);
	git("add", "-A");
	git("commit", "-q", "--no-gpg-sign", "-m", "the code");
	git("checkout", "-q", "-b", "work");
	// The branch's own changes, not yet committed.
	write(shop, {
		"src/timing/index.ts": [
			"function durations<T extends Record<string, number>>(values: T): Readonly<T> {",
			"\treturn Object.freeze(values);",
			"}",
			"const SCALE = 2;",
			"export const RETRY_MS = durations({ base: 100 * SCALE, max: 5000 });",
			"export const IDLE_MS = 12;",
			"export type Duration = number;",
			"export interface Window {",
			"\treadonly ms: Duration;",
			"}",
			"",
		].join("\n"),
		"src/kit/lib/math.ts":
			"export function add(a: number, b: number): number {\n\treturn b + a;\n}\n",
	});
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
 * @param asked What the request names beyond the vault.
 * @returns The answer.
 */
async function check(asked: { base?: string; touched?: boolean } = {}): Promise<CodeCheckAnswer> {
	const answer = await codeCheck.run({
		vault,
		variant: undefined,
		everyDraft: false,
		plans: [],
		...asked,
		signal: new AbortController().signal,
	});
	if (!("states" in answer)) throw new Error(answer.error);
	return answer;
}

/**
 * The findings of one code, as the module and the export each names, and its severity.
 * @param answer The answer.
 * @param code The code.
 * @returns Each finding.
 */
function judged(answer: CodeCheckAnswer, code: string) {
	return answer.findings
		.filter((each) => each.code === code)
		.map((each) => [each.subject?.name, each.export, each.severity]);
}

test("the check counts each bound TypeScript module's exports by kind and the pieces of logic behind them", async () => {
	const answer = await check();
	const depth = new Map(answer.depth?.map((each) => [each.subject.name, each]));
	// The call, the freeze and the product, and the hidden SCALE.
	expect(depth.get("Timing")).toMatchObject({
		directory: "src/timing",
		exports: { functions: 0, classes: 0, methods: 0, values: 2, types: 2 },
		logic: 4,
	});
	// A public method is an export of its own; a private one is not.
	expect(depth.get("Ledger")?.exports).toEqual({
		functions: 0,
		classes: 1,
		methods: 1,
		values: 0,
		types: 0,
	});
	expect(depth.get("Clock")?.exports).toMatchObject({ functions: 1, values: 0 });
});

test("each measured module lists the exports it counted, where each is defined, and the languages no rule judged", async () => {
	const answer = await check();
	const depth = new Map(answer.depth?.map((each) => [each.subject.name, each]));
	expect(depth.get("Ledger")?.names).toEqual([
		{ name: "Ledger", kind: "class", path: "src/ledger/index.ts", line: 1 },
		{ name: "Ledger.post", kind: "method", path: "src/ledger/index.ts", line: 2 },
	]);
	expect(depth.get("Timing")?.names.map(({ name, kind }) => [name, kind])).toEqual([
		["RETRY_MS", "value"],
		["IDLE_MS", "value"],
		["Duration", "type"],
		["Window", "type"],
	]);
	expect(depth.get("Timing")?.unjudged).toEqual([]);
	// The Python half of a module is read and judged beside its TypeScript.
	expect(depth.get("Mixed")).toMatchObject({ languages: ["typescript", "python"], unjudged: [] });
});

test("a skipped part carries the canonical model and state, as its findings do", async () => {
	const answer = await check();
	const subjects = answer.skipped.filter((skip) => skip.subject !== undefined);
	expect(subjects.length).toBeGreaterThan(0);
	for (const skip of subjects) expect(skip).toMatchObject({ model: "Shop", state: "Built" });
	expect(subjects.some((skip) => skip.variant !== undefined)).toBe(false);
});

test("an exported value that outside code reads is a warning, a value made by a call included, and a getter clears it", async () => {
	const answer = await check();
	expect(judged(answer, "EXPOSED_VALUE")).toEqual([
		["Timing", "RETRY_MS", "warning"],
		["Timing", "IDLE_MS", "warning"],
		// SHAPE is read only as a type, and FIXTURE only by a test.
		["Config", "LIMIT", "warning"],
	]);
	const retry = answer.findings.find((each) => each.export === "RETRY_MS");
	expect(retry?.evidence?.map((each) => each.path)).toEqual([
		"src/server/retry.ts",
		"src/worker/backoff.ts",
	]);
});

test("the remedies of an exposed value follow its readers: one reader takes it, several get the behavior moved in", async () => {
	const answer = await check();
	const idle = answer.findings.find((each) => each.export === "IDLE_MS");
	const retry = answer.findings.find((each) => each.export === "RETRY_MS");
	// One reader is named as the place the value moves to.
	expect(idle?.message).toContain('"Server"');
	expect(idle?.message).not.toContain('"Worker"');
	// Several readers are named as the modules whose behavior moves in.
	expect(retry?.message).toContain('"Server"');
	expect(retry?.message).toContain('"Worker"');
	expect(idle?.message).not.toBe(retry?.message?.replaceAll("RETRY_MS", "IDLE_MS"));
});

test("a module whose every export that is not a type carries a per-name finding is shallow, as information", async () => {
	const answer = await check();
	expect(judged(answer, "MODULE_SHALLOW")).toEqual([["Timing", undefined, "information"]]);
});

/**
 * Each finding's code, subject, export and severity.
 * @param answer The answer.
 * @returns Them, in the answer's order.
 */
function severities(answer: CodeCheckAnswer) {
	return answer.findings.map((each) => [each.code, each.subject?.id, each.export, each.severity]);
}

test("the check marks the modules that the branch touched, working tree included, and its severities stay the same", async () => {
	const plain = await check();
	const asked = await check({ touched: true });
	expect(asked.touched).toEqual([
		{
			model: "Shop",
			state: "Built",
			base: "main",
			modules: expect.arrayContaining(["Shop#Timing", "Shop#Kit"]),
			unread: [],
		},
	]);
	expect(asked.touched?.[0]?.modules).not.toContain("Shop#Clock");
	expect(plain.touched).toBeUndefined();
	expect(severities(asked)).toEqual(severities(plain));
});

test("a named base that does not resolve is a refusal, never a pass", async () => {
	const answer = await codeCheck.run({
		vault,
		variant: undefined,
		everyDraft: false,
		plans: [],
		base: "no-such-base",
		signal: new AbortController().signal,
	});
	expect(answer).toMatchObject({ code: "BASE_UNRESOLVED" });
});

test("the model's policy turns the gate on, so the answer marks the touched modules unasked", async () => {
	policy(true);
	try {
		const answer = await check();
		expect(answer.models?.[0]?.failShallowModules).toBe(true);
		expect(answer.touched?.[0]?.modules).toContain("Shop#Timing");
		expect(judged(answer, "MODULE_SHALLOW")).toEqual([["Timing", undefined, "information"]]);
	} finally {
		policy(false);
	}
});

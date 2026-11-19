// The per-name rules of module depth beside `EXPOSED_VALUE` (TASK-646.05):
// pass-throughs, two doors to one name, and exports that no caller uses.
//
// The checkout `shop` holds a canonical vault. `relay` only passes calls on:
// a function, a public method, and a `toJSON` that the language calls.
// `store` defines `save`; `text` defines `format`. `kit` re-exports both: the
// server reaches `save` through `kit` while the worker and `relay` import
// `store` directly, so `save` has two doors; `format` has one. `util` exports a
// function no file outside uses, one that only a test uses, one the server
// uses, and an unused type. `port` exports an interface and a class that
// implements it; outside code calls the method only through the interface.
// `sdk` exports a function no file uses, but the model draws a consumer
// of it whose code the check does not read.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";
import type * as CodeCheckRun from "#runtime/api/code-check-run.ts";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { git as fixtureGit, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-module-depth-names-")));
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
 * One module of the model.
 * @param id Its id in the model.
 * @param order Its order.
 * @param path Its bound path; none leaves it unbound.
 * @param calls The modules it calls.
 */
function module(id: string, order: number, path?: string, calls: readonly string[] = []): void {
	write(vault, {
		[`${id}.module.json`]: JSON.stringify({
			schemaVersion: 1,
			id: `Shop#${id}`,
			name: id,
			kind: "module",
			order,
			...(path === undefined ? {} : { binding: { repo: SHOP, path } }),
			outgoing: calls.map((to, index) => ({
				id: `Shop#r${id.slice(0, 3)}${index}`,
				order: (index + 1) * 10,
				kind: "call",
				to: `Shop#${to}`,
			})),
		}),
	});
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git("init", "-q", "-b", "main");
	git("remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"src/relay/index.ts": [
			'import { save } from "../store";',
			"function describe(key: string): string {",
			"\treturn `relay ${key}`;",
			"}",
			"export function put(item: string): Promise<void> {",
			"\treturn save(item);",
			"}",
			"export class Relay {",
			"\tconstructor(private readonly target: { send(id: string): void }) {}",
			"\tsend(id: string): void {",
			"\t\tthis.target.send(id);",
			"\t}",
			"\ttoJSON(key: string): string {",
			"\t\treturn describe(key);",
			"\t}",
			"}",
			"",
		].join("\n"),
		"src/store/index.ts": [
			"function write(item: string): Promise<void> {",
			"\treturn Promise.resolve(void item.length);",
			"}",
			"export async function save(item: string): Promise<void> {",
			"\tawait write(item.trim());",
			"}",
			"",
		].join("\n"),
		"src/text/index.ts":
			"export function format(value: number): string {\n\treturn value.toFixed(2);\n}\n",
		"src/kit/index.ts": [
			'export { save } from "../store";',
			'export { format } from "../text";',
			"export function twice(value: number): number {",
			"\treturn value * 2;",
			"}",
			"",
		].join("\n"),
		"src/util/index.ts": [
			"export function unusedHelper(value: number): number {",
			"\treturn value + 1;",
			"}",
			"export function testOnly(value: number): number {",
			"\treturn value - 1;",
			"}",
			"export function used(value: number): number {",
			"\treturn value * 3;",
			"}",
			"export type Unused = number;",
			"",
		].join("\n"),
		"tests/util.test.ts": 'import { testOnly } from "../src/util";\nconsole.log(testOnly(1));\n',
		"src/port/index.ts": [
			"export interface Port {",
			"\tsend(id: string): number;",
			"}",
			"export class HttpPort implements Port {",
			"\tsend(id: string): number {",
			"\t\treturn id.length + 1;",
			"\t}",
			"}",
			"",
		].join("\n"),
		"src/sdk/index.ts":
			"export function publish(value: number): number {\n\treturn value + 1;\n}\n",
		"src/server/main.ts": [
			'import { put, Relay } from "../relay";',
			'import { format, save, twice } from "../kit";',
			'import { used } from "../util";',
			'import { HttpPort, type Port } from "../port";',
			"async function main(): Promise<string> {",
			"\tconst sink: Port = new HttpPort();",
			"\tnew Relay({ send: (id) => void sink.send(id) }).send(format(twice(1)));",
			'\tawait put("a");',
			'\tawait save("b");',
			"\treturn String(used(2));",
			"}",
			"void main();",
			"",
		].join("\n"),
		"src/worker/main.ts": [
			'import { save } from "../store";',
			"async function work(): Promise<void> {",
			'\tawait save("c");',
			"}",
			"void work();",
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
	module("Server", 10, "src/server");
	module("Worker", 20, "src/worker");
	module("Relay", 30, "src/relay");
	module("Store", 40, "src/store");
	module("Text", 50, "src/text");
	module("Kit", 60, "src/kit");
	module("Util", 70, "src/util");
	module("Port", 80, "src/port");
	module("Sdk", 90, "src/sdk");
	// A consumer outside the checkout, as the users of a published package are.
	module("Consumer", 100, undefined, ["Sdk"]);
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

test("a function or public method that only passes its call on is information, and members the language calls are not judged", async () => {
	const answer = await check();
	expect(judged(answer, "CODE_PASS_THROUGH")).toEqual([
		["Relay", "put", "information"],
		["Relay", "Relay.send", "information"],
	]);
	// Every export that is not a type, each public method among them, passes its call on.
	expect(judged(answer, "MODULE_SHALLOW")).toEqual([["Relay", undefined, "information"]]);
});

test("a re-export is information through one door, and a warning when outside callers also import the defining module", async () => {
	const answer = await check();
	expect(judged(answer, "REEXPORT_PASS_THROUGH")).toEqual([
		["Kit", "save", "warning"],
		["Kit", "format", "information"],
	]);
	const save = answer.findings.find(
		(each) => each.code === "REEXPORT_PASS_THROUGH" && each.export === "save",
	);
	// The other door: the files outside both modules that import the defining module.
	expect(save?.evidence?.map((each) => each.path)).toEqual([
		"src/relay/index.ts",
		"src/worker/main.ts",
	]);
});

test("an export no file outside uses is a warning after a complete read, and a use through another module's door is a use", async () => {
	const answer = await check();
	expect(judged(answer, "EXPOSED_UNUSED")).toEqual([
		// A test is no user, and a type no exemption.
		["Util", "unusedHelper", "warning"],
		["Util", "testOnly", "warning"],
		["Util", "Unused", "warning"],
		// The model draws a consumer whose code the check does not read.
		["Sdk", "publish", "information"],
	]);
	// `format` and `save` are used through `kit`'s door, and `HttpPort.send` through `Port.send`.
});

/** The codes of module depth. */
const DEPTH = new Set([
	"EXPOSED_UNUSED",
	"REEXPORT_PASS_THROUGH",
	"EXPOSED_VALUE",
	"CODE_PASS_THROUGH",
	"MODULE_SHALLOW",
]);

test("one finding per name, grouped by module", async () => {
	const answer = await check();
	const depth = answer.findings.filter((each) => DEPTH.has(each.code));
	const relay = depth
		.filter((each) => each.subject?.name === "Relay")
		.map((each) => [each.code, each.export]);
	expect(relay).toEqual([
		["CODE_PASS_THROUGH", "put"],
		["CODE_PASS_THROUGH", "Relay.send"],
		["MODULE_SHALLOW", undefined],
	]);
	const modules = depth.map((each) => each.subject?.name);
	const runs = modules.filter((name, index) => name !== modules[index - 1]);
	expect(new Set(runs).size).toBe(runs.length);
});

test("an outside file that the check could not read fully makes an unused export information", async () => {
	write(shop, { "src/broken.ts": "export function (\n" });
	try {
		const answer = await check();
		expect(judged(answer, "EXPOSED_UNUSED").map(([, name, severity]) => [name, severity])).toEqual([
			["unusedHelper", "information"],
			["testOnly", "information"],
			["Unused", "information"],
			["publish", "information"],
		]);
	} finally {
		rmSync(join(shop, "src/broken.ts"));
	}
});

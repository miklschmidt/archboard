// Module depth reads Go packages (TASK-646.11): what the Go grammar decides
// for it. The kind of each export, the pieces of logic in each body, the
// function and the method that only pass their call on, the methods Go calls
// itself, and the math around each use of a name another package defines. The
// rules themselves are asserted once, for TypeScript.
//
// The checkout `shop` holds a canonical vault. The package `timing` exports
// durations, a getter, a function and a method that pass their call on, a
// struct, a named type with a method of its own, and three types. `codex` and
// `relay` write the restart backoff on the durations, `relay` through a local
// variable. `codex` and `worker` compute the same jitter on the getter.
// `worker` compares `Limit`, which is no math.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";
import type * as CodeCheckRun from "#runtime/api/code-check-run.ts";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { git as fixtureGit, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-go-depth-")));
const shop = join(scratch, "shop");
const vault = join(shop, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let answer: CodeCheckAnswer;

/**
 * One module of the model, bound to its package.
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
	fixtureGit(scratch, shop, "init", "-q", "-b", "main");
	fixtureGit(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"go.mod": "module example.com/shop\n\ngo 1.22\n",
		"src/timing/timing.go": [
			"package timing",
			"",
			"const RestartBase = 1000",
			"",
			"var RestartMax = 30_000",
			"",
			"const Limit = 3",
			"",
			"var scale = 2",
			"",
			"type Duration int",
			"",
			"type Window interface {",
			"\tSpan() Duration",
			"}",
			"",
			"type Mode int",
			"",
			'func (m Mode) Label() string { return "mode" }',
			"",
			"type Handler = func()",
			"",
			"func JitterMs() int {",
			"\treturn 50 * scale",
			"}",
			"",
			"func Send(message string) error {",
			"\treturn deliver(message)",
			"}",
			"",
			"func deliver(message string) error {",
			'\tif message == "" {',
			"\t\treturn nil",
			"\t}",
			"\treturn nil",
			"}",
			"",
			"type Clock struct {",
			"\tstart int",
			"}",
			"",
			'func (c *Clock) String() string { return "clock" }',
			"",
			"func (c *Clock) Now() int { return c.start + 1 }",
			"",
			"func (c *Clock) Tick(step int) int { return c.advance(step) }",
			"",
			"func (c *Clock) advance(step int) int {",
			"\tfor i := 0; i < step; i++ {",
			"\t\tc.start++",
			"\t}",
			"\treturn c.start",
			"}",
			"",
		].join("\n"),
		"src/codex/codex.go": [
			"package codex",
			"",
			'import "example.com/shop/src/timing"',
			"",
			"func Delay(attempt int) timing.Duration {",
			"\treturn timing.Duration(min(timing.RestartMax, timing.RestartBase*2*attempt))",
			"}",
			"",
			"func Spread(seed int) int {",
			'\t_ = timing.Send("spread")',
			"\treturn timing.JitterMs()*seed + 1",
			"}",
			"",
			"func Run() int {",
			"\tc := timing.Clock{}",
			"\treturn c.Tick(1)",
			"}",
			"",
		].join("\n"),
		"src/relay/relay.go": [
			"package relay",
			"",
			'import "example.com/shop/src/timing"',
			"",
			"func Wait(tries int) int {",
			"\tbase := timing.RestartBase",
			"\treturn min(tries*base*2, timing.RestartMax)",
			"}",
			"",
		].join("\n"),
		"src/worker/worker.go": [
			"package worker",
			"",
			'import "example.com/shop/src/timing"',
			"",
			"func Late(tries int) bool {",
			"\treturn tries == timing.Limit",
			"}",
			"",
			"func Noise(n int) int {",
			"\treturn (1 + n*timing.JitterMs())",
			"}",
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
	fixtureGit(scratch, shop, "add", "-A");
	fixtureGit(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [SHOP]: shop });
	const codeCheck: ReturnType<typeof CodeCheckRun.createCodeCheck> = (
		await import("#runtime/api/code-check-run.ts")
	).createCodeCheck();
	const result = await codeCheck.run({
		vault,
		variant: undefined,
		everyDraft: false,
		plans: [],
		signal: new AbortController().signal,
	});
	if (!("states" in result)) throw new Error(result.error);
	answer = result;
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

test("a Go package's exports are counted by kind, without the methods Go calls itself", () => {
	const timing = answer.depth?.find((each) => each.subject.name === "Timing");
	expect(timing?.names.map(({ name, kind }) => [name, kind])).toEqual([
		["RestartBase", "value"],
		["RestartMax", "value"],
		["Limit", "value"],
		["Duration", "type"],
		["Window", "type"],
		// A named type whose file declares a method on it is a class.
		["Mode", "class"],
		["Mode.Label", "method"],
		["Handler", "type"],
		["JitterMs", "function"],
		["Send", "function"],
		["Clock", "class"],
		["Clock.Now", "method"],
		["Clock.Tick", "method"],
	]);
	expect(timing).toMatchObject({ languages: ["go"], unjudged: [] });
	// The product, the call `Send` passes on, the condition and its
	// comparison, the sum, the call `Tick` passes on, the loop, its comparison
	// and its step, the increment, and the hidden `scale`.
	expect(timing?.logic).toBe(11);
});

test("each Go export gets the verdict its uses and its body earn", () => {
	const findings = answer.findings
		.filter((each) => each.subject?.name === "Timing" && each.export !== undefined)
		.map((each) => [each.export, each.code]);
	expect(findings).toEqual([
		// Two packages write the same backoff on each duration, with their own names.
		["RestartBase", "EXPOSED_VALUE_COMPUTED"],
		["RestartMax", "EXPOSED_VALUE_COMPUTED"],
		// Comparing is no math.
		["Limit", "EXPOSED_VALUE"],
		// Only a signature names Duration; nothing names the others.
		["Window", "EXPOSED_UNUSED"],
		["Mode", "EXPOSED_UNUSED"],
		["Handler", "EXPOSED_UNUSED"],
		["JitterMs", "EXPOSED_VALUE_COMPUTED"],
		["Send", "CODE_PASS_THROUGH"],
		["Clock.Tick", "CODE_PASS_THROUGH"],
	]);
});

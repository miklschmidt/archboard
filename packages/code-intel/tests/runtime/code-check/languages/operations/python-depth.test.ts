// Module depth reads Python modules (TASK-646.11): what the Python grammar
// decides for it. The kind of each export, the pieces of logic in each body,
// the function that only passes its call on, the members Python calls itself,
// and the math around each use of a name another module defines. The rules
// themselves are asserted once, for TypeScript.
//
// The checkout `shop` holds a canonical vault. The package `timing` exports
// durations, a getter, a function and a method that pass their call on, a
// class, two type aliases, a dataclass and an enum with no method, an enum
// with one, and an exception. `codex` and `relay` write the restart backoff on
// the durations, `relay` through a local variable and the module's own name.
// `codex` and `worker` compute the same jitter on the getter. `worker`
// compares `LIMIT`, which is no math.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import type * as CodeCheckRun from "#runtime/api/code-check-run.ts";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { git as fixtureGit, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-python-depth-")));
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
		"src/timing/__init__.py": [
			"import enum",
			"from dataclasses import dataclass",
			"from enum import IntEnum",
			"from typing import TypeAlias",
			"",
			"RESTART_BASE = 1000",
			"RESTART_MAX = 30_000",
			"LIMIT = 3",
			"_SCALE = 2",
			"Duration: TypeAlias = int",
			"type Window = tuple[int, int]",
			"",
			"def jitter_ms():",
			"    return 50 * _SCALE",
			"",
			"def send(message):",
			'    """Send a message."""',
			"    return _deliver(message)",
			"",
			"def _deliver(message):",
			"    if message:",
			"        print(message)",
			"",
			"class Clock:",
			"    def __init__(self, start):",
			"        self._start = start",
			"",
			"    def __repr__(self):",
			'        return "Clock"',
			"",
			"    def now(self):",
			"        return self._start + 1",
			"",
			"    def tick(self, step):",
			"        return self._advance(step)",
			"",
			"    def _advance(self, step):",
			"        for _ in range(step):",
			"            self._start += 1",
			"",
			"@dataclass(frozen=True)",
			"class Point:",
			"    x: int",
			"",
			"class Color(enum.Enum):",
			"    RED = 1",
			"",
			"class Level(IntEnum):",
			"    LOW = 1",
			"",
			"    def label(self):",
			'        return "low"',
			"",
			"class Failure(Exception):",
			"    pass",
			"",
		].join("\n"),
		"src/codex/__init__.py": [
			"from timing import RESTART_BASE, RESTART_MAX, Clock, Duration, jitter_ms, send",
			"",
			"def delay(attempt) -> Duration:",
			"    return min(RESTART_MAX, RESTART_BASE * 2 ** attempt)",
			"",
			"def spread(seed):",
			"    send(seed)",
			"    return jitter_ms() * seed + 1",
			"",
			"def run():",
			"    return Clock(0).tick(1)",
			"",
		].join("\n"),
		"src/relay/__init__.py": [
			"import timing",
			"",
			"def wait(tries):",
			"    base = timing.RESTART_BASE",
			"    return min(2 ** tries * base, timing.RESTART_MAX)",
			"",
		].join("\n"),
		"src/worker/__init__.py": [
			"from timing import LIMIT, jitter_ms",
			"",
			"def late(tries):",
			"    return tries == LIMIT",
			"",
			"def noise(n):",
			"    return (1 + n * jitter_ms())",
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
		".archboard/config.yaml": Bun.YAML.stringify(defaultSemanticPolicy()),
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

test("a Python module's exports are counted by kind, without the members Python calls itself", () => {
	const timing = answer.depth?.find((each) => each.subject.name === "Timing");
	expect(timing?.names.map(({ name, kind }) => [name, kind])).toEqual([
		["RESTART_BASE", "value"],
		["RESTART_MAX", "value"],
		["LIMIT", "value"],
		["Duration", "type"],
		["Window", "type"],
		["jitter_ms", "function"],
		["send", "function"],
		["Clock", "class"],
		["Clock.now", "method"],
		["Clock.tick", "method"],
		// A dataclass or an enum with no method is a type that holds data; any other class is a class.
		["Point", "type"],
		["Color", "type"],
		["Level", "class"],
		["Level.label", "method"],
		["Failure", "class"],
	]);
	expect(timing).toMatchObject({ languages: ["python"], unjudged: [] });
	// The product, the call `send` passes on, the condition and `print`, the
	// sum, the call `tick` passes on, the loop, `range` and the addition, and
	// the hidden `_SCALE`, and the call of the decorator `dataclass`.
	expect(timing?.logic).toBe(11);
});

test("each Python export gets the verdict its uses and its body earn", () => {
	const findings = answer.findings
		.filter((each) => each.subject?.name === "Timing" && each.export !== undefined)
		.map((each) => [each.export, each.code]);
	expect(findings).toEqual([
		// Two modules write the same backoff on each duration, with their own names.
		["RESTART_BASE", "EXPOSED_VALUE_COMPUTED"],
		["RESTART_MAX", "EXPOSED_VALUE_COMPUTED"],
		// Comparing is no math.
		["LIMIT", "EXPOSED_VALUE"],
		// Only an annotation names Duration; nothing names Window.
		["Window", "EXPOSED_UNUSED"],
		["jitter_ms", "EXPOSED_VALUE_COMPUTED"],
		// A docstring is no statement of the body.
		["send", "CODE_PASS_THROUGH"],
		["Clock.tick", "CODE_PASS_THROUGH"],
		// Nothing names the types and the classes after `Clock`.
		["Point", "EXPOSED_UNUSED"],
		["Color", "EXPOSED_UNUSED"],
		["Level", "EXPOSED_UNUSED"],
		["Failure", "EXPOSED_UNUSED"],
	]);
});

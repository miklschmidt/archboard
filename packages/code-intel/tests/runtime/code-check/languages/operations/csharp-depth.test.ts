// Module depth reads C# projects (TASK-646.11): what the C# grammar decides
// for it. The kind of each export, a static member among them, the pieces of
// logic in each body, the method that only passes its call on, the members C#
// calls itself, and the math around each use of a name another project
// defines. The rules themselves are asserted once, for TypeScript.
//
// The checkout `shop` holds a canonical vault. The project `timing` exports
// the static class `Durations`, whose constants, fields, properties and
// methods are exports of their own, a class, three types, a struct and a
// record with no method, and a struct with one. `codex` and
// `relay` write the restart backoff on the durations, `relay` through a local
// variable and the full name. `codex` and `worker` compute the same jitter on
// the getter `JitterMs`. `worker` compares `Limit`, which is no math.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import type * as CodeCheckRun from "#runtime/api/code-check-run.ts";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { git as fixtureGit, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = { ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"] };
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-csharp-depth-")));
const shop = join(scratch, "shop");
const vault = join(shop, ".archboard", "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let answer: CodeCheckAnswer;

/**
 * One module of the model, bound to its project.
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

/**
 * A project file, with the project reference it names, if any.
 * @param reference The referenced project's path, as the file writes it.
 * @returns The file's text.
 */
function project(reference?: string): string {
	return [
		'<Project Sdk="Microsoft.NET.Sdk">',
		"  <ItemGroup>",
		...(reference === undefined ? [] : [`    <ProjectReference Include="${reference}" />`]),
		"  </ItemGroup>",
		"</Project>",
		"",
	].join("\n");
}

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	fixtureGit(scratch, shop, "init", "-q", "-b", "main");
	fixtureGit(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		"src/timing/Timing.csproj": project(),
		"src/timing/Durations.cs": [
			"namespace Shop.Timing;",
			"",
			"public static class Durations",
			"{",
			"    public const int RestartBase = 1000;",
			"    public static readonly int RestartMax = 30_000;",
			"    public static int Limit { get; } = 3;",
			"    private static int scale = 2;",
			"    public static int JitterMs => 50 * scale;",
			"    public static void Send(string message) => Deliver(message);",
			"",
			"    private static void Deliver(string message)",
			"    {",
			"        if (message.Length > 0) System.Console.WriteLine(message);",
			"    }",
			"}",
			"",
			"public interface IWindow",
			"{",
			"    int Span();",
			"}",
			"",
			"public enum Mode { On, Off }",
			"",
			"public delegate void Handler();",
			"",
			"public struct Point { public int X; }",
			"",
			"public record Money(int Cents);",
			"",
			"public struct Range",
			"{",
			"    public int Width() => 1;",
			"}",
			"",
			"public class Clock",
			"{",
			"    private int start;",
			"",
			"    public Clock(int start) { this.start = start; }",
			"",
			'    public override string ToString() => "clock";',
			"",
			"    public int Now() => start + 1;",
			"",
			"    public int Tick(int step) => Advance(step);",
			"",
			"    private int Advance(int step)",
			"    {",
			"        for (var i = 0; i < step; i++) start++;",
			"        return start;",
			"    }",
			"}",
			"",
		].join("\n"),
		"src/codex/Codex.csproj": project("../timing/Timing.csproj"),
		"src/codex/Backoff.cs": [
			"using Shop.Timing;",
			"",
			"namespace Shop.Codex;",
			"",
			"public static class Backoff",
			"{",
			"    public static int Delay(int attempt) =>",
			"        Math.Min(Durations.RestartMax, Durations.RestartBase * 2 * attempt);",
			"",
			"    public static int Spread(int seed)",
			"    {",
			'        Durations.Send("spread");',
			"        return Durations.JitterMs * seed + 1;",
			"    }",
			"",
			"    public static int Run() => new Clock(0).Tick(1);",
			"}",
			"",
		].join("\n"),
		"src/relay/Relay.csproj": project("../timing/Timing.csproj"),
		"src/relay/Wait.cs": [
			"namespace Shop.Relay;",
			"",
			"public static class Wait",
			"{",
			"    public static int For(int tries)",
			"    {",
			"        var b = Shop.Timing.Durations.RestartBase;",
			"        return Math.Min(tries * b * 2, Shop.Timing.Durations.RestartMax);",
			"    }",
			"}",
			"",
		].join("\n"),
		"src/worker/Worker.csproj": project("../timing/Timing.csproj"),
		"src/worker/Checks.cs": [
			"using Shop.Timing;",
			"",
			"namespace Shop.Worker;",
			"",
			"public static class Checks",
			"{",
			"    public static bool Late(int tries) => tries == Durations.Limit;",
			"",
			"    public static int Noise(int n) => (1 + n * Durations.JitterMs);",
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

test("a C# project's exports are counted by kind, a static member as an export of its own, without the members C# calls itself", () => {
	const timing = answer.depth?.find((each) => each.subject.name === "Timing");
	expect(timing?.names.map(({ name, kind }) => [name, kind])).toEqual([
		["Shop.Timing.Durations", "class"],
		["Shop.Timing.Durations.RestartBase", "value"],
		["Shop.Timing.Durations.RestartMax", "value"],
		["Shop.Timing.Durations.Limit", "value"],
		// A property with a body is a getter.
		["Shop.Timing.Durations.JitterMs", "function"],
		["Shop.Timing.Durations.Send", "function"],
		["Shop.Timing.IWindow", "type"],
		// An interface's method counts once, for the interface.
		["Shop.Timing.IWindow.Span", "method"],
		["Shop.Timing.Mode", "type"],
		["Shop.Timing.Handler", "type"],
		// A struct or a record with no method is a type that holds data.
		["Shop.Timing.Point", "type"],
		["Shop.Timing.Money", "type"],
		["Shop.Timing.Range", "class"],
		["Shop.Timing.Range.Width", "method"],
		["Shop.Timing.Clock", "class"],
		["Shop.Timing.Clock.Now", "method"],
		["Shop.Timing.Clock.Tick", "method"],
	]);
	expect(timing).toMatchObject({ languages: ["csharp"], unjudged: [] });
	// The product, the call `Send` passes on, the condition, its comparison
	// and its call, the sum, the call `Tick` passes on, the loop, its
	// comparison and its step, the increment, and the hidden `scale`.
	expect(timing?.logic).toBe(12);
});

test("each C# export gets the verdict its uses and its body earn", () => {
	const findings = answer.findings
		.filter((each) => each.subject?.name === "Timing" && each.export !== undefined)
		.map((each) => [each.export, each.code]);
	expect(findings).toEqual([
		// Two projects write the same backoff on each duration, with their own names.
		["Shop.Timing.Durations.RestartBase", "EXPOSED_VALUE_COMPUTED"],
		["Shop.Timing.Durations.RestartMax", "EXPOSED_VALUE_COMPUTED"],
		// Comparing is no math.
		["Shop.Timing.Durations.Limit", "EXPOSED_VALUE"],
		["Shop.Timing.Durations.JitterMs", "EXPOSED_VALUE_COMPUTED"],
		["Shop.Timing.Durations.Send", "CODE_PASS_THROUGH"],
		// Nothing names the types.
		["Shop.Timing.IWindow", "EXPOSED_UNUSED"],
		["Shop.Timing.Mode", "EXPOSED_UNUSED"],
		["Shop.Timing.Handler", "EXPOSED_UNUSED"],
		["Shop.Timing.Point", "EXPOSED_UNUSED"],
		["Shop.Timing.Money", "EXPOSED_UNUSED"],
		["Shop.Timing.Range", "EXPOSED_UNUSED"],
		["Shop.Timing.Clock.Tick", "CODE_PASS_THROUGH"],
	]);
});

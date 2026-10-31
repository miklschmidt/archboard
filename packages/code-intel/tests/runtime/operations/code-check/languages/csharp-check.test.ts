// The code pass reads parts bound to C# files, to a .NET project file and to
// a project directory through the C# adapter (ADR 0046, TASK-367.11):
// bindings and anchors are held to definitions and references, and the
// relationships between bound parts to the evidence that joins their code,
// including a member that another file of a partial class declares and the
// project references of the project files.
//
// The checkout `shop`: `Shop.Core` declares the partial class `Ledger` in two
// files and the static class `Clock`; `Shop.Api` and `Shop.Worker` reference
// it by project, and their code calls `Ledger.Create`. A part bound to a
// project file binds the project, so the part bound to `Shop.Worker.csproj`
// owns the call in `Job.cs`.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const caller = {
	ARCHBOARD_REPOS: process.env["ARCHBOARD_REPOS"],
};
const scratch = mkdtempSync(join(tmpdir(), "archboard-code-csharp-"));
const shop = join(scratch, "shop");
const vault = join(scratch, "vault");
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
const SHOP = "github.com/test/shop";
let outcome: CodeCheckOutcome;
let parts = 0;

/**
 * A part bound to code in the checkout.
 * @param id Its id.
 * @param path Its bound path.
 * @param extra Its bound symbol and the part that holds it, if any.
 * @param extra.symbol The bound symbol.
 * @param extra.parent The id of the part that holds it.
 * @returns The node.
 */
function part(id: string, path: string, extra: { symbol?: string; parent?: string } = {}) {
	const { symbol, parent } = extra;
	return {
		id,
		name: id.slice(1),
		kind: "module",
		order: (parts += 1) * 10,
		...(parent === undefined ? {} : { parent }),
		binding: { repo: SHOP, path, ...(symbol === undefined ? {} : { symbol }) },
	};
}

/**
 * A relationship.
 * @param id Its id.
 * @param ends Its start and end.
 * @param kind Its kind.
 * @param anchor The file and symbol of its anchor, if any.
 * @returns The relationship.
 */
function edge(
	id: string,
	ends: readonly [string, string],
	kind: string,
	anchor?: [string, string],
) {
	const [from, to] = ends;
	return {
		id,
		order: Number(id.slice(1)) * 10,
		from,
		to,
		kind,
		...(anchor === undefined ? {} : { anchor: { repo: SHOP, path: anchor[0], symbol: anchor[1] } }),
	};
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

const CORE = "src/Shop.Core";
const CONTROLLER = "src/Shop.Api/OrdersController.cs";

beforeAll(async () => {
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, {
		[`${CORE}/Shop.Core.csproj`]: project(),
		[`${CORE}/Ledger.cs`]: [
			"namespace Shop.Core;",
			"",
			"public partial class Ledger",
			"{",
			"    public static Ledger Create() => new Ledger();",
			"",
			"    public void Post()",
			"    {",
			"        Audit();",
			"    }",
			"}",
			"",
		].join("\n"),
		[`${CORE}/Ledger.Audit.cs`]: [
			"namespace Shop.Core;",
			"",
			"public partial class Ledger",
			"{",
			"    void Audit() => Clock.Now();",
			"}",
			"",
		].join("\n"),
		[`${CORE}/Clock.cs`]: [
			"namespace Shop.Core;",
			"",
			"static class Clock",
			"{",
			"    public static int Now() => 0;",
			"}",
			"",
		].join("\n"),
		"src/Shop.Api/Shop.Api.csproj": project("..\\Shop.Core\\Shop.Core.csproj"),
		[CONTROLLER]: [
			"using Shop.Core;",
			"",
			"namespace Shop.Api;",
			"",
			"public class OrdersController",
			"{",
			"    // LedgerInComment",
			"    public void Place() => Ledger.Create();",
			"}",
			"",
		].join("\n"),
		"src/Shop.Worker/Shop.Worker.csproj": project("../Shop.Core/Shop.Core.csproj"),
		"src/Shop.Worker/Job.cs":
			"namespace Shop.Worker;\n\nclass Job\n{\n    void Run() => Shop.Core.Ledger.Create();\n}\n",
	});
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [SHOP]: shop });
	board(vault, "Shop", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("pCore", `${CORE}/Shop.Core.csproj`),
					part("pPost", `${CORE}/Ledger.cs`, { symbol: "Ledger.Post", parent: "pCore" }),
					part("pAudit", `${CORE}/Ledger.Audit.cs`, { parent: "pCore" }),
					part("pClock", `${CORE}/Clock.cs`, { symbol: "Clock.Now", parent: "pCore" }),
					part("pGone", `${CORE}/Ledger.cs`, { symbol: "Ledger.Missing" }),
					part("pApi", "src/Shop.Api/Shop.Api.csproj"),
					part("pCtl", CONTROLLER, { parent: "pApi" }),
					part("pWork", "src/Shop.Worker/Shop.Worker.csproj"),
				],
				edges: [
					// The anchor holds, and the project file of an end passes its definition on.
					edge("e1", ["pCtl", "pCore"], "call", [CONTROLLER, "Ledger.Create"]),
					// The name stands only in a comment, which is no use.
					edge("e2", ["pCtl", "pCore"], "call", [CONTROLLER, "LedgerInComment"]),
					// Drawn from the core, while the API's project file builds with it.
					edge("e3", ["pCore", "pApi"], "dependency"),
					// Drawn from the clock, while the auditing code calls it.
					edge("e4", ["pClock", "pAudit"], "call"),
				],
			},
		},
	]);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("no boards");
	outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
});

afterAll(() => {
	for (const [key, value] of Object.entries(caller)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	rmSync(scratch, { recursive: true, force: true });
});

test("anchors, binding symbols and the relationships between parts bound to C# files and projects are judged by the C# adapter", () => {
	const found = outcome.findings.map((each) => `${each.code} ${each.subject?.id} ${each.severity}`);
	expect(found.toSorted()).toEqual(
		[
			"ANCHOR_SYMBOL_MISSING e2 warning",
			"BINDING_SYMBOL_MISSING pGone warning",
			// The API's project exposes its public controller, which no file outside it uses.
			"EXPOSED_UNUSED pApi information",
			"RELATIONSHIP_BACKWARDS e3 information",
			"RELATIONSHIP_BACKWARDS e4 information",
			"RELATIONSHIP_UNDRAWN pAudit warning",
			"RELATIONSHIP_UNDRAWN pCore warning",
		].toSorted(),
	);
	expect(outcome.skipped.map((each) => each.reason)).not.toContain("text-only");
});

test("a member of a partial class reaches the file that declares it, and a project reaches another through its code and through its project file", () => {
	const evidenceOf = (id: string) =>
		outcome.findings
			.find((each) => each.code === "RELATIONSHIP_UNDRAWN" && each.subject?.id === id)
			?.evidence?.map((piece) => [
				piece.from,
				piece.kind,
				piece.resolution,
				piece.path,
				piece.symbol,
			]);
	expect(evidenceOf("pAudit")).toEqual([
		["pPost", "call", "resolved", `${CORE}/Ledger.cs`, "Audit"],
	]);
	expect(evidenceOf("pCore")).toEqual([
		["pWork", "call", "resolved", "src/Shop.Worker/Job.cs", "Shop.Core.Ledger"],
	]);
	const turned = outcome.findings.find((each) => each.subject?.id === "e3");
	expect(turned?.evidence?.map((piece) => [piece.from, piece.kind, piece.path]).toSorted()).toEqual(
		[
			["pApi", "build-dependency", "src/Shop.Api/Shop.Api.csproj"],
			["pCtl", "call", CONTROLLER],
		].toSorted(),
	);
});

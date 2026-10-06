// The code facts of C# files and .NET project files (ADR 0046, TASK-367.11),
// read from the fixture solution `fixtures/csharp-shop`: definitions with C#'s
// accessibility and the friends `InternalsVisibleTo` names, references with
// their evidence kind, names resolved within a project and through a
// `ProjectReference`, project files as build dependencies, and code that did
// not parse.
//
// The solution: `Shop.Core` declares the partial class `Ledger` in two files,
// the internal class `Money`, and names `Shop.Api` (in its project file) and
// `Shop.Tests` (in an attribute) as friends; `Shop.Api` references it by
// project, brings its namespace in with a `global using`, and calls it from a
// controller and from top-level statements.

import { afterAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	createCodeFacts,
	definitionSite,
	findSymbol,
	type SyntaxFacts,
} from "@/runtime/code-facts/index";
import { fixtureCheckout } from "@/runtime/code-facts/tests/checkout";

const FIXTURE = join(import.meta.dir, "fixtures", "csharp-shop");
const checkout = fixtureCheckout(
	Object.fromEntries(
		readdirSync(FIXTURE, { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => {
				const file = join(entry.parentPath, entry.name);
				return [file.slice(FIXTURE.length + 1), readFileSync(file, "utf8")];
			}),
	),
);
const facts = createCodeFacts();
const CORE = "src/Shop.Core/Shop.Core.csproj";

afterAll(() => {
	checkout.remove();
});

/**
 * Read one file's facts in a pass of their own.
 * @param relative The file.
 * @returns Its facts.
 */
async function csharp(relative: string): Promise<SyntaxFacts> {
	const read = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (read?.adapter !== "csharp") throw new Error(`${relative} was not read as C#`);
	return read;
}

/**
 * The first use of a spelling in a file.
 * @param file The file's facts.
 * @param symbol The spelling.
 * @returns The reference, if any.
 */
function use(file: SyntaxFacts, symbol: string): SyntaxFacts["references"][number] | undefined {
	return file.references.find((each) => each.symbol === symbol);
}

test("a C# file defines its types, members and enum members, qualified by namespace, with C#'s accessibility and the friends its project names", async () => {
	const visibility = async (file: string) =>
		Object.fromEntries(
			(await csharp(file)).definitions.map((each) => [
				each.symbol,
				[each.visibility, each.exposed],
			]),
		);
	const friends = "InternalsVisibleTo(Shop.Api, Shop.Tests)";
	expect(await visibility("src/Shop.Core/Ledger.cs")).toEqual({
		"Shop.Core.Ledger": ["public", true],
		"Shop.Core.Ledger._rate": ["private", false],
		"Shop.Core.Ledger.Create": ["public", true],
		"Shop.Core.Ledger.Post": ["public", true],
		"Shop.Core.Ledger.Rate": ["protected", false],
		"Shop.Core.Ledger.State": [`internal, ${friends}`, false],
		"Shop.Core.Ledger.State.Open": ["public", false],
		"Shop.Core.Ledger.State.Closed": ["public", false],
		"Shop.Core.Ledger.Hidden": ["private", false],
	});
	expect(await visibility("src/Shop.Core/Money.cs")).toEqual({
		"Shop.Core.Money": [`internal, ${friends}`, false],
		"Shop.Core.Money.Round": ["public", false],
		"Shop.Core.ILedger": ["public", true],
		"Shop.Core.ILedger.Post": ["public", true],
		"Shop.Core.LedgerBase": ["public", true],
		"Shop.Core.Order": ["public", true],
		"Shop.Core.Order.Total": ["public", true],
	});
	const ledger = await csharp("src/Shop.Core/Ledger.cs");
	expect(ledger.definitions.find((each) => each.symbol === "Shop.Core.Ledger.Post")).toMatchObject({
		start: 12,
		end: 18,
	});
});

test("a use at run time is call evidence, a declared type or an interface import evidence, and comments and strings are no use", async () => {
	const ledger = await csharp("src/Shop.Core/Ledger.cs");
	expect(use(ledger, "Money.Round")).toMatchObject({ kind: "call", typeOnly: false });
	expect(use(ledger, "LedgerBase")).toMatchObject({ kind: "call", typeOnly: false });
	expect(use(ledger, "ILedger")).toMatchObject({ kind: "import", typeOnly: true });
	expect(use(ledger, "Order")).toMatchObject({ kind: "import", typeOnly: true });
	expect(findSymbol(ledger, "PostInComment", "definition-or-reference").status).toBe("absent");
	expect(findSymbol(ledger, "PostInString", "definition-or-reference").status).toBe("absent");
	// A parameter and a local are no use where they are declared.
	expect(ledger.references.filter((each) => each.symbol === "text")).toEqual([]);
	const audit = await csharp("src/Shop.Core/Ledger.Audit.cs");
	expect(audit.references.filter((each) => each.via !== "code")).toEqual([
		{ symbol: "SHOP_AUDIT", line: 13, via: "environment", typeOnly: false },
	]);
});

test("a name resolves within its project to the file that declares it, also a member of a partial class another file declares", async () => {
	const ledger = await csharp("src/Shop.Core/Ledger.cs");
	expect(use(ledger, "Audit")?.target).toEqual({
		path: "src/Shop.Core/Ledger.Audit.cs",
		symbol: "Shop.Core.Ledger.Audit",
	});
	expect(use(ledger, "Money.Round")?.target).toEqual({
		path: "src/Shop.Core/Money.cs",
		symbol: "Shop.Core.Money.Round",
	});
	expect(use(ledger, "Order")?.target).toEqual({
		path: "src/Shop.Core/Money.cs",
		symbol: "Shop.Core.Order",
	});
	// A name no project of the checkout declares leads nowhere.
	const audit = await csharp("src/Shop.Core/Ledger.Audit.cs");
	expect(use(audit, "Console.WriteLine")?.target).toBeUndefined();
});

test("a name resolves through a project reference and the other project's file, a global using, an alias and a qualified name, and a use through a value reaches only the value", async () => {
	const controller = await csharp("src/Shop.Api/Controllers/OrdersController.cs");
	const create = {
		path: "src/Shop.Core/Ledger.cs",
		symbol: "Shop.Core.Ledger.Create",
		via: [CORE],
	};
	expect(use(controller, "Ledger.Create")?.target).toEqual(create);
	expect(use(controller, "L.Create")?.target).toEqual(create);
	expect(use(controller, "_ledger.Post")?.target).toEqual({
		path: "src/Shop.Api/Controllers/OrdersController.cs",
		symbol: "Shop.Api.Controllers.OrdersController._ledger",
	});
	// A name used as a value is no type: it is a local or a member a base class declares.
	expect(use(controller, "Ledger")?.target).toBeUndefined();
	// A member of a value the code does not name is spelled from the `.`, and no lookup finds it.
	expect(use(controller, ".Post")).toMatchObject({ kind: "call" });
	expect(use(controller, ".Post")?.target).toBeUndefined();
	const program = await csharp("src/Shop.Api/Program.cs");
	expect(use(program, "Shop.Api.Controllers.OrdersController")?.target).toMatchObject({
		path: "src/Shop.Api/Controllers/OrdersController.cs",
		symbol: "Shop.Api.Controllers.OrdersController",
	});
	expect(use(program, "Ledger.Create")?.target).toEqual(create);
	const pass = facts.pass(new AbortController().signal);
	const site = await definitionSite(pass, checkout, "src/Shop.Api/Program.cs", "Ledger.Create");
	expect(site).toMatchObject({ path: "src/Shop.Core/Ledger.cs", via: [CORE] });
});

test("a project file builds with the projects and packages it references, and names its friends", async () => {
	const api = await csharp("src/Shop.Api/Shop.Api.csproj");
	expect(api.imports.map((each) => [each.specifier, each.resolved])).toEqual([
		["../Shop.Core/Shop.Core.csproj", CORE],
	]);
	expect(api.references).toEqual([
		{
			symbol: "Shop.Core",
			line: 4,
			via: "code",
			kind: "build-dependency",
			typeOnly: false,
			target: { path: CORE, symbol: "*" },
		},
	]);
	const core = await csharp(CORE);
	expect(core.references.map((each) => [each.symbol, each.via, each.kind, each.target])).toEqual([
		["Newtonsoft.Json", "code", "build-dependency", undefined],
		["Shop.Api", "assembly", undefined, undefined],
	]);
	expect(core.definitions).toEqual([]);
});

test("code that did not parse holds no facts, a name found only there is unparsed, and the rest of the file keeps its facts", async () => {
	const broken = await csharp("src/Shop.Core/Broken.cs");
	expect(findSymbol(broken, "OnlyHere", "definition-or-reference")).toMatchObject({
		status: "unparsed",
	});
	expect(findSymbol(broken, "After", "definition").status).toBe("found");
	expect(findSymbol(broken, "Before", "definition").status).toBe("found");
	// Two branches of an `#if` that each hold half a statement: the first is read, and the file parses.
	const audit = await csharp("src/Shop.Core/Ledger.Audit.cs");
	expect(audit.unparsed).toEqual([]);
	expect(findSymbol(audit, "Ledger.Audit", "definition").status).toBe("found");
});

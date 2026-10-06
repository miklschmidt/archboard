// The code facts of Python files (ADR 0046, TASK-367.08), read from the
// fixture package `fixtures/python-shop`: definitions with Python's
// visibility, references with their evidence kind, imports resolved as
// absolute, relative and package imports, and code that did not parse.
//
// The package: `pyproject.toml` names `lib` as its source root; `ledger` is a
// package whose `__init__.py` passes `Ledger` and the submodule `money` on;
// `checkout/pay.py` imports them every way Python can; `tools/report.py` is a
// script beside its helper; `other/` is a project whose `setup.cfg` names
// `code` as its root.

import { afterAll, expect, test } from "bun:test";
import {
	createCodeFacts,
	definitionSite,
	findSymbol,
	type SyntaxFacts,
} from "@/runtime/code-facts/index";
import { fixtureDirectory } from "@/runtime/code-facts/tests/checkout";

const checkout = fixtureDirectory("python-shop");
const facts = createCodeFacts();

afterAll(() => {
	checkout.remove();
});

/**
 * Read one Python file's facts in a pass of their own.
 * @param relative The file.
 * @returns Its facts.
 */
async function python(relative: string): Promise<SyntaxFacts> {
	const read = await facts.pass(new AbortController().signal).read(checkout, relative);
	if (read?.adapter !== "python") throw new Error(`${relative} was not read as Python`);
	return read;
}

test("a Python file defines its module-level names and class members, exposed by __all__ where it is set and else by the leading underscore", async () => {
	const visibility = async (file: string) =>
		Object.fromEntries(
			(await python(file)).definitions.map((each) => [
				each.symbol,
				[each.visibility, each.exposed],
			]),
		);
	expect(await visibility("lib/ledger/book.py")).toEqual({
		__all__: ["not in __all__", false],
		QUEUE: ["not in __all__", false],
		Ledger: ["__all__", true],
		"Ledger.rate": ["public", true],
		"Ledger.__init__": ["public", true],
		"Ledger.post": ["public", true],
		"Ledger._audit": ["non-public", false],
		"Ledger.__seal": ["name-mangled", false],
		helper: ["not in __all__", false],
		_Hidden: ["not in __all__", false],
		"_Hidden.visible": ["public", false],
	});
	expect(await visibility("lib/ledger/money.py")).toEqual({
		_CENTS: ["non-public", false],
		round_amount: ["public", true],
	});
	// __all__ grows through extend(); one built at run time leaves the names to the underscore.
	expect(await visibility("lib/checkout/steps.py")).toMatchObject({
		first: ["__all__", true],
		second: ["__all__", true],
		third: ["not in __all__", false],
	});
	expect(await visibility("lib/ledger/accounts.py")).toMatchObject({
		Account: ["public", true],
		CURRENCY: ["public", true],
	});
	const book = await python("lib/ledger/book.py");
	expect(book.definitions.find((each) => each.symbol === "Ledger.post")).toMatchObject({
		start: 20,
		end: 23,
	});
});

test("a use at run time is call evidence, a use in an annotation or under TYPE_CHECKING is import evidence, and comments, docstrings and other strings are no use", async () => {
	const book = await python("lib/ledger/book.py");
	const use = (symbol: string) => book.references.find((each) => each.symbol === symbol);
	expect(use("round_amount")).toMatchObject({ kind: "call", typeOnly: false });
	expect(use("round_amount")?.target).toEqual({
		path: "lib/ledger/money.py",
		symbol: "round_amount",
	});
	// A forward reference in a string annotation names a type the file imports only for type checking.
	expect(use("Account")).toMatchObject({ kind: "import", typeOnly: true });
	expect(use("Account")?.target).toEqual({ path: "lib/ledger/accounts.py", symbol: "Account" });
	expect(use("float")).toMatchObject({ typeOnly: true });
	const accounts = book.imports.find((each) => each.specifier === ".accounts");
	expect(accounts?.typeOnly).toBe(true);
	expect(findSymbol(book, "postInComment", "definition-or-reference").status).toBe("absent");
	expect(findSymbol(book, "postInDocstring", "definition-or-reference").status).toBe("absent");
	// A local of a function body is no definition, and a parameter no use.
	expect(findSymbol(book, "local", "definition").status).toBe("absent");
	expect(use("account")).toBeUndefined();
	// A string where Literal or Annotated takes a value names no type.
	const account = await python("lib/ledger/accounts.py");
	expect(findSymbol(account, "cash", "definition-or-reference").status).toBe("absent");
	expect(findSymbol(account, "owner", "definition-or-reference").status).toBe("absent");
	const pay = await python("lib/checkout/pay.py");
	expect(findSymbol(pay, "postInString", "definition-or-reference").status).toBe("absent");
	// Inside refund(), its parameter money hides the imported module money.
	const money = pay.references.filter((each) => each.symbol === "money");
	expect(money.map((each) => [each.line, each.target?.path])).toEqual([
		[16, "lib/ledger/money.py"],
		[29, undefined],
	]);
	const strings = [...book.references, ...pay.references]
		.filter((each) => each.via !== "code")
		.map((each) => [each.via, each.symbol, each.kind]);
	expect(strings.toSorted()).toEqual(
		[
			["environment", "LEDGER_QUEUE", undefined],
			["environment", "SHOP_DEBUG", undefined],
			["environment", "SHOP_TOKEN", undefined],
			["event", "paid", undefined],
		].toSorted(),
	);
});

test("absolute, relative and package imports resolve, a name that is a submodule reaches the submodule, and a module of the environment reaches no file", async () => {
	const pay = await python("lib/checkout/pay.py");
	const resolved = Object.fromEntries(
		pay.imports.map((each) => [`${each.specifier} ${each.names[0]?.local ?? ""}`, each.resolved]),
	);
	expect(resolved).toEqual({
		"importlib importlib": undefined,
		"os os": undefined,
		"ledger ledger": "lib/ledger/__init__.py",
		"ledger.money m": "lib/ledger/money.py",
		"ledger Ledger": "lib/ledger/__init__.py",
		"ledger money": "lib/ledger/money.py",
		". steps": "lib/checkout/steps.py",
		".steps first": "lib/checkout/steps.py",
		"ledger.accounts ": "lib/ledger/accounts.py",
	});
	const target = (symbol: string) => pay.references.find((each) => each.symbol === symbol)?.target;
	expect(target("money.round_amount")).toEqual({
		path: "lib/ledger/money.py",
		symbol: "round_amount",
	});
	expect(target("m.round_amount")).toEqual({ path: "lib/ledger/money.py", symbol: "round_amount" });
	expect(target("ledger.Ledger")).toEqual({ path: "lib/ledger/__init__.py", symbol: "Ledger" });
	expect(target("steps.first")).toEqual({ path: "lib/checkout/steps.py", symbol: "first" });
	expect(target("first")).toEqual({ path: "lib/checkout/steps.py", symbol: "first" });
	// A script finds its siblings in its own root; another project finds its packages through setup.cfg.
	const report = await python("tools/report.py");
	const bound = report.imports.filter((each) => !each.reexport);
	expect(bound.map((each) => each.resolved)).toEqual([
		"lib/ledger/__init__.py",
		"tools/helpers.py",
	]);
	const run = await python("other/scripts/run.py");
	expect(run.imports[0]?.resolved).toBe("other/code/stock/__init__.py");
});

test("a name a package's __init__.py imports and passes on is followed to the file that defines it", async () => {
	const pass = facts.pass(new AbortController().signal);
	const site = await definitionSite(pass, checkout, "lib/checkout/pay.py", "Ledger.post");
	expect(site).toMatchObject({
		path: "lib/ledger/book.py",
		definition: { symbol: "Ledger.post" },
		via: ["lib/ledger/__init__.py"],
	});
});

test("code that did not parse holds no facts, a name found only there is unparsed, and the rest of the file keeps its facts", async () => {
	const broken = await python("lib/checkout/broken.py");
	expect(findSymbol(broken, "onlyHere", "definition-or-reference")).toMatchObject({
		status: "unparsed",
	});
	expect(findSymbol(broken, "after", "definition").status).toBe("found");
	expect(findSymbol(broken, "before", "definition").status).toBe("found");
});

// The width of a folder module that declares no interface (decision 16): only
// the names a file outside it uses. Such a language makes a file export a name
// for another file of the module to import it, so a name only its own files
// import costs a caller nothing, and neither does a name nothing uses. A
// module that declares its interface keeps every exported name as its width.
//
// In TypeScript, `Declared` has an index file, `Inner` and `Open` none. In C,
// `CLib` keeps its public header under `include/`, `CFlat` and `CWide`
// keep theirs beside their sources. Every module exports more than 20 thin
// functions, and the apps outside call two of `Declared`, `Inner`,
// `CLib` and `CFlat`, while files of `Inner` and `CFlat` call the rest.
// Files outside call 22 names of `Open` and `CWide`, and their own files
// import 3 more; nothing uses one.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { CodeCheckAnswer } from "#shared/protocol/code-check.ts";
import { depthCheckout, depthFindings } from "#tests/runtime/support/code-check/depth-checkout.ts";

/**
 * Names with a prefix and a number.
 * @param prefix The prefix.
 * @param from The first number.
 * @param to The number after the last.
 * @returns The names.
 */
function names(prefix: string, from: number, to: number): string[] {
	return Array.from({ length: to - from }, (_, index) => `${prefix}${from + index}`);
}

/**
 * Thin exported TypeScript functions.
 * @param each Their names.
 * @returns The code.
 */
function thin(each: readonly string[]): string {
	return each
		.map((name) => `export function ${name}(n: number): number {\n\treturn n + 1;\n}\n`)
		.join("");
}

/**
 * A TypeScript file that calls names another file exports.
 * @param from The file it imports.
 * @param each The names.
 * @returns The code.
 */
function calls(from: string, each: readonly string[]): string {
	return (
		`import { ${each.join(", ")} } from "${from}";\n` +
		`console.log(${each.map((name) => `${name}(1)`).join(" + ")});\n`
	);
}

/**
 * A C header that declares thin functions, and the source that defines them.
 * @param header The header's path.
 * @param source The source's path, which includes the header by its file name.
 * @param each Their names.
 * @returns The two files.
 */
function cPair(header: string, source: string, each: readonly string[]): Record<string, string> {
	const include = header.slice(header.lastIndexOf("/") + 1);
	return {
		[header]: each.map((name) => `int ${name}(int n);\n`).join(""),
		[source]: `#include "${include}"\n\n${each.map((name) => `int ${name}(int n) { return n + 1; }\n`).join("")}`,
	};
}

/**
 * A C source that calls names a header declares.
 * @param include How it includes the header.
 * @param each The names.
 * @param defined The name of the function it defines that calls them.
 * @returns The code.
 */
function cCalls(include: string, each: readonly string[], defined: string): string {
	return `#include "${include}"\n\nint ${defined}(int n) { return ${each.map((name) => `${name}(n)`).join(" + ")}; }\n`;
}

let shop: Awaited<ReturnType<typeof depthCheckout>>;
let answer: CodeCheckAnswer;

beforeAll(async () => {
	shop = await depthCheckout(
		{
			"src/declared/index.ts": thin(names("d", 0, 21)),
			"src/inner/api.ts": thin(names("i", 0, 21)),
			"src/inner/use.ts": calls("./api.ts", names("i", 2, 21)),
			"src/open/api.ts": thin([...names("o", 0, 25), "spare"]),
			"src/open/use.ts": calls("./api.ts", names("o", 22, 25)),
			"src/app/declared.ts": calls("../declared/index.ts", ["d0", "d1"]),
			"src/app/inner.ts": calls("../inner/api.ts", ["i0", "i1"]),
			"src/app/open.ts": calls("../open/api.ts", names("o", 0, 22)),
			...cPair("clib/include/clib.h", "clib/src/clib.c", names("cd", 0, 21)),
			...cPair("cflat/flat.h", "cflat/flat.c", names("cf", 0, 21)),
			"cflat/use.c": cCalls("flat.h", names("cf", 2, 21), "cf_rest"),
			...cPair("cwide/wide.h", "cwide/wide.c", [...names("cw", 0, 25), "cw_spare"]),
			"cwide/use.c": cCalls("wide.h", names("cw", 22, 25), "cw_inside"),
			"capp/declared.c": cCalls("../clib/include/clib.h", ["cd0", "cd1"], "app_declared"),
			"capp/flat.c": cCalls("../cflat/flat.h", ["cf0", "cf1"], "app_flat"),
			"capp/wide.c": cCalls("../cwide/wide.h", names("cw", 0, 22), "app_wide"),
		},
		{
			Declared: "src/declared",
			Inner: "src/inner",
			Open: "src/open",
			App: "src/app",
			CLib: "clib",
			CFlat: "cflat",
			CWide: "cwide",
			CApp: "capp",
		},
	);
	answer = await shop.check();
});

afterAll(() => {
	shop.remove();
});

/**
 * The message of a module's finding of one code.
 * @param name The module.
 * @param code The code.
 * @returns The message, or undefined when it has none.
 */
function message(name: string, code: string): string | undefined {
	return answer.findings.find((each) => each.subject?.name === name && each.code === code)?.message;
}

test("a module that declares its interface counts every exported name, used outside or not", () => {
	for (const name of ["Declared", "CLib"]) {
		expect(depthFindings(answer, name)).toContain("(module) INTERFACE_WIDE warning");
		expect(depthFindings(answer, name)).toContain("(module) MODULE_SHALLOW warning");
		expect(message(name, "INTERFACE_WIDE")).toContain("callers must learn 21 names");
		expect(message(name, "INTERFACE_WIDE")).not.toContain("declares no interface");
	}
});

test("in a module that declares no interface, names only its own files import are no width", () => {
	for (const name of ["Inner", "CFlat"]) {
		expect(depthFindings(answer, name)).not.toContain("(module) INTERFACE_WIDE warning");
		expect(depthFindings(answer, name)).not.toContain("(module) MODULE_SHALLOW warning");
	}
});

test("in a module that declares no interface, the names files outside it use make it wide, and the message says what it leaves out", () => {
	for (const name of ["Open", "CWide"]) {
		expect(depthFindings(answer, name)).toContain("(module) INTERFACE_WIDE warning");
		const wide = message(name, "INTERFACE_WIDE");
		expect(wide).toContain("callers must learn 22 names");
		expect(wide).toContain("declares no interface");
		expect(wide).toContain("only its own files import 3");
		expect(wide).toContain("nothing uses 1");
	}
});

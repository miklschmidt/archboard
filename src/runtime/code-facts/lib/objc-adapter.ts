// The Objective-C adapter (ADR 0046, TASK-367.10): the code facts of an `.m`
// file, and of a `.h` file that holds Objective-C, read with
// `tree-sitter-objc` after the macros its grammar cannot read are blanked
// (objc-macros.ts).
//
// Objective-C is C with classes, protocols and message sends, so the C
// adapter reads what the file shares with C (c-adapter.ts): functions,
// variables, types and macros, the names they use, `#include` and `#import`,
// which include alike, and code that did not parse. This adapter adds the
// classes and their members (objc-definitions.ts), the sends (objc-sends.ts)
// and `@import`. A file that mixes C and Objective-C gives the facts of both.
//
// `@import Name;` names a Clang module, not a file. A framework's module
// lives in the directory of its name, and its umbrella header has its name
// too, as `#import <Name/Name.h>` is what Clang reads as `@import Name;`. So
// `@import Name;` is read as that include, and `@import Name.Part;` as
// `#import <Name/Part.h>`. The SDK's modules, such as `Foundation`, are
// outside every checkout and resolve to no file.
//
// Which file is a header decides what it exposes. An `.m` file is a source
// file. A `.h` file is read as Objective-C when a line outside a comment
// starts with `@interface`, `@protocol`, `@class`, `@end`, `@import` or
// `#import`, and as C++ otherwise (TASK-367.09), unless its same-directory
// source decides its language (TASK-436.07). An Objective-C++ file (`.mm`)
// has no grammar and is read as text.
//
// The facts of a file depend on its bytes and on one fact of its checkout:
// the SDK attribute macros the checkout's headers wrap under their own names
// (objc-macros.ts). So a reading is made for each set of them, and the cache
// reads the files again when a header changes the set (reader.ts).

import type { Node, QueryCapture, Tree } from "web-tree-sitter";
import { cFactsOf, distinct } from "@/runtime/code-facts/lib/c-adapter";
import { cUnparsedOf } from "@/runtime/code-facts/lib/c-unparsed";
import type { Import, ParsedFacts, ParseFacts, ReadText } from "@/runtime/code-facts/lib/facts";
import { type Grammar, treeSitter } from "@/runtime/code-facts/lib/grammars";
import type { CheckoutFiles } from "@/runtime/code-facts/lib/module-resolution";
import { type ObjcRole, objcDefinitionsOf } from "@/runtime/code-facts/lib/objc-definitions";
import { attributeWrappers, blankedMacros } from "@/runtime/code-facts/lib/objc-macros";
import { sendReferences } from "@/runtime/code-facts/lib/objc-sends";
import { spansOf } from "@/runtime/code-facts/lib/spans";

/** A line of a header that only Objective-C writes. */
const OBJECTIVE_C_LINE = /^[ \t]*(?:@(?:interface|protocol|class|end|import)\b|#[ \t]*import\b)/mu;
/**
 * A comment or a string. A documentation tool writes `@interface` or `@class`
 * at a line's start in a block comment, also in a C++ header.
 */
const COMMENT_OR_STRING =
	/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/gu;
/** An Objective-C source file, whose checkout's headers may wrap the SDK's macros. */
const OBJECTIVE_C_SOURCE = /\.mm?$/u;
/** A header whose macros every file of its checkout joins: a `.h`, or a prefix header. */
const WRAPPING_HEADER = /\.(?:h|pch)$/u;

/** The captures only this adapter reads. */
interface ObjcCaptured {
	readonly send: Node[];
	readonly selector: Node[];
	readonly protocol: Node[];
	readonly module: Node[];
	readonly unparsed: Node[];
}

/**
 * Sort the captures this adapter reads into their lists.
 * @param captures The query's captures.
 * @returns The lists.
 */
function objcCaptured(captures: readonly QueryCapture[]): ObjcCaptured {
	const lists: ObjcCaptured = { send: [], selector: [], protocol: [], module: [], unparsed: [] };
	const byName: ReadonlyMap<string, Node[]> = new Map(Object.entries(lists));
	for (const capture of captures) byName.get(capture.name)?.push(capture.node);
	return lists;
}

/**
 * One `@import` as the include of its module's header: `<Name/Name.h>`, or
 * `<Name/Part.h>` for `@import Name.Part;`.
 * @param node The module import.
 * @returns The import, every name of the header in scope.
 */
function moduleImportOf(node: Node): Import | undefined {
	const names = node.childrenForFieldName("path").filter((each) => each.type === "identifier");
	const [module] = names;
	if (module === undefined) return undefined;
	const header = names.at(-1)?.text ?? module.text;
	return {
		specifier: `<${module.text}/${header}.h>`,
		line: node.startPosition.row + 1,
		names: [{ imported: "*", local: "*", typeOnly: false }],
		typeOnly: false,
		reexport: false,
	};
}

/**
 * The code facts of one parsed Objective-C file, before its includes are resolved.
 * @param role Whether the file is a header or a source file.
 * @returns The facts of a tree the Objective-C grammar parsed.
 */
function objcFacts(role: ObjcRole): (tree: Tree, grammar: Grammar) => ParsedFacts {
	return (tree, grammar) => {
		const captures = grammar.query.captures(tree.rootNode);
		const c = cFactsOf(tree, captures);
		const captured = objcCaptured(captures);
		const unparsed = spansOf(cUnparsedOf(captured.unparsed));
		const modules = captured.module
			.filter((node) => !unparsed.holds(node.startIndex))
			.flatMap((node) => moduleImportOf(node) ?? []);
		return {
			definitions: [...c.definitions, ...objcDefinitionsOf(tree.rootNode, role)].toSorted(
				(left, right) => left.start - right.start,
			),
			references: distinct(
				[...c.references, ...sendReferences(captured, unparsed)].toSorted(
					(left, right) => left.line - right.line,
				),
			),
			imports: [...c.imports, ...modules].toSorted((left, right) => left.line - right.line),
			unparsed: c.unparsed,
		};
	};
}

const OBJC = "tree-sitter-objc/tree-sitter-objc.wasm";
const SOURCE = treeSitter(OBJC, "objc.scm", objcFacts("source"));
const HEADER = treeSitter(OBJC, "objc.scm", objcFacts("header"));

/**
 * Whether a header's text is Objective-C: a line outside its block comments
 * that only Objective-C writes.
 * @param text The header.
 * @returns True when it is.
 */
function isObjectiveC(text: string): boolean {
	if (!OBJECTIVE_C_LINE.test(text)) return false;
	const code = text.replaceAll(COMMENT_OR_STRING, (token) => (token.startsWith("/*") ? "" : token));
	return OBJECTIVE_C_LINE.test(code);
}

/** How the files of a checkout whose headers wrap the same SDK macros are read. */
interface ObjectiveCReadings {
	/** An `.m` file. */
	readonly source: ParseFacts;
	/** A `.h` file: as an Objective-C header where its text is Objective-C, else as C or C++. */
	readonly unpairedHeader: ParseFacts;
	/** A header whose paired source file is Objective-C. */
	readonly header: ParseFacts;
}

/**
 * The readings of the files of a checkout, by the SDK macros its headers
 * wrap: one for each set of them, so the cache sees one reading while the set
 * holds.
 * @param otherwise How a header of C or C++ is read.
 * @returns The readings for a set of wrappers (`wrappersIn`).
 */
function objectiveCReadings(
	otherwise: ParseFacts,
): (wrappers: ReadonlyMap<string, boolean>) => ObjectiveCReadings {
	const made = new Map<string, ObjectiveCReadings>();
	return (wrappers) => {
		const key = [...wrappers]
			.map(([name, takes]) => `${name}${takes ? "()" : ""}`)
			.toSorted()
			.join(" ");
		let readings = made.get(key);
		if (readings === undefined) {
			readings = {
				/**
				 * Read an `.m` file.
				 * @param text The file.
				 * @returns Its facts.
				 */
				source: (text) => SOURCE(blankedMacros(text, wrappers)),
				/**
				 * Read a `.h` file.
				 * @param text The file.
				 * @returns Its facts.
				 */
				unpairedHeader: (text) =>
					isObjectiveC(text) ? HEADER(blankedMacros(text, wrappers)) : otherwise(text),
				/**
				 * Read a header whose source says it is Objective-C.
				 * @param text The header.
				 * @returns Its facts.
				 */
				header: (text) => HEADER(blankedMacros(text, wrappers)),
			};
			made.set(key, readings);
		}
		return readings;
	};
}

/**
 * The SDK attribute macros a checkout's headers wrap under their own names,
 * read once in a pass. A checkout with no Objective-C source file has none to
 * read, so a C or C++ checkout reads no header for them.
 * @param checkout The checkout.
 * @param read Reads a file of the checkout as text.
 * @returns The macros and whether each takes arguments, by name.
 */
function wrappersIn(checkout: CheckoutFiles, read: ReadText): Map<string, boolean> {
	const files = [...checkout.files];
	if (!files.some((file) => OBJECTIVE_C_SOURCE.test(file))) return new Map();
	const headers = files.filter((file) => WRAPPING_HEADER.test(file)).toSorted();
	return attributeWrappers(headers.flatMap((file) => read(file) ?? []));
}

export { type ObjectiveCReadings, objectiveCReadings, wrappersIn };

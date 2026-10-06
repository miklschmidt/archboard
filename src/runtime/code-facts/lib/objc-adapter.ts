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
// file. A `.h` file is read as Objective-C when a line starts with
// `@interface`, `@protocol`, `@class`, `@end`, `@import` or `#import`, and as
// C++ otherwise (TASK-367.09); the facts of a file depend on its bytes alone,
// so its text decides, not its pair. An Objective-C++ file (`.mm`) has no
// grammar and is read as text.

import type { Node, QueryCapture, Tree } from "web-tree-sitter";
import { cFactsOf } from "@/runtime/code-facts/lib/c-adapter";
import { cUnparsedOf } from "@/runtime/code-facts/lib/c-unparsed";
import type { Import, ParsedFacts, ParseFacts, Reference } from "@/runtime/code-facts/lib/facts";
import { type Grammar, treeSitter } from "@/runtime/code-facts/lib/grammars";
import { type ObjcRole, objcDefinitionsOf } from "@/runtime/code-facts/lib/objc-definitions";
import { blankedMacros } from "@/runtime/code-facts/lib/objc-macros";
import { sendReferences } from "@/runtime/code-facts/lib/objc-sends";
import { spansOf } from "@/runtime/code-facts/lib/spans";

/** A line of a header that only Objective-C writes. */
const OBJECTIVE_C_LINE = /^[ \t]*(?:@(?:interface|protocol|class|end|import)\b|#[ \t]*import\b)/mu;

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
 * The references of a file, one for each spelling and way of use, at the
 * first line it occurs.
 * @param references Every reference.
 * @returns The references.
 */
function distinct(references: readonly Reference[]): Reference[] {
	const first = new Map<string, Reference>();
	for (const reference of references) {
		const key = `${reference.via}\0${reference.symbol}\0${String(reference.typeOnly)}`;
		const seen = first.get(key);
		if (seen === undefined || reference.line < seen.line) first.set(key, reference);
	}
	return [...first.values()];
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
			references: distinct([...c.references, ...sendReferences(captured, unparsed)]),
			imports: [...c.imports, ...modules].toSorted((left, right) => left.line - right.line),
			unparsed: c.unparsed,
		};
	};
}

const OBJC = "tree-sitter-objc/tree-sitter-objc.wasm";
const SOURCE = treeSitter(OBJC, "objc.scm", objcFacts("source"));
const HEADER = treeSitter(OBJC, "objc.scm", objcFacts("header"));

/**
 * Read an `.m` file.
 * @param text The file.
 * @returns Its facts.
 */
const readObjectiveC: ParseFacts = (text) => SOURCE(blankedMacros(text));

/**
 * How a `.h` file is read: as an Objective-C header where its text is
 * Objective-C, else as the C family's other reading does.
 * @param otherwise How a header of C or C++ is read.
 * @returns The reading of a `.h` file.
 */
function readingHeaders(otherwise: ParseFacts): ParseFacts {
	return (text) => (OBJECTIVE_C_LINE.test(text) ? HEADER(blankedMacros(text)) : otherwise(text));
}

export { readingHeaders, readObjectiveC };

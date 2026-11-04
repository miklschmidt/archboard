// The Go adapter (ADR 0046, TASK-575): the code facts of one file from the
// captures of `go.scm`.
//
// A Go import names a package by its path, and the files of one package see
// each other's names with no import at all. So a use names no import here:
// the resolver finds where it leads in the package and in the packages the
// file imports (go-resolution.ts). An import is also a use of the package it
// names, as `build-dependency` evidence, because a package is built from the
// packages it imports.
//
// A name in a type is a use only as a type, `import` evidence. The type of a
// composite literal constructs a value, so it runs, as a call does. Every
// other use is at run time, `call` evidence, and one that is neither called
// nor constructed is a use as a value (runs.ts). A name in a comment or a
// string is never captured, but for the name of an environment value
// (`os.Getenv("NAME")`). A member reached through a value the code does not
// name, such as a call's result, is spelled with the `.` alone (`.Close`), as
// C# spells it: it is no name of the package.
//
// The facts keep the package clause, which says which files of a directory
// form one package (a `_test` package is another), and the names the file
// binds in a scope narrower than the file: a parameter, a receiver, a local.
// A use of one of those names may be that binding, so the resolver leads it
// to no other file.

import type { Node, QueryCapture, Tree } from "web-tree-sitter";
import type { Import, ParsedFacts, Reference } from "#runtime/operations/code-facts/facts.ts";
import type { Grammar } from "#runtime/services/code-facts/grammars.ts";
import { definitionsOf } from "#runtime/operations/code-facts/go/go-definitions.ts";
import { ANY, type RunSyntax, valueMark } from "#runtime/operations/code-facts/runs.ts";
import { spansOf, type Spans } from "#runtime/operations/code-facts/spans.ts";
import { unparsedOf } from "#runtime/operations/code-facts/unparsed.ts";

/** The facts of a Go file, with its package and the names it binds in a narrower scope. */
type GoFacts = ParsedFacts & { readonly package: string; readonly scoped: readonly string[] };

/** The captures of one file, by what the query calls them. */
interface Captured {
	readonly binding: Node[];
	readonly label: Node[];
	readonly reference: Node[];
	readonly environment: Node[];
	readonly import: Node[];
	readonly type: Node[];
	readonly runtime: Node[];
	readonly skip: Node[];
	readonly unparsed: Node[];
}

/** Which list each capture of the query joins; a capture named `_...` only constrains a pattern. */
const LIST_OF: Readonly<Record<string, keyof Captured>> = {
	binding: "binding",
	label: "label",
	reference: "reference",
	environment: "environment",
	import: "import",
	type: "type",
	runtime: "runtime",
	skip: "skip",
	unparsed: "unparsed",
};

/** What deciding whether a captured name is a use needs. */
interface UseContext {
	/** The names that are no use: bound where written, or a literal's key. */
	readonly declared: ReadonlySet<number>;
	readonly skip: Spans;
	readonly unparsed: Spans;
	readonly types: Spans;
	readonly runtime: Spans;
}

/**
 * Sort the captures into their lists.
 * @param captures The captures, in document order.
 * @returns The lists.
 */
function sorted(captures: readonly QueryCapture[]): Captured {
	const lists: Captured = {
		binding: [],
		label: [],
		reference: [],
		environment: [],
		import: [],
		type: [],
		runtime: [],
		skip: [],
		unparsed: [],
	};
	for (const capture of captures) {
		const list = LIST_OF[capture.name];
		if (list !== undefined) lists[list].push(capture.node);
	}
	return lists;
}

/**
 * How code spells a chain of names through `.`, from a name.
 * @param node A selector or a name.
 * @returns The spelling, or undefined when the chain starts at something else, such as a call.
 */
function chain(node: Node): string | undefined {
	if (node.type === "identifier") return node.text;
	if (node.type !== "selector_expression") return undefined;
	return joined(node.childForFieldName("operand"), node.childForFieldName("field"));
}

/**
 * A chain and the name after its `.`.
 * @param operand The chain before the `.`.
 * @param field The name after it.
 * @returns The spelling, or undefined when the chain does not start at a name.
 */
function joined(operand: Node | null, field: Node | null): string | undefined {
	const base = operand === null ? undefined : chain(operand);
	return base === undefined || field === null ? undefined : `${base}.${field.text}`;
}

/**
 * A selector's field, spelled with the chain before it, or with the `.` alone
 * when the chain starts at a value the code does not name.
 * @param node The field.
 * @param selector The selector.
 * @returns The spelling.
 */
function fieldSpelling(node: Node, selector: Node): string {
	return chain(selector) ?? `.${node.text}`;
}

/**
 * A type's name, spelled with its package where it is qualified.
 * @param node The name.
 * @param parent What holds it.
 * @returns The spelling.
 */
function typeSpelling(node: Node, parent: Node): string {
	const pkg = parent.type === "qualified_type" ? parent.childForFieldName("package") : null;
	return pkg === null ? node.text : `${pkg.text}.${node.text}`;
}

/** How each kind of captured name is spelled with what holds it. */
const SPELLED: Readonly<Record<string, (node: Node, parent: Node) => string>> = {
	field_identifier: fieldSpelling,
	type_identifier: typeSpelling,
};

/**
 * How a used name is spelled: with what holds it, else the name alone.
 * @param node The name.
 * @returns The spelling.
 */
function spelling(node: Node): string {
	const spell = SPELLED[node.type];
	return node.parent === null || spell === undefined ? node.text : spell(node, node.parent);
}

/** How Go runs a name: a call, or a composite literal that constructs its type. */
const RUN_SYNTAX: RunSyntax = {
	runners: { call_expression: "function", composite_literal: "type" },
	chains: {
		selector_expression: ["operand", "field"],
		qualified_type: ["package", "name"],
		index_expression: ["operand"],
		generic_type: ["type"],
		parenthesized_expression: [""],
	},
	arguments: { argument_list: ANY },
};

/**
 * A use of a name in code.
 * @param node The name.
 * @param context The file's bound names and spans.
 * @returns The use, or undefined when the name is not a use.
 */
function codeReference(node: Node, context: UseContext): Reference | undefined {
	const at = node.startIndex;
	if (context.declared.has(node.id) || context.skip.holds(at) || context.unparsed.holds(at)) {
		return undefined;
	}
	const typeOnly = context.types.holds(at) && !context.runtime.holds(at);
	return {
		symbol: spelling(node),
		line: node.startPosition.row + 1,
		via: "code",
		kind: typeOnly ? "import" : "call",
		typeOnly,
		...valueMark(node, RUN_SYNTAX, typeOnly),
	};
}

/**
 * The name a package is used by when its import gives none: the last element
 * of its path, before a major version (`.../v2`) and without `.vN` or a `go-`
 * prefix, as packages are mostly named. The resolver reads the package clause
 * of a package in the checkout instead.
 * @param specifier The import path.
 * @returns The name.
 */
function defaultName(specifier: string): string {
	const elements = specifier.split("/");
	const last = elements.at(-1) ?? specifier;
	const named = /^v\d+$/u.test(last) && elements.length > 1 ? (elements.at(-2) ?? last) : last;
	return named.replace(/\.v\d+$/u, "").replace(/^go-/u, "");
}

/**
 * One import: the package it names, and the name the file uses for it. A
 * blank import (`_`) brings in no name, and a dot import (`.`) brings every
 * exported name of the package into the file, named `.` here.
 * @param node The import spec.
 * @param unparsed The file's unparsed code.
 * @returns The import, or undefined for one that did not parse.
 */
function importOf(node: Node, unparsed: Spans): Import | undefined {
	const specifier = pathOf(node);
	if (specifier === undefined || unparsed.holds(node.startIndex)) return undefined;
	const local = node.childForFieldName("name")?.text ?? defaultName(specifier);
	return {
		specifier,
		line: node.startPosition.row + 1,
		names: local === "_" ? [] : [{ imported: "*", local, typeOnly: false }],
		typeOnly: false,
		reexport: false,
	};
}

/**
 * The import path an import spec names.
 * @param node The import spec.
 * @returns The path, as written between its quotes.
 */
function pathOf(node: Node): string | undefined {
	const literal = node.childForFieldName("path");
	return literal?.namedChildren.find((child) => child.type === "interpreted_string_literal_content")
		?.text;
}

/**
 * The use of the package an import names, as a build dependency.
 * @param found The import.
 * @returns The reference.
 */
function packageUse(found: Import): Reference {
	return {
		symbol: found.specifier,
		line: found.line,
		via: "code",
		kind: "build-dependency",
		typeOnly: false,
	};
}

/**
 * The references of a file, one for each spelling, way of use and evidence
 * kind at the first line it occurs.
 * @param uses Every use.
 * @returns The references.
 */
function distinct(uses: readonly Reference[]): Reference[] {
	const seen = new Map<string, Reference>();
	for (const use of uses) {
		const key = [use.via, use.symbol, use.typeOnly, use.kind, use.asValue, use.passed].join("\0");
		if (!seen.has(key)) seen.set(key, use);
	}
	return [...seen.values()];
}

/**
 * The code facts of one parsed Go file.
 * @param tree The file's syntax tree.
 * @param grammar The grammar it was parsed with.
 * @returns Its facts.
 */
function goFacts(tree: Tree, grammar: Grammar): GoFacts {
	const captured = sorted(grammar.query.captures(tree.rootNode));
	const unparsed = spansOf(captured.unparsed);
	const context: UseContext = {
		declared: new Set([...captured.binding, ...captured.label].map((node) => node.id)),
		skip: spansOf(captured.skip),
		unparsed,
		types: spansOf(captured.type),
		runtime: spansOf(captured.runtime),
	};
	const imports = captured.import.flatMap((node) => importOf(node, unparsed) ?? []);
	const environment = captured.environment.flatMap((node): Reference[] =>
		unparsed.holds(node.startIndex)
			? []
			: [
					{
						symbol: node.text,
						line: node.startPosition.row + 1,
						via: "environment",
						typeOnly: false,
					},
				],
	);
	const uses = [
		...imports.map(packageUse),
		...captured.reference.flatMap((node) => codeReference(node, context) ?? []),
		...environment,
	];
	const definitions = definitionsOf(tree.rootNode);
	const fileLevel = new Set(definitions.map((each) => each.symbol));
	const pkg = tree.rootNode.namedChildren.find((node) => node.type === "package_clause");
	return {
		definitions,
		references: distinct(uses),
		imports,
		unparsed: unparsedOf(captured.unparsed),
		package: pkg?.namedChildren[0]?.text ?? "",
		scoped: [...new Set(captured.binding.map((node) => node.text))].filter(
			(name) => !fileLevel.has(name),
		),
	};
}

/**
 * Whether facts are a Go file's.
 * @param facts The facts a file gave.
 * @returns True for the facts of a Go file.
 */
function isGoFacts(facts: ParsedFacts | undefined): facts is GoFacts {
	return facts !== undefined && "package" in facts && "scoped" in facts;
}

export { defaultName, type GoFacts, goFacts, isGoFacts };

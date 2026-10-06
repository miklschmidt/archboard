// A static reading of a Nix expression (ADR 0046, TASK-367.21): the value
// each expression of a flake gives, as far as its syntax tells it. Nothing is
// evaluated: no file is imported, nothing is fetched, no builtin runs. The
// reading follows what a flake writes to give its outputs:
//
// - attribute sets, `rec` sets, nested names (`packages.x86_64-linux.a = ...`),
//   `inherit` and `inherit (from)`;
// - `let ... in`, `with`, `assert` and parentheses;
// - functions the file writes, with a name or formals (`{ self, nixpkgs, ... }`
//   with defaults and `@`), applied to their arguments, so that a
//   `forAllSystems = f: genAttrs systems (system: f ...)` is followed;
// - selections (`a.b.${system}`, `a.b or c`), lists, strings without
//   interpolation, `//` and `++`;
// - the library functions nix-library.ts knows, by the last name of the
//   selection that names them (`nixpkgs.lib.genAttrs`,
//   `inherit (nixpkgs.lib) genAttrs`, `flake-utils.lib.eachDefaultSystem`), or
//   by a name `with` brings in.
//
// Everything else is unknown at its node: `import`, a builtin, an
// `if`, a value of an input, a library function the reading does not know.
// A default, `a.b or c` or a formal's `? c`, stands only where the reading is
// sure the name is absent: of a set it can tell every name of, or of a value
// that is no set. An input is never absent, because Nix gives the outputs
// function every formal it names.
//
// A reading has a budget of steps and of depth (nix-values.ts), so a
// recursion the file writes, and a list or a set it doubles, end as unknown
// too.

import type { Node } from "web-tree-sitter";
import { libraryValue, orLibrary, updated } from "@/runtime/code-facts/lib/nix-library";
import {
	type Building,
	type Scope,
	finished,
	lookup,
	place,
} from "@/runtime/code-facts/lib/nix-scope";
import {
	type AttrsValue,
	type Budget,
	type NixValue,
	type Thunk,
	OTHER,
	applied,
	lazy,
	ready,
	selected,
	spend,
	surelyAbsent,
	unknownAt,
} from "@/runtime/code-facts/lib/nix-values";

/** How many steps one file's reading spends at most. */
const MAX_STEPS = 200_000;
/** How deep one reading nests at most. */
const MAX_DEPTH = 400;

/** Reads one kind of expression. */
type Reader = (node: Node, scope: Scope, budget: Budget) => NixValue;

/**
 * The value of an expression.
 * @param node The expression.
 * @param scope The names in scope.
 * @param budget What the reading may still spend.
 * @returns Its value; unknown when the reading cannot follow it or has spent its budget.
 */
function evaluate(node: Node | null, scope: Scope, budget: Budget): NixValue {
	if (node === null) return OTHER;
	if (budget.depth >= MAX_DEPTH || !spend(budget, 1)) return unknownAt(node);
	budget.depth += 1;
	try {
		return (READERS.get(node.type) ?? unknownAt)(node, scope, budget);
	} finally {
		budget.depth -= 1;
	}
}

/**
 * A value read when first asked for.
 * @param node The expression.
 * @param scope The names in scope.
 * @param budget The reading's budget.
 * @returns The thunk.
 */
function thunk(node: Node | null, scope: Scope, budget: Budget): Thunk {
	return node === null ? ready(OTHER) : lazy(() => evaluate(node, scope, budget), node);
}

/**
 * The name one attribute of an attribute path gives: an identifier, a string,
 * or an interpolation the reading can tell.
 * @param attr The attribute.
 * @param scope The names in scope.
 * @param budget The reading's budget.
 * @returns The name, or undefined when the reading cannot tell it.
 */
function attrName(attr: Node, scope: Scope, budget: Budget): string | undefined {
	if (attr.type === "identifier") return attr.text;
	const value =
		attr.type === "interpolation"
			? evaluate(attr.childForFieldName("expression"), scope, budget)
			: evaluate(attr, scope, budget);
	return value.kind === "string" ? value.text : undefined;
}

/**
 * The names of an attribute path, each a step.
 * @param path The attribute path.
 * @param scope The names in scope.
 * @param budget The reading's budget.
 * @returns Each name, undefined where the reading cannot tell it; one name it
 * cannot tell once the budget is spent.
 */
function attrNames(path: Node | null, scope: Scope, budget: Budget): (string | undefined)[] {
	const names = path?.childrenForFieldName("attr") ?? [];
	if (!spend(budget, names.length)) return [undefined];
	return names.map((attr) => attrName(attr, scope, budget));
}

/** The names Nix binds itself that the reading can tell are no set. */
const CONSTANTS = new Set(["true", "false", "null"]);

/**
 * The value of a name.
 * @param node The variable.
 * @param scope The names in scope.
 * @param budget The reading's budget.
 * @returns What the scope binds it to, else the library value it names, else unknown.
 */
function variable(node: Node, scope: Scope, budget: Budget): NixValue {
	const name = node.childForFieldName("name")?.text ?? node.text;
	const value = lookup(scope, name) ?? libraryValue(name, budget);
	if (value !== undefined) return value;
	return CONSTANTS.has(name) ? OTHER : unknownAt(node);
}

/** The scope of a set's values, and the scope a plain `inherit` reads names from. */
interface Scopes {
	readonly values: Scope;
	readonly inherited: Scope;
}

/**
 * Add the bindings of one binding set to a set being built, each a step.
 * @param bindings The binding set.
 * @param building The set.
 * @param scopes Where its values and inherited names are read.
 * @param budget The reading's budget.
 */
function bindInto(
	bindings: Node | undefined,
	building: Building,
	scopes: Scopes,
	budget: Budget,
): void {
	if (bindings === undefined) return;
	if (!spend(budget, bindings.namedChildCount)) {
		place(building, [undefined], ready(OTHER), bindings);
		return;
	}
	for (const binding of bindings.namedChildren) {
		if (INHERITS.has(binding.type)) inheritInto(binding, building, scopes, budget);
		else if (binding.type === "binding") bindOne(binding, building, scopes.values, budget);
	}
}

/**
 * Add one binding, `a.b = value;`, to a set being built.
 * @param binding The binding.
 * @param building The set.
 * @param scope Where its names and its value are read.
 * @param budget The reading's budget.
 */
function bindOne(binding: Node, building: Building, scope: Scope, budget: Budget): void {
	const names = attrNames(binding.childForFieldName("attrpath"), scope, budget);
	place(building, names, thunk(binding.childForFieldName("expression"), scope, budget), binding);
}

/** The bindings that inherit names. */
const INHERITS = new Set(["inherit", "inherit_from"]);

/**
 * Add the names an `inherit` or an `inherit (from)` binds. A name inherited
 * from a value the reading cannot follow is the library function of that
 * name, as `from.name` is.
 * @param binding The binding.
 * @param building The set.
 * @param scopes Where its values and inherited names are read.
 * @param budget The reading's budget.
 */
function inheritInto(binding: Node, building: Building, scopes: Scopes, budget: Budget): void {
	const from = binding.childForFieldName("expression");
	const source = from === null ? undefined : thunk(from, scopes.values, budget);
	for (const name of attrNames(binding.childForFieldName("attrs"), scopes.values, budget)) {
		const value =
			name === undefined
				? ready(OTHER)
				: lazy(
						() =>
							source === undefined
								? (lookup(scopes.inherited, name) ?? unknownAt(binding))
								: orLibrary(selected(source(), name, binding), name, budget),
						binding,
					);
		place(building, [name], value, binding);
	}
}

/**
 * The binding set of a set, a `let` or a `rec` set.
 * @param node The expression.
 * @returns Its binding set, if any.
 */
function bindingSetOf(node: Node): Node | undefined {
	return node.namedChildren.find((child) => child.type === "binding_set");
}

/**
 * The set a `rec` set or a `let` gives, and the scope in which its names see
 * each other.
 * @param node The expression.
 * @param scope The names in scope around it.
 * @param budget The reading's budget.
 * @returns The set, and the scope with its names.
 */
function recursive(
	node: Node,
	scope: Scope,
	budget: Budget,
): { readonly value: AttrsValue; readonly scope: Scope } {
	const names = new Map<string, Thunk>();
	const inner: Scope = { names, parent: scope };
	const building: Building = { entries: new Map() };
	bindInto(bindingSetOf(node), building, { values: inner, inherited: scope }, budget);
	const value = finished(building, budget);
	for (const [name, entry] of value.entries) names.set(name, entry.value);
	return { value, scope: inner };
}

/**
 * The scope of a function's body for one argument: its name, and each
 * formal with the argument's value of that name or its default, each a step.
 * @param node The function.
 * @param argument The argument.
 * @param scope The scope the function was written in.
 * @param budget The reading's budget.
 * @returns The scope.
 */
function parameterScope(node: Node, argument: Thunk, scope: Scope, budget: Budget): Scope {
	const names = new Map<string, Thunk>();
	const inner: Scope = { names, parent: scope };
	const universal = node.childForFieldName("universal");
	if (universal !== null) names.set(universal.text, argument);
	const formals = node.childForFieldName("formals")?.childrenForFieldName("formal") ?? [];
	if (!spend(budget, formals.length)) return inner;
	for (const formal of formals) names.set(...formalOf(formal, argument, inner, budget));
	return inner;
}

/**
 * One formal's name, and its value for an argument.
 * @param formal The formal.
 * @param argument The argument.
 * @param scope The scope of the function's body, where its default is read.
 * @param budget The reading's budget.
 * @returns Its name and its value.
 */
function formalOf(formal: Node, argument: Thunk, scope: Scope, budget: Budget): [string, Thunk] {
	const name = formal.childForFieldName("name")?.text ?? formal.text;
	const fallback = formal.childForFieldName("default");
	const otherwise = fallback === null ? undefined : thunk(fallback, scope, budget);
	return [name, lazy(() => given(argument(), name, otherwise, formal), formal)];
}

/**
 * The value of one formal: the argument's value of its name, else its
 * default where the reading is sure the argument has no such name.
 * @param argument The argument.
 * @param name The formal's name.
 * @param otherwise Its default, if any.
 * @param formal The formal.
 * @returns The value; unknown when the reading cannot tell it.
 */
function given(
	argument: NixValue,
	name: string,
	otherwise: Thunk | undefined,
	formal: Node,
): NixValue {
	if (!surelyAbsent(argument, name)) return selected(argument, name, formal);
	return otherwise?.() ?? unknownAt(formal);
}

/**
 * The value of a selection, `a.b.c` or `a.b or c`. The default stands only
 * where the reading is sure a name is absent. A selection the reading cannot
 * follow whose last name is a library function it knows gives that function.
 * @param node The selection.
 * @param scope The names in scope.
 * @param budget The reading's budget.
 * @returns Its value.
 */
function selection(node: Node, scope: Scope, budget: Budget): NixValue {
	const names = attrNames(node.childForFieldName("attrpath"), scope, budget);
	let value = evaluate(node.childForFieldName("expression"), scope, budget);
	for (const name of names) {
		if (surelyAbsent(value, name)) {
			const fallback = node.childForFieldName("default");
			return fallback === null ? unknownAt(node) : evaluate(fallback, scope, budget);
		}
		value = name === undefined ? unknownAt(node) : selected(value, name, node);
	}
	return orLibrary(value, names.at(-1), budget);
}

/** What one binary operator gives for its two values. */
type Operator = (left: NixValue, right: NixValue, node: Node, budget: Budget) => NixValue;

/** What each binary operator that can give a set or a list gives; every other gives neither. */
const OPERATORS: ReadonlyMap<string, Operator> = new Map<string, Operator>([
	["//", (left, right, node, budget) => updated(left, right, { deep: false, budget, node })],
	[
		"++",
		(left, right, node, budget) =>
			left.kind === "list" &&
			right.kind === "list" &&
			spend(budget, left.items.length + right.items.length)
				? { kind: "list", items: [...left.items, ...right.items] }
				: unknownAt(node),
	],
]);

/**
 * The value of a binary expression: `//` merges two sets, `++` joins two
 * lists, and every other operator gives no set.
 * @param node The expression.
 * @param scope The names in scope.
 * @param budget The reading's budget.
 * @returns Its value.
 */
function binary(node: Node, scope: Scope, budget: Budget): NixValue {
	const operator = node.childForFieldName("operator")?.type ?? node.child(1)?.type ?? "";
	const apply = OPERATORS.get(operator);
	if (apply === undefined) return OTHER;
	const left = evaluate(node.childForFieldName("left"), scope, budget);
	return apply(left, evaluate(node.childForFieldName("right"), scope, budget), node, budget);
}

/**
 * The value of a string: its text where no interpolation or escape makes it.
 * @param node The string.
 * @param budget The reading's budget, which pays for each part.
 * @returns The string.
 */
function string(node: Node, budget: Budget): NixValue {
	if (!spend(budget, node.namedChildCount)) return { kind: "string" };
	const parts = node.namedChildren;
	return parts.every((part) => part.type === "string_fragment")
		? { kind: "string", text: parts.map((part) => part.text).join("") }
		: { kind: "string" };
}

/**
 * The value of a list, each item a step.
 * @param node The list.
 * @param scope The names in scope.
 * @param budget The reading's budget.
 * @returns The list; unknown once the budget is spent.
 */
function list(node: Node, scope: Scope, budget: Budget): NixValue {
	const items = node.childrenForFieldName("element");
	if (!spend(budget, items.length)) return unknownAt(node);
	return {
		kind: "list",
		items: items.map((item) => ({ node: item, value: thunk(item, scope, budget) })),
	};
}

/**
 * Read one field of an expression in the same scope.
 * @param name The field.
 * @returns The reader.
 */
function field(name: string): Reader {
	return (node, scope, budget) => evaluate(node.childForFieldName(name), scope, budget);
}

/** Each kind of expression the reading follows, and how. */
const READERS: ReadonlyMap<string, Reader> = new Map<string, Reader>([
	[
		"attrset_expression",
		(node, scope, budget) => {
			const building: Building = { entries: new Map() };
			bindInto(bindingSetOf(node), building, { values: scope, inherited: scope }, budget);
			return finished(building, budget);
		},
	],
	["rec_attrset_expression", (node, scope, budget) => recursive(node, scope, budget).value],
	[
		"let_expression",
		(node, scope, budget) =>
			evaluate(node.childForFieldName("body"), recursive(node, scope, budget).scope, budget),
	],
	[
		"function_expression",
		(node, scope, budget) => ({
			kind: "function",
			/**
			 * The body's value for one argument.
			 * @param argument The argument.
			 * @returns The value.
			 */
			apply: (argument) =>
				evaluate(
					node.childForFieldName("body"),
					parameterScope(node, argument, scope, budget),
					budget,
				),
		}),
	],
	[
		"apply_expression",
		(node, scope, budget) =>
			applied(
				evaluate(node.childForFieldName("function"), scope, budget),
				thunk(node.childForFieldName("argument"), scope, budget),
				node,
			),
	],
	["select_expression", selection],
	["variable_expression", variable],
	["parenthesized_expression", field("expression")],
	["assert_expression", field("body")],
	[
		"with_expression",
		(node, scope, budget) =>
			evaluate(
				node.childForFieldName("body"),
				{
					names: new Map(),
					parent: scope,
					with: thunk(node.childForFieldName("environment"), scope, budget),
				},
				budget,
			),
	],
	["binary_expression", binary],
	["list_expression", list],
	["string_expression", (node, _scope, budget) => string(node, budget)],
	["indented_string_expression", () => ({ kind: "string" })],
	...[
		"integer_expression",
		"float_expression",
		"path_expression",
		"hpath_expression",
		"spath_expression",
		"uri_expression",
		"unary_expression",
		"has_attr_expression",
	].map((type): [string, Reader] => [type, () => OTHER]),
]);

/**
 * Read the expression of a whole file: what its root expression gives. Every
 * value of it that is read later spends the same budget.
 * @param root The file's root node.
 * @returns Its value.
 */
function readFile(root: Node): NixValue {
	const budget: Budget = { steps: MAX_STEPS, depth: 0 };
	return evaluate(root.childForFieldName("expression"), { names: new Map() }, budget);
}

export { MAX_DEPTH, readFile };

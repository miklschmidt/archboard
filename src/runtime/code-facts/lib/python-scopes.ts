// Which uses of a Python file name a local rather than an import. A
// function, a lambda and a comprehension give the names bound inside them a
// scope of their own, so a parameter or a local named like an import hides
// the import there: `Response` in Flask's `redirect(..., Response=None)` is
// the parameter, not `flask.wrappers.Response`. Only names that an import of
// the file binds are tracked, because only they can hide one.

import type { Node } from "web-tree-sitter";
import { staticImports } from "@/runtime/code-facts/lib/python-imports";

/** What gives the names bound inside it a scope of their own. */
const SCOPES = new Set([
	"function_definition",
	"lambda",
	"list_comprehension",
	"set_comprehension",
	"dictionary_comprehension",
	"generator_expression",
]);

/** The statements that declare a name to belong to a scope outside. */
const DECLARED_OUTSIDE = new Set(["global_statement", "nonlocal_statement"]);

/** The names of imports that scopes bind for themselves, which hide the import inside them. */
interface Shadows {
	/** Every such name, of any scope. */
	readonly names: ReadonlySet<string>;
	/** The names each scope binds, by the scope's node. */
	readonly byScope: ReadonlyMap<number, ReadonlySet<string>>;
}

/** One name bound in a scope: its own, or declared to be another scope's or an import's. */
interface Binding {
	/** The scope's node, or -1 at module level. */
	readonly scope: number;
	readonly name: string;
	readonly own: boolean;
}

/**
 * Whether one node lies within another.
 * @param outer The node that may hold it.
 * @param inner The node.
 * @returns True when the outer node's text spans the inner one's.
 */
function holds(outer: Node, inner: Node): boolean {
	return outer.startIndex <= inner.startIndex && inner.endIndex <= outer.endIndex;
}

/**
 * Where the names of a scope live: the body of a function or a lambda, whose
 * defaults, annotations and decorators the scope around it evaluates, or the
 * whole comprehension.
 * @param scope The scope.
 * @returns The node that holds its names.
 */
function bodyOf(scope: Node): Node {
	if (scope.type !== "function_definition" && scope.type !== "lambda") return scope;
	return scope.childForFieldName("body") ?? scope;
}

/**
 * The scope a name or a statement belongs to: the function or lambda whose
 * parameter it is, else the nearest scope whose body holds it.
 * @param node The name or the statement.
 * @returns The scope, or undefined at module level and in a class body.
 */
function scopeOf(node: Node): Node | undefined {
	for (let at = node.parent; at !== null; at = at.parent) {
		if (!SCOPES.has(at.type)) continue;
		const parameters = at.childForFieldName("parameters");
		if (holds(bodyOf(at), node) || (parameters !== null && holds(parameters, node))) return at;
	}
	return undefined;
}

/**
 * The first name each import statement binds, in the scope it sits in. A
 * name a scope imports itself reaches its import, even where the scope
 * assigns it too (`from .testing import FlaskClient as cls` beside
 * `cls = self.test_client_class`), so it is not the scope's own.
 * @param statements The import statements.
 * @returns The bindings.
 */
function importBindings(statements: readonly Node[]): Binding[] {
	return statements.flatMap((statement) => {
		const scope = scopeOf(statement)?.id ?? -1;
		const names = staticImports(statement, false).flatMap((found) => found.names);
		return names.map((name) => ({ scope, name: name.local.split(".")[0] ?? "", own: false }));
	});
}

/**
 * The scope a bound name belongs to, and whether it is the scope's own.
 * @param name The name, as a parameter, a target or a definition writes it.
 * @returns The binding, or undefined at module level, in a class body and for a keyword argument.
 */
function bindingOf(name: Node): Binding | undefined {
	const statement = name.parent?.type ?? "";
	const scope = statement === "keyword_argument" ? undefined : scopeOf(name);
	if (scope === undefined) return undefined;
	return { scope: scope.id, name: name.text, own: !DECLARED_OUTSIDE.has(statement) };
}

/**
 * A binding's scope and name, as one key.
 * @param each The binding.
 * @returns The key.
 */
function key(each: Binding): string {
	return `${String(each.scope)}\0${each.name}`;
}

/**
 * The names of the file's imports that each scope binds for itself: its
 * parameters, the names it assigns, loops over or binds with `as`, and the
 * functions and classes it defines, less the names it declares `global` or
 * `nonlocal` and the names it imports itself.
 * @param imports The file's import statements.
 * @param bound Every name a parameter, a target or a definition writes.
 * @returns The names, by scope.
 */
function shadowsOf(imports: readonly Node[], bound: readonly Node[]): Shadows {
	const imported = importBindings(imports);
	const importable = new Set(imported.map((each) => each.name));
	const bindings = bound
		.filter((name) => importable.has(name.text))
		.flatMap((name) => bindingOf(name) ?? []);
	const notOwn = new Set([...imported, ...bindings].filter((each) => !each.own).map(key));
	const byScope = new Map<number, Set<string>>();
	for (const each of bindings) {
		if (!each.own || notOwn.has(key(each))) continue;
		byScope.set(each.scope, (byScope.get(each.scope) ?? new Set()).add(each.name));
	}
	return { names: new Set([...byScope.values()].flatMap((names) => [...names])), byScope };
}

/**
 * The scopes whose bodies hold a node, innermost first.
 * @param node The node.
 * @returns The scopes.
 */
function scopesAround(node: Node): Node[] {
	const scopes: Node[] = [];
	for (let at = node.parent; at !== null; at = at.parent) {
		if (SCOPES.has(at.type) && holds(bodyOf(at), node)) scopes.push(at);
	}
	return scopes;
}

/**
 * Whether a use names what a scope around it binds for itself, rather than
 * an import of the module.
 * @param node The use.
 * @param symbol Its spelling, whose first name the scope may bind.
 * @param shadows The names of imports that scopes bind for themselves.
 * @returns True for a local of a function, a lambda or a comprehension.
 */
function isLocal(node: Node, symbol: string, shadows: Shadows): boolean {
	const first = symbol.split(".")[0] ?? "";
	return (
		shadows.names.has(first) &&
		scopesAround(node).some((scope) => shadows.byScope.get(scope.id)?.has(first) === true)
	);
}

export { type Shadows, holds, isLocal, shadowsOf };

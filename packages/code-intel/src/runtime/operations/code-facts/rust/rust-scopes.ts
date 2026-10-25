// Rust imports and local bindings belong to lexical scopes. Keep that scope
// while syntax nodes exist, then retain only import indices in the cached facts.
import type { Node } from "web-tree-sitter";
import type { Import, ParsedFacts, Reference } from "#runtime/operations/code-facts/facts.ts";
import { opens } from "#runtime/operations/code-facts/rust/rust-definitions.ts";
import { importsOf, nestingOf } from "#runtime/operations/code-facts/rust/rust-imports.ts";

/** A use while the syntax tree is still alive. */
type WrittenUse = Reference & { readonly node: Node };
/** A use with the imports visible there, or a local binding that hides them. */
type RustUse = ParsedFacts["references"][number] & {
	readonly local?: true;
	readonly globs: readonly number[];
};
/** One import and the scope that owns it. */
interface ScopedImport {
	readonly found: Import;
	readonly scope: Node;
	readonly local: string;
}
/** A local name and the source region where it hides an outer name. */
interface Binding {
	readonly name: string;
	readonly start: number;
	readonly end: number;
}

/**
 * The lexical scopes visible at a node, nearest first. An inline module
 * starts a separate namespace and cannot inherit its parent's imports.
 * @param node The node.
 * @returns Its scopes.
 */
function scopesOf(node: Node): Node[] {
	const scopes: Node[] = [];
	for (let at = node.parent; at !== null; at = at.parent) {
		if (["block", "declaration_list", "source_file"].includes(at.type)) scopes.push(at);
		if (at.type === "mod_item" || at.type === "source_file") {
			break;
		}
	}
	return scopes;
}

/**
 * Whether every inline module around an import exposes it.
 * @param node The import.
 * @returns True when its namespace is exposed.
 */
function openScope(node: Node): boolean {
	for (let at = node.parent; at !== null; at = at.parent) {
		if (at.type !== "mod_item") continue;
		const visibility = at.namedChildren.find((child) => child.type === "visibility_modifier");
		if (visibility === undefined || !opens(visibility.text)) return false;
	}
	return true;
}

/**
 * Imports with their lexical scopes and module-qualified local names.
 * @param nodes The import declarations.
 * @returns Each leaf in source order.
 */
function scopedImports(nodes: readonly Node[]): ScopedImport[] {
	return nodes.flatMap((node) => {
		const scope = scopesOf(node)[0];
		if (scope === undefined) return [];
		const prefix = nestingOf(node);
		return importsOf(node).map((found) => {
			const local = found.names[0]?.local ?? "*";
			const qualified = [...prefix, ...(local === "*" ? [] : [local])].join(".") || "*";
			return {
				scope,
				local,
				found: {
					...found,
					reexport: found.reexport && openScope(node),
					names: found.names.map((name) => ({ ...name, local: qualified })),
				},
			};
		});
	});
}

/**
 * Where a bound name hides an outer name. A let binding starts after its
 * initializer, while parameters belong to the body of their function or closure.
 * @param node The bound name.
 * @returns Its region, or none for an unsupported pattern.
 */
function bindingOf(node: Node): Binding | undefined {
	for (let at = node.parent; at !== null; at = at.parent) {
		if (at.type === "let_declaration") {
			const scope = scopesOf(at)[0];
			return scope === undefined
				? undefined
				: { name: node.text, start: at.endIndex, end: scope.endIndex };
		}
		const body = at.childForFieldName("body");
		if (body !== null) return { name: node.text, start: body.startIndex, end: body.endIndex };
		if (at.type === "match_arm") return { name: node.text, start: at.startIndex, end: at.endIndex };
	}
	return undefined;
}

/**
 * Whether a local binding hides the first name at this use.
 * @param use The use.
 * @param bindings The local bindings.
 * @returns True when the use is local.
 */
function isLocal(use: WrittenUse, bindings: readonly Binding[]): boolean {
	const first = use.symbol.split(".")[0];
	return bindings.some(
		(binding) =>
			binding.name === first &&
			binding.start <= use.node.startIndex &&
			use.node.startIndex < binding.end,
	);
}

/**
 * The imports visible at a use, nearest scope first.
 * @param node The use's syntax node.
 * @param imports The imports.
 * @returns Their indices.
 */
function visibleAt(node: Node, imports: readonly ScopedImport[]): number[] {
	return scopesOf(node).flatMap((scope) =>
		imports.flatMap((found, index) => (found.scope.id === scope.id ? [index] : [])),
	);
}

/**
 * Attach a visible import, or keep the use local. The symbol retains the
 * inline module prefix of an imported name so re-exports share that spelling.
 * @param written The use while its node is available.
 * @param imports The imports.
 * @param bindings The local bindings.
 * @returns The cached use, with no syntax nodes.
 */
function bindUse(
	written: WrittenUse,
	imports: readonly ScopedImport[],
	bindings: readonly Binding[],
): RustUse {
	const { node, ...use } = written;
	const visible = visibleAt(node, imports);
	const globs = visible.filter((index) => imports[index]?.found.specifier.endsWith("::*"));
	if (isLocal(written, bindings)) return { ...use, local: true, globs: [] };
	const [first = ""] = use.symbol.split(".");
	const index = visible.find((at) => imports[at]?.local === first && !globs.includes(at));
	return importedUse({ ...use, globs }, first, index, imports);
}

/**
 * Rewrite an imported use to the name stored by its owning inline module.
 * @param use The use.
 * @param first Its first name as written.
 * @param index The import index, if one matched.
 * @param imports The imports.
 * @returns The use with its import.
 */
function importedUse(
	use: RustUse,
	first: string,
	index: number | undefined,
	imports: readonly ScopedImport[],
): RustUse {
	if (index === undefined) return use;
	const local = imports[index]?.found.names[0]?.local;
	return local === undefined
		? use
		: { ...use, symbol: local + use.symbol.slice(first.length), through: { import: index, local } };
}

/**
 * A use of a named import that no expression uses, such as a trait imported
 * for its methods. A re-export and a whole-module import add no such use.
 * @param imports The imports.
 * @param uses The uses with their imports.
 * @returns The remaining import evidence.
 */
function importedOnly(imports: readonly ScopedImport[], uses: readonly RustUse[]): RustUse[] {
	const used = new Set(uses.flatMap((use) => use.through?.import ?? []));
	return imports.flatMap(({ found }, index) => {
		const name = found.names[0];
		if (
			found.reexport ||
			used.has(index) ||
			name === undefined ||
			name.imported === "*" ||
			name.local === "_"
		)
			return [];
		return [
			{
				symbol: name.local,
				line: found.line,
				via: "code",
				kind: "import",
				typeOnly: true,
				through: { import: index, local: name.local },
				globs: [],
			},
		];
	});
}

/**
 * Resolve lexical ownership before discarding syntax nodes. Uses of the same
 * name in different scopes remain separate when they reach different imports.
 * @param written The uses.
 * @param declarations The import declarations.
 * @param bound The local bindings.
 * @returns The imports and distinct uses.
 */
function bindReferences(
	written: readonly WrittenUse[],
	declarations: readonly Node[],
	bound: readonly Node[],
): Pick<ParsedFacts, "imports" | "references"> {
	const imports = scopedImports(declarations);
	const bindings = bound.flatMap((node) => bindingOf(node) ?? []);
	const uses = written.map((use) => bindUse(use, imports, bindings));
	const seen = new Map<string, RustUse>();
	for (const use of [...uses, ...importedOnly(imports, uses)].toSorted(
		(left, right) => left.line - right.line,
	)) {
		const { line: _line, ...identity } = use;
		const key = JSON.stringify(identity);
		if (!seen.has(key)) seen.set(key, use);
	}
	return { imports: imports.map((each) => each.found), references: [...seen.values()] };
}

export { bindReferences, type RustUse, type WrittenUse };

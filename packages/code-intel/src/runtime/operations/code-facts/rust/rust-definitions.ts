// The definitions of a Rust file (ADR 0046, TASK-540): its items, and the
// items of the inline modules, `impl` blocks and traits it holds.
//
// An item is spelled with the inline modules that hold it, `tests.helper`,
// and a member with the type that holds it: a method or an associated item of
// an `impl` block is a member of the type the block adds to, wherever the type
// is declared (`Ledger.post`, `Ledger.fmt` from `impl Display for Ledger`), an
// item of a trait a member of the trait, a variant a member of its enum and a
// named field a member of its struct. A module declared with `mod name;`, whose
// code is in another file, is a definition of its name too. An item inside a
// function body is a local, and is no definition.
//
// The visibility is Rust's word as written, `pub`, `pub(crate)`, `pub(super)`,
// `pub(self)` or `pub(in path)`, else `private`. The items of a trait, the
// variants of an enum and the members an `impl` of a trait adds have no word
// of their own: they take their holder's, and a member of a trait's `impl`
// reads `impl`. A `macro_rules!` macro reads `macro_export` where that
// attribute exports it to the whole crate, else `macro_rules`.
//
// A definition is exposed when code outside its file can name it: its word
// opens it beyond its module (any `pub` but `pub(self)`), and so does every
// inline module and type around it that the file declares. A module declared
// with `mod name;` is not exposed itself: what it passes on is its file's own
// exposure, which a `pub mod` re-exports (rust-imports.ts). A member of a
// trait's `impl` is exposed when its type is, or when the file does not
// declare the type.

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/operations/code-facts/facts.ts";
import { sourceRange } from "#runtime/operations/code-facts/spans.ts";

/** Where the walk is: the names that qualify an item, and whether everything around it is open. */
interface Scope {
	readonly prefix: readonly string[];
	readonly open: boolean;
}

/** An item's kind, by its node. */
const ITEM_KIND: Readonly<Record<string, Definition["kind"]>> = {
	function_item: "function",
	function_signature_item: "function",
	macro_definition: "function",
	struct_item: "class",
	enum_item: "class",
	union_item: "class",
	trait_item: "class",
	type_item: "class",
	associated_type: "class",
	mod_item: "class",
	const_item: "value",
	static_item: "value",
};

/**
 * The visibility an item writes, with its spaces collapsed.
 * @param node The item.
 * @returns The word, or `private` when it writes none.
 */
function visibilityOf(node: Node): string {
	const modifier = node.namedChildren.find((child) => child.type === "visibility_modifier");
	return modifier === undefined ? "private" : modifier.text.replaceAll(/\s+/gu, " ");
}

/**
 * Whether a visibility opens an item beyond its module.
 * @param visibility The word.
 * @returns True for any `pub` but `pub(self)`.
 */
function opens(visibility: string): boolean {
	return visibility.startsWith("pub") && visibility.replaceAll(" ", "") !== "pub(self)";
}

/**
 * Whether an attribute right before an item names `#[macro_export]`.
 * @param node The item.
 * @returns True when it does.
 */
function exported(node: Node): boolean {
	for (
		let at = node.previousNamedSibling;
		at?.type === "attribute_item";
		at = at.previousNamedSibling
	) {
		if (at.text.replaceAll(/\s+/gu, "") === "#[macro_export]") return true;
	}
	return false;
}

/**
 * The name of the type an `impl` block adds to: its last name, without its
 * generic arguments.
 * @param type The block's type.
 * @returns The name, or undefined for a type that has none, such as a reference.
 */
function typeName(type: Node | null): string | undefined {
	if (type === null) return undefined;
	if (type.type === "type_identifier") return type.text;
	if (type.type === "generic_type") return typeName(type.childForFieldName("type"));
	if (type.type === "scoped_type_identifier") return type.childForFieldName("name")?.text;
	return undefined;
}

/**
 * One definition.
 * @param node Its declaration.
 * @param symbol Its spelled name.
 * @param shape Its kind, visibility and exposure.
 * @returns The definition.
 */
function definition(
	node: Node,
	symbol: string,
	shape: Pick<Definition, "kind" | "visibility" | "exposed">,
): Definition {
	return {
		symbol,
		...shape,
		start: node.startPosition.row + 1,
		end: node.endPosition.row + 1,
		source: sourceRange(node),
	};
}

/** What one walk collects, and the types the file declares with whether each is open. */
interface Walk {
	readonly found: Definition[];
	readonly types: Map<string, boolean>;
}

/** A definition's kind, visibility and exposure. */
type Shape = Pick<Definition, "kind" | "visibility" | "exposed">;

/** A definition's visibility and exposure. */
type Openness = Pick<Definition, "visibility" | "exposed">;

/**
 * The name a declaration gives.
 * @param node The declaration.
 * @returns Its name, or undefined for one that names none.
 */
function nameOf(node: Node): string | undefined {
	return node.childForFieldName("name")?.text;
}

/**
 * The kind and name of an item.
 * @param node The item.
 * @returns Them, or undefined for a node that is no named item.
 */
function namedItem(node: Node): { kind: Definition["kind"]; name: string } | undefined {
	const kind = ITEM_KIND[node.type];
	const name = nameOf(node);
	return kind === undefined || name === undefined ? undefined : { kind, name };
}

/**
 * Whether the members of an `impl` block are open: an inherent block's
 * members by their own visibility within an open scope, and a trait's by
 * whether the file opens the type, where the file declares it.
 * @param ofTrait Whether the block implements a trait.
 * @param holder The type's spelled name.
 * @param scope Where the block is.
 * @param walk What the walk collected.
 * @returns True when they are.
 */
function implOpen(ofTrait: boolean, holder: string, scope: Scope, walk: Walk): boolean {
	return scope.open && (!ofTrait || (walk.types.get(holder) ?? true));
}

/**
 * The visibility and exposure of a member of an `impl` block.
 * @param member The member.
 * @param ofTrait Whether the block implements a trait, whose members are as open as the trait.
 * @param open Whether the block's members are open.
 * @returns Them.
 */
function implShape(member: Node, ofTrait: boolean, open: boolean): Openness {
	if (ofTrait) return { visibility: "impl", exposed: open };
	const visibility = visibilityOf(member);
	return { visibility, exposed: opens(visibility) && open };
}

/**
 * The members of an `impl` block, spelled under its type.
 * @param node The block.
 * @param scope Where it is.
 * @param walk What the walk collects.
 */
function implMembers(node: Node, scope: Scope, walk: Walk): void {
	const type = typeName(node.childForFieldName("type"));
	const body = node.childForFieldName("body");
	if (type === undefined || body === null) return;
	const ofTrait = node.childForFieldName("trait") !== null;
	const holder = [...scope.prefix, type].join(".");
	const open = implOpen(ofTrait, holder, scope, walk);
	for (const member of body.namedChildren) {
		const item = namedItem(member);
		if (item === undefined) continue;
		const shape = { kind: item.kind, ...implShape(member, ofTrait, open) };
		walk.found.push(definition(member, `${holder}.${item.name}`, shape));
	}
}

/**
 * The kind, visibility and exposure of a member a type holds in its body.
 * @param member The member.
 * @param holder The type's visibility and exposure, which a trait's items and a variant take.
 * @returns Them, or undefined for a node that is no member.
 */
function memberShape(member: Node, holder: Openness): Shape | undefined {
	if (member.type === "enum_variant") return { kind: "value", ...holder };
	if (member.type === "field_declaration") {
		const visibility = visibilityOf(member);
		return { kind: "value", visibility, exposed: holder.exposed && opens(visibility) };
	}
	const kind = ITEM_KIND[member.type];
	return kind === undefined ? undefined : { kind, ...holder };
}

/**
 * The members a type holds in its body: a trait's items, an enum's variants,
 * a struct's or a union's named fields.
 * @param node The type.
 * @param holder Its spelled name.
 * @param shape Its visibility and exposure.
 * @param walk What the walk collects.
 */
function typeMembers(node: Node, holder: string, shape: Openness, walk: Walk): void {
	for (const member of node.childForFieldName("body")?.namedChildren ?? []) {
		const name = nameOf(member);
		const own = memberShape(member, shape);
		if (name !== undefined && own !== undefined) {
			walk.found.push(definition(member, `${holder}.${name}`, own));
		}
	}
}

/**
 * The visibility of an item and whether it is open: a macro by
 * `#[macro_export]`, any other item by its visibility within an open scope.
 * @param node The item.
 * @param scope Where it is.
 * @returns Them.
 */
function itemShape(node: Node, scope: Scope): Openness {
	if (node.type === "macro_definition") {
		const exposed = exported(node);
		return { visibility: exposed ? "macro_export" : "macro_rules", exposed };
	}
	const visibility = visibilityOf(node);
	return { visibility, exposed: opens(visibility) && scope.open };
}

/**
 * A module item: `mod name;`, whose file is another and which exposes
 * nothing itself, or an inline module and its items.
 * @param node The module.
 * @param path Its names.
 * @param shape Its kind, visibility and exposure.
 * @param walk What the walk collects.
 */
function modItem(node: Node, path: string[], shape: Shape, walk: Walk): void {
	const body = node.childForFieldName("body");
	const exposed = shape.exposed && body !== null;
	walk.found.push(definition(node, path.join("."), { ...shape, exposed }));
	if (body !== null) walkItems(body.namedChildren, { prefix: path, open: shape.exposed }, walk);
}

/**
 * One item other than an `impl` block, and the members it holds.
 * @param node The item.
 * @param scope Where it is.
 * @param walk What the walk collects.
 */
function walkItem(node: Node, scope: Scope, walk: Walk): void {
	const item = namedItem(node);
	if (item === undefined) return;
	const path = [...scope.prefix, item.name];
	const openness = itemShape(node, scope);
	const shape = { kind: item.kind, ...openness };
	if (node.type === "mod_item") {
		modItem(node, path, shape, walk);
		return;
	}
	const symbol = path.join(".");
	walk.found.push(definition(node, symbol, shape));
	if (item.kind !== "class") return;
	walk.types.set(symbol, openness.exposed);
	typeMembers(node, symbol, openness, walk);
}

/**
 * The items of a list of declarations, and of the inline modules, types and
 * `impl` blocks it holds. Types come first, so a trait's `impl` knows whether
 * the file opens its type.
 * @param items The declarations.
 * @param scope Where they are.
 * @param walk What the walk collects.
 */
function walkItems(items: readonly Node[], scope: Scope, walk: Walk): void {
	for (const node of items) walkItem(node, scope, walk);
	for (const block of items) if (block.type === "impl_item") implMembers(block, scope, walk);
}

/**
 * The definitions of a Rust file.
 * @param root The file's syntax tree.
 * @returns Its definitions, each item before its members.
 */
function definitionsOf(root: Node): Definition[] {
	const walk: Walk = { found: [], types: new Map() };
	walkItems(root.namedChildren, { prefix: [], open: true }, walk);
	return walk.found;
}

export { definitionsOf, opens, typeName };

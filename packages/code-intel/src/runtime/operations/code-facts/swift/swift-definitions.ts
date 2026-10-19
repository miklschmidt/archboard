// What a Swift file defines (ADR 0046, TASK-367.12), read by walking its
// declarations: the declarations at file level, and the members of a type,
// an extension or a protocol, each qualified by the types that hold it
// (`Ledger.post`, `Ledger.Kind.debit`). An extension is no definition of its
// own: its members are members of the type it extends, so `refund` in
// `extension Ledger` is `Ledger.refund`, whichever file the extension is in.
// A declaration inside a function body is local, and no definition.
//
// The visibility is Swift's access level, as written: `open`, `public`,
// `package`, `internal`, `fileprivate` or `private`. Where none is written,
// it is the default Swift gives: `internal`, the level an extension states
// for its members, `fileprivate` for a member of a private or file-private
// type, and the level of its enum or protocol for a case or a requirement.
// Exposed means that another module can use it: `open`, `public` or
// `package`, the last because the modules of one package see it. A member is
// exposed only when its type is too.

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/operations/code-facts/facts.ts";
import { sourceRange } from "#runtime/operations/code-facts/spans.ts";

/** The access levels another module can use. */
const EXPOSED = new Set(["open", "public", "package"]);

/** The access levels the file alone can use. */
const FILE_PRIVATE = new Set(["private", "fileprivate"]);

/** What holds a declaration: the file, or a type, an extension or a protocol. */
interface Holder {
	/** The qualified name of the type; empty for the file. */
	readonly symbol: string;
	/** The level a declaration that writes none gets. */
	readonly level: string;
	/** Whether every declaration takes that level, as an enum's cases and a protocol's requirements do. */
	readonly imposed: boolean;
	readonly exposed: boolean;
}

/** What holds the declarations at file level. */
const FILE: Holder = { symbol: "", level: "internal", imposed: false, exposed: true };

/** Callable declarations and types with named members. */
const KINDS: Readonly<Record<string, Definition["kind"]>> = {
	class_declaration: "class",
	protocol_declaration: "class",
	function_declaration: "function",
	protocol_function_declaration: "function",
	init_declaration: "function",
	macro_declaration: "function",
};

/**
 * The kind of a declaration or directly assigned closure.
 * @param node The declaration.
 * @returns Its kind.
 */
function kindOf(node: Node): Definition["kind"] {
	return (
		KINDS[node.type] ??
		(node.childrenForFieldName("value").some((value) => value.type === "lambda_literal")
			? "function"
			: "value")
	);
}

/**
 * Whether a member takes the level of what holds it, rather than writing its
 * own: each case of an enum, and every requirement of a protocol, its
 * initializers too.
 * @param holder The declaration that holds the member.
 * @param member The member.
 * @returns True when it does.
 */
function takesLevel(holder: Node, member: Node): boolean {
	if (holder.type === "protocol_declaration") return true;
	return (
		holder.childForFieldName("declaration_kind")?.text === "enum" && member.type === "enum_entry"
	);
}

/**
 * The access level a declaration writes, leaving out a setter's own level such as `private(set)`.
 * @param node The declaration.
 * @returns The level, or undefined when it writes none.
 */
function writtenLevel(node: Node): string | undefined {
	const modifiers = node.namedChildren.find((child) => child.type === "modifiers");
	return modifiers?.namedChildren.find(
		(modifier) => modifier.type === "visibility_modifier" && !modifier.text.includes("("),
	)?.text;
}

/**
 * One definition, with its level and whether another module can use it.
 * @param node The declaration.
 * @param name Its own name.
 * @param holder What holds it.
 * @returns The definition.
 */
function defined(node: Node, name: string, holder: Holder): Definition {
	const level = holder.imposed ? holder.level : (writtenLevel(node) ?? holder.level);
	return {
		symbol: holder.symbol === "" ? name : `${holder.symbol}.${name}`,
		kind: kindOf(node),
		start: node.startPosition.row + 1,
		end: node.endPosition.row + 1,
		source: sourceRange(node),
		visibility: level,
		exposed: EXPOSED.has(level) && holder.exposed,
	};
}

/**
 * The name a field of a declaration holds, of one kind of node, so a
 * function's name and not its return type.
 * @param node The declaration.
 * @param type The kind of node the name is.
 * @returns The name, or undefined when it has none of that kind.
 */
function nameOf(node: Node, type: string): string | undefined {
	return node.childrenForFieldName("name").find((child) => child.type === type)?.text;
}

/**
 * The names a property binds: one name, or each name of a tuple.
 * @param node The declaration.
 * @returns The names.
 */
function boundNames(node: Node): string[] {
	return node.childrenForFieldName("name").flatMap((pattern) => {
		const bound = pattern.childForFieldName("bound_identifier");
		if (bound !== null) return [bound.text];
		return pattern.descendantsOfType("simple_identifier").map((name) => name.text);
	});
}

/**
 * The definitions of the members of a body.
 * @param node The declaration whose body holds them.
 * @param holder What holds the members.
 * @param imposed The level an enum's cases or a protocol's requirements take, if any.
 * @returns The definitions.
 */
function members(node: Node, holder: Holder, imposed?: string): Definition[] {
	const body = node.childForFieldName("body");
	return (body?.namedChildren ?? []).flatMap((child) =>
		imposed !== undefined && takesLevel(node, child)
			? declared(child, { ...holder, level: imposed, imposed: true })
			: declared(child, holder),
	);
}

/**
 * A type and its members: a class, a struct, an enum, an actor or a protocol.
 * @param node The declaration.
 * @param holder What holds it.
 * @returns Its definition and its members'.
 */
function typeDefinitions(node: Node, holder: Holder): Definition[] {
	const name = nameOf(node, "type_identifier");
	if (name === undefined) return [];
	const own = defined(node, name, holder);
	const level = FILE_PRIVATE.has(own.visibility) ? "fileprivate" : "internal";
	const inner: Holder = { symbol: own.symbol, level, imposed: false, exposed: own.exposed };
	return [own, ...members(node, inner, own.visibility)];
}

/**
 * The members of an extension, as members of the type it extends, at the level it states.
 * @param node The extension.
 * @returns The definitions.
 */
function extensionDefinitions(node: Node): Definition[] {
	const type = node.childForFieldName("name");
	if (type === null) return [];
	const names = type.namedChildren.filter((child) => child.type === "type_identifier");
	const symbol = names.length === 0 ? type.text : names.map((name) => name.text).join(".");
	const written = writtenLevel(node) ?? "internal";
	const level = written === "private" ? "fileprivate" : written;
	return members(node, { symbol, level, imposed: false, exposed: true });
}

/**
 * The one definition a declaration with a name of one kind of node gives.
 * @param type The kind of node its name is.
 * @returns How to read it.
 */
function named(type: string): (node: Node, holder: Holder) => Definition[] {
	return (node, holder) => {
		const name = nameOf(node, type);
		return name === undefined ? [] : [defined(node, name, holder)];
	};
}

/**
 * A class, a struct, an enum, an actor, or an extension's members.
 * @param node The declaration.
 * @param holder What holds it.
 * @returns The definitions.
 */
function classDefinitions(node: Node, holder: Holder): Definition[] {
	return node.childForFieldName("declaration_kind")?.text === "extension"
		? extensionDefinitions(node)
		: typeDefinitions(node, holder);
}

/**
 * An initializer of a type, as `Ledger.init`.
 * @param node The declaration.
 * @param holder What holds it.
 * @returns The definition; none at file level.
 */
function initializer(node: Node, holder: Holder): Definition[] {
	return holder === FILE ? [] : [defined(node, "init", holder)];
}

/**
 * Each name a property or a property requirement binds.
 * @param node The declaration.
 * @param holder What holds it.
 * @returns The definitions.
 */
function properties(node: Node, holder: Holder): Definition[] {
	return boundNames(node).map((name) => defined(node, name, holder));
}

/**
 * Each case an enum's `case` declares.
 * @param node The declaration.
 * @param holder The enum.
 * @returns The definitions.
 */
function cases(node: Node, holder: Holder): Definition[] {
	return node.childrenForFieldName("name").map((name) => defined(node, name.text, holder));
}

/**
 * A macro, whose name is the first name it writes.
 * @param node The declaration.
 * @param holder What holds it.
 * @returns The definition.
 */
function macro(node: Node, holder: Holder): Definition[] {
	const name = node.namedChildren.find((child) => child.type === "simple_identifier");
	return name === undefined ? [] : [defined(node, name.text, holder)];
}

/** How each kind of declaration gives its definitions. */
const DECLARATIONS: Readonly<Record<string, (node: Node, holder: Holder) => Definition[]>> = {
	class_declaration: classDefinitions,
	protocol_declaration: typeDefinitions,
	function_declaration: named("simple_identifier"),
	protocol_function_declaration: named("simple_identifier"),
	init_declaration: initializer,
	property_declaration: properties,
	protocol_property_declaration: properties,
	enum_entry: cases,
	typealias_declaration: named("type_identifier"),
	associatedtype_declaration: named("type_identifier"),
	macro_declaration: macro,
};

/**
 * The definitions one declaration gives.
 * @param node The declaration.
 * @param holder What holds it.
 * @returns The definitions; none for a statement that declares nothing.
 */
function declared(node: Node, holder: Holder): Definition[] {
	return DECLARATIONS[node.type]?.(node, holder) ?? [];
}

/**
 * Every definition of a file. A file whose whole tree is an error has none:
 * what tree-sitter recovers there stands outside its declarations, a member
 * outside its type and a local at file level.
 * @param root The file's syntax tree.
 * @returns The definitions, in document order.
 */
function definitionsOf(root: Node): Definition[] {
	if (root.type === "ERROR") return [];
	return root.namedChildren.flatMap((child) => declared(child, FILE));
}

/**
 * Whether only its own file can use a definition: it is private or file-private,
 * or a type around it in the file is.
 * @param definition The definition.
 * @param definitions Every definition of its file.
 * @returns True when no other file sees it.
 */
function filePrivate(definition: Definition, definitions: readonly Definition[]): boolean {
	if (FILE_PRIVATE.has(definition.visibility)) return true;
	return definitions.some(
		(holder) =>
			definition.symbol.startsWith(`${holder.symbol}.`) &&
			holder.start <= definition.start &&
			definition.end <= holder.end &&
			FILE_PRIVATE.has(holder.visibility),
	);
}

export { definitionsOf, filePrivate };

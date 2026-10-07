// What a C# file declares (ADR 0046): each type, each member of a type and
// each enum member, qualified by the namespaces and the types that hold it as
// C# spells a qualified name (`Shop.Core.Ledger.Post`), with the
// accessibility C# gives it.
//
// The word is the access modifier as written: `public`, `internal`,
// `protected`, `private`, `protected internal`, `private protected` or
// `file`. With none written, it is the default C# gives the place: `internal`
// for a type in a namespace, `public` for a member of an interface or of an
// enum and for a record's positional property, and `private` for every other
// member and nested type. A definition is exposed outside its project when it
// is `public` and every type that holds it is exposed. Which friends
// `InternalsVisibleTo` gives an internal definition is a fact of the whole
// project, so the resolver adds it on each pass (csharp-resolution.ts). So is
// the accessibility of a part of a partial type that writes none: C# gives it
// what another part writes, and the default only where no part writes one. The
// walk marks such a part `partial` before the default (`partial internal`),
// and the resolver settles it.
//
// A constructor is spelled with its type's name (`Ledger.Ledger`). Locals,
// local functions and lambdas are not definitions, and nor are indexers,
// operators and finalizers, which have no name a binding could spell. A
// declaration in a part of the file that did not parse is not read.

import type { Node } from "web-tree-sitter";
import type { Definition } from "@/runtime/code-facts/lib/facts";
import { sourceRange } from "@/runtime/code-facts/lib/spans";

/** The kind of a type, which decides the default accessibility of its members. */
type TypeKind = "class" | "struct" | "interface" | "enum" | "delegate";

/** The declarations of a type, and the kind of type each one is. */
const TYPE_KINDS: Readonly<Record<string, TypeKind>> = {
	class_declaration: "class",
	struct_declaration: "struct",
	interface_declaration: "interface",
	enum_declaration: "enum",
	record_declaration: "class",
	delegate_declaration: "delegate",
};

/** The members of a type that a declaration names once. */
const NAMED_MEMBERS = new Set([
	"method_declaration",
	"constructor_declaration",
	"property_declaration",
	"event_declaration",
	"enum_member_declaration",
]);

/** The members of a type that declare one or more variables. */
const VARIABLE_MEMBERS = new Set(["field_declaration", "event_field_declaration"]);

/**
 * The kind of one type, named callable member or value member.
 * @param node The declaration.
 * @returns Its kind.
 */
function kindOf(node: Node): Definition["kind"] {
	if (TYPE_KINDS[node.type] !== undefined) return "class";
	return ["method_declaration", "constructor_declaration"].includes(node.type)
		? "function"
		: "value";
}

/** The access modifiers, in the order C# writes a pair of them. */
const ACCESS = ["private", "protected", "internal", "public", "file"];

/**
 * What the walk puts before the default of a part of a partial type that
 * writes no access modifier, which the resolver replaces with what another
 * part writes.
 */
const UNSETTLED = "partial ";

/** The type that holds a declaration. */
interface Holder {
	readonly kind: TypeKind;
	readonly exposed: boolean;
}

/** Where the walk is: the qualified name of what holds the next declaration, and its type. */
interface Scope {
	readonly qualifier: readonly string[];
	readonly holder?: Holder;
}

/** The fields of a qualified name: what qualifies it, and its last name. */
const QUALIFIED = ["qualifier", "name"] as const;

/**
 * A name as a namespace declaration writes it: `Shop.Core`.
 * @param node The name.
 * @returns Its names.
 */
function namesOf(node: Node | null): string[] {
	if (node?.type === "identifier") return [node.text];
	if (node?.type !== "qualified_name") return [];
	return QUALIFIED.flatMap((field) => namesOf(node.childForFieldName(field)));
}

/**
 * The accessibility C# gives a declaration that writes none.
 * @param holder The type that holds it, if any.
 * @returns `internal` in a namespace, `public` in an interface or an enum, else `private`.
 */
function defaultAccessibility(holder: Holder | undefined): string {
	if (holder === undefined) return "internal";
	return holder.kind === "interface" || holder.kind === "enum" ? "public" : "private";
}

/**
 * The accessibility a declaration writes or C# gives it there; for a part of
 * a partial type that writes none, the default marked as unsettled.
 * @param node The declaration.
 * @param holder The type that holds it, if any.
 * @returns The word.
 */
function accessibility(node: Node, holder: Holder | undefined): string {
	const written = new Set(
		node.namedChildren.filter((child) => child.type === "modifier").map((child) => child.text),
	);
	const words = ACCESS.filter((word) => written.has(word));
	if (words.length > 0) return words.join(" ");
	const partial = written.has("partial") && TYPE_KINDS[node.type] !== undefined;
	return `${partial ? UNSETTLED : ""}${defaultAccessibility(holder)}`;
}

/**
 * One definition.
 * @param node The declaration, whose lines it spans.
 * @param name The name it declares.
 * @param scope What holds it.
 * @param visibility Its accessibility.
 * @param kind A callable field's kind, where its initializer proves it.
 * @returns The definition.
 */
function definitionAt(
	node: Node,
	name: string,
	scope: Scope,
	visibility: string,
	kind?: Definition["kind"],
): Definition {
	return {
		symbol: [...scope.qualifier, name].join("."),
		kind: kind ?? kindOf(node),
		start: node.startPosition.row + 1,
		end: node.endPosition.row + 1,
		source: sourceRange(node),
		visibility,
		exposed: visibility === "public" && (scope.holder?.exposed ?? true),
	};
}

/**
 * The named children of one type.
 * @param node The node.
 * @param type The type.
 * @returns Its children of that type.
 */
function childrenOf(node: Node | undefined, type: string): Node[] {
	return (node?.namedChildren ?? []).filter((child) => child.type === type);
}

/**
 * The names a member declares: its own, or each variable of a field or an event field.
 * @param node The member.
 * @returns The names; none for a member with no name a binding spells.
 */
function memberNames(node: Node): Node[] {
	if (NAMED_MEMBERS.has(node.type))
		return [node.childForFieldName("name")].filter((name) => name !== null);
	if (!VARIABLE_MEMBERS.has(node.type)) return [];
	return childrenOf(childrenOf(node, "variable_declaration")[0], "variable_declarator")
		.map((declarator) => declarator.childForFieldName("name"))
		.filter((name) => name !== null);
}

/**
 * The definitions a member of a type declares.
 * @param node The member.
 * @param scope The type that holds it.
 * @returns Its definitions.
 */
function memberDefinitions(node: Node, scope: Scope): Definition[] {
	const visibility = accessibility(node, scope.holder);
	return memberNames(node).map((name) => {
		const lambda = name.parent?.namedChildren.some((child) =>
			["lambda_expression", "anonymous_method_expression"].includes(child.type),
		);
		return definitionAt(
			node,
			name.text,
			scope,
			visibility,
			lambda === true ? "function" : undefined,
		);
	});
}

/**
 * The positional properties of a record: `record Order(int Id)` declares the
 * public property `Order.Id`.
 * @param node The record.
 * @param scope The record itself, as the holder of its members.
 * @returns The definitions.
 */
function positionalProperties(node: Node, scope: Scope): Definition[] {
	if (node.type !== "record_declaration") return [];
	return childrenOf(childrenOf(node, "parameter_list")[0], "parameter").flatMap((parameter) => {
		const name = parameter.childForFieldName("name");
		return name === null ? [] : [definitionAt(parameter, name.text, scope, "public")];
	});
}

/**
 * The definitions a type declares: itself, its positional properties and
 * everything its body declares.
 * @param node The type's declaration.
 * @param kind Its kind.
 * @param scope What holds it.
 * @returns The definitions, the type first.
 */
function typeDefinitions(node: Node, kind: TypeKind, scope: Scope): Definition[] {
	const name = node.childForFieldName("name");
	if (name === null) return [];
	const own = definitionAt(node, name.text, scope, accessibility(node, scope.holder));
	const holder: Holder = { kind, exposed: own.exposed };
	const inside: Scope = { qualifier: [...scope.qualifier, name.text], holder };
	return [
		own,
		...positionalProperties(node, inside),
		...declarationsIn(node.childForFieldName("body"), inside),
	];
}

/**
 * The definitions one declaration holds: a type, a namespace, or a member of
 * the type the scope is in.
 * @param node The declaration.
 * @param scope What holds it.
 * @returns Its definitions.
 */
function declarationsOf(node: Node, scope: Scope): Definition[] {
	const kind = TYPE_KINDS[node.type];
	if (kind !== undefined) return typeDefinitions(node, kind, scope);
	if (node.type === "namespace_declaration") {
		const qualifier = [...scope.qualifier, ...namesOf(node.childForFieldName("name"))];
		return declarationsIn(node.childForFieldName("body"), { qualifier });
	}
	return scope.holder === undefined ? [] : memberDefinitions(node, scope);
}

/**
 * Every definition below a compilation unit, a namespace body or a type body.
 * A file-scoped namespace holds every declaration after it.
 * @param body The node whose children declare.
 * @param scope What holds them.
 * @returns The definitions, in the order the file declares them.
 */
function declarationsIn(body: Node | null, scope: Scope): Definition[] {
	let current = scope;
	const found: Definition[] = [];
	for (const child of body?.namedChildren ?? []) {
		if (child.type === "file_scoped_namespace_declaration") {
			current = { qualifier: [...current.qualifier, ...namesOf(child.childForFieldName("name"))] };
		} else found.push(...declarationsOf(child, current));
	}
	return found;
}

/**
 * Every definition of a C# file.
 * @param root The compilation unit.
 * @returns The definitions, in the order the file declares them.
 */
function csharpDefinitions(root: Node): Definition[] {
	return declarationsIn(root, { qualifier: [] });
}

export { UNSETTLED, csharpDefinitions };

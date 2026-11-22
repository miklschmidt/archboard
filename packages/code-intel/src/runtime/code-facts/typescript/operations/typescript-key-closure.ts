// The closed set of keys a TypeScript switchboard's key takes (ADR 0082,
// TASK-659), from the types the file writes.
//
// Literal overloads whose literals name every key the body tests close it, and
// so does a literal or boolean union the parameter is typed with, or a type
// alias or an enum of the file. A key typed by a name another file declares is
// closed once module depth finds that name and it closes the key: this names
// it. A key typed `string` or `number`, or not typed, is open. A type alias or
// an enum states the keys it closes (`Definition.closes`), so that a
// switchboard in another file can be closed by it.

import type { Node } from "web-tree-sitter";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import {
	codeOf,
	declared,
	literalOf,
	type Parameter,
	part,
} from "#runtime/code-facts/typescript/operations/typescript-pick-syntax.ts";

/**
 * What a type says of a key: the keys it closes, `whole` where they are every
 * key it takes, or the name module depth must close them by; undefined for an
 * open key.
 */
type Closure =
	| { readonly keys: readonly string[]; readonly whole: boolean }
	| { readonly type: string }
	| undefined;

/** The type of a property, or the name of a type another file declares, which holds it. */
type Held = Node | { readonly named: string } | undefined;

/** The declarations that can close a key. */
const CLOSING = new Set(["type_alias_declaration", "enum_declaration"]);

/**
 * The type alias or enum of a file that a name declares.
 * @param root The file.
 * @param name The name.
 * @returns The declaration, or undefined.
 */
function typeDeclaration(root: Node, name: string): Node | undefined {
	return codeOf(root)
		.map(declared)
		.find((each) => CLOSING.has(each?.type ?? "") && part(each, "name")?.text === name);
}

/**
 * The members of a union, flattened, without parentheses.
 * @param type The type.
 * @returns Its members, or the type alone.
 */
function unionMembers(type: Node): Node[] {
	const nested = type.type === "parenthesized_type" || type.type === "union_type";
	return nested ? codeOf(type).flatMap(unionMembers) : [type];
}

/**
 * The keys one member of a union closes.
 * @param member The member.
 * @returns The keys, or undefined for a member that is no literal or boolean.
 */
function memberKeys(member: Node): string[] | undefined {
	if (member.type === "predefined_type" && member.text === "boolean") return ["true", "false"];
	const literal = member.type === "literal_type" ? codeOf(member)[0] : undefined;
	const key = literal === undefined ? undefined : literalOf(literal);
	return key === undefined ? undefined : [key];
}

/**
 * The keys a literal type, a boolean or a union of them closes.
 * @param type The type.
 * @returns The keys, or undefined for another type.
 */
function literalKeys(type: Node): string[] | undefined {
	const keys = unionMembers(type).map(memberKeys);
	return keys.every((each) => each !== undefined) ? keys.flat() : undefined;
}

/**
 * The type of a property of an object type.
 * @param type The object type.
 * @param property The property.
 * @returns The property's type, or undefined.
 */
function signatureType(type: Node, property: string): Node | undefined {
	const member = codeOf(type).find(
		(each) => each.type === "property_signature" && part(each, "name")?.text === property,
	);
	const annotation = part(member, "type");
	return annotation === undefined ? undefined : codeOf(annotation)[0];
}

/**
 * The type of a property of the first part of an intersection that holds it.
 * @param type The intersection.
 * @param property The property.
 * @returns The property's type, the name of a type another file declares, or undefined.
 */
function intersectionType(type: Node, property: string): Held {
	for (const each of codeOf(type)) {
		const found = propertyType(each, property);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * The type of a property of a type the file names, through its own aliases.
 * @param type The name.
 * @param property The property.
 * @returns The property's type, the name of a type another file declares, or undefined.
 */
function namedType(type: Node, property: string): Held {
	const value = part(typeDeclaration(type.tree.rootNode, type.text), "value");
	return value === undefined ? { named: type.text } : propertyType(value, property);
}

/**
 * The type of a property of an object type, through intersections and the file's own aliases.
 * @param type The type.
 * @param property The property.
 * @returns The property's type, the name of a type another file declares, or undefined.
 */
function propertyType(type: Node, property: string): Held {
	if (type.type === "object_type") return signatureType(type, property);
	if (type.type === "intersection_type") return intersectionType(type, property);
	return type.type === "type_identifier" ? namedType(type, property) : undefined;
}

/**
 * The keys a type the file names closes, or that name for module depth to close by.
 * @param type The name.
 * @returns The closure.
 */
function namedClosure(type: Node): Closure {
	const declaration = typeDeclaration(type.tree.rootNode, type.text);
	const keys = declaration === undefined ? undefined : closesOf(declaration)?.[""];
	return keys === undefined ? { type: type.text } : { keys, whole: true };
}

/**
 * The keys a type closes, at the key's property where the key is a property.
 * @param annotation The type, or its annotation.
 * @param property The key's property, if any.
 * @returns The keys, the name another file must close them by, or undefined for an open type.
 */
function closureOf(annotation: Node | undefined, property: string | undefined): Closure {
	const type = typeOf(annotation);
	if (type === undefined) return undefined;
	if (property !== undefined) return propertyClosure(type, property);
	if (type.type === "type_identifier") return namedClosure(type);
	const keys = literalKeys(type);
	return keys === undefined ? undefined : { keys, whole: true };
}

/**
 * The closure of a request property, including a union of tagged requests.
 * @param type The request type.
 * @param property The selected property.
 * @returns The closure.
 */
function propertyClosure(type: Node, property: string): Closure {
	const declaration =
		type.type === "type_identifier" ? typeDeclaration(type.tree.rootNode, type.text) : undefined;
	const members = unionMembers(part(declaration, "value") ?? type);
	const keys = members.length > 1 ? propertyKeys(members, property) : undefined;
	return keys === undefined ? heldClosure(propertyType(type, property)) : { keys, whole: true };
}

/**
 * The type an annotation writes, or the type itself.
 * @param annotation The annotation or the type.
 * @returns The type.
 */
function typeOf(annotation: Node | undefined): Node | undefined {
	const type = annotation?.type === "type_annotation" ? codeOf(annotation)[0] : annotation;
	return followedType(type);
}

/**
 * Follow local aliases that name another type without changing its shape.
 * @param type The annotated type.
 * @returns The last type in the chain, or undefined for a cycle.
 */
function followedType(type: Node | undefined): Node | undefined {
	const seen = new Set<string>();
	let current = type;
	while (current?.type === "type_identifier") {
		if (seen.has(current.text)) return undefined;
		seen.add(current.text);
		const declaration = typeDeclaration(current.tree.rootNode, current.text);
		const value = part(declaration, "value");
		if (value?.type !== "type_identifier") break;
		current = value;
	}
	return current;
}

/**
 * The keys a property's type closes.
 * @param held The property's type.
 * @returns The closure.
 */
function heldClosure(held: Held): Closure {
	if (held === undefined) return undefined;
	return "named" in held ? { type: held.named } : closureOf(held, undefined);
}

/**
 * The overloads of a callable: the signatures beside it with its name.
 * @param callable The callable.
 * @returns The signatures.
 */
function overloadsOf(callable: Node): Node[] {
	const name = part(callable, "name")?.text;
	const holder = holderOf(callable);
	if (name === undefined || holder === undefined) return [];
	const signature =
		callable.type === "method_definition" ? "method_signature" : "function_signature";
	return codeOf(holder)
		.map(declared)
		.filter((each) => each?.type === signature && part(each, "name")?.text === name)
		.flatMap((each) => (each === undefined ? [] : [each]));
}

/**
 * What holds a callable's declaration: the file, a namespace or a class body, through `export`.
 * @param callable The callable.
 * @returns The holder, or undefined.
 */
function holderOf(callable: Node): Node | undefined {
	const parent = callable.parent;
	return (parent?.type === "export_statement" ? parent.parent : parent) ?? undefined;
}

/**
 * The keys the overloads of a callable close the key to, where they name a literal at its place.
 * @param callable The callable.
 * @param parameter The key's parameter.
 * @param property The key's property, if any.
 * @returns The keys, or undefined when no overload names one.
 */
function overloadKeys(
	callable: Node,
	parameter: Parameter,
	property: string | undefined,
): string[] | undefined {
	const keys = overloadsOf(callable).flatMap((signature) => {
		const list = part(signature, "parameters");
		const at = list === undefined ? undefined : codeOf(list)[parameter.index];
		const closure = closureOf(part(at, "type"), property);
		return closure !== undefined && "keys" in closure ? closure.keys : [];
	});
	return keys.length === 0 ? undefined : keys;
}

/**
 * The keys of a property every member of a union of object types fixes to literals.
 * @param members The members.
 * @param property The property.
 * @returns The keys, or undefined where a member does not fix it.
 */
function propertyKeys(members: readonly Node[], property: string): string[] | undefined {
	const keys = members.map((member) => {
		const held = propertyType(member, property);
		return held === undefined || "named" in held ? undefined : literalKeys(held);
	});
	return keys.every((each) => each !== undefined) ? keys.flat() : undefined;
}

/**
 * The literal properties every member of a union of object types fixes.
 * @param members The members.
 * @returns The keys of each, or undefined for none.
 */
function taggedCloses(members: readonly Node[]): Definition["closes"] {
	const [first] = members;
	const objects = members.length > 1 && members.every((member) => member.type === "object_type");
	const properties = (objects && first !== undefined ? codeOf(first) : [])
		.filter((each) => each.type === "property_signature")
		.map((each) => part(each, "name")?.text ?? "");
	const tagged = properties.flatMap((property) => {
		const keys = propertyKeys(members, property);
		return keys === undefined ? [] : [[property, keys] as const];
	});
	return tagged.length === 0 ? undefined : Object.fromEntries(tagged);
}

/**
 * The members an enum names.
 * @param declaration The enum.
 * @returns Its keys, or undefined for none.
 */
function enumCloses(declaration: Node): Definition["closes"] {
	const body = part(declaration, "body");
	const members = (body === undefined ? [] : codeOf(body)).flatMap((member) => {
		const name = member.type === "enum_assignment" ? part(member, "name") : member;
		return name?.type === "property_identifier" ? [name.text] : [];
	});
	return members.length === 0 ? undefined : { "": members };
}

/**
 * The keys a type alias or an enum closes: a union of literals or an enum's
 * members under `""`, and the literals of each property every member of a
 * union of object types fixes.
 * @param declaration The declaration.
 * @returns The keys, or undefined for a type that closes none.
 */
function closesOf(declaration: Node): Definition["closes"] {
	if (declaration.type === "enum_declaration") return enumCloses(declaration);
	const value =
		declaration.type === "type_alias_declaration" ? part(declaration, "value") : undefined;
	if (value === undefined) return undefined;
	const literals = literalKeys(value);
	return literals === undefined ? taggedCloses(unionMembers(value)) : { "": literals };
}

export { type Closure, closesOf, closureOf, overloadKeys };

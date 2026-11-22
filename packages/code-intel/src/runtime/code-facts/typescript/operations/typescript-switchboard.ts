// Whether a TypeScript callable is a switchboard (ADR 0082): it picks the
// operation it runs by a closed key its caller passes, so each operation it
// picks is a name its callers learn.
//
// The key is a parameter, or a property of one: `intent`, `input.analysis`,
// `options.register`. The body picks by it after any preparation, through a
// chain of `if` on `===` tests, a `switch`, a conditional expression, or a
// call of an entry of a closed table of handlers that the key indexes, beside
// a default path. A test of shape, `in` or `instanceof`, is no key test, and
// neither is a test of anything but the key.
//
// The key is closed by literal overloads whose literals name every key the
// body tests, by a literal or boolean union the parameter is typed with, by a
// type alias or an enum of the file, or by the table that it indexes. A key
// typed by a name another file declares is closed once module depth finds
// that name and it closes the key (`Switchboard.type`). A key typed `string`
// or `number`, or not typed, is open, and the callable is no switchboard: no
// call site is read, since a choice can cross HTTP or WebAssembly as data.

import type { Node } from "web-tree-sitter";
import type { Definition, Switchboard } from "#runtime/code-facts/operations/facts.ts";
import {
	type Arm,
	operationsOf,
	restSpelled,
} from "#runtime/code-facts/operations/switchboard-arms.ts";
import { callableOf } from "#runtime/code-facts/typescript/operations/typescript-pass-through.ts";

/** The syntax the query counts as a piece of logic (typescript.scm). */
const LOGIC = new Set([
	"call_expression",
	"new_expression",
	"binary_expression",
	"unary_expression",
	"update_expression",
	"augmented_assignment_expression",
	"ternary_expression",
	"if_statement",
	"switch_case",
	"for_statement",
	"for_in_statement",
	"while_statement",
	"do_statement",
]);

/** Code of its own, which runs when it is called and not when the arm runs. */
const NESTED = new Set([
	"arrow_function",
	"function_expression",
	"function_declaration",
	"generator_function",
	"generator_function_declaration",
	"class",
	"class_declaration",
]);

/** Wrappers that hand on the value of the expression inside. */
const UNWRAPPED = new Set([
	"parenthesized_expression",
	"await_expression",
	"non_null_expression",
	"as_expression",
	"satisfies_expression",
]);

/** Arguments that hand a name or a fixed value on, and decide nothing. */
const BARE = new Set([
	"identifier",
	"this",
	"string",
	"number",
	"true",
	"false",
	"null",
	"undefined",
]);

/** A parameter of the callable: its name, place and declared type. */
interface Parameter {
	readonly name: string;
	readonly index: number;
	readonly type: Node | null;
}

/** One test of the key: the key, and the keys that pick the arm it guards. */
interface Test {
	readonly key: string;
	readonly keys: readonly string[];
	/** It tests the key's truth, `if (flag)`, which only a boolean key closes. */
	readonly truthy: boolean;
}

/** An arm before its calls are read: the keys that pick it and its code. */
interface ArmCode {
	readonly keys: readonly string[];
	readonly code: readonly Node[];
	/** The callee of an entry of a table that names a function, with the arguments the call passes. */
	readonly handler?: string;
}

/** A pick the body makes. */
interface Dispatch {
	readonly key: string;
	readonly arms: readonly ArmCode[];
	/** The pieces of logic its tests count. */
	readonly logic: number;
	readonly truthy: boolean;
	/** The keys of the table of handlers it indexes, which close the key. */
	readonly table?: readonly string[];
}

/**
 * The named children of a node that are no comment.
 * @param node The node.
 * @returns The children.
 */
function codeOf(node: Node): Node[] {
	return node.namedChildren.filter((child) => child.type !== "comment");
}

/**
 * The expression inside wrappers that hand its value on.
 * @param node The expression.
 * @returns The expression inside.
 */
function unwrapped(node: Node): Node {
	let at = node;
	while (UNWRAPPED.has(at.type)) {
		const inner = codeOf(at)[0];
		if (inner === undefined) break;
		at = inner;
	}
	return at;
}

/**
 * The callable's parameters that are plain names.
 * @param callable The callable.
 * @returns The parameters.
 */
function parametersOf(callable: Node): Parameter[] {
	const list = callable.childForFieldName("parameters");
	return (list === null ? [] : codeOf(list)).flatMap((parameter, index) => {
		const pattern = parameter.childForFieldName("pattern");
		if (pattern?.type !== "identifier") return [];
		return [{ name: pattern.text, index, type: parameter.childForFieldName("type") }];
	});
}

/**
 * The key an expression reads: a parameter, or a property of one.
 * @param node The expression.
 * @param parameters The callable's parameters.
 * @returns The key as the code spells it, or undefined.
 */
function keyOf(node: Node, parameters: readonly Parameter[]): string | undefined {
	const at = unwrapped(node);
	if (at.type === "identifier") {
		return parameters.some((each) => each.name === at.text) ? at.text : undefined;
	}
	if (at.type !== "member_expression") return undefined;
	const object = at.childForFieldName("object");
	const property = at.childForFieldName("property");
	if (object?.type !== "identifier" || property?.type !== "property_identifier") return undefined;
	return parameters.some((each) => each.name === object.text)
		? `${object.text}.${property.text}`
		: undefined;
}

/**
 * The key a literal names: a string, a number, a boolean, or an enum's member.
 * @param node The expression.
 * @returns The key, or undefined for another expression.
 */
function literalOf(node: Node): string | undefined {
	const at = unwrapped(node);
	if (at.type === "string") return codeOf(at).map((part) => part.text).join("");
	if (at.type === "number" || at.type === "true" || at.type === "false") return at.text;
	if (at.type !== "member_expression") return undefined;
	const object = at.childForFieldName("object");
	return object?.type === "identifier" && /^[A-Z]/u.test(object.text)
		? at.childForFieldName("property")?.text
		: undefined;
}

/**
 * A test of the key: `key === "a"`, `"a" === key`, several joined by `||`,
 * or the key's truth, `key` or `!key`.
 * @param node The condition.
 * @param parameters The callable's parameters.
 * @returns The test, or undefined for a condition that tests anything else.
 */
function testOf(node: Node, parameters: readonly Parameter[]): Test | undefined {
	const at = unwrapped(node);
	const key = keyOf(at, parameters);
	if (key !== undefined) return { key, keys: ["true"], truthy: true };
	if (at.type === "unary_expression" && at.childForFieldName("operator")?.text === "!") {
		const negated = keyOf(at.childForFieldName("argument") ?? at, parameters);
		return negated === undefined ? undefined : { key: negated, keys: ["false"], truthy: true };
	}
	if (at.type !== "binary_expression") return undefined;
	const operator = at.childForFieldName("operator")?.text;
	const left = at.childForFieldName("left");
	const right = at.childForFieldName("right");
	if (left === null || right === null) return undefined;
	if (operator === "||") {
		const [one, other] = [testOf(left, parameters), testOf(right, parameters)];
		if (one === undefined || other?.key !== one.key || one.truthy || other.truthy) return undefined;
		return { key: one.key, keys: [...one.keys, ...other.keys], truthy: false };
	}
	if (operator !== "===" && operator !== "==") return undefined;
	for (const [side, value] of [
		[left, right],
		[right, left],
	] as const) {
		const tested = keyOf(side, parameters);
		const literal = literalOf(value);
		if (tested !== undefined && literal !== undefined) {
			return { key: tested, keys: [literal], truthy: false };
		}
	}
	return undefined;
}

/**
 * The pieces of logic in code, the code itself among them.
 * @param node The code.
 * @returns How many there are.
 */
function logicIn(node: Node): number {
	if (NESTED.has(node.type)) return 0;
	return (LOGIC.has(node.type) ? 1 : 0) + codeOf(node).reduce((sum, child) => sum + logicIn(child), 0);
}

/**
 * Whether a statement always leaves the body: it returns or throws.
 * @param node The statement.
 * @returns True when it does.
 */
function exits(node: Node): boolean {
	if (node.type === "return_statement" || node.type === "throw_statement") return true;
	if (node.type !== "statement_block") return false;
	const last = codeOf(node).at(-1);
	return last !== undefined && exits(last);
}

/**
 * The pick a chain of `if` makes, from one `if` on. An `if` whose branch
 * leaves the body goes on with the next statement, and what follows the last
 * test is the default path; an `else` holds the next test or the default path.
 * @param statements The statements of the body.
 * @param start The `if` that starts the chain.
 * @param parameters The callable's parameters.
 * @returns The pick, or undefined.
 */
function ifChain(
	statements: readonly Node[],
	start: number,
	parameters: readonly Parameter[],
): Dispatch | undefined {
	const arms: ArmCode[] = [];
	let key: string | undefined;
	let logic = 0;
	let truthy = false;
	let index = start;
	let at = statements[index];
	let inElse = false;
	while (at?.type === "if_statement") {
		const condition = at.childForFieldName("condition");
		const consequence = at.childForFieldName("consequence");
		const test = condition === null ? undefined : testOf(condition, parameters);
		if (condition === null || consequence === null || test === undefined) break;
		if (key !== undefined && test.key !== key) break;
		key = test.key;
		truthy ||= test.truthy;
		logic += 1 + logicIn(condition);
		arms.push({ keys: test.keys, code: [consequence] });
		const alternative = at.childForFieldName("alternative");
		const inner = alternative === null ? undefined : codeOf(alternative)[0];
		if (inner?.type === "if_statement") {
			at = inner;
			inElse = true;
		} else if (inner !== undefined || inElse) {
			if (inner !== undefined) arms.push({ keys: ["*"], code: [inner] });
			return { key, arms, logic, truthy };
		} else {
			if (!exits(consequence)) return undefined;
			index += 1;
			at = statements[index];
		}
	}
	if (key === undefined) return undefined;
	const rest = inElse && at !== undefined ? [at] : statements.slice(index);
	if (rest.length > 0) arms.push({ keys: ["*"], code: rest });
	return { key, arms, logic, truthy };
}

/**
 * The pick a conditional expression makes, and the conditional expressions in its last arm.
 * @param expression The expression.
 * @param parameters The callable's parameters.
 * @param key The key a conditional before it tested.
 * @returns The pick, or undefined.
 */
function conditional(
	expression: Node,
	parameters: readonly Parameter[],
	key?: string,
): Dispatch | undefined {
	const at = unwrapped(expression);
	if (at.type !== "ternary_expression") return undefined;
	const condition = at.childForFieldName("condition");
	const consequence = at.childForFieldName("consequence");
	const alternative = at.childForFieldName("alternative");
	const test = condition === null ? undefined : testOf(condition, parameters);
	if (condition === null || consequence === null || alternative === null) return undefined;
	if (test === undefined || (key !== undefined && test.key !== key)) return undefined;
	const logic = 1 + logicIn(condition);
	const arm = { keys: test.keys, code: [consequence] };
	const more = conditional(alternative, parameters, test.key);
	if (more === undefined) {
		return { key: test.key, arms: [arm, { keys: ["*"], code: [alternative] }], logic, truthy: test.truthy };
	}
	return {
		key: test.key,
		arms: [arm, ...more.arms],
		logic: logic + more.logic,
		truthy: test.truthy || more.truthy,
	};
}

/**
 * The pick a `switch` on the key makes.
 * @param statement The statement.
 * @param parameters The callable's parameters.
 * @returns The pick, or undefined.
 */
function switchOn(statement: Node, parameters: readonly Parameter[]): Dispatch | undefined {
	const value = statement.childForFieldName("value");
	const body = statement.childForFieldName("body");
	const key = value === null ? undefined : keyOf(value, parameters);
	if (key === undefined || body === null) return undefined;
	const arms: ArmCode[] = [];
	let keys: string[] = [];
	let logic = 0;
	for (const label of codeOf(body)) {
		const tested = label.childForFieldName("value");
		if (label.type === "switch_case") {
			const literal = tested === null ? undefined : literalOf(tested);
			if (literal === undefined) return undefined;
			keys.push(literal);
			logic += 1;
		} else if (label.type === "switch_default") {
			keys.push("*");
		} else continue;
		const code = label.childrenForFieldName("body").filter((each) => each.type !== "comment");
		if (code.length === 0) continue;
		arms.push({ keys, code });
		keys = [];
	}
	return { key, arms, logic, truthy: false };
}

/**
 * The module-level object a name holds, through `as`, `satisfies` and parentheses.
 * @param root The file.
 * @param name The name.
 * @returns The object, or undefined.
 */
function moduleObject(root: Node, name: string): Node | undefined {
	for (const statement of codeOf(root)) {
		const declaration =
			statement.type === "export_statement"
				? statement.childForFieldName("declaration")
				: statement;
		if (declaration?.type !== "lexical_declaration") continue;
		for (const declarator of codeOf(declaration)) {
			if (declarator.childForFieldName("name")?.text !== name) continue;
			const value = declarator.childForFieldName("value");
			const held = value === null ? undefined : unwrapped(value);
			return held?.type === "object" ? held : undefined;
		}
	}
	return undefined;
}

/**
 * The name of a member of an object, as a key spells it.
 * @param member The member.
 * @returns The name, or undefined for a computed one.
 */
function memberName(member: Node): string | undefined {
	const name = member.childForFieldName(member.type === "pair" ? "key" : "name");
	if (name === null) return undefined;
	return name.type === "string" ? literalOf(name) : name.text;
}

/**
 * The arms of a closed table of handlers that a call indexes by the key: one
 * for each entry, its code an inline function's body, or the function an
 * entry names.
 * @param expression The expression that may call an entry.
 * @param parameters The callable's parameters.
 * @returns The key, the table's keys and its arms, or undefined.
 */
function tableCall(
	expression: Node,
	parameters: readonly Parameter[],
): { readonly key: string; readonly arms: ArmCode[]; readonly forwards: boolean } | undefined {
	const call = unwrapped(expression);
	if (call.type !== "call_expression") return undefined;
	const callee = call.childForFieldName("function");
	if (callee?.type !== "subscript_expression") return undefined;
	const object = callee.childForFieldName("object");
	const index = callee.childForFieldName("index");
	const key = index === null ? undefined : keyOf(index, parameters);
	if (object?.type !== "identifier" || key === undefined) return undefined;
	const table = moduleObject(call.tree.rootNode, object.text);
	if (table === undefined) return undefined;
	const passed = codeOf(call.childForFieldName("arguments") ?? call).length;
	const arms: ArmCode[] = [];
	for (const member of codeOf(table)) {
		const name = memberName(member);
		if (name === undefined) return undefined;
		const value = member.type === "pair" ? member.childForFieldName("value") : member;
		if (value?.type === "identifier") {
			arms.push({ keys: [name], code: [], handler: `${value.text}/${String(passed)}` });
			continue;
		}
		const body = value === null ? null : (callableOf(value)?.childForFieldName("body") ?? null);
		if (body === null) return undefined;
		arms.push({ keys: [name], code: [body] });
	}
	return { key, arms, forwards: bareCall(call) };
}

/**
 * The pick a call of a table's entry makes: returned alone, or returned under
 * a guard with the rest of the body as the default path.
 * @param statements The statements of the body.
 * @param start The statement that may make the pick.
 * @param parameters The callable's parameters.
 * @returns The pick, or undefined.
 */
function tableDispatch(
	statements: readonly Node[],
	start: number,
	parameters: readonly Parameter[],
): Dispatch | undefined {
	const statement = statements[start];
	if (statement === undefined) return undefined;
	const guarded = statement.type === "if_statement" && statement.childForFieldName("alternative") === null;
	const consequence = guarded ? statement.childForFieldName("consequence") : statement;
	const returned = consequence === null ? undefined : onlyStatement(consequence);
	const value = returned?.type === "return_statement" ? codeOf(returned)[0] : undefined;
	const table = value === undefined ? undefined : tableCall(value, parameters);
	if (table === undefined) return undefined;
	const condition = guarded ? statement.childForFieldName("condition") : null;
	const logic = (guarded ? 1 + (condition === null ? 0 : logicIn(condition)) : 0) + (table.forwards ? 1 : 0);
	const rest = guarded ? statements.slice(start + 1) : [];
	const arms = rest.length > 0 ? [...table.arms, { keys: ["*"], code: rest }] : table.arms;
	return {
		key: table.key,
		arms,
		logic,
		truthy: false,
		table: table.arms.flatMap((arm) => arm.keys),
	};
}

/**
 * The one statement a block holds, or the statement itself.
 * @param node A statement or a block.
 * @returns The statement, or undefined for a block of another number.
 */
function onlyStatement(node: Node): Node | undefined {
	if (node.type !== "statement_block") return node;
	const statements = codeOf(node);
	return statements.length === 1 ? statements[0] : undefined;
}

/**
 * The pick a body makes, after any preparation: the first statement that picks by a key.
 * @param body The body.
 * @param parameters The callable's parameters.
 * @returns The pick, or undefined.
 */
function dispatchOf(body: Node, parameters: readonly Parameter[]): Dispatch | undefined {
	if (body.type !== "statement_block") return conditional(body, parameters);
	const statements = codeOf(body);
	for (const [index, statement] of statements.entries()) {
		const found =
			tableDispatch(statements, index, parameters) ??
			(statement.type === "if_statement" ? ifChain(statements, index, parameters) : undefined) ??
			(statement.type === "switch_statement" ? switchOn(statement, parameters) : undefined) ??
			(statement.type === "return_statement" || statement.type === "expression_statement"
				? conditional(codeOf(statement)[0] ?? statement, parameters)
				: undefined);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * The name a call or a write is known by: the last name of its callee or target.
 * @param node The callee or target.
 * @returns The name.
 */
function lastName(node: Node | null): string {
	if (node === null) return "";
	if (node.type === "member_expression") return node.childForFieldName("property")?.text ?? "";
	if (node.type === "subscript_expression") return `${lastName(node.childForFieldName("object"))}[]`;
	return node.text;
}

/**
 * The calls an arm's code makes, outermost only, and the state it writes.
 * @param node The code.
 * @param found The calls and writes found so far, which this adds to.
 * @param found.calls The calls, as `callee/arguments`.
 * @param found.writes The state written, as the code spells each target.
 */
function effectsIn(node: Node, found: { calls: Set<string>; writes: Set<string> }): void {
	if (NESTED.has(node.type)) return;
	if (node.type === "call_expression") {
		const list = node.childForFieldName("arguments");
		const count = list?.type === "arguments" ? codeOf(list).length : 1;
		found.calls.add(`${lastName(node.childForFieldName("function"))}/${String(count)}`);
		return;
	}
	if (node.type === "assignment_expression" || node.type === "augmented_assignment_expression") {
		const target = node.childForFieldName("left");
		if (target?.type === "member_expression" || target?.type === "subscript_expression") {
			found.writes.add(target.text);
		}
	}
	for (const child of codeOf(node)) effectsIn(child, found);
}

/**
 * Whether a call hands only names and fixed values on, deciding nothing.
 * @param call The call.
 * @returns True when it does.
 */
function bareCall(call: Node): boolean {
	const list = call.childForFieldName("arguments");
	if (list?.type !== "arguments") return false;
	return codeOf(list).every((argument) => {
		const name = argument.type === "spread_element" ? codeOf(argument)[0] : argument;
		return name !== undefined && BARE.has(name.type);
	});
}

/**
 * Whether an arm only hands its call on: its one piece of logic is a call of names.
 * @param code The arm's code.
 * @returns True when it does.
 */
function forwards(code: readonly Node[]): boolean {
	if (code.reduce((sum, node) => sum + logicIn(node), 0) !== 1) return false;
	const calls: Node[] = [];
	const collect = (node: Node): void => {
		if (NESTED.has(node.type)) return;
		if (node.type === "call_expression") calls.push(node);
		for (const child of codeOf(node)) collect(child);
	};
	for (const node of code) collect(node);
	return calls.length === 1 && calls[0] !== undefined && bareCall(calls[0]);
}

/**
 * An arm, with the calls it makes and the state it writes.
 * @param arm The arm's keys and code.
 * @param line The line of the pick, for an entry that names its function.
 * @returns The arm.
 */
function armOf(arm: ArmCode, line: number): Arm {
	const found = { calls: new Set<string>(), writes: new Set<string>() };
	for (const node of arm.code) effectsIn(node, found);
	if (arm.handler !== undefined) found.calls.add(arm.handler);
	return {
		keys: arm.keys,
		line: (arm.code[0]?.startPosition.row ?? line - 1) + 1,
		calls: found.calls,
		writes: found.writes,
	};
}

/**
 * What a type says of a key: the keys it closes, `whole` where they are every
 * key it takes, or the name module depth must close them by; undefined for an
 * open key.
 */
type Closure =
	| { readonly keys: readonly string[]; readonly whole: boolean }
	| { readonly type: string }
	| undefined;

/**
 * The type alias or enum of a file that a name declares.
 * @param root The file.
 * @param name The name.
 * @returns The declaration, or undefined.
 */
function typeDeclaration(root: Node, name: string): Node | undefined {
	for (const statement of codeOf(root)) {
		const declaration =
			statement.type === "export_statement"
				? statement.childForFieldName("declaration")
				: statement;
		const declares =
			declaration?.type === "type_alias_declaration" || declaration?.type === "enum_declaration";
		if (declares && declaration.childForFieldName("name")?.text === name) return declaration;
	}
	return undefined;
}

/**
 * The members of a union, flattened, without parentheses.
 * @param type The type.
 * @returns Its members, or the type alone.
 */
function unionMembers(type: Node): Node[] {
	if (type.type === "parenthesized_type") return codeOf(type).flatMap(unionMembers);
	return type.type === "union_type" ? codeOf(type).flatMap(unionMembers) : [type];
}

/**
 * The keys a literal type, a boolean or a union of them closes.
 * @param type The type.
 * @returns The keys, or undefined for another type.
 */
function literalKeys(type: Node): string[] | undefined {
	const keys: string[] = [];
	for (const member of unionMembers(type)) {
		if (member.type === "predefined_type" && member.text === "boolean") keys.push("true", "false");
		else if (member.type === "literal_type") {
			const literal = codeOf(member)[0];
			const key = literal === undefined ? undefined : literalOf(literal);
			if (key === undefined) return undefined;
			keys.push(key);
		} else return undefined;
	}
	return keys;
}

/**
 * The type of a property of an object type, through intersections and the file's own aliases.
 * @param type The type.
 * @param property The property.
 * @returns The property's type, the name of a type another file declares, or undefined.
 */
function propertyType(type: Node, property: string): Node | { readonly named: string } | undefined {
	if (type.type === "object_type") {
		const member = codeOf(type).find(
			(each) => each.type === "property_signature" && each.childForFieldName("name")?.text === property,
		);
		const annotation = member?.childForFieldName("type");
		return annotation === null || annotation === undefined ? undefined : codeOf(annotation)[0];
	}
	if (type.type === "intersection_type") {
		for (const part of codeOf(type)) {
			const found = propertyType(part, property);
			if (found !== undefined) return found;
		}
		return undefined;
	}
	if (type.type === "type_identifier") {
		const value = typeDeclaration(type.tree.rootNode, type.text)?.childForFieldName("value");
		return value === null || value === undefined ? { named: type.text } : propertyType(value, property);
	}
	return undefined;
}

/**
 * The keys a type closes, at the key's property where the key is a property.
 * @param annotation The type, or its annotation.
 * @param property The key's property, if any.
 * @returns The keys, the name another file must close them by, or undefined for an open type.
 */
function closureOf(annotation: Node | null, property: string | undefined): Closure {
	if (annotation === null) return undefined;
	const type = annotation.type === "type_annotation" ? codeOf(annotation)[0] : annotation;
	if (type === undefined) return undefined;
	if (property !== undefined) {
		const held = propertyType(type, property);
		if (held === undefined) return undefined;
		return "named" in held ? { type: held.named } : closureOf(held, undefined);
	}
	if (type.type === "type_identifier") {
		const declaration = typeDeclaration(type.tree.rootNode, type.text);
		const keys = declaration === undefined ? undefined : closesOf(declaration)?.[""];
		return keys === undefined ? { type: type.text } : { keys, whole: true };
	}
	const keys = literalKeys(type);
	return keys === undefined ? undefined : { keys, whole: true };
}

/**
 * The overloads of a callable: the signatures beside it with its name.
 * @param callable The callable.
 * @returns The signatures.
 */
function overloadsOf(callable: Node): Node[] {
	const name = callable.childForFieldName("name")?.text;
	const holder = callable.parent?.type === "export_statement" ? callable.parent.parent : callable.parent;
	if (name === undefined || holder === null || holder === undefined) return [];
	const signature = callable.type === "method_definition" ? "method_signature" : "function_signature";
	return codeOf(holder).flatMap((statement) => {
		const declaration =
			statement.type === "export_statement" ? statement.childForFieldName("declaration") : statement;
		return declaration?.type === signature && declaration.childForFieldName("name")?.text === name
			? [declaration]
			: [];
	});
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
		const list = signature.childForFieldName("parameters");
		const at = list === null ? undefined : codeOf(list)[parameter.index];
		const closure = at === undefined ? undefined : closureOf(at.childForFieldName("type"), property);
		return closure !== undefined && "keys" in closure ? closure.keys : [];
	});
	return keys.length === 0 ? undefined : keys;
}

/**
 * The keys a closed key takes, or the name another file closes it by.
 * @param callable The callable.
 * @param parameters Its parameters.
 * @param dispatch The pick its body makes.
 * @returns The closure, or undefined for an open key.
 */
function keyClosure(callable: Node, parameters: readonly Parameter[], dispatch: Dispatch): Closure {
	const [root, property] = dispatch.key.split(".");
	const parameter = parameters.find((each) => each.name === root);
	if (parameter === undefined) return undefined;
	const named = dispatch.arms.flatMap((arm) => arm.keys).filter((key) => key !== "*");
	const overloaded = overloadKeys(callable, parameter, property);
	if (overloaded !== undefined && named.every((key) => overloaded.includes(key))) {
		return { keys: overloaded, whole: true };
	}
	const declared = closureOf(parameter.type, property);
	if (dispatch.table === undefined || (declared !== undefined && "keys" in declared)) return declared;
	// A closed table closes the keys it handles; a key typed `string` or `number` stays open.
	const open = parameter.type === null || /^:\s*(?:string|number)$/u.test(parameter.type.text);
	return open ? undefined : { keys: dispatch.table, whole: false };
}

/**
 * The switchboard a declaration is, if it is one.
 * @param declaration The declaration.
 * @returns The switchboard, or undefined.
 */
function switchboardOf(declaration: Node): Switchboard | undefined {
	const callable = callableOf(declaration);
	const body = callable?.childForFieldName("body");
	if (callable === undefined || body === null || body === undefined) return undefined;
	const parameters = parametersOf(callable);
	const dispatch = dispatchOf(body, parameters);
	if (dispatch === undefined) return undefined;
	const closure = keyClosure(callable, parameters, dispatch);
	if (closure === undefined) return undefined;
	const keys = "keys" in closure ? closure.keys : [];
	if (dispatch.truthy && !(keys.length > 0 && keys.every((key) => key === "true" || key === "false")))
		return undefined;
	const line = callable.startPosition.row + 1;
	const picked = operationsOf(dispatch.arms.map((arm) => armOf(arm, line)));
	const operations = "whole" in closure && closure.whole ? restSpelled(picked, keys) : picked;
	if (operations.length < 2) return undefined;
	const forwarding = dispatch.arms.filter((arm) => forwards(arm.code)).length;
	return {
		key: dispatch.key,
		...("type" in closure ? { type: closure.type } : {}),
		operations,
		logic: dispatch.logic + forwarding,
	};
}

/**
 * The keys a type alias or an enum closes: a union of literals or an enum's
 * members under `""`, and the literals of each property every member of a
 * union of object types fixes.
 * @param declaration The declaration.
 * @returns The keys, or undefined for a type that closes none.
 */
function closesOf(declaration: Node): Definition["closes"] {
	if (declaration.type === "enum_declaration") {
		const body = declaration.childForFieldName("body");
		const members = (body === null ? [] : codeOf(body)).flatMap((member) => {
			const name = member.type === "enum_assignment" ? member.childForFieldName("name") : member;
			return name?.type === "property_identifier" ? [name.text] : [];
		});
		return members.length === 0 ? undefined : { "": members };
	}
	if (declaration.type !== "type_alias_declaration") return undefined;
	const value = declaration.childForFieldName("value");
	if (value === null) return undefined;
	const literals = literalKeys(value);
	if (literals !== undefined) return { "": literals };
	const members = unionMembers(value);
	if (members.length < 2 || !members.every((member) => member.type === "object_type")) return undefined;
	const closes: Record<string, string[]> = {};
	const first = members[0];
	for (const signature of first === undefined ? [] : codeOf(first)) {
		const property = signature.childForFieldName("name")?.text;
		if (signature.type !== "property_signature" || property === undefined) continue;
		const keys = members.map((member) => {
			const held = propertyType(member, property);
			return held === undefined || "named" in held ? undefined : literalKeys(held);
		});
		if (keys.every((each) => each !== undefined)) closes[property] = keys.flat();
	}
	return Object.keys(closes).length === 0 ? undefined : closes;
}

export { closesOf, switchboardOf };

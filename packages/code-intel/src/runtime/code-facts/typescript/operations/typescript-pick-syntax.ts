// The syntax a TypeScript switchboard is read from (ADR 0082, TASK-659): the
// callable's parameters, the key an expression reads, the key a literal
// names, a test of the key, and the pieces of logic in code, as the query
// counts them (typescript.scm). A test of shape, `in` or `instanceof`, is no
// key test, and neither is a test of anything but the key.

import type { Node } from "web-tree-sitter";

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

/** Literals that are their own key. */
const LITERALS = new Set(["number", "true", "false"]);

/** A parameter of the callable: its name, place and declared type. */
interface Parameter {
	readonly name: string;
	readonly index: number;
	readonly type: Node | undefined;
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
 * A field of a node.
 * @param node The node.
 * @param name The field.
 * @returns The child, or undefined.
 */
function part(node: Node | undefined, name: string): Node | undefined {
	return node?.childForFieldName(name) ?? undefined;
}

/**
 * The expression inside wrappers that hand its value on.
 * @param node The expression.
 * @returns The expression inside.
 */
function unwrapped(node: Node): Node {
	const inner = UNWRAPPED.has(node.type) ? codeOf(node)[0] : undefined;
	return inner === undefined ? node : unwrapped(inner);
}

/**
 * The pieces of logic in code, the code itself among them.
 * @param node The code.
 * @returns How many there are.
 */
function logicIn(node: Node): number {
	if (NESTED.has(node.type)) return 0;
	return (
		(LOGIC.has(node.type) ? 1 : 0) + codeOf(node).reduce((sum, child) => sum + logicIn(child), 0)
	);
}

/**
 * The callable's parameters that are plain names.
 * @param callable The callable.
 * @returns The parameters.
 */
function parametersOf(callable: Node): Parameter[] {
	const list = part(callable, "parameters");
	return (list === undefined ? [] : codeOf(list)).flatMap((parameter, index) => {
		const pattern = part(parameter, "pattern");
		if (pattern?.type !== "identifier") return [];
		return [{ name: pattern.text, index, type: part(parameter, "type") }];
	});
}

/**
 * Whether a name is one of the callable's parameters.
 * @param name The name.
 * @param parameters The parameters.
 * @returns True when it is.
 */
function isParameter(name: Node | undefined, parameters: readonly Parameter[]): boolean {
	return name?.type === "identifier" && parameters.some((each) => each.name === name.text);
}

/**
 * The key an expression reads: a parameter, or a property of one.
 * @param node The expression.
 * @param parameters The callable's parameters.
 * @returns The key as the code spells it, or undefined.
 */
function keyOf(node: Node, parameters: readonly Parameter[]): string | undefined {
	const at = unwrapped(node);
	if (isParameter(at, parameters)) return at.text;
	return at.type === "member_expression" ? propertyKey(at, parameters) : undefined;
}

/**
 * The key a property of a parameter is, as `input.analysis`.
 * @param at The member expression.
 * @param parameters The callable's parameters.
 * @returns The key as the code spells it, or undefined.
 */
function propertyKey(at: Node, parameters: readonly Parameter[]): string | undefined {
	const object = part(at, "object");
	const property = part(at, "property");
	if (property?.type !== "property_identifier" || object === undefined) return undefined;
	return isParameter(object, parameters) ? `${object.text}.${property.text}` : undefined;
}

/**
 * The key an enum's member names, as `Kind.A` names `A`.
 * @param at The expression.
 * @returns The key, or undefined for another expression.
 */
function memberKey(at: Node): string | undefined {
	const object = part(at, "object");
	const capital = object?.type === "identifier" && /^[A-Z]/u.test(object.text);
	return capital ? part(at, "property")?.text : undefined;
}

/**
 * The key a literal names: a string, a number, a boolean, or an enum's member.
 * @param node The expression.
 * @returns The key, or undefined for another expression.
 */
function literalOf(node: Node): string | undefined {
	const at = unwrapped(node);
	if (at.type === "string")
		return codeOf(at)
			.map((each) => each.text)
			.join("");
	if (LITERALS.has(at.type)) return at.text;
	return at.type === "member_expression" ? memberKey(at) : undefined;
}

/**
 * A test of the key's truth: `key` or `!key`.
 * @param at The condition.
 * @param parameters The callable's parameters.
 * @returns The test, or undefined.
 */
function truthTest(at: Node, parameters: readonly Parameter[]): Test | undefined {
	const negated = at.type === "unary_expression" && part(at, "operator")?.text === "!";
	const tested = negated ? part(at, "argument") : at;
	const key = tested === undefined ? undefined : keyOf(tested, parameters);
	return key === undefined ? undefined : { key, keys: [String(!negated)], truthy: true };
}

/**
 * A test of equality between the key and a literal, either way round.
 * @param left One side.
 * @param right The other.
 * @param parameters The callable's parameters.
 * @returns The test, or undefined.
 */
function equalityTest(left: Node, right: Node, parameters: readonly Parameter[]): Test | undefined {
	for (const [side, value] of [
		[left, right],
		[right, left],
	] as const) {
		const key = keyOf(side, parameters);
		const literal = literalOf(value);
		if (key !== undefined && literal !== undefined) return { key, keys: [literal], truthy: false };
	}
	return undefined;
}

/**
 * Two tests of one key joined by `||`.
 * @param left One test's condition.
 * @param right The other's.
 * @param parameters The callable's parameters.
 * @returns The test, or undefined.
 */
function eitherTest(left: Node, right: Node, parameters: readonly Parameter[]): Test | undefined {
	const one = testOf(left, parameters);
	const other = testOf(right, parameters);
	if (one === undefined || other?.key !== one.key || one.truthy || other.truthy) return undefined;
	return { key: one.key, keys: [...one.keys, ...other.keys], truthy: false };
}

/**
 * The operator of a binary expression.
 * @param at The expression.
 * @returns The operator, or "" where it has none.
 */
function operatorOf(at: Node): string {
	return part(at, "operator")?.text ?? "";
}

/** How each operator that can test the key reads its test. */
const BINARY: Readonly<
	Record<string, (left: Node, right: Node, parameters: readonly Parameter[]) => Test | undefined>
> = { "||": eitherTest, "===": equalityTest, "==": equalityTest };

/**
 * A test of the key: `key === "a"`, `"a" === key`, several joined by `||`,
 * or the key's truth, `key` or `!key`.
 * @param node The condition.
 * @param parameters The callable's parameters.
 * @returns The test, or undefined for a condition that tests anything else.
 */
function testOf(node: Node, parameters: readonly Parameter[]): Test | undefined {
	const at = unwrapped(node);
	if (at.type !== "binary_expression") return truthTest(at, parameters);
	const left = part(at, "left");
	const right = part(at, "right");
	const read = BINARY[operatorOf(at)];
	return left === undefined || right === undefined ? undefined : read?.(left, right, parameters);
}

/**
 * The declaration a module-level statement holds, through `export`.
 * @param statement The statement.
 * @returns The declaration.
 */
function declared(statement: Node): Node | undefined {
	return statement.type === "export_statement" ? part(statement, "declaration") : statement;
}

export {
	type ArmCode,
	codeOf,
	declared,
	type Dispatch,
	keyOf,
	literalOf,
	logicIn,
	NESTED,
	type Parameter,
	parametersOf,
	part,
	testOf,
	type Test,
	unwrapped,
};

// Whether a Rust function is a switchboard (ADR 0082): it picks the operation
// it runs by a closed key its caller passes, so each operation it picks is a
// name its callers learn.
//
// The key is a parameter, borrowed or not. The body picks by it after any
// preparation, through a `match` whose arms name the variants of an enum,
// with or without payloads, or `true` and `false`, or through an `if` on a
// `bool` parameter, with an `else` or with a branch that returns before the
// rest of the body. Explicit exhaustive patterns close the key. An enum
// catch-all needs the enum definition to name its remaining variants. A
// `match` on a string or a number is open, and a
// `match` on a field of `self` is no choice of the caller's.

import type { Node } from "web-tree-sitter";
import type { Switchboard } from "#runtime/code-facts/operations/facts.ts";
import {
	type Arm,
	operationsOf,
	restSpelled,
} from "#runtime/code-facts/operations/switchboard-arms.ts";

/** The syntax the query counts as a piece of logic (rust.scm). */
const LOGIC = new Set([
	"call_expression",
	"macro_invocation",
	"binary_expression",
	"unary_expression",
	"compound_assignment_expr",
	"if_expression",
	"match_arm",
	"for_expression",
	"while_expression",
	"loop_expression",
	"try_expression",
]);

/** Code of its own, which runs when it is called and not when the arm runs, and macros, which build data. */
const SKIPPED = new Set(["closure_expression", "function_item", "macro_invocation"]);

/** Syntax that is no code. */
const COMMENTS = new Set(["line_comment", "block_comment"]);

/** Arguments that hand a name or a fixed value on, and decide nothing. */
const BARE = new Set([
	"identifier",
	"self",
	"integer_literal",
	"float_literal",
	"string_literal",
	"boolean_literal",
]);

/** Expressions that hand on the value inside, and the field that holds it ("" for the first child). */
const WRAPPERS: Readonly<Record<string, string>> = {
	reference_expression: "value",
	parenthesized_expression: "",
	unary_expression: "",
};

/** The field that names the last name of each callee or target that has one. */
const LAST_NAME: Readonly<Record<string, string>> = {
	field_expression: "field",
	scoped_identifier: "name",
};

/** Assignments, whose target a write names. */
const ASSIGNMENTS = new Set(["assignment_expression", "compound_assignment_expr"]);

/** Targets of an assignment that are state outside the arm. */
const STATE = new Set(["field_expression", "index_expression"]);

/** An arm before its calls are read: the keys that pick it and its code. */
interface ArmCode {
	readonly keys: readonly string[];
	readonly code: readonly Node[];
}

/** A pick the body makes. */
interface Dispatch {
	readonly key: string;
	readonly arms: readonly ArmCode[];
	/** The pieces of logic its tests count. */
	readonly logic: number;
	/** It picks by `true` and `false`, which every key of a `bool` is. */
	readonly boolean: boolean;
}

/** The calls and writes an arm's code makes. */
interface Effects {
	readonly calls: Set<string>;
	readonly writes: Set<string>;
}

/**
 * The named children of a node that are no comment.
 * @param node The node.
 * @returns The children.
 */
function codeOf(node: Node): Node[] {
	return node.namedChildren.filter((child) => !COMMENTS.has(child.type));
}

/**
 * A field of a node, or its first child of code for `""`.
 * @param node The node.
 * @param name The field.
 * @returns The child, or undefined.
 */
function part(node: Node | undefined, name: string): Node | undefined {
	if (node === undefined) return undefined;
	return name === "" ? codeOf(node)[0] : (node.childForFieldName(name) ?? undefined);
}

/**
 * A type without its borrows.
 * @param type The type.
 * @returns The type that is borrowed.
 */
function unborrowed(type: Node | undefined): Node | undefined {
	return type?.type === "reference_type" ? unborrowed(part(type, "type")) : type;
}

/**
 * The function's parameters that are plain names, with their types.
 * @param fn The function.
 * @returns Each name and its type's text, without a borrow.
 */
function parametersOf(fn: Node): Map<string, string> {
	const list = part(fn, "parameters");
	return new Map((list === undefined ? [] : codeOf(list)).flatMap(parameterOf));
}

/**
 * A parameter that is a plain name, with its type.
 * @param parameter The parameter.
 * @returns Its name and its type's text, without a borrow, or nothing.
 */
function parameterOf(parameter: Node): [string, string][] {
	const pattern = part(parameter, "pattern");
	const type = unborrowed(part(parameter, "type"));
	return pattern?.type === "identifier" ? [[pattern.text, type?.text ?? ""]] : [];
}

/**
 * The expression inside borrows, dereferences and parentheses.
 * @param node The expression.
 * @returns The expression inside.
 */
function unwrapped(node: Node | undefined): Node | undefined {
	const field = node === undefined ? undefined : WRAPPERS[node.type];
	if (field === undefined || node === undefined) return node;
	if (node.type === "unary_expression" && !node.text.startsWith("*")) return node;
	return unwrapped(part(node, field));
}

/**
 * The parameter an expression reads, borrowed, dereferenced or not.
 * @param node The expression.
 * @param parameters The function's parameters.
 * @returns Its name, or undefined.
 */
function keyOf(
	node: Node | undefined,
	parameters: ReadonlyMap<string, string>,
): string | undefined {
	const at = unwrapped(node);
	return at?.type === "identifier" && parameters.has(at.text) ? at.text : undefined;
}

/**
 * The keys of each alternative of an or-pattern.
 * @param pattern The or-pattern.
 * @returns The keys, or undefined where one alternative is open.
 */
function alternativeKeys(pattern: Node): string[] | undefined {
	const keys = codeOf(pattern).map(patternKeys);
	return keys.every((each) => each !== undefined) ? keys.flat() : undefined;
}

/**
 * The variant a struct or tuple-struct pattern names.
 * @param pattern The pattern.
 * @returns Its name.
 */
function variantOf(pattern: Node): string {
	const type = part(pattern, "type");
	return part(type, "name")?.text ?? type?.text ?? "";
}

/**
 * The variant a path names: `Cut` for `Arrival::Cut`.
 * @param pattern The path.
 * @returns The variant.
 */
function pathKeys(pattern: Node): string[] {
	return [part(pattern, "name")?.text ?? pattern.text];
}

/**
 * The variant a struct or tuple-struct pattern names.
 * @param pattern The pattern.
 * @returns The variant.
 */
function variantKeys(pattern: Node): string[] {
	return [variantOf(pattern)];
}

/**
 * A capitalized name is a variant brought in by `use`; any other name binds every other key.
 * @param pattern The name.
 * @returns The variant, or `*`.
 */
function nameKeys(pattern: Node): string[] {
	return /^[A-Z]/u.test(pattern.text) ? [pattern.text] : ["*"];
}

/**
 * A boolean literal is its own key.
 * @param pattern The literal.
 * @returns The key.
 */
function literalKeys(pattern: Node): string[] {
	return [pattern.text];
}

/** How each kind of pattern names its keys. */
const PATTERNS: Readonly<Record<string, (pattern: Node) => string[] | undefined>> = {
	or_pattern: alternativeKeys,
	scoped_identifier: pathKeys,
	struct_pattern: variantKeys,
	tuple_struct_pattern: variantKeys,
	identifier: nameKeys,
	boolean_literal: literalKeys,
};

/**
 * The keys a pattern picks: the variants it names, `true` or `false`, or `*`
 * for a wildcard or a binding that takes every other key.
 * @param pattern The pattern.
 * @returns The keys, or undefined for a pattern of an open key, such as a string.
 */
function patternKeys(pattern: Node): string[] | undefined {
	return PATTERNS[pattern.type]?.(pattern);
}

/**
 * The pieces of logic in code, the code itself among them.
 * @param node The code.
 * @returns How many there are.
 */
function logicIn(node: Node): number {
	if (node.type === "closure_expression" || node.type === "function_item") return 0;
	return (
		(LOGIC.has(node.type) ? 1 : 0) + codeOf(node).reduce((sum, child) => sum + logicIn(child), 0)
	);
}

/**
 * One arm of a `match`: the keys its pattern picks and its code.
 * @param arm The arm.
 * @returns The arm, or undefined for an open pattern.
 */
function matchArm(arm: Node): ArmCode | undefined {
	const pattern = part(arm, "pattern");
	const guard = part(pattern, "condition")?.id;
	const first = (pattern === undefined ? [] : codeOf(pattern)).find((each) => each.id !== guard);
	const keys = first === undefined ? ["*"] : patternKeys(first);
	const value = part(arm, "value");
	return keys === undefined || value === undefined ? undefined : { keys, code: [value] };
}

/**
 * The pick a `match` on a parameter makes.
 * @param expression The `match`.
 * @param parameters The function's parameters.
 * @returns The pick, or undefined.
 */
function matchOn(expression: Node, parameters: ReadonlyMap<string, string>): Dispatch | undefined {
	const key = keyOf(part(expression, "value"), parameters);
	const block = part(expression, "body");
	if (key === undefined || block === undefined) return undefined;
	const arms = codeOf(block)
		.filter((each) => each.type === "match_arm")
		.map(matchArm);
	if (!arms.every((arm) => arm !== undefined)) return undefined;
	const named = arms.flatMap((arm) => arm.keys).filter((each) => each !== "*");
	const boolean = named.every((each) => each === "true" || each === "false");
	if (boolean && parameters.get(key) !== "bool") return undefined;
	return { key, arms, logic: arms.length, boolean };
}

/**
 * The pick an `if` on a `bool` parameter makes.
 * @param expression The `if`.
 * @param parameters The function's parameters.
 * @param rest The statements after it, which run for the other key where its branch returns.
 * @returns The pick, or undefined.
 */
function ifOn(
	expression: Node,
	parameters: ReadonlyMap<string, string>,
	rest: readonly Node[],
): Dispatch | undefined {
	const condition = part(expression, "condition");
	const tested = condition === undefined ? undefined : flagOf(condition, parameters);
	const consequence = part(expression, "consequence");
	const otherwise = otherwiseOf(expression, consequence, rest);
	if (tested === undefined || consequence === undefined || otherwise === undefined)
		return undefined;
	const arms = [
		{ keys: [String(tested.picks)], code: [consequence] },
		{ keys: [String(!tested.picks)], code: otherwise },
	];
	return { key: tested.key, arms, logic: tested.logic, boolean: true };
}

/**
 * What runs where an `if` does not: its `else`, or, after a branch that
 * returns, the statements that follow it.
 * @param expression The `if`.
 * @param consequence Its branch.
 * @param rest The statements after it.
 * @returns The code, or undefined where neither runs.
 */
function otherwiseOf(
	expression: Node,
	consequence: Node | undefined,
	rest: readonly Node[],
): readonly Node[] | undefined {
	const otherwise = part(part(expression, "alternative"), "");
	if (otherwise !== undefined) return [otherwise];
	return rest.length > 0 && returns(consequence) ? rest : undefined;
}

/**
 * Whether a block always returns: its last statement is a `return`.
 * @param block The block.
 * @returns True when it does.
 */
function returns(block: Node | undefined): boolean {
	const last = block === undefined ? undefined : codeOf(block).at(-1);
	const value = last?.type === "expression_statement" ? part(last, "") : last;
	return value?.type === "return_expression";
}

/**
 * The `bool` parameter a condition tests, and the value that takes its first branch.
 * @param condition The condition.
 * @param parameters The function's parameters.
 * @returns The parameter, the value, and the logic of the test, or undefined.
 */
function flagOf(
	condition: Node,
	parameters: ReadonlyMap<string, string>,
): { readonly key: string; readonly picks: boolean; readonly logic: number } | undefined {
	const negated = condition.type === "unary_expression" && condition.text.startsWith("!");
	const key = keyOf(negated ? part(condition, "") : condition, parameters);
	if (key === undefined || parameters.get(key) !== "bool") return undefined;
	return { key, picks: !negated, logic: 1 + logicIn(condition) };
}

/**
 * The expression evaluated by a statement, including a returned or bound value.
 * @param statement The statement with its trailing semicolon removed.
 * @returns The expression it evaluates.
 */
function dispatchExpression(statement: Node | undefined): Node | undefined {
	if (statement?.type === "return_expression") return part(statement, "");
	if (statement?.type === "let_declaration") return part(statement, "value");
	return statement;
}

/**
 * The dispatch evaluated by a statement.
 * @param statement The statement to read.
 * @param parameters The function's parameters.
 * @param rest The statements after this one.
 * @returns The dispatch, if the statement picks by a parameter.
 */
function dispatchAt(
	statement: Node,
	parameters: ReadonlyMap<string, string>,
	rest: readonly Node[],
): Dispatch | undefined {
	const value = statement.type === "expression_statement" ? part(statement, "") : statement;
	const expression = dispatchExpression(value);
	if (expression === undefined) return undefined;
	if (expression.type === "match_expression") return matchOn(expression, parameters);
	if (expression.type === "if_expression")
		return ifOn(expression, parameters, expression === value ? rest : []);
	return undefined;
}

/**
 * The last name of a callee or a target: `show` for `self.show`, `take` for `std::mem::take`.
 * @param node The callee or target.
 * @returns The name.
 */
function lastName(node: Node | undefined): string {
	if (node === undefined) return "";
	const field = LAST_NAME[node.type];
	return field === undefined ? node.text : (part(node, field)?.text ?? "");
}

/**
 * The callee of a call, without its explicit type arguments.
 * @param call The call expression.
 * @returns The callee.
 */
function calleeOf(call: Node): Node | undefined {
	const callee = part(call, "function");
	return callee?.type === "generic_function" ? part(callee, "function") : callee;
}

/**
 * The call a call expression makes, or, for a call of a capitalized name such
 * as `Some(…)` or a variant, which builds data, the calls of its arguments.
 * @param call The call.
 * @param found The effects found so far, which this adds to.
 */
function callEffects(call: Node, found: Effects): void {
	const callee = calleeOf(call);
	if (callee === undefined) return;
	const name = lastName(callee);
	const list = part(call, "arguments");
	if (/^[A-Z]/u.test(name)) {
		if (list !== undefined) effectsIn(list, found);
		return;
	}
	found.calls.add(`${callee.text}/${String(list === undefined ? 0 : codeOf(list).length)}`);
}

/**
 * The calls an arm's code makes, outermost only, and the state it writes.
 * @param node The code.
 * @param found The effects found so far, which this adds to.
 */
function effectsIn(node: Node, found: Effects): void {
	if (SKIPPED.has(node.type)) return;
	if (node.type === "call_expression") {
		callEffects(node, found);
		return;
	}
	writeOf(node, found);
	for (const child of codeOf(node)) effectsIn(child, found);
}

/**
 * The state an assignment writes outside the arm: a field or an element.
 * @param node The code.
 * @param found The effects found so far, which this adds to.
 */
function writeOf(node: Node, found: Effects): void {
	const target = ASSIGNMENTS.has(node.type) ? part(node, "left") : undefined;
	if (target !== undefined && STATE.has(target.type)) found.writes.add(target.text);
}

/**
 * The call an arm forwards, through a single-expression block or return.
 * @param node The arm's expression.
 * @returns Its call, if it only forwards one.
 */
function forwardedCall(node: Node | undefined): Node | undefined {
	if (node === undefined || node.type === "call_expression") return node;
	if (node.type === "block" && codeOf(node).length !== 1) return undefined;
	if (["block", "expression_statement", "return_expression"].includes(node.type))
		return forwardedCall(part(node, ""));
	return undefined;
}

/**
 * Whether an argument hands a name or a fixed value on, borrowed or not.
 * @param argument The argument.
 * @returns True when it does.
 */
function bare(argument: Node): boolean {
	const name = argument.type === "reference_expression" ? part(argument, "value") : argument;
	return name !== undefined && BARE.has(name.type);
}

/**
 * Whether an arm only hands its call on: its one piece of logic is a call of names.
 * @param code The arm's code.
 * @returns True when it does.
 */
function forwards(code: readonly Node[]): boolean {
	const call = code.length === 1 ? forwardedCall(code[0]) : undefined;
	const list = part(call, "arguments");
	const logic = code.reduce((sum, node) => sum + logicIn(node), 0);
	return logic === 1 && list !== undefined && codeOf(list).every(bare);
}

/**
 * An arm, with the calls it makes and the state it writes.
 * @param arm The arm's keys and code.
 * @returns The arm.
 */
function armOf(arm: ArmCode): Arm {
	const found = { calls: new Set<string>(), writes: new Set<string>() };
	for (const node of arm.code) effectsIn(node, found);
	return { keys: arm.keys, line: (arm.code[0]?.startPosition.row ?? 0) + 1, ...found };
}

/**
 * Closure facts for a match whose catch-all depends on the enum's variants.
 * @param dispatch The match.
 * @param type The parameter's type.
 * @param namedKeys The keys the arms name.
 * @returns The deferred closure, when needed.
 */
function enumPick(
	dispatch: Dispatch,
	type: string | undefined,
	namedKeys: readonly string[],
): Pick<Switchboard, "type" | "namedKeys"> {
	if (dispatch.boolean || type === undefined || !namedKeys.includes("*")) return {};
	return { type: type.replaceAll("::", "."), namedKeys };
}

/**
 * The switchboard a function is, if it is one.
 * @param fn The function item.
 * @returns The switchboard, or undefined.
 */
function switchboardOf(fn: Node): Switchboard | undefined {
	const body = fn.type === "function_item" ? part(fn, "body") : undefined;
	if (body === undefined) return undefined;
	const parameters = parametersOf(fn);
	const statements = codeOf(body);
	for (const [index, statement] of statements.entries()) {
		const dispatch = dispatchAt(statement, parameters, statements.slice(index + 1));
		const found = switchboardFrom(dispatch, parameters);
		if (found !== undefined) return found;
	}
	return undefined;
}

/**
 * The operations and logic discount of a dispatch with multiple operations.
 * @param dispatch The dispatch to measure.
 * @param parameters The function's parameters, by name.
 * @returns Its switchboard, if it runs different operations.
 */
function switchboardFrom(
	dispatch: Dispatch | undefined,
	parameters: Map<string, string>,
): Switchboard | undefined {
	if (dispatch === undefined) return undefined;
	const picked = operationsOf(dispatch.arms.map(armOf));
	const namedKeys = dispatch.arms.flatMap((arm) => arm.keys);
	const operations = dispatch.boolean ? restSpelled(picked, ["true", "false"], namedKeys) : picked;
	if (operations.length < 2) return undefined;
	const forwarding = dispatch.arms.filter((arm) => forwards(arm.code)).length;
	return {
		key: dispatch.key,
		...enumPick(dispatch, parameters.get(dispatch.key), namedKeys),
		operations,
		logic: dispatch.logic + forwarding,
	};
}

export { switchboardOf };

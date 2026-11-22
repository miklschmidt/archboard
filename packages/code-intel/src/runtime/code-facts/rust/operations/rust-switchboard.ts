// Whether a Rust function is a switchboard (ADR 0082): it picks the operation
// it runs by a closed key its caller passes, so each operation it picks is a
// name its callers learn.
//
// The key is a parameter, borrowed or not. The body picks by it after any
// preparation, through a `match` whose arms name the variants of an enum,
// with or without payloads, or `true` and `false`, or through an `if` on a
// `bool` parameter. The language closes both, so no type is resolved and no
// call site is read. A `match` on a string or a number is open, and a
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

/** Code of its own, which runs when it is called and not when the arm runs. */
const NESTED = new Set(["closure_expression", "function_item"]);

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

/** An arm before its calls are read: the keys that pick it and its code. */
interface ArmCode {
	readonly keys: readonly string[];
	readonly code: Node;
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

/**
 * The named children of a node that are no comment.
 * @param node The node.
 * @returns The children.
 */
function codeOf(node: Node): Node[] {
	return node.namedChildren.filter((child) => !COMMENTS.has(child.type));
}

/**
 * The function's parameters that are plain names, with their types.
 * @param fn The function.
 * @returns Each name and its type's text, without a borrow.
 */
function parametersOf(fn: Node): Map<string, string> {
	const list = fn.childForFieldName("parameters");
	const named = new Map<string, string>();
	for (const parameter of list === null ? [] : codeOf(list)) {
		const pattern = parameter.childForFieldName("pattern");
		let type = parameter.childForFieldName("type");
		while (type?.type === "reference_type") type = type.childForFieldName("type");
		if (pattern?.type === "identifier") named.set(pattern.text, type?.text ?? "");
	}
	return named;
}

/**
 * The parameter an expression reads, borrowed, dereferenced or not.
 * @param node The expression.
 * @param parameters The function's parameters.
 * @returns Its name, or undefined.
 */
function keyOf(node: Node | null, parameters: ReadonlyMap<string, string>): string | undefined {
	let at = node;
	while (at?.type === "reference_expression" || at?.type === "parenthesized_expression") {
		at = at.type === "reference_expression" ? at.childForFieldName("value") : codeOf(at)[0] ?? null;
	}
	if (at?.type === "unary_expression" && at.text.startsWith("*")) return keyOf(codeOf(at)[0] ?? null, parameters);
	return at?.type === "identifier" && parameters.has(at.text) ? at.text : undefined;
}

/**
 * The keys a pattern picks: the variants it names, `true` or `false`, or `*`
 * for a wildcard or a binding that takes every other key.
 * @param pattern The pattern.
 * @returns The keys, or undefined for a pattern of an open key, such as a string.
 */
function patternKeys(pattern: Node): string[] | undefined {
	switch (pattern.type) {
		case "or_pattern":
			return codeOf(pattern).reduce<string[] | undefined>((keys, each) => {
				const more = patternKeys(each);
				return keys === undefined || more === undefined ? undefined : [...keys, ...more];
			}, []);
		case "scoped_identifier":
			return [pattern.childForFieldName("name")?.text ?? pattern.text];
		case "struct_pattern":
		case "tuple_struct_pattern": {
			const type = pattern.childForFieldName("type");
			return [type?.childForFieldName("name")?.text ?? type?.text ?? ""];
		}
		case "identifier":
			return /^[A-Z]/u.test(pattern.text) ? [pattern.text] : ["*"];
		case "boolean_literal":
			return [pattern.text];
		default:
			return undefined;
	}
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
 * The pick a `match` on a parameter makes.
 * @param expression The `match`.
 * @param parameters The function's parameters.
 * @returns The pick, or undefined.
 */
function matchOn(expression: Node, parameters: ReadonlyMap<string, string>): Dispatch | undefined {
	const key = keyOf(expression.childForFieldName("value"), parameters);
	const block = expression.childForFieldName("body");
	if (key === undefined || block === null) return undefined;
	const arms: ArmCode[] = [];
	for (const arm of codeOf(block).filter((each) => each.type === "match_arm")) {
		const pattern = arm.childForFieldName("pattern");
		const value = arm.childForFieldName("value");
		const named = pattern === null ? [] : codeOf(pattern).filter((each) => pattern.childForFieldName("condition")?.id !== each.id);
		const first = named[0];
		const keys = first === undefined ? ["*"] : patternKeys(first);
		if (keys === undefined || value === null) return undefined;
		arms.push({ keys, code: value });
	}
	const keys = arms.flatMap((arm) => arm.keys).filter((each) => each !== "*");
	const boolean = keys.every((each) => each === "true" || each === "false");
	if (boolean && parameters.get(key) !== "bool") return undefined;
	return { key, arms, logic: arms.length, boolean };
}

/**
 * The pick an `if` on a `bool` parameter makes.
 * @param expression The `if`.
 * @param parameters The function's parameters.
 * @returns The pick, or undefined.
 */
function ifOn(expression: Node, parameters: ReadonlyMap<string, string>): Dispatch | undefined {
	const condition = expression.childForFieldName("condition");
	const consequence = expression.childForFieldName("consequence");
	const alternative = expression.childForFieldName("alternative");
	const otherwise = alternative === null ? undefined : codeOf(alternative)[0];
	if (condition === null || consequence === null || otherwise === undefined) return undefined;
	const negated = condition.type === "unary_expression" && condition.text.startsWith("!");
	const key = keyOf(negated ? (codeOf(condition)[0] ?? null) : condition, parameters);
	if (key === undefined || parameters.get(key) !== "bool") return undefined;
	const [picked, other] = negated ? ["false", "true"] : ["true", "false"];
	return {
		key,
		arms: [
			{ keys: [picked], code: consequence },
			{ keys: [other], code: otherwise },
		],
		logic: 1 + logicIn(condition),
		boolean: true,
	};
}

/**
 * The pick a body makes, after any preparation: the first statement that picks by a parameter.
 * @param body The body.
 * @param parameters The function's parameters.
 * @returns The pick, or undefined.
 */
function dispatchOf(body: Node, parameters: ReadonlyMap<string, string>): Dispatch | undefined {
	for (const statement of codeOf(body)) {
		const expression = statement.type === "expression_statement" ? codeOf(statement)[0] : statement;
		if (expression?.type === "match_expression") {
			const found = matchOn(expression, parameters);
			if (found !== undefined) return found;
		}
		if (expression?.type === "if_expression") {
			const found = ifOn(expression, parameters);
			if (found !== undefined) return found;
		}
	}
	return undefined;
}

/**
 * The last name of a callee or a target: `show` for `self.show`, `take` for `std::mem::take`.
 * @param node The callee or target.
 * @returns The name.
 */
function lastName(node: Node | null): string {
	if (node === null) return "";
	if (node.type === "field_expression") return node.childForFieldName("field")?.text ?? "";
	if (node.type === "scoped_identifier") return node.childForFieldName("name")?.text ?? "";
	if (node.type === "generic_function") return lastName(node.childForFieldName("function"));
	return node.text;
}

/**
 * The calls an arm's code makes, outermost only, and the state it writes. A
 * call of a capitalized name, such as `Some(…)` or a variant, builds data.
 * @param node The code.
 * @param found The calls and writes found so far, which this adds to.
 * @param found.calls The calls, as `callee/arguments`.
 * @param found.writes The state written, as the code spells each target.
 */
function effectsIn(node: Node, found: { calls: Set<string>; writes: Set<string> }): void {
	if (NESTED.has(node.type) || node.type === "macro_invocation") return;
	if (node.type === "call_expression") {
		const name = lastName(node.childForFieldName("function"));
		const list = node.childForFieldName("arguments");
		if (!/^[A-Z]/u.test(name)) {
			found.calls.add(`${name}/${String(list === null ? 0 : codeOf(list).length)}`);
			return;
		}
		if (list !== null) effectsIn(list, found);
		return;
	}
	if (node.type === "assignment_expression" || node.type === "compound_assignment_expr") {
		const target = node.childForFieldName("left");
		if (target?.type === "field_expression" || target?.type === "index_expression") {
			found.writes.add(target.text);
		}
	}
	for (const child of codeOf(node)) effectsIn(child, found);
}

/**
 * Whether an arm only hands its call on: its one piece of logic is a call of names.
 * @param code The arm's code.
 * @returns True when it does.
 */
function forwards(code: Node): boolean {
	if (logicIn(code) !== 1) return false;
	const calls: Node[] = [];
	const collect = (node: Node): void => {
		if (node.type === "call_expression") calls.push(node);
		for (const child of codeOf(node)) collect(child);
	};
	collect(code);
	const list = calls[0]?.childForFieldName("arguments");
	return (
		list !== null &&
		list !== undefined &&
		codeOf(list).every((argument) => {
			const name = argument.type === "reference_expression" ? argument.childForFieldName("value") : argument;
			return name !== null && BARE.has(name.type);
		})
	);
}

/**
 * An arm, with the calls it makes and the state it writes.
 * @param arm The arm's keys and code.
 * @returns The arm.
 */
function armOf(arm: ArmCode): Arm {
	const found = { calls: new Set<string>(), writes: new Set<string>() };
	effectsIn(arm.code, found);
	return { keys: arm.keys, line: arm.code.startPosition.row + 1, ...found };
}

/**
 * The switchboard a function is, if it is one.
 * @param fn The function item.
 * @returns The switchboard, or undefined.
 */
function switchboardOf(fn: Node): Switchboard | undefined {
	const body = fn.type === "function_item" ? fn.childForFieldName("body") : null;
	if (body === null) return undefined;
	const dispatch = dispatchOf(body, parametersOf(fn));
	if (dispatch === undefined) return undefined;
	const picked = operationsOf(dispatch.arms.map(armOf));
	const operations = dispatch.boolean ? restSpelled(picked, ["true", "false"]) : picked;
	if (operations.length < 2) return undefined;
	const forwarding = dispatch.arms.filter((arm) => forwards(arm.code)).length;
	return { key: dispatch.key, operations, logic: dispatch.logic + forwarding };
}

export { switchboardOf };

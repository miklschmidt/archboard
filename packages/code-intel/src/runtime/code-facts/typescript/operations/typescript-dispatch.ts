// The pick a TypeScript callable's body makes by a key (ADR 0082, TASK-659),
// before its key is closed (typescript-key-closure.ts) and its arms are read
// as operations (typescript-switchboard.ts).
//
// The key is a parameter, or a property of one: `intent`, `input.analysis`,
// `options.register`. The body picks by it after any preparation, through a
// chain of `if` on `===` tests, a `switch`, a conditional expression, or a
// call of an entry of a closed table of handlers that the key indexes, beside
// a default path. Its syntax is read in typescript-pick-syntax.ts.

import type { Node } from "web-tree-sitter";
import {
	type ArmCode,
	codeOf,
	declared,
	type Dispatch,
	keyOf,
	literalOf,
	logicIn,
	type Parameter,
	part,
	testOf,
	type Test,
	unwrapped,
} from "#runtime/code-facts/typescript/operations/typescript-pick-syntax.ts";
import { callableOf } from "#runtime/code-facts/typescript/operations/typescript-pass-through.ts";

/**
 * Whether a statement always leaves the body: it returns or throws.
 * @param node The statement.
 * @returns True when it does.
 */
function exits(node: Node): boolean {
	if (node.type === "return_statement" || node.type === "throw_statement") return true;
	const last = node.type === "statement_block" ? codeOf(node).at(-1) : undefined;
	return last !== undefined && exits(last);
}

/** One `if` of a chain, read: its test, the code it guards, and what its `else` holds. */
interface Branch {
	readonly test: Test;
	readonly logic: number;
	readonly consequence: Node;
	readonly otherwise: Node | undefined;
}

/**
 * One `if` that tests a key, read: its condition, its test and the code it guards.
 * @param statement The statement.
 * @param parameters The callable's parameters.
 * @returns What it holds, or undefined for a statement that is no such `if`.
 */
function testedIf(
	statement: Node | undefined,
	parameters: readonly Parameter[],
): { readonly condition: Node; readonly consequence: Node; readonly test: Test } | undefined {
	if (statement?.type !== "if_statement") return undefined;
	const condition = part(statement, "condition");
	const consequence = part(statement, "consequence");
	if (condition === undefined || consequence === undefined) return undefined;
	const test = testOf(condition, parameters);
	return test === undefined ? undefined : { condition, consequence, test };
}

/**
 * What an `else` holds.
 * @param statement The `if`.
 * @returns The statement of its `else`, or undefined where it has none.
 */
function elseOf(statement: Node): Node | undefined {
	const otherwise = part(statement, "alternative");
	return otherwise === undefined ? undefined : codeOf(otherwise)[0];
}

/**
 * One `if` that tests the key the chain tests.
 * @param statement The statement.
 * @param parameters The callable's parameters.
 * @param key The key the chain tests so far, if any.
 * @returns The branch, or undefined.
 */
function branchOf(
	statement: Node | undefined,
	parameters: readonly Parameter[],
	key: string | undefined,
): Branch | undefined {
	const tested = testedIf(statement, parameters);
	if (statement === undefined || tested === undefined) return undefined;
	if (key !== undefined && tested.test.key !== key) return undefined;
	const { test, condition, consequence } = tested;
	return { test, logic: 1 + logicIn(condition), consequence, otherwise: elseOf(statement) };
}

/** A chain of `if` read so far. */
interface Chain {
	readonly arms: ArmCode[];
	key: string | undefined;
	logic: number;
	truthy: boolean;
}

/**
 * Add one branch to a chain.
 * @param chain The chain, which this changes.
 * @param branch The branch.
 */
function extend(chain: Chain, branch: Branch): void {
	chain.key = branch.test.key;
	chain.truthy ||= branch.test.truthy;
	chain.logic += branch.logic;
	chain.arms.push({ keys: branch.test.keys, code: [branch.consequence] });
}

/**
 * The chain an `else` holds: more tests of the key, then the default path, if any.
 * @param chain The chain so far, which this changes.
 * @param otherwise What the `else` holds.
 * @param parameters The callable's parameters.
 */
function elseChain(
	chain: Chain,
	otherwise: Node | undefined,
	parameters: readonly Parameter[],
): void {
	let at = otherwise;
	let branch = branchOf(at, parameters, chain.key);
	while (branch !== undefined) {
		extend(chain, branch);
		at = branch.otherwise;
		branch = branchOf(at, parameters, chain.key);
	}
	if (at !== undefined) chain.arms.push({ keys: ["*"], code: [at] });
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
	const chain: Chain = { arms: [], key: undefined, logic: 0, truthy: false };
	let index = start;
	let branch = branchOf(statements[index], parameters, undefined);
	while (branch !== undefined) {
		extend(chain, branch);
		if (branch.otherwise !== undefined) {
			elseChain(chain, branch.otherwise, parameters);
			return finished(chain, []);
		}
		if (!exits(branch.consequence)) return undefined;
		index += 1;
		branch = branchOf(statements[index], parameters, chain.key);
	}
	return finished(chain, statements.slice(index));
}

/**
 * A chain read whole, with the statements after its last test as its default path.
 * @param chain The chain.
 * @param rest The statements after it.
 * @returns The pick, or undefined for a chain that tests nothing.
 */
function finished(chain: Chain, rest: readonly Node[]): Dispatch | undefined {
	if (chain.key === undefined) return undefined;
	return {
		key: chain.key,
		arms: withRest(chain.arms, rest),
		logic: chain.logic,
		truthy: chain.truthy,
	};
}

/**
 * Arms with the statements after them as the default path, where any follow.
 * @param arms The arms.
 * @param rest The statements after them.
 * @returns The arms.
 */
function withRest(arms: readonly ArmCode[], rest: readonly Node[]): ArmCode[] {
	return rest.length > 0 ? [...arms, { keys: ["*"], code: rest }] : [...arms];
}

/**
 * A conditional expression that tests a key, read.
 * @param at The expression.
 * @param parameters The callable's parameters.
 * @returns Its condition, test and both branches, or undefined.
 */
function testedConditional(
	at: Node,
	parameters: readonly Parameter[],
):
	| {
			readonly condition: Node;
			readonly test: Test;
			readonly consequence: Node;
			readonly alternative: Node;
	  }
	| undefined {
	if (at.type !== "ternary_expression") return undefined;
	const condition = part(at, "condition");
	const consequence = part(at, "consequence");
	const alternative = part(at, "alternative");
	if (condition === undefined || consequence === undefined || alternative === undefined)
		return undefined;
	const test = testOf(condition, parameters);
	return test === undefined ? undefined : { condition, test, consequence, alternative };
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
	const tested = testedConditional(unwrapped(expression), parameters);
	if (tested === undefined || (key !== undefined && tested.test.key !== key)) return undefined;
	const { condition, test, consequence, alternative } = tested;
	const more = conditional(alternative, parameters, test.key) ?? lastArm(test.key, alternative);
	return {
		key: test.key,
		arms: [{ keys: test.keys, code: [consequence] }, ...more.arms],
		logic: 1 + logicIn(condition) + more.logic,
		truthy: test.truthy || more.truthy,
	};
}

/**
 * The default path of a conditional expression, as a pick of its own.
 * @param key The key.
 * @param code The default path.
 * @returns The pick.
 */
function lastArm(key: string, code: Node): Dispatch {
	return { key, arms: [{ keys: ["*"], code: [code] }], logic: 0, truthy: false };
}

/**
 * The label of one case of a `switch`, and its pieces of logic.
 * @param label The case or the default.
 * @returns Its key, or undefined for a case that names no literal.
 */
function caseKey(label: Node): string | undefined {
	if (label.type === "switch_default") return "*";
	const tested = part(label, "value");
	return tested === undefined ? undefined : literalOf(tested);
}

/**
 * The arms of a `switch`: each case with code, with the keys of the empty cases before it.
 * @param labels The cases and the default.
 * @returns The arms, or undefined where a case names no literal.
 */
function switchArms(labels: readonly Node[]): ArmCode[] | undefined {
	const arms: ArmCode[] = [];
	let keys: string[] = [];
	for (const label of labels) {
		const key = caseKey(label);
		if (key === undefined) return undefined;
		keys.push(key);
		const code = label.childrenForFieldName("body").filter((each) => each.type !== "comment");
		if (code.length === 0) continue;
		arms.push({ keys, code });
		keys = [];
	}
	return arms;
}

/**
 * The pick a `switch` on the key makes.
 * @param statement The statement.
 * @param parameters The callable's parameters.
 * @returns The pick, or undefined.
 */
function switchOn(statement: Node, parameters: readonly Parameter[]): Dispatch | undefined {
	const value = part(statement, "value");
	const key = value === undefined ? undefined : keyOf(value, parameters);
	const body = part(statement, "body");
	const labels = (body === undefined ? [] : codeOf(body)).filter((each) =>
		["switch_case", "switch_default"].includes(each.type),
	);
	const arms = switchArms(labels);
	if (key === undefined || arms === undefined) return undefined;
	const logic = labels.filter((each) => each.type === "switch_case").length;
	return { key, arms, logic, truthy: false };
}

/**
 * The module-level object a name holds, through `as`, `satisfies` and parentheses.
 * @param root The file.
 * @param name The name.
 * @returns The object, or undefined.
 */
function moduleObject(root: Node, name: string): Node | undefined {
	const declarators = codeOf(root)
		.map(declared)
		.filter((each) => each?.type === "lexical_declaration")
		.flatMap((each) => (each === undefined ? [] : codeOf(each)));
	const value = part(
		declarators.find((each) => part(each, "name")?.text === name),
		"value",
	);
	const held = value === undefined ? undefined : unwrapped(value);
	return held?.type === "object" ? held : undefined;
}

/**
 * The name of a member of an object, as a key spells it.
 * @param member The member.
 * @returns The name, or undefined for a computed one.
 */
function memberName(member: Node): string | undefined {
	const name = part(member, member.type === "pair" ? "key" : "name");
	if (name === undefined) return undefined;
	return name.type === "string" ? literalOf(name) : name.text;
}

/**
 * One entry of a table of handlers, as an arm: an inline function's body, or the function it names.
 * @param member The entry.
 * @param passed How many arguments the call of the entry passes.
 * @returns The arm, or undefined for an entry that is neither.
 */
function tableArm(member: Node, passed: number): ArmCode | undefined {
	const name = memberName(member);
	const value = member.type === "pair" ? part(member, "value") : member;
	if (name === undefined || value === undefined) return undefined;
	if (value.type === "identifier")
		return { keys: [name], code: [], handler: `${value.text}/${String(passed)}` };
	const body = part(callableOf(value), "body");
	return body === undefined ? undefined : { keys: [name], code: [body] };
}

/**
 * The subscript a call calls, as `CHECKED[kind](raw)` calls `CHECKED[kind]`.
 * @param call The call.
 * @returns The subscript, or undefined.
 */
function subscriptOf(call: Node): Node | undefined {
	const callee = part(call, "function");
	return call.type === "call_expression" && callee?.type === "subscript_expression"
		? callee
		: undefined;
}

/**
 * The table a call indexes by a key, and the key.
 * @param call The call.
 * @param parameters The callable's parameters.
 * @returns The table's name and the key, or undefined.
 */
function tableIndex(
	call: Node,
	parameters: readonly Parameter[],
): { readonly table: string; readonly key: string } | undefined {
	const callee = subscriptOf(call);
	const object = part(callee, "object");
	const index = part(callee, "index");
	if (object?.type !== "identifier" || index === undefined) return undefined;
	const key = keyOf(index, parameters);
	return key === undefined ? undefined : { table: object.text, key };
}

/**
 * The arms of a closed table of handlers that a call indexes by the key.
 * @param expression The expression that may call an entry.
 * @param parameters The callable's parameters.
 * @returns The key, the arms and the call, or undefined.
 */
function tableCall(
	expression: Node,
	parameters: readonly Parameter[],
): { readonly key: string; readonly arms: ArmCode[]; readonly call: Node } | undefined {
	const call = unwrapped(expression);
	const indexed = tableIndex(call, parameters);
	const table = indexed === undefined ? undefined : moduleObject(call.tree.rootNode, indexed.table);
	if (indexed === undefined || table === undefined) return undefined;
	const passed = codeOf(part(call, "arguments") ?? call).length;
	const arms = codeOf(table).map((member) => tableArm(member, passed));
	return arms.every((arm) => arm !== undefined) ? { key: indexed.key, arms, call } : undefined;
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
 * The value a statement, or the one statement of a block, returns.
 * @param node A statement or a block.
 * @returns The value, or undefined.
 */
function returned(node: Node | undefined): Node | undefined {
	const statement = node === undefined ? undefined : onlyStatement(node);
	return statement?.type === "return_statement" ? codeOf(statement)[0] : undefined;
}

/**
 * Whether a statement is an `if` with no `else`, which may guard a call of a table's entry.
 * @param statement The statement.
 * @returns True when it is.
 */
function isGuard(statement: Node): boolean {
	return statement.type === "if_statement" && part(statement, "alternative") === undefined;
}

/**
 * The call of a table's entry that a statement, or the one statement of a block, returns.
 * @param node The statement or block.
 * @param parameters The callable's parameters.
 * @returns The table's arms and the call, or undefined.
 */
function tableReturned(
	node: Node | undefined,
	parameters: readonly Parameter[],
): ReturnType<typeof tableCall> {
	const value = returned(node);
	return value === undefined ? undefined : tableCall(value, parameters);
}

/**
 * The pieces of logic of a guard's test.
 * @param statement The guard.
 * @returns The `if` and its condition.
 */
function guardLogic(statement: Node): number {
	const condition = part(statement, "condition");
	return 1 + (condition === undefined ? 0 : logicIn(condition));
}

/**
 * The pick a call of a table's entry makes: returned alone, or returned under
 * a guard with the rest of the body as the default path.
 * @param statements The statements of the body.
 * @param start The statement that may make the pick.
 * @param parameters The callable's parameters.
 * @returns The pick and the call of the entry, or undefined.
 */
function tableDispatch(
	statements: readonly Node[],
	start: number,
	parameters: readonly Parameter[],
): (Dispatch & { readonly call: Node }) | undefined {
	const statement = statements[start];
	if (statement === undefined) return undefined;
	const guarded = isGuard(statement);
	const table = tableReturned(guarded ? part(statement, "consequence") : statement, parameters);
	if (table === undefined) return undefined;
	return {
		key: table.key,
		arms: withRest(table.arms, guarded ? statements.slice(start + 1) : []),
		logic: guarded ? guardLogic(statement) : 0,
		truthy: false,
		table: table.arms.flatMap((arm) => arm.keys),
		call: table.call,
	};
}

/**
 * The pick one statement of a body starts, if it starts one.
 * @param statements The statements of the body.
 * @param index The statement.
 * @param parameters The callable's parameters.
 * @returns The pick, or undefined.
 */
function pickAt(
	statements: readonly Node[],
	index: number,
	parameters: readonly Parameter[],
): Dispatch | undefined {
	const statement = statements[index];
	if (statement === undefined) return undefined;
	if (statement.type === "if_statement") return ifChain(statements, index, parameters);
	if (statement.type === "switch_statement") return switchOn(statement, parameters);
	const value = ["return_statement", "expression_statement"].includes(statement.type)
		? codeOf(statement)[0]
		: undefined;
	return value === undefined ? undefined : conditional(value, parameters);
}

/**
 * The pick a body makes, after any preparation: the first statement that picks by a key.
 * @param body The body.
 * @param parameters The callable's parameters.
 * @returns The pick, with the call of a table's entry where it calls one, or undefined.
 */
function dispatchOf(
	body: Node,
	parameters: readonly Parameter[],
): (Dispatch & { readonly call?: Node }) | undefined {
	if (body.type !== "statement_block") return conditional(body, parameters);
	const statements = codeOf(body);
	for (const index of statements.keys()) {
		const found =
			tableDispatch(statements, index, parameters) ?? pickAt(statements, index, parameters);
		if (found !== undefined) return found;
	}
	return undefined;
}

export { dispatchOf };

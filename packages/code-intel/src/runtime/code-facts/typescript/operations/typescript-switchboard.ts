// Whether a TypeScript callable is a switchboard (ADR 0082, TASK-659): it
// picks the operation it runs by a closed key its caller passes, so each
// operation it picks is a name its callers learn.
//
// The body's pick (typescript-dispatch.ts) and the key's closure
// (typescript-key-closure.ts) come together here, with what each arm runs:
// the calls it makes, outermost only, and the state it writes. A table closes
// the keys it handles, and a key typed `string` or `number` stays open. No
// call site is read, since a choice can cross HTTP or WebAssembly as data.

import type { Node } from "web-tree-sitter";
import type { Switchboard } from "#runtime/code-facts/operations/facts.ts";
import { type Arm, dispatchOperations } from "#runtime/code-facts/operations/switchboard-arms.ts";
import {
	type ArmCode,
	codeOf,
	type Dispatch,
	logicIn,
	NESTED,
	type Parameter,
	parametersOf,
	part,
} from "#runtime/code-facts/typescript/operations/typescript-pick-syntax.ts";
import { dispatchOf } from "#runtime/code-facts/typescript/operations/typescript-dispatch.ts";
import {
	type Closure,
	closureOf,
	overloadKeys,
} from "#runtime/code-facts/typescript/operations/typescript-key-closure.ts";
import { callableOf } from "#runtime/code-facts/typescript/operations/typescript-pass-through.ts";

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

/** Assignments, whose target a write names. */
const ASSIGNMENTS = new Set(["assignment_expression", "augmented_assignment_expression"]);

/** Targets of an assignment that are state outside the arm. */
const STATE = new Set(["member_expression", "subscript_expression"]);

/** A key typed so that any value passes: open. */
const OPEN_TYPE = /^:\s*(?:string|number)$/u;

/** The calls and writes an arm's code makes. */
interface Effects {
	readonly calls: Set<string>;
	readonly writes: Set<string>;
}

/** A pick with its closed key, and the call of a table's entry where it calls one. */
interface ClosedPick {
	readonly callable: Node;
	readonly dispatch: Dispatch & { readonly call?: Node };
	readonly closure: NonNullable<Closure>;
}

/**
 * The name a call is known by: the last name of its callee.
 * @param node The callee.
 * @returns The name.
 */
function lastName(node: Node | undefined): string {
	if (node === undefined) return "";
	if (node.type === "subscript_expression") return `${lastName(part(node, "object"))}[]`;
	const property = node.type === "member_expression" ? part(node, "property") : undefined;
	return property?.text ?? node.text;
}

/**
 * The state an assignment writes outside the arm: a member or an element.
 * @param node The code.
 * @param found The effects found so far, which this adds to.
 */
function writeOf(node: Node, found: Effects): void {
	const target = ASSIGNMENTS.has(node.type) ? part(node, "left") : undefined;
	if (target !== undefined && STATE.has(target.type)) found.writes.add(target.text);
}

/**
 * The calls an arm's code makes, outermost only, and the state it writes.
 * @param node The code.
 * @param found The effects found so far, which this adds to.
 */
function effectsIn(node: Node, found: Effects): void {
	if (NESTED.has(node.type)) return;
	if (node.type === "call_expression") {
		const list = part(node, "arguments");
		const count = list?.type === "arguments" ? codeOf(list).length : 1;
		found.calls.add(`${lastName(part(node, "function"))}/${String(count)}`);
		return;
	}
	writeOf(node, found);
	for (const child of codeOf(node)) effectsIn(child, found);
}

/**
 * Whether an argument hands a name or a fixed value on.
 * @param argument The argument.
 * @returns True when it does.
 */
function bare(argument: Node): boolean {
	const name = argument.type === "spread_element" ? codeOf(argument)[0] : argument;
	return name !== undefined && BARE.has(name.type);
}

/**
 * Whether a call hands only names and fixed values on, deciding nothing.
 * @param call The call.
 * @returns True when it does.
 */
function bareCall(call: Node | undefined): boolean {
	const list = part(call, "arguments");
	return list?.type === "arguments" && codeOf(list).every(bare);
}

/**
 * The calls in code, nested ones included, outside nested functions.
 * @param node The code.
 * @returns The calls.
 */
function callsIn(node: Node): Node[] {
	if (NESTED.has(node.type)) return [];
	const nested = codeOf(node).flatMap(callsIn);
	return node.type === "call_expression" ? [node, ...nested] : nested;
}

/**
 * Whether an arm only hands its call on: its one piece of logic is a call of names.
 * @param code The arm's code.
 * @returns True when it does.
 */
function forwards(code: readonly Node[]): boolean {
	const logic = code.reduce((sum, node) => sum + logicIn(node), 0);
	return logic === 1 && bareCall(code.flatMap(callsIn)[0]);
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
	const start = arm.code[0]?.startPosition.row;
	return { keys: arm.keys, line: start === undefined ? line : start + 1, ...found };
}

/**
 * Whether a key's parameter is typed so that any value passes.
 * @param parameter The parameter.
 * @returns True for no type, `string` or `number`.
 */
function openlyTyped(parameter: Parameter): boolean {
	return parameter.type === undefined || OPEN_TYPE.test(parameter.type.text);
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
	return (
		overloadClosure(callable, parameter, property, dispatch) ??
		declaredClosure(parameter, property, dispatch)
	);
}

/**
 * The keys literal overloads close a key to, where they name every key the body tests.
 * @param callable The callable.
 * @param parameter The key's parameter.
 * @param property The key's property, if any.
 * @param dispatch The pick its body makes.
 * @returns The closure, or undefined.
 */
function overloadClosure(
	callable: Node,
	parameter: Parameter,
	property: string | undefined,
	dispatch: Dispatch,
): Closure {
	const named = dispatch.arms.flatMap((arm) => arm.keys).filter((key) => key !== "*");
	const overloaded = overloadKeys(callable, parameter, property) ?? [];
	const covers = overloaded.length > 0 && named.every((key) => overloaded.includes(key));
	return covers ? { keys: overloaded, whole: true } : undefined;
}

/**
 * The keys the key's declared type closes, or, for a key that indexes a closed table, the table's.
 * @param parameter The key's parameter.
 * @param property The key's property, if any.
 * @param dispatch The pick the body makes.
 * @returns The closure, or undefined for an open key.
 */
function declaredClosure(
	parameter: Parameter,
	property: string | undefined,
	dispatch: Dispatch,
): Closure {
	const declared = closureOf(parameter.type, property);
	if (dispatch.table === undefined || (declared !== undefined && "keys" in declared))
		return declared;
	return openlyTyped(parameter) ? undefined : { keys: dispatch.table, whole: false };
}

/**
 * A closure, unless the body tests the key's truth and the key is no boolean.
 * @param closure The closure.
 * @param dispatch The pick the body makes.
 * @returns The closure, or undefined.
 */
function truthful(closure: Closure, dispatch: Dispatch): Closure {
	return closure === undefined || (dispatch.truthy && !boolean(closure)) ? undefined : closure;
}

/**
 * Whether a closure closes a key that a test of its truth picks by: a boolean.
 * @param closure The closure.
 * @returns True when its keys are `true` and `false`.
 */
function boolean(closure: NonNullable<Closure>): boolean {
	const keys = "keys" in closure ? closure.keys : [];
	return keys.length > 0 && keys.every((key) => key === "true" || key === "false");
}

/**
 * The pick a declaration's body makes, with its closed key.
 * @param declaration The declaration.
 * @returns The callable, its pick and its closure, or undefined.
 */
function closedPick(declaration: Node): ClosedPick | undefined {
	const callable = callableOf(declaration);
	const body = part(callable, "body");
	if (callable === undefined || body === undefined) return undefined;
	const parameters = parametersOf(callable);
	const dispatch = dispatchOf(body, parameters);
	if (dispatch === undefined) return undefined;
	const closure = truthful(keyClosure(callable, parameters, dispatch), dispatch);
	return closure === undefined ? undefined : { callable, dispatch, closure };
}

/**
 * The forwarding calls in the selector's own body.
 * @param dispatch The selector.
 * @returns Its forwarding overhead.
 */
function forwardingLogic(dispatch: ClosedPick["dispatch"]): number {
	// Table entries describe the handlers' own bodies.
	const arms = dispatch.arms.slice(dispatch.table?.length ?? 0);
	return arms.filter((arm) => forwards(arm.code)).length + Number(bareCall(dispatch.call));
}

/**
 * The switchboard a declaration is, if it is one.
 * @param declaration The declaration.
 * @returns The switchboard, or undefined.
 */
function switchboardOf(declaration: Node): Switchboard | undefined {
	const pick = closedPick(declaration);
	if (pick === undefined) return undefined;
	const { callable, dispatch, closure } = pick;
	const line = callable.startPosition.row + 1;
	const arms = dispatch.arms.map((arm) => armOf(arm, line));
	const operations = dispatchOperations(
		arms,
		"whole" in closure && closure.whole ? closure.keys : undefined,
		"type" in closure ? closure.type : undefined,
	);
	if (operations === undefined) return undefined;
	return {
		key: dispatch.key,
		...operations,
		logic: dispatch.logic + forwardingLogic(dispatch),
	};
}

export { switchboardOf };

// The math a TypeScript file writes on the names it imports (TASK-646.06):
// for each use of an imported name at run time that arithmetic holds, the
// shape of that math, which module depth compares across the modules that
// read one export.
//
// The math is the largest arithmetic expression around the use: `+ - * / %
// **`, a unary sign, parentheses, and the functions of `Math`. Equality,
// comparison, bitwise and logical operators end it, and so does a `+` that
// joins a string. The use is the chain of names it starts, with the `()` of
// a call that passes nothing, as a getter's is. Inside the shape the use is
// `@`, a number is its value and every other operand, the caller's own names
// among them, is `…`. The operands of `+`, `*`, `Math.min`, `Math.max` and
// `Math.hypot` are sorted, so `a * b` and `b * a` have one shape. A use that
// a local variable holds whole, as `const base = X.restartBase` or `const {
// restartBase } = X` does, is followed once: the math around each later use
// of that variable is math on the name.

import type { Node } from "web-tree-sitter";
import type { Computation } from "#runtime/code-facts/operations/facts.ts";

/** The operators of arithmetic, by how tightly each binds. */
const BINDING: ReadonlyMap<string, number> = new Map([
	["+", 1],
	["-", 1],
	["*", 2],
	["/", 2],
	["%", 2],
	["**", 3],
]);

/** How tightly a sign, and an operand that is no operation, binds. */
const SIGN = 4;
const OPERAND = 5;

/** The operators whose operands can change places. */
const COMMUTATIVE = new Set(["+", "*"]);

/** The functions of `Math` whose arguments can change places. */
const SORTED = new Set(["Math.min", "Math.max", "Math.hypot"]);

/** Syntax that only wraps an expression for the type checker. */
const WRAPPERS = new Set(["as_expression", "satisfies_expression", "non_null_expression"]);

/** Syntax that holds text, which `+` joins. */
const TEXT = new Set(["string", "template_string"]);

/** The scopes a local variable is searched in. */
const SCOPES = new Set(["statement_block", "program", "class_body"]);

/** What any operand that is not the use and no math shapes as. */
const OTHER = "…";

/** One part of a shape, and how tightly it binds. */
interface Shape {
	readonly text: string;
	readonly binding: number;
}

/** The use a shape is drawn around, and what it is written as. */
interface Focus {
	readonly node: Node;
	readonly text: string;
}

/**
 * A child of a node by its field.
 * @param node The node.
 * @param name The field.
 * @returns The child, or undefined.
 */
function field(node: Node, name: string): Node | undefined {
	return node.childForFieldName(name) ?? undefined;
}

/**
 * Whether a node holds another in one of its fields.
 * @param node The node.
 * @param name The field.
 * @param child The other node.
 * @returns True when it does.
 */
function holds(node: Node, name: string, child: Node): boolean {
	return field(node, name)?.id === child.id;
}

/**
 * Whether syntax only wraps an expression: parentheses, or a wrapper for the type checker.
 * @param node The syntax.
 * @returns True when it does.
 */
function transparent(node: Node): boolean {
	return node.type === "parenthesized_expression" || WRAPPERS.has(node.type);
}

/**
 * The expression inside parentheses or a wrapper for the type checker.
 * @param node The expression.
 * @returns The expression it holds, or itself.
 */
function unwrapped(node: Node): Node {
	const inner = transparent(node) ? node.namedChildren[0] : undefined;
	return inner === undefined || inner === null ? node : unwrapped(inner);
}

/**
 * The function of `Math` a call runs.
 * @param call The call.
 * @returns Its name, such as `Math.min`, or undefined for another call.
 */
function mathFunction(call: Node): string | undefined {
	const callee = call.type === "call_expression" ? field(call, "function") : undefined;
	const name = callee?.type === "member_expression" ? callee.text.replaceAll(/\s/gu, "") : "";
	return /^Math\.\w+$/u.test(name) ? name : undefined;
}

/**
 * The operator of an operation, as its syntax names it.
 * @param node The operation.
 * @returns The operator, or `""`.
 */
function operatorOf(node: Node): string {
	return field(node, "operator")?.type ?? "";
}

/**
 * The two sides of a binary expression.
 * @param node The expression.
 * @returns The left side, then the right, where each is there.
 */
function sidesOf(node: Node): Node[] {
	return [field(node, "left"), field(node, "right")].filter((side) => side !== undefined);
}

/**
 * The operator of a binary expression, when it is arithmetic on numbers.
 * @param node The expression.
 * @returns The operator, or undefined.
 */
function arithmetic(node: Node): string | undefined {
	const operator = node.type === "binary_expression" ? operatorOf(node) : "";
	if (!BINDING.has(operator)) return undefined;
	const joins = sidesOf(node).some((side) => TEXT.has(unwrapped(side).type));
	return operator === "+" && joins ? undefined : operator;
}

/**
 * Whether an expression is a unary sign.
 * @param node The expression.
 * @returns True for `-x` and `+x`.
 */
function signed(node: Node): boolean {
	return node.type === "unary_expression" && /^[-+]$/u.test(operatorOf(node));
}

/**
 * The math that holds an expression, one step out.
 * @param node The expression.
 * @returns The parent that keeps the math going, or undefined where the math ends.
 */
function mathParent(node: Node): Node | undefined {
	const parent = node.parent;
	if (parent === null) return undefined;
	return operation(parent) ? parent : mathCallOf(parent);
}

/**
 * Whether syntax keeps math going around what it holds: parentheses, a
 * wrapper, arithmetic or a sign.
 * @param node The syntax.
 * @returns True when it does.
 */
function operation(node: Node): boolean {
	return transparent(node) || arithmetic(node) !== undefined || signed(node);
}

/**
 * The call of a function of `Math` whose arguments these are.
 * @param node The syntax that holds an expression.
 * @returns The call, or undefined when they are no arguments of such a call.
 */
function mathCallOf(node: Node): Node | undefined {
	const call = node.type === "arguments" ? node.parent : null;
	return call !== null && mathFunction(call) !== undefined ? call : undefined;
}

/**
 * The largest math around an expression.
 * @param node The expression.
 * @returns The math, or undefined when no arithmetic holds the expression.
 */
function mathAround(node: Node): Node | undefined {
	let math: Node | undefined;
	for (let step = mathParent(node); step !== undefined; step = mathParent(step)) {
		if (!transparent(step)) math = step;
	}
	return math;
}

/**
 * An operand, in parentheses where it binds less tightly than its place needs.
 * @param shape The operand.
 * @param least How tightly it must bind to go without them.
 * @returns Its text.
 */
function placed(shape: Shape, least: number): string {
	return shape.binding < least ? `(${shape.text})` : shape.text;
}

/**
 * The operands of a commutative operator, its own nested uses flattened.
 * @param node The expression.
 * @param operator The operator.
 * @returns The operands.
 */
function chained(node: Node, operator: string): Node[] {
	const inner = unwrapped(node);
	if (arithmetic(inner) !== operator) return [inner];
	return sidesOf(inner).flatMap((side) => chained(side, operator));
}

/**
 * The shape of a binary operation.
 * @param node The operation.
 * @param operator Its operator.
 * @param focus The use.
 * @returns Its shape.
 */
function binaryShape(node: Node, operator: string, focus: Focus): Shape {
	const binding = BINDING.get(operator) ?? OPERAND;
	if (COMMUTATIVE.has(operator)) {
		const operands = chained(node, operator).map((each) =>
			placed(shapeOf(each, focus), binding + 1),
		);
		return { text: operands.toSorted().join(` ${operator} `), binding };
	}
	// `**` groups to the right, the others to the left.
	const least = operator === "**" ? [binding + 1, binding] : [binding, binding + 1];
	const sides = sidesOf(node).map((side, index) =>
		placed(shapeOf(side, focus), least[index] ?? binding),
	);
	return { text: sides.join(` ${operator} `), binding };
}

/**
 * The shape of a sign.
 * @param node The signed expression.
 * @param focus The use.
 * @returns Its shape.
 */
function signShape(node: Node, focus: Focus): Shape {
	const argument = field(node, "argument");
	const operand = argument === undefined ? OTHER : placed(shapeOf(argument, focus), SIGN);
	return { text: `${operatorOf(node)}${operand}`, binding: SIGN };
}

/**
 * The shape of a call of a function of `Math`.
 * @param node The call.
 * @param math The function.
 * @param focus The use.
 * @returns Its shape.
 */
function callShape(node: Node, math: string, focus: Focus): Shape {
	const passed = field(node, "arguments")?.namedChildren ?? [];
	const shapes = passed.flatMap((each) => (each === null ? [] : [shapeOf(each, focus).text]));
	const ordered = SORTED.has(math) ? shapes.toSorted() : shapes;
	return { text: `${math}(${ordered.join(", ")})`, binding: OPERAND };
}

/**
 * The shape of an operation of the math.
 * @param node The expression.
 * @param focus The use.
 * @returns Its shape, or undefined when the expression is no operation of the math.
 */
function operationShape(node: Node, focus: Focus): Shape | undefined {
	const operator = arithmetic(node);
	if (operator !== undefined) return binaryShape(node, operator, focus);
	if (signed(node)) return signShape(node, focus);
	const math = mathFunction(node);
	return math === undefined ? undefined : callShape(node, math, focus);
}

/**
 * The shape of an operand that is no operation: a number as its value, so
 * `30_000` and `30000` are one, and anything else as `…`.
 * @param node The operand.
 * @returns Its shape.
 */
function operandShape(node: Node): Shape {
	const value = node.type === "number" ? Number(node.text.replaceAll("_", "")) : Number.NaN;
	const text = node.type !== "number" ? OTHER : Number.isNaN(value) ? node.text : String(value);
	return { text, binding: OPERAND };
}

/**
 * The shape of an expression inside the math around a use.
 * @param node The expression.
 * @param focus The use.
 * @returns Its shape.
 */
function shapeOf(node: Node, focus: Focus): Shape {
	if (node.id === focus.node.id) return { text: focus.text, binding: OPERAND };
	const inner = unwrapped(node);
	if (inner.id !== node.id) return shapeOf(inner, focus);
	return operationShape(node, focus) ?? operandShape(node);
}

/**
 * The chain of names a use starts, through `.`.
 * @param name The imported name.
 * @returns The chain's expression.
 */
function chainOf(name: Node): Node {
	let chain = name;
	while (chain.parent?.type === "member_expression" && holds(chain.parent, "object", chain)) {
		chain = chain.parent;
	}
	return chain;
}

/**
 * How the code spells a chain of names through `.`, as a reference spells it.
 * @param chain The chain.
 * @returns The spelling.
 */
function spelled(chain: Node): string {
	const object = chain.type === "member_expression" ? field(chain, "object") : undefined;
	const property = field(chain, "property");
	return object === undefined || property === undefined
		? chain.text
		: `${spelled(object)}.${property.text}`;
}

/**
 * Whether an expression reads on from what it holds: a member of it, or the
 * call of it that passes nothing, as a getter's is.
 * @param parent The expression.
 * @param operand What it holds.
 * @returns True when it does.
 */
function readsOn(parent: Node, operand: Node): boolean {
	if (parent.type === "member_expression") return holds(parent, "object", operand);
	const call = parent.type === "call_expression" && holds(parent, "function", operand);
	return call && field(parent, "arguments")?.namedChildCount === 0;
}

/**
 * What a use reads: its chain of names, with what the code adds to it, a
 * member or the call of a getter that passes nothing.
 * @param chain The chain of names.
 * @returns The expression it reads.
 */
function operandOf(chain: Node): Node {
	let operand = chain;
	while (operand.parent !== null && readsOn(operand.parent, operand)) operand = operand.parent;
	return operand;
}

/**
 * What the code adds to an expression's start, without white space.
 * @param operand The expression.
 * @param start The start it adds to.
 * @returns The text after the start, such as `()` or `.restartBase`.
 */
function added(operand: Node, start: Node): string {
	return operand.text.slice(start.endIndex - operand.startIndex).replaceAll(/\s/gu, "");
}

/**
 * The computation around one expression a use reads, if math holds it.
 * @param symbol The chain of names the use reads.
 * @param operand The expression.
 * @param text What the shape writes for the expression.
 * @returns The computation, or undefined.
 */
function computed(symbol: string, operand: Node, text: string): Computation | undefined {
	const math = mathAround(operand);
	if (math === undefined) return undefined;
	const shape = shapeOf(math, { node: operand, text }).text;
	return { symbol, line: operand.startPosition.row + 1, shape };
}

/** A local variable, and the member of the use it takes, `""` for the whole use. */
type Local = readonly [Node, string];

/**
 * The local variable one entry of an object pattern declares.
 * @param entry The entry.
 * @returns The variable, or none for a default, a rest or a nested pattern.
 */
function patternLocal(entry: Node | null): Local[] {
	if (entry?.type === "shorthand_property_identifier_pattern") return [[entry, `.${entry.text}`]];
	return entry?.type === "pair_pattern" ? pairLocal(entry) : [];
}

/**
 * The local variable a `key: name` entry of an object pattern declares.
 * @param entry The entry.
 * @returns The variable, or none when its value is a pattern or a default.
 */
function pairLocal(entry: Node): Local[] {
	const key = field(entry, "key");
	const value = field(entry, "value");
	return key !== undefined && value?.type === "identifier" ? [[value, `.${key.text}`]] : [];
}

/**
 * The local variables a declaration fills with a use.
 * @param declarator The declaration.
 * @returns The variables.
 */
function localsOf(declarator: Node): Local[] {
	const name = field(declarator, "name");
	if (name?.type === "identifier") return [[name, ""]];
	return name?.type === "object_pattern" ? name.namedChildren.flatMap(patternLocal) : [];
}

/**
 * The declaration whose whole value an expression is.
 * @param operand The expression.
 * @returns The declaration, or undefined.
 */
function declaratorOf(operand: Node): Node | undefined {
	let held = operand;
	while (held.parent !== null && transparent(held.parent)) held = held.parent;
	const declarator = held.parent;
	return declarator?.type === "variable_declarator" && holds(declarator, "value", held)
		? declarator
		: undefined;
}

/**
 * The block, class or file a declaration's variables live in.
 * @param declarator The declaration.
 * @returns The scope.
 */
function scopeOf(declarator: Node): Node | undefined {
	let scope = declarator.parent;
	while (scope !== null && !SCOPES.has(scope.type)) scope = scope.parent;
	return scope ?? undefined;
}

/**
 * The uses of a local variable after its declaration.
 * @param scope Where it lives.
 * @param local The variable.
 * @param after Where its declaration ends.
 * @returns The uses.
 */
function laterUses(scope: Node, local: Node, after: number): Node[] {
	return scope
		.descendantsOfType("identifier")
		.filter((each) => each !== null && each.text === local.text && each.startIndex > after)
		.filter((each) => each !== null);
}

/**
 * The math around each later use of the local variables that hold a use whole.
 * @param symbol The chain of names the use reads.
 * @param operand The expression the use reads.
 * @param text What the shape writes for it.
 * @returns The computations.
 */
function throughLocals(symbol: string, operand: Node, text: string): Computation[] {
	const declarator = declaratorOf(operand);
	const scope = declarator === undefined ? undefined : scopeOf(declarator);
	if (declarator === undefined || scope === undefined) return [];
	return localsOf(declarator).flatMap(([local, member]) =>
		laterUses(scope, local, declarator.endIndex).flatMap((each) => {
			const read = operandOf(chainOf(each));
			return computed(symbol, read, `${text}${member}${added(read, each)}`) ?? [];
		}),
	);
}

/**
 * The math a file writes on the names it imports.
 * @param uses Each use at run time of a name the file imports, by its first name.
 * @returns The computations, each once.
 */
function computationsOf(uses: readonly Node[]): Computation[] {
	const found = new Map<string, Computation>();
	for (const name of uses) {
		const chain = chainOf(name);
		const symbol = spelled(chain);
		const operand = operandOf(chain);
		const text = `@${added(operand, chain)}`;
		const direct = computed(symbol, operand, text);
		const each = direct === undefined ? throughLocals(symbol, operand, text) : [direct];
		for (const computation of each) {
			found.set(`${computation.symbol}\0${computation.line}\0${computation.shape}`, computation);
		}
	}
	return [...found.values()];
}

export { computationsOf };

// The math a Rust file writes on the names other files define (TASK-646.10):
// for each use of a path at run time that arithmetic holds, the shape of that
// math, which module depth compares across the modules that read one export.
//
// The math is the largest arithmetic expression around the use: `+ - * / %`,
// a unary `-`, parentheses, an `as` cast, and the numeric functions Rust
// writes as methods or through a numeric type or `cmp`: `a.min(b)`,
// `u64::pow(a, b)` and `std::cmp::min(a, b)` are one math, `min(a, b)`.
// Equality, comparison, bitwise and logical operators end it, and so does a
// `+` that joins a string. The use is the path and the fields it reads
// through `.`, with the `()` of a call that passes nothing, as a getter's is.
// Inside the shape the use is `@`, a number is its value without its suffix
// or `_`, and every other operand, the caller's own names among them, is
// `…`. The operands of `+`, `*` and of the functions whose arguments can
// change places are sorted, so `a * b` and `b * a` have one shape. A use that
// a `let` holds whole, as `let base = timing::PROCESS.restart_base;` does, is
// followed once: the math around each later use of that variable in its block
// is math on the name.

import type { Node } from "web-tree-sitter";
import type { Computation } from "#runtime/code-facts/operations/facts.ts";

/** The operators of arithmetic, by how tightly each binds. */
const BINDING: ReadonlyMap<string, number> = new Map([
	["+", 1],
	["-", 1],
	["*", 2],
	["/", 2],
	["%", 2],
]);

/** How tightly a sign, and an operand that is no operation, binds. */
const SIGN = 3;
const OPERAND = 4;

/** The operators whose operands can change places. */
const COMMUTATIVE = new Set(["+", "*"]);

/** The numeric functions of the math. */
const MATH = new Set([
	"min",
	"max",
	"clamp",
	"pow",
	"powi",
	"powf",
	"abs",
	"abs_diff",
	"signum",
	"sqrt",
	"hypot",
	"exp",
	"ln",
	"log",
	"log2",
	"log10",
	"floor",
	"ceil",
	"round",
	"trunc",
	"mul_add",
	"div_euclid",
	"rem_euclid",
	"saturating_add",
	"saturating_sub",
	"saturating_mul",
	"saturating_div",
	"saturating_pow",
	"wrapping_add",
	"wrapping_sub",
	"wrapping_mul",
	"wrapping_div",
	"wrapping_pow",
]);

/** The numeric functions whose arguments can change places. */
const SORTED = new Set([
	"min",
	"max",
	"hypot",
	"abs_diff",
	"saturating_add",
	"saturating_mul",
	"wrapping_add",
	"wrapping_mul",
]);

/** The paths a numeric function is called through: a numeric type, or `cmp`. */
const OWNERS = /^(?:[iu](?:8|16|32|64|128|size)|f32|f64|(?:(?:std|core)::)?cmp)$/u;

/** The suffix of a number's type, as `2u64` and `1.5f64` write it. */
const SUFFIX = /(?:[iu](?:8|16|32|64|128|size)|f32|f64)$/u;
/** The suffix of a hexadecimal, octal or binary number, which `f32` cannot end. */
const RADIX_SUFFIX = /[iu](?:8|16|32|64|128|size)$/u;

/** Syntax that holds text, which `+` joins. */
const TEXT = new Set(["string_literal", "raw_string_literal"]);

/** Syntax that holds a number. */
const NUMBERS = new Set(["integer_literal", "float_literal"]);

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

/** A call of a numeric function: its name, and its operands, the receiver of a method first. */
interface MathCall {
	readonly name: string;
	readonly operands: readonly Node[];
}

/** One use of a path at run time, and how the file's references spell it. */
interface PathUse {
	readonly node: Node;
	readonly symbol: string;
}

/**
 * Whether a node holds another in one of its fields.
 * @param node The node.
 * @param name The field.
 * @param child The other node.
 * @returns True when it does.
 */
function holds(node: Node | null, name: string, child: Node): boolean {
	return node?.childForFieldName(name)?.id === child.id;
}

/**
 * The expression inside parentheses or an `as` cast.
 * @param node The expression.
 * @returns The expression it holds, or itself.
 */
function unwrapped(node: Node): Node {
	const inner = wrapped(node);
	return inner === undefined ? node : unwrapped(inner);
}

/**
 * The expression that parentheses or an `as` cast hold.
 * @param node The syntax.
 * @returns The expression, or undefined for other syntax.
 */
function wrapped(node: Node): Node | undefined {
	if (node.type === "parenthesized_expression") return node.namedChildren[0] ?? undefined;
	return node.type === "type_cast_expression"
		? (node.childForFieldName("value") ?? undefined)
		: undefined;
}

/**
 * The numeric function a call runs: a method of a number, or a function
 * through a numeric type or `cmp`.
 * @param call The call.
 * @returns The function and its operands, or undefined for another call.
 */
function mathCall(call: Node): MathCall | undefined {
	const callee = call.type === "call_expression" ? call.childForFieldName("function") : null;
	const passed = call.childForFieldName("arguments")?.namedChildren ?? [];
	if (callee?.type === "field_expression") {
		const name = callee.childForFieldName("field")?.text ?? "";
		const receiver = callee.childForFieldName("value");
		return MATH.has(name) && receiver !== null ? { name, operands: [receiver, ...passed] } : undefined;
	}
	if (callee?.type !== "scoped_identifier") return undefined;
	const name = callee.childForFieldName("name")?.text ?? "";
	const owner = callee.childForFieldName("path")?.text.replaceAll(/\s/gu, "") ?? "";
	return MATH.has(name) && OWNERS.test(owner) ? { name, operands: passed } : undefined;
}

/**
 * The operator of an arithmetic expression on numbers.
 * @param node The expression.
 * @returns The operator, or undefined.
 */
function arithmetic(node: Node): string | undefined {
	if (node.type !== "binary_expression") return undefined;
	const operator = node.childForFieldName("operator")?.type ?? "";
	if (!BINDING.has(operator)) return undefined;
	const joins = sidesOf(node).some((side) => TEXT.has(unwrapped(side).type));
	return operator === "+" && joins ? undefined : operator;
}

/**
 * The two sides of a binary expression.
 * @param node The expression.
 * @returns The left side, then the right, where each is there.
 */
function sidesOf(node: Node): Node[] {
	return [node.childForFieldName("left"), node.childForFieldName("right")].filter(
		(side) => side !== null,
	);
}

/**
 * Whether an expression is a unary minus.
 * @param node The expression.
 * @returns True for `-x`.
 */
function signed(node: Node): boolean {
	return node.type === "unary_expression" && node.child(0)?.type === "-";
}

/**
 * The math that holds an expression, one step out: an operation, the call of
 * a numeric function it is an argument of, or the method it is the receiver of.
 * @param node The expression.
 * @returns The parent that keeps the math going, or undefined where the math ends.
 */
function mathParent(node: Node): Node | undefined {
	const parent = node.parent;
	if (parent === null) return undefined;
	if (wrapped(parent)?.id === node.id || arithmetic(parent) !== undefined || signed(parent)) {
		return parent;
	}
	const call = parent.type === "arguments" ? parent.parent : methodCall(parent, node);
	return call !== null && call !== undefined && mathCall(call) !== undefined ? call : undefined;
}

/**
 * The method call whose receiver an expression is.
 * @param member The `.` that holds the expression.
 * @param receiver The expression.
 * @returns The call, or undefined when the `.` reads a field or the expression is no receiver.
 */
function methodCall(member: Node, receiver: Node): Node | undefined {
	if (member.type !== "field_expression" || !holds(member, "value", receiver)) return undefined;
	const call = member.parent;
	return call?.type === "call_expression" && holds(call, "function", member) ? call : undefined;
}

/**
 * The largest math around an expression.
 * @param node The expression.
 * @returns The math, or undefined when no arithmetic holds the expression.
 */
function mathAround(node: Node): Node | undefined {
	let math: Node | undefined;
	for (let step = mathParent(node); step !== undefined; step = mathParent(step)) {
		if (wrapped(step) === undefined) math = step;
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
	const least = [binding, binding + 1];
	const sides = sidesOf(node).map((side, index) =>
		placed(shapeOf(side, focus), least[index] ?? binding),
	);
	return { text: sides.join(` ${operator} `), binding };
}

/**
 * The shape of a unary minus.
 * @param node The signed expression.
 * @param focus The use.
 * @returns Its shape.
 */
function signShape(node: Node, focus: Focus): Shape {
	const argument = node.namedChildren[0];
	const operand = argument === undefined ? OTHER : placed(shapeOf(argument, focus), SIGN);
	return { text: `-${operand}`, binding: SIGN };
}

/**
 * The shape of a call of a numeric function.
 * @param call The function and its operands.
 * @param focus The use.
 * @returns Its shape.
 */
function callShape(call: MathCall, focus: Focus): Shape {
	const shapes = call.operands.map((each) => shapeOf(each, focus).text);
	const ordered = SORTED.has(call.name) ? shapes.toSorted() : shapes;
	return { text: `${call.name}(${ordered.join(", ")})`, binding: OPERAND };
}

/**
 * The shape of an operand that is no operation: a number as its value, so
 * `30_000` and `30000u64` are one, and anything else as `…`.
 * @param node The operand.
 * @returns Its shape.
 */
function operandShape(node: Node): Shape {
	if (!NUMBERS.has(node.type)) return { text: OTHER, binding: OPERAND };
	const digits = node.text.replaceAll("_", "");
	const suffix = /^0[box]/iu.test(digits) ? RADIX_SUFFIX : SUFFIX;
	const value = Number(digits.replace(suffix, ""));
	return { text: Number.isNaN(value) ? digits : String(value), binding: OPERAND };
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
	const operator = arithmetic(node);
	if (operator !== undefined) return binaryShape(node, operator, focus);
	if (signed(node)) return signShape(node, focus);
	const call = mathCall(node);
	return call === undefined ? operandShape(node) : callShape(call, focus);
}

/**
 * The fields a use reads through `.`, a method call aside, and how the code spells them.
 * @param node The use.
 * @param symbol How the file spells the use.
 * @returns The chain's expression and its spelling.
 */
function chainOf(node: Node, symbol: string): PathUse {
	let chain = { node, symbol };
	for (let parent = node.parent; parent !== null; parent = chain.node.parent) {
		const field = parent.childForFieldName("field")?.text;
		const plain = methodCall(parent, chain.node) === undefined;
		if (parent.type !== "field_expression" || !holds(parent, "value", chain.node) || !plain) break;
		if (field === undefined) break;
		chain = { node: parent, symbol: `${chain.symbol}.${field}` };
	}
	return chain;
}

/**
 * Whether an expression reads on from what it holds: a field of it, or the
 * call of it, or of a method of it that is no numeric function, that passes
 * nothing, as a getter's does.
 * @param parent The expression.
 * @param operand What it holds.
 * @returns True when it does.
 */
function readsOn(parent: Node, operand: Node): boolean {
	if (parent.type === "call_expression") {
		return holds(parent, "function", operand) && emptyCall(parent);
	}
	if (parent.type !== "field_expression" || !holds(parent, "value", operand)) return false;
	const call = methodCall(parent, operand);
	return call === undefined || (emptyCall(call) && mathCall(call) === undefined);
}

/**
 * Whether a call passes nothing.
 * @param call The call.
 * @returns True when it does.
 */
function emptyCall(call: Node): boolean {
	return call.childForFieldName("arguments")?.namedChildCount === 0;
}

/**
 * What a use reads: its chain, with what the code adds to it, a field or the
 * call of a getter that passes nothing.
 * @param chain The chain.
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
 * @returns The text after the start, such as `()` or `.restart_base`.
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

/**
 * The `let` whose whole value an expression is, and the variable it binds.
 * @param operand The expression.
 * @returns The declaration and the variable, or undefined.
 */
function letOf(operand: Node): { readonly declaration: Node; readonly local: Node } | undefined {
	let held = operand;
	while (held.parent !== null && wrapped(held.parent)?.id === held.id) held = held.parent;
	const declaration = held.parent;
	const local = declaration?.childForFieldName("pattern");
	if (declaration?.type !== "let_declaration" || !holds(declaration, "value", held)) {
		return undefined;
	}
	return local?.type === "identifier" ? { declaration, local } : undefined;
}

/**
 * The math around each later use of the variable a `let` fills with a use whole.
 * @param symbol The chain of names the use reads.
 * @param operand The expression the use reads.
 * @param text What the shape writes for it.
 * @returns The computations.
 */
function throughLocal(symbol: string, operand: Node, text: string): Computation[] {
	const bound = letOf(operand);
	const block = bound?.declaration.parent;
	if (bound === undefined || block === null || block === undefined) return [];
	const { declaration, local } = bound;
	return block
		.descendantsOfType("identifier")
		.filter((each) => each.text === local.text && each.startIndex > declaration.endIndex)
		.flatMap((each) => {
			const read = operandOf(chainOf(each, local.text).node);
			return computed(symbol, read, `${text}${added(read, each)}`) ?? [];
		});
}

/**
 * The math a file writes on the paths it uses at run time.
 * @param uses Each use of a path at run time, at its whole path, and how the file spells it.
 * @returns The computations, each once.
 */
function computationsOf(uses: readonly PathUse[]): Computation[] {
	const found = new Map<string, Computation>();
	for (const use of uses) {
		const chain = chainOf(use.node, use.symbol);
		const operand = operandOf(chain.node);
		const text = `@${added(operand, chain.node)}`;
		const direct = computed(chain.symbol, operand, text);
		const each = direct === undefined ? throughLocal(chain.symbol, operand, text) : [direct];
		for (const computation of each) {
			found.set(`${computation.symbol}\0${computation.line}\0${computation.shape}`, computation);
		}
	}
	return [...found.values()];
}

export { computationsOf, type PathUse };

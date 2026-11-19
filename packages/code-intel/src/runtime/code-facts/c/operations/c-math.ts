// How C, C++ and Objective-C write arithmetic (TASK-646.12), for the math a
// file writes around its uses (math-shapes.ts): `binary_expression`, a sign,
// parentheses, the math functions of `<math.h>` and `<algorithm>`, and
// Foundation's `MIN` and `MAX`. A chain of names runs through `.` and `->`, as
// the references spell it (`config.retry`), and a getter is a call that passes
// nothing. A local variable that holds a use whole is a declarator's value:
// `const int base = restart_base;`.

import { declaredBy, type MathSyntax } from "#runtime/code-facts/operations/math-shapes.ts";

/** How C, C++ and Objective-C write arithmetic. */
const C_MATH: MathSyntax = {
	binary: new Set(["binary_expression"]),
	unary: new Set(["unary_expression"]),
	wrappers: new Set(["parenthesized_expression"]),
	call: { type: "call_expression", callee: "function", arguments: "arguments" },
	member: { type: "field_expression", object: "argument", property: "field" },
	math: /^(?:std::)?(?:f?min[fl]?|f?max[fl]?|f?abs|labs|pow|sqrt|ceil|floor|round|exp|log|hypot|clamp)$|^(?:MIN|MAX|ABS)$/u,
	sorted: new Set(
		["min", "max", "fmin", "fmax", "fminf", "fmaxf", "hypot", "MIN", "MAX"].flatMap((name) =>
			/^[a-z]/u.test(name) ? [name, `std::${name}`] : [name],
		),
	),
	numbers: new Set(["number_literal"]),
	texts: new Set(["string_literal", "concatenated_string", "raw_string_literal"]),
	/**
	 * The declarator that fills one name with a whole value.
	 * @param held The value.
	 * @returns The declarator and its name, or undefined.
	 */
	declared: (held) =>
		declaredBy(held, { type: "init_declarator", value: "value", name: "declarator" }),
	scopes: new Set(["compound_statement", "translation_unit"]),
};

export { C_MATH };

// What a server's outline of a file says is declared on a line: code that
// runs, a member that holds data, or a type.
//
// A definition request names the declaration of a name, and for a use through
// a value, such as `entry.name` or `memory.remember()`, that declaration is
// often a member of the value's type: an interface or a type literal, which no
// code runs. The outline, `textDocument/documentSymbol`, gives each declared
// symbol with its kind and what holds it. A declaration is code when the
// symbol the outline declares on that line is a class, a function, a method, a
// constructor, a variable, a constant or an enum, and no interface holds it.
// The definition must start where that symbol's name starts: a member of a
// type literal shares a line with the type alias that holds it, and the
// outline declares the alias and not the member. A property or a field holds
// data. Anything in an interface is a type. A name the outline does not
// declare, such as that member or a local, is unknown.

import { z } from "zod";

/** What a line of a file declares. */
type Declaration = "code" | "data" | "type" | "unknown";

/** One symbol of an outline: its kind, its lines, and the symbols it holds. */
interface OutlineSymbol {
	readonly kind: number;
	/** The first and last line of the whole declaration, from 0. */
	readonly start: number;
	readonly end: number;
	/** Where its name starts: the line and the column, from 0. */
	readonly line: number;
	readonly character: number;
	readonly children: readonly OutlineSymbol[];
}

/** The `SymbolKind` values of the protocol that the classification reads. */
const KIND = {
	class: 5,
	method: 6,
	property: 7,
	field: 8,
	constructor: 9,
	enum: 10,
	interface: 11,
	function: 12,
	variable: 13,
	constant: 14,
	enumMember: 22,
	struct: 23,
	typeParameter: 26,
} as const;

/** The kinds that declare code that runs. */
const CODE_KINDS = new Set<number>([
	KIND.class,
	KIND.method,
	KIND.constructor,
	KIND.enum,
	KIND.function,
	KIND.variable,
	KIND.constant,
	KIND.enumMember,
	KIND.struct,
]);

/** The kinds that declare data. */
const DATA_KINDS = new Set<number>([KIND.property, KIND.field]);

/** The kinds that declare a type, and hold only types. */
const TYPE_KINDS = new Set<number>([KIND.interface, KIND.typeParameter]);

/** A range as the protocol spells it, of which only the lines are read. */
const RangeSchema = z.object({
	start: z.object({ line: z.int().nonnegative(), character: z.int().nonnegative() }),
	end: z.object({ line: z.int().nonnegative() }),
});

/** One `DocumentSymbol` as a server spells it. */
interface SpelledSymbol {
	readonly kind: number;
	readonly range: z.infer<typeof RangeSchema>;
	readonly selectionRange: z.infer<typeof RangeSchema>;
	readonly children?: readonly SpelledSymbol[] | undefined;
}

const DocumentSymbolSchema: z.ZodType<SpelledSymbol> = z.lazy(() =>
	z.object({
		kind: z.int(),
		range: RangeSchema,
		selectionRange: RangeSchema,
		children: z.array(DocumentSymbolSchema).optional(),
	}),
);

/**
 * An outline as the check reads it.
 * @param symbol One symbol as the server spelled it.
 * @returns The symbol.
 */
function outlined(symbol: SpelledSymbol): OutlineSymbol {
	return {
		kind: symbol.kind,
		start: symbol.range.start.line,
		end: symbol.range.end.line,
		line: symbol.selectionRange.start.line,
		character: symbol.selectionRange.start.character,
		children: (symbol.children ?? []).map(outlined),
	};
}

/**
 * The outline of an answer to `textDocument/documentSymbol`. A flat list of
 * `SymbolInformation`, or another shape, gives none.
 * @param result The answer.
 * @returns Its symbols.
 */
function outlineOf(result: unknown): OutlineSymbol[] {
	const parsed = z.array(DocumentSymbolSchema).safeParse(result);
	return parsed.success ? parsed.data.map(outlined) : [];
}

/**
 * The symbols that hold a line, the outermost first.
 * @param symbols An outline.
 * @param line The line, from 0.
 * @returns Each symbol whose declaration spans the line, down to the innermost.
 */
function holdersOf(symbols: readonly OutlineSymbol[], line: number): OutlineSymbol[] {
	const holder = symbols.find((symbol) => symbol.start <= line && line <= symbol.end);
	return holder === undefined ? [] : [holder, ...holdersOf(holder.children, line)];
}

/**
 * Whether a symbol's name starts at a place.
 * @param symbol The symbol.
 * @param at The place: its line from 1, and its column from 0.
 * @param at.line Its line, from 1.
 * @param at.character Its column, from 0.
 * @returns True when the place is where its name starts.
 */
function names(
	symbol: OutlineSymbol,
	at: { readonly line: number; readonly character: number },
): boolean {
	return symbol.line === at.line - 1 && symbol.character === at.character;
}

/**
 * What an outline says the name at a place of its file declares.
 * @param symbols The outline.
 * @param at Where the name starts: its line from 1, and its column from 0.
 * @param at.line Its line, from 1.
 * @param at.character Its column, from 0.
 * @returns Code, data, a type, or unknown when the outline declares no symbol
 * named there, such as a member of a type literal.
 */
function declarationAt(
	symbols: readonly OutlineSymbol[],
	at: { readonly line: number; readonly character: number },
): Declaration {
	const holders = holdersOf(symbols, at.line - 1);
	const innermost = holders.at(-1);
	if (innermost === undefined) return "unknown";
	if (holders.some((holder) => TYPE_KINDS.has(holder.kind))) return "type";
	if (!names(innermost, at)) return "unknown";
	if (CODE_KINDS.has(innermost.kind)) return "code";
	return DATA_KINDS.has(innermost.kind) ? "data" : "unknown";
}

export { type Declaration, type OutlineSymbol, declarationAt, outlineOf };

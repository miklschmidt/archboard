// What a server's semantic tokens say a name in a file is (TASK-646.15).
//
// A server types each name of a range of a file,
// `textDocument/semanticTokens/range`, as
// one of the token types it lists in its legend. The type comes from the
// checker, not from the syntax: TypeScript gives `function` to a constant
// whose value can be called, as `const buttonClass = cva(...)` is, `class` to
// one that can be constructed, and `variable` to any other. The client names
// the token types of the protocol; the server answers with the index of each
// in the legend it returns from `initialize`. A range of one line is all the
// check asks, since typing every name of a whole file costs a server many
// times more. The answer lists the tokens in order, five numbers each: the
// line and the start, each relative to the token before and the first to the
// start of the file, the length, the type and the modifiers.

import { z } from "zod";
import type { Position } from "#runtime/language-servers/processes/server.ts";

/** The token types the protocol defines, which the client says it reads. */
const TOKEN_TYPES = [
	"namespace",
	"type",
	"class",
	"enum",
	"interface",
	"struct",
	"typeParameter",
	"parameter",
	"variable",
	"property",
	"enumMember",
	"event",
	"function",
	"method",
	"macro",
	"keyword",
	"modifier",
	"comment",
	"string",
	"number",
	"regexp",
	"operator",
	"decorator",
] as const;

/** One token: where it stands, as the protocol counts, and its type. */
interface SemanticToken extends Position {
	readonly length: number;
	readonly type: string;
}

/** The legend of an `initialize` answer, and whether the server types a range. */
const InitializeResultSchema = z.object({
	capabilities: z.object({
		semanticTokensProvider: z
			.object({
				legend: z.object({ tokenTypes: z.array(z.string()) }),
				range: z.union([z.boolean(), z.object({})]).optional(),
			})
			.optional(),
	}),
});

/** How many numbers spell one token. */
const TOKEN_WIDTH = 5;

/** One count of a token. */
const Count = z.int().nonnegative();

/** An answer to `textDocument/semanticTokens/range`, as the five numbers of each token. */
const SemanticTokensSchema = z
	.object({ data: z.array(Count) })
	.transform(({ data }) =>
		Array.from({ length: Math.floor(data.length / TOKEN_WIDTH) }, (_, index) =>
			data.slice(index * TOKEN_WIDTH, (index + 1) * TOKEN_WIDTH),
		),
	)
	.pipe(z.array(z.tuple([Count, Count, Count, Count, Count])));

/**
 * The token types a server answers a range with, by index, from its
 * `initialize` answer. A server that types only whole files is asked nothing.
 * @param result The answer.
 * @returns The types, none when the server gives no semantic tokens of a range.
 */
function legendOf(result: unknown): readonly string[] {
	const provider =
		InitializeResultSchema.safeParse(result).data?.capabilities.semanticTokensProvider;
	const range = provider?.range !== undefined && provider.range !== false;
	return range ? provider.legend.tokenTypes : [];
}

/**
 * The tokens of an answer to `textDocument/semanticTokens/range`. An answer of
 * another shape gives none.
 * @param result The answer.
 * @param legend The server's token types, by index.
 * @returns Each token, in order.
 */
function tokensOf(result: unknown, legend: readonly string[]): SemanticToken[] {
	const parsed = SemanticTokensSchema.safeParse(result);
	if (!parsed.success) return [];
	const tokens: SemanticToken[] = [];
	let line = 0;
	let character = 0;
	for (const [lines, start, length, type] of parsed.data) {
		character = lines === 0 ? character + start : start;
		line += lines;
		tokens.push({ line, character, length, type: legend[type] ?? "unknown" });
	}
	return tokens;
}

/**
 * The type of the token at a position.
 * @param tokens A file's tokens.
 * @param position The position.
 * @returns The type, or undefined when no token stands there.
 */
function tokenTypeAt(tokens: readonly SemanticToken[], position: Position): string | undefined {
	return tokens.find(
		(token) =>
			token.line === position.line &&
			token.character <= position.character &&
			position.character < token.character + token.length,
	)?.type;
}

export { type SemanticToken, TOKEN_TYPES, legendOf, tokenTypeAt, tokensOf };

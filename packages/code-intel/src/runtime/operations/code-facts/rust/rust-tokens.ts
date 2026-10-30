// The names a Rust macro is called with (ADR 0046, TASK-540). The grammar
// reads the input of a macro call, `vec![a(), b::c()]` or
// `assert_eq!(total(ledger), 3)`, as a tree of tokens and not as code, so the
// names in it are read here from the tokens: a path is a name with `::` and
// names after it, a call is a path followed by parentheses or by `!`, and a
// member is a name right after a `.`, spelled with the `.` alone, as the
// adapter spells a member reached through a value. Any other name is a use as
// a value. A keyword is no name, and neither is a name the macro's own
// pattern binds, which the tokens cannot tell from a use: such a name stays a
// use that leads nowhere unless something of its name is in scope.

import type { Node } from "web-tree-sitter";

/** One name a macro is called with. */
interface TokenUse {
	/** Its path, from its first name. */
	readonly path: readonly string[];
	/** The token it starts at. */
	readonly node: Node;
	/** Reached with `.` from a value. */
	readonly member: boolean;
	/** Called, as a function or a macro. */
	readonly called: boolean;
}

/** The words of Rust that the grammar leaves as names among a macro's tokens. */
const KEYWORDS = new Set(
	(
		"as async await break const continue dyn else enum extern false fn for if impl in let loop " +
		"match mod move mut pub ref return static struct trait true type unsafe use where while yield"
	).split(" "),
);

/** The tokens that start a path. */
const HEADS = new Set(["identifier", "crate", "self", "super"]);

/**
 * Whether a token is a name that starts or continues a path.
 * @param node The token.
 * @returns True when it is.
 */
function isName(node: Node | undefined): node is Node {
	return node !== undefined && HEADS.has(node.type) && !KEYWORDS.has(node.text);
}

/**
 * Whether a token calls the path before it: a `!` or a list in parentheses.
 * @param next The token after the path.
 * @returns True when it does.
 */
function calls(next: Node | undefined): boolean {
	return next?.type === "!" || (next?.type === "token_tree" && next.firstChild?.type === "(");
}

/**
 * The path a name starts among the tokens: the name, and each `::` and name after it.
 * @param tokens The tokens of one level.
 * @param index Where the name is.
 * @returns The path's names, and the index of its last name.
 */
function pathAt(tokens: readonly Node[], index: number): { path: string[]; end: number } {
	const path = [tokens[index]?.text ?? ""];
	let end = index;
	for (
		let name = tokens[end + 2];
		tokens[end + 1]?.type === "::" && isName(name);
		name = tokens[end + 2]
	) {
		path.push(name.text);
		end += 2;
	}
	return { path, end };
}

/**
 * The names of one level of a macro's tokens, and of the levels inside it.
 * @param tree The tokens.
 * @returns Each name, in order.
 */
function tokenUses(tree: Node): TokenUse[] {
	const tokens = tree.children;
	const uses: TokenUse[] = [];
	tokens.forEach((token, index) => {
		const before = tokens[index - 1]?.type;
		if (token.type === "token_tree") uses.push(...tokenUses(token));
		if (!isName(token) || before === "::") return;
		const { path, end } = pathAt(tokens, index);
		uses.push({ path, node: token, member: before === ".", called: calls(tokens[end + 1]) });
	});
	return uses;
}

export { type TokenUse, tokenUses };

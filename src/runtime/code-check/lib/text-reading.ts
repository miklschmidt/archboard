// The text reading: the adapter for every file that no grammar or parser
// reads (ADR 0046).
//
// A file read as text tells the check one thing about a symbol: whether its
// last name stands in the file as a whole word. `post` stands for
// `Ledger.post`, `checkout` for `Deployment/checkout`, and `api` for
// `module.checkout.aws_lambda_function.api`, because the address of a
// declaration never stands in a file as one word. Text cannot tell a
// definition from a reference, a comment or a string, so a name anywhere in
// the file holds. Code facts replace this reading for each language that gets
// an adapter (TASK-367.06 on), and it stays for every other file.

/** What separates the names of a qualified symbol, in the languages and tools a board binds. */
const NAME_SEPARATOR = /::|[./#]/u;

/** A character that continues an identifier, so a name beside one is part of a longer word. */
const WORD_CHARACTER = "[\\p{L}\\p{N}_$]";

/**
 * The last name of a symbol: what follows its last separator once an index or
 * a call is gone, such as `web` for `aws_instance.web[0]` and `www` for
 * `aws_route53_record.www["example.com"]`, whose key holds a separator.
 * @param symbol The symbol as a binding or an anchor spells it.
 * @returns Its last name, or the empty string when it has none.
 */
function lastName(symbol: string): string {
	const names = symbol
		.replace(/[[(].*$/u, "")
		.split(NAME_SEPARATOR)
		.filter((name) => name.trim() !== "");
	return (names.at(-1) ?? "").trim();
}

/**
 * The pattern that finds a name as a whole word.
 * @param name The name.
 * @returns A pattern that matches it with no identifier character on either side.
 */
function wholeWord(name: string): RegExp {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	return new RegExp(`(?<!${WORD_CHARACTER})${escaped}(?!${WORD_CHARACTER})`, "u");
}

/** A test of one symbol against the text of files. */
interface TextTest {
	/** The name the test looks for. */
	readonly name: string;
	/**
	 * Whether a file holds the name as a whole word.
	 * @param text The file's text.
	 * @returns True when it does.
	 */
	holds(text: string): boolean;
}

/**
 * The text test of one symbol.
 * @param symbol The symbol as a binding or an anchor spells it.
 * @returns The test, which no text passes when the symbol has no last name.
 */
function textTest(symbol: string): TextTest {
	const name = lastName(symbol);
	const pattern = name === "" ? undefined : wholeWord(name);
	return {
		name,
		/**
		 * Whether a file holds the name as a whole word.
		 * @param text The file's text.
		 * @returns True when it does.
		 */
		holds: (text) => pattern?.test(text) === true,
	};
}

export { type TextTest, textTest };

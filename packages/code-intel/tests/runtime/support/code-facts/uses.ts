// How one file uses each name at run time, for the tests of each adapter's
// reading of a use as a value (runs.ts).

import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

/**
 * Whether each name one file uses at run time is a use as a value, read from
 * a checkout that holds that file alone.
 * @param file The file's path, whose extension picks the adapter.
 * @param lines The file's lines.
 * @returns Each spelling the file uses at run time, true for a use as a value.
 */
async function asValueOf(file: string, lines: readonly string[]): Promise<Record<string, boolean>> {
	const own = fixtureCheckout({ [file]: `${lines.join("\n")}\n` });
	try {
		const read = await createCodeFacts().pass(new AbortController().signal).read(own, file);
		if (read === undefined || read.adapter === "text") throw new Error(`${file} was not parsed`);
		const used = read.references.filter((each) => each.via === "code" && !each.typeOnly);
		return Object.fromEntries(used.map((each) => [each.symbol, each.asValue === true]));
	} finally {
		own.remove();
	}
}

export { asValueOf };

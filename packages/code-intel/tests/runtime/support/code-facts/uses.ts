// How one file uses each name at run time, for the tests of each adapter's
// reading of a use as a value (runs.ts) and of a call's timing (call-timing.ts).

import type { SyntaxFacts } from "#runtime/code-facts/operations/facts.ts";
import { createCodeFacts } from "#runtime/code-facts/services/reader.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

/**
 * Whether each name one file uses at run time is a use as a value, read from
 * a checkout that holds that file alone.
 * @param file The file's path, whose extension picks the adapter.
 * @param lines The file's lines.
 * @returns Each spelling the file uses at run time, true for a use as a value.
 */
async function asValueOf(file: string, lines: readonly string[]): Promise<Record<string, boolean>> {
	const read = await factsOf(file, lines);
	const used = read.references.filter((each) => each.via === "code" && !each.typeOnly);
	return Object.fromEntries(used.map((each) => [each.symbol, each.asValue === true]));
}

/**
 * The code facts of one file, read from a checkout that holds that file alone.
 * @param file The file's path, whose extension picks the adapter.
 * @param lines The file's lines.
 * @returns Its facts.
 */
async function factsOf(file: string, lines: readonly string[]): Promise<SyntaxFacts> {
	const own = fixtureCheckout({ [file]: `${lines.join("\n")}\n` });
	try {
		const read = await createCodeFacts().pass(new AbortController().signal).read(own, file);
		if (read === undefined || read.adapter === "text") throw new Error(`${file} was not parsed`);
		return read;
	} finally {
		own.remove();
	}
}

/**
 * The timing of each call site one file writes, by the spelling it calls.
 * @param file The file's path, whose extension picks the adapter.
 * @param lines The file's lines.
 * @returns Each spelling and the timings of its sites, joined by spaces where they differ.
 */
async function timingsOf(file: string, lines: readonly string[]): Promise<Record<string, string>> {
	const timings: Record<string, string> = {};
	for (const { symbol, timing } of (await factsOf(file, lines)).references) {
		if (timing !== undefined) timings[symbol] = [timings[symbol], timing].filter(Boolean).join(" ");
	}
	return timings;
}

export { asValueOf, factsOf, timingsOf };

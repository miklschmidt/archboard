// The line where a binding's symbol is defined, for "open the code" (ADR 0046).
//
// The opener opens the bound file, and where code facts find the symbol in it,
// at the line that defines it. This is the one reader of a binding's `symbol`
// that has no checkout-wide view: it reads the one bound file, as the code
// check does for a binding, and never follows a re-export to another file. A
// directory has no line, so it opens as it always did. So does a file that code
// facts read as text, which gives no line, and a symbol the file does not
// define.

import path from "node:path";

import type { CodeBinding } from "@archboard/code-binding/bindings";
import type { LocalCodeTarget } from "@archboard/code-binding/resolution";
import type { FileFacts } from "#runtime/operations/code-facts/facts.ts";
import { findSymbol } from "#runtime/operations/code-facts/lookup.ts";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";

/** One cache for the opener: a file is parsed again only when its bytes change. */
const codeFacts = createCodeFacts();

/**
 * The code facts of the one file a target names, if they can be read.
 * @param target Where the binding resolved on this machine.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The facts, or undefined for a file that went away or cannot be read since it resolved.
 * @throws {unknown} The signal's reason, when it ends the reading.
 */
async function factsOfFile(
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<FileFacts | undefined> {
	// The target is the real file, so the checkout lists exactly that file, which stays
	// inside the checkout because the resolver refused any other.
	const file = path.relative(target.root, target.target).split(path.sep).join("/");
	try {
		return await codeFacts.pass(signal).read({ root: target.root, files: new Set([file]) }, file);
	} catch (error) {
		if (signal.aborted) throw error;
		return undefined;
	}
}

/**
 * The line where a binding's symbol is defined in the file it names.
 * @param binding The binding, with the symbol to find.
 * @param target Where the binding resolved on this machine.
 * @param signal Ends the reading when the request is abandoned.
 * @returns The first line of the definition, or undefined when the binding has no
 * symbol, names a directory, or code facts do not find the symbol defined there.
 * @throws {unknown} The signal's reason, when it ends the reading.
 */
async function symbolLine(
	binding: CodeBinding,
	target: LocalCodeTarget,
	signal: AbortSignal,
): Promise<number | undefined> {
	if (binding.symbol === undefined || target.kind !== "file") {
		return undefined;
	}
	const facts = await factsOfFile(target, signal);
	const found = facts && findSymbol(facts, binding.symbol, "definition");
	return found?.status === "found" ? found.line : undefined;
}

export { symbolLine };

// The warnings about a binding or an anchor that the code no longer holds
// (ADR 0046): a path or a symbol that is missing. Each says what is missing,
// so the check is sure of it, and what change clears it. A file a grammar reads
// lacks a definition or a use; a file read as text lacks the symbol's last
// name as a whole word, and the message says which.

import type {
	AnchorClaim,
	BindingClaim,
	ClaimSite,
} from "#runtime/operations/code-check/claims/claims.ts";
import type { Held } from "#runtime/operations/code-check/claims/symbols.ts";
import { lastName } from "#runtime/operations/code-facts/text-reading.ts";
import type { CodeFinding } from "#shared/protocol/code-check.ts";
import { describeSubject } from "@archboard/board/policy";

/**
 * A warning about one claim.
 * @param site Where the claim sits.
 * @param code The finding's code.
 * @param message What is wrong and what to do.
 * @returns The finding.
 */
function warning(site: ClaimSite, code: string, message: string): CodeFinding {
	return { ...site, severity: "warning", code, message };
}

/** What a missing symbol's message says the path lacks, by what it binds and how it was read. */
const LACKS = {
	file: { code: "the file does not define it", text: "the file does not hold the name" },
	directory: {
		code: "no file below the directory defines it",
		text: "no file below the directory holds the name",
	},
	anchor: { code: "the file neither defines nor uses it", text: "the file does not hold the name" },
} as const;

/**
 * What a path lacks of a symbol, in the words of how it was read: a file a
 * grammar reads lacks a definition or a use, and a file read as text lacks
 * the symbol's last name.
 * @param lacks The phrases for the claim.
 * @param held Where the search looked.
 * @param symbol The symbol.
 * @returns The phrase.
 */
function lacking(lacks: (typeof LACKS)[keyof typeof LACKS], held: Held, symbol: string): string {
	const asText = held.status === "absent" && held.asText === true;
	return asText ? `${lacks.text} ${JSON.stringify(lastName(symbol))}` : lacks.code;
}

/**
 * The warning for a bound path that a named draft names and the checkout lacks.
 * @param claim The binding.
 * @param where The code that was read: the checkout, or a ref in it.
 * @returns The finding.
 */
function bindingPathMissing(claim: BindingClaim, where: string): CodeFinding {
	const { binding, site } = claim;
	return warning(
		site,
		"BINDING_PATH_MISSING",
		`Node ${JSON.stringify(site.subject.name)} is bound to ${JSON.stringify(binding.path)} in ` +
			`${JSON.stringify(binding.repo)} on the named draft, and there is no such file or ` +
			`directory in ${where}. Naming a draft says that its code ` +
			"is built now: bind the part to where its code lives, write that code, or leave --state " +
			"out until it is built.",
	);
}

/**
 * The warning for a bound symbol that the bound file or directory does not define.
 * @param claim The binding.
 * @param symbol Its symbol.
 * @param kind Whether it binds a file or a directory.
 * @param held Where the search looked.
 * @returns The finding.
 */
function bindingSymbolMissing(
	claim: BindingClaim,
	symbol: string,
	kind: "file" | "directory",
	held: Held,
): CodeFinding {
	const { binding, site } = claim;
	return warning(
		site,
		"BINDING_SYMBOL_MISSING",
		`Node ${JSON.stringify(site.subject.name)} is bound to ${JSON.stringify(symbol)} in ` +
			`${JSON.stringify(binding.path)}, and ${lacking(LACKS[kind], held, symbol)}. Bind the part ` +
			"to the definition it stands for now, or leave out the symbol to bind the whole file or " +
			"directory.",
	);
}

/**
 * The warning for an anchor whose file is not in the checkout.
 * @param claim The anchor.
 * @param where The code that was read: the checkout, or a ref in it.
 * @returns The finding.
 */
function anchorPathMissing(claim: AnchorClaim, where: string): CodeFinding {
	const { anchor, site } = claim;
	return warning(
		site,
		"ANCHOR_PATH_MISSING",
		`The anchor of ${describeSubject(site.subject)} names ${JSON.stringify(anchor.path)} in ` +
			`${JSON.stringify(anchor.repo)}, and there is no such file in ${where}. Cite the file that holds the code now, or remove the anchor if ` +
			"the code that proved it is gone.",
	);
}

/**
 * The warning for an anchor whose file neither defines nor uses its symbol.
 * @param claim The anchor.
 * @param held Where the search looked.
 * @returns The finding.
 */
function anchorSymbolMissing(claim: AnchorClaim, held: Held): CodeFinding {
	const { anchor, site } = claim;
	return warning(
		site,
		"ANCHOR_SYMBOL_MISSING",
		`The anchor of ${describeSubject(site.subject)} names ${JSON.stringify(anchor.symbol)} in ` +
			`${JSON.stringify(anchor.path)}, and ${lacking(LACKS.anchor, held, anchor.symbol)}. Cite ` +
			"the symbol that proves it now, or change the board to what the code does.",
	);
}

export { anchorPathMissing, anchorSymbolMissing, bindingPathMissing, bindingSymbolMissing };

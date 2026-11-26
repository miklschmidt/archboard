// The warnings about a binding or an anchor that the code no longer holds
// (ADR 0046): a path or a symbol that is missing. Each says what is missing,
// so the check is sure of it, and what change clears it. A file a grammar reads
// lacks a definition or a use; a file read as text lacks the symbol's last
// name as a whole word, and the message says which.

import type {
	AnchorClaim,
	BindingClaim,
	Claim,
	ClaimSite,
} from "#runtime/code-check/claims/operations/claims.ts";
import type { Held } from "#runtime/code-check/claims/operations/symbols.ts";
import { lastName } from "#runtime/code-facts/operations/text-reading.ts";
import type { CodeCheckSkip, CodeEvidence, CodeFinding } from "#shared/protocol/code-check.ts";
import { describeSubject } from "@archboard/model/policy";

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
	if (held.status === "absent" && held.ambiguous === true) {
		return "multiple blocks of that type share that name in the same resource, so the symbol is ambiguous";
	}
	const asText = held.status === "absent" && held.asText === true;
	return asText ? `${lacks.text} ${JSON.stringify(lastName(symbol))}` : lacks.code;
}

/**
 * The warning for a bound path that the selected source lacks.
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
			`${JSON.stringify(binding.repo)}. There is no such file or directory in ${where}. ` +
			"Correct the binding or create the missing source before accepting this state.",
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
			"the symbol that proves it now, or change the model to what the code does.",
	);
}

/**
 * Format the skip for a symbol found only inside unparsed or unfollowed source lines.
 * @param base The shared skip site and repository.
 * @param held The unparsed result.
 * @returns The skip naming the file and line range.
 */
function unparsedSourceSkip(
	base: Pick<CodeCheckSkip, "model" | "variant" | "subject" | "repo">,
	held: Extract<Held, { status: "unparsed" }>,
): CodeCheckSkip {
	const { path: file, start, end } = held.unparsed.source ?? { path: held.file, ...held.unparsed };
	const detail = `${file}:${start === end ? start : `${start}-${end}`}`;
	const reason = held.unparsed.under === undefined ? "symbol-unparsed" : "expression-not-followed";
	return { ...base, reason, detail };
}

/**
 * The skip of a symbol found only in code that did not parse or below an
 * expression it cannot follow, or of an address in a module it does not read.
 * @param claim The claim.
 * @param held Where it was found.
 * @returns The skip, which names the file and its lines, plan path, or module call.
 */
function unparsedSkip(
	claim: Claim,
	held: Extract<Held, { status: "unparsed" | "module-unread" | "unfollowed" }>,
): CodeCheckSkip {
	const repo = claim.kind === "binding" ? claim.binding.repo : claim.anchor.repo;
	const base = {
		model: claim.site.model,
		variant: claim.site.variant,
		subject: claim.site.subject,
		repo,
	};
	if (held.status === "module-unread") {
		return { ...base, reason: "module-not-read", detail: held.module };
	}
	if (held.status === "unfollowed") {
		return { ...base, reason: "expression-not-followed", detail: held.detail };
	}
	return unparsedSourceSkip(base, held);
}

/** Where a cited symbol is defined for mismatch diagnostics. */
interface MismatchSite {
	readonly path: string;
	readonly definition: { readonly start: number; readonly declaration?: boolean };
}

/**
 * The warning for an anchor whose symbol is defined outside both ends.
 * @param claim The anchor.
 * @param site Where the symbol is defined.
 * @param use The anchored use, if the file uses the symbol.
 * @returns The finding.
 */
function anchorMismatch(
	claim: AnchorClaim,
	site: MismatchSite,
	use: CodeEvidence | undefined,
): CodeFinding {
	const ends = claim.ends.map((end) => JSON.stringify(end.name)).join(" nor ");
	const candidate = site.definition.declaration === true;
	return {
		...claim.site,
		severity: candidate ? "information" : "warning",
		code: "ANCHOR_MISMATCH",
		message:
			`The anchor of ${describeSubject(claim.site.subject)} names ${JSON.stringify(claim.anchor.symbol)}, ` +
			`which ${site.path}:${site.definition.start} ${candidate ? "declares" : "defines"}, and that ` +
			`${candidate ? "declaration" : "definition"} is in the bound code of neither ${ends}, nor of ` +
			"a part inside one. Cite the symbol in the code of an end that proves the relationship, " +
			"bind the part whose code it is, or change the relationship to what the code does.",
		...(use === undefined
			? {}
			: { evidence: [{ ...use, resolution: candidate ? "candidate" : use.resolution }] }),
	};
}

/**
 * The warning for an anchor citing the enclosing Terraform resource of an end
 * that binds a nested block of that resource (ADR 0046, TASK-682).
 * @param claim The anchor.
 * @param site Where the enclosing resource is defined.
 * @param use The anchored use, if any.
 * @returns The finding.
 */
function enclosingResourceMismatch(
	claim: AnchorClaim,
	site: MismatchSite,
	use: CodeEvidence | undefined,
): CodeFinding {
	return {
		...claim.site,
		severity: "warning",
		code: "ANCHOR_MISMATCH",
		message:
			`The anchor of ${describeSubject(claim.site.subject)} names ${JSON.stringify(claim.anchor.symbol)}, ` +
			`which ${site.path}:${site.definition.start} defines as the enclosing Terraform resource of a ` +
			"nested-block end. A whole-resource anchor cannot stand for a relationship involving a nested " +
			"block; cite the nested block or a 1-hop sibling block that links the ends instead.",
		...(use === undefined ? {} : { evidence: [use] }),
	};
}

export {
	anchorMismatch,
	anchorPathMissing,
	anchorSymbolMissing,
	bindingPathMissing,
	bindingSymbolMissing,
	enclosingResourceMismatch,
	unparsedSkip,
};

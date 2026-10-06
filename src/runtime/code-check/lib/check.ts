// The code pass: every claim a board makes about code, held to the code facts
// of the files on disk (ADR 0046).
//
// A bound symbol must be a definition in the bound file or directory, and an
// anchor's symbol a definition or a use in its file; a file no grammar reads
// holds a symbol wherever its last name stands. A missing path or symbol says
// that something is missing, so the check is sure of it, the code contradicts
// the board, and a right change clears it: each one is a warning, and the only
// finding about its binding or anchor. An anchor that holds, and whose symbol
// is defined outside the bound code of both ends, is `ANCHOR_MISMATCH`
// (support.ts), and so is one whose uses are all of an evidence kind its
// relationship kind does not accept (anchor-kind.ts). Then each board's
// relationships are held to the evidence between its bound parts
// (relationships.ts), and each container's interface to what the module it
// binds exposes (interfaces.ts). What the pass cannot read is listed with the
// reason, and never reported as a finding: a symbol found only in code that
// did not parse too.

import path from "node:path";
import {
	otherRefOf,
	readCheckouts,
	readableOf,
	type Checkout,
	type ReadCheckout,
	type Readable,
} from "@/runtime/code-check/lib/checkouts";
import {
	claimsOf,
	type AnchorClaim,
	type BindingClaim,
	type Claim,
	type ClaimSite,
} from "@/runtime/code-check/lib/claims";
import { judgeAnchorKind } from "@/runtime/code-check/lib/anchor-kind";
import type { BoardToCheck } from "@/runtime/code-check/lib/boards";
import { evidenceOf, lineagesOf } from "@/runtime/code-check/lib/evidence";
import { judgeInterfaces, type ModuleReadings } from "@/runtime/code-check/lib/interfaces";
import { partCodesOf } from "@/runtime/code-check/lib/part-code";
import { judgeRelationships } from "@/runtime/code-check/lib/relationships";
import { judgeSupport } from "@/runtime/code-check/lib/support";
import { heldInFiles, type Held } from "@/runtime/code-check/lib/symbols";
import { createCodeFacts, lastName, type Accept, type FactsPass } from "@/runtime/code-facts/index";
import {
	resolveLocalCodeTarget,
	snapshotCheckoutAccess,
	type CheckoutSnapshot,
	type LocalCodeTarget,
} from "@/runtime/code-target/index";
import type { CodeCheckSkip, CodeFinding } from "@/shared/code-check/index";
import type { CodeBinding } from "@/shared/code-target/index";
import { describeSubject } from "@/shared/semantic-policy/index";

/** What one pass found and what it did not read. */
interface CodeCheckOutcome {
	readonly findings: CodeFinding[];
	readonly skipped: CodeCheckSkip[];
}

/** The code facts of every pass, kept in the server's memory by file content. */
const codeFacts = createCodeFacts();

/** A checkout a claim reads, with the repository it is. */
type ClaimCheckout = ReadCheckout & { readonly repo: string };

/** What judging one claim needs. */
interface Pass {
	readonly snapshot: CheckoutSnapshot;
	readonly checkouts: ReadonlyMap<string, Checkout>;
	readonly facts: FactsPass;
	/** The kinds of file read as text in each repository. */
	readonly readAsText: Map<string, Set<string>>;
	/** What each module a container binds exposes, read once for every board. */
	readonly modules: ModuleReadings;
	readonly outcome: CodeCheckOutcome;
}

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

/**
 * A skipped subject, at its board and variant.
 * @param site Where the claim sits.
 * @param skip Why it was skipped, and what else the reason says.
 * @returns The skip.
 */
function skipped(
	site: ClaimSite,
	skip: Omit<CodeCheckSkip, "board" | "variant" | "subject">,
): CodeCheckSkip {
	return { board: site.board, variant: site.variant, subject: site.subject, ...skip };
}

/**
 * The repository a claim names.
 * @param claim The claim.
 * @returns Its repository.
 */
function repoOf(claim: Claim): string {
	return claim.kind === "binding" ? claim.binding.repo : claim.anchor.repo;
}

/**
 * The ref a claim's code is pinned to, when its checkout has another one out:
 * a binding's own pin, or the pin of a part at an anchor's end that binds the
 * anchor's repository, since the files on disk are then not that ref's.
 * @param claim The claim.
 * @param snapshot The registered checkouts.
 * @returns The two refs, and for an anchor the end that is pinned, or undefined.
 */
function pinOf(claim: Claim, snapshot: CheckoutSnapshot): Pick<CodeCheckSkip, "ref" | "detail"> {
	if (claim.kind === "binding") return { ref: otherRefOf(claim.binding, snapshot) };
	const pins = claim.ends.flatMap((end) => {
		const ref =
			end.binding?.repo === claim.anchor.repo ? otherRefOf(end.binding, snapshot) : undefined;
		return ref === undefined ? [] : [{ ref, detail: `${end.name} is pinned to ${ref.named}` }];
	});
	return pins[0] ?? {};
}

/**
 * The checkout a claim reads, or the skip that says why it reads none. A
 * checkout that is unavailable is said once for the whole checkout, so its
 * claims add nothing.
 * @param claim The claim.
 * @param pass The pass.
 * @returns The checkout's root and files, or undefined when the claim is not read.
 */
function checkoutFor(claim: Claim, pass: Pass): ClaimCheckout | undefined {
	const repo = repoOf(claim);
	const checkout = pass.checkouts.get(repo);
	if (checkout?.status === "unregistered") {
		pass.outcome.skipped.push(skipped(claim.site, { reason: "repository-unregistered", repo }));
	}
	if (checkout?.status !== "read") return undefined;
	const pin = pinOf(claim, pass.snapshot);
	if (pin.ref === undefined) return { ...checkout, repo };
	pass.outcome.skipped.push(skipped(claim.site, { reason: "ref-not-checked-out", repo, ...pin }));
	return undefined;
}

/**
 * The skip of a path the pass may not read: one Git ignores, or one never read.
 * @param claim The claim.
 * @param readable Why the path cannot be read.
 * @returns The skip.
 */
function unreadable(claim: Claim, readable: Exclude<Readable, { status: "files" }>): CodeCheckSkip {
	const reason = readable.status === "ignored" ? "path-ignored" : "path-never-read";
	const at = claim.kind === "binding" ? claim.binding.path : claim.anchor.path;
	return skipped(claim.site, { reason, repo: repoOf(claim), detail: at });
}

/**
 * The skip of a symbol found only in code that did not parse.
 * @param claim The claim.
 * @param held Where it was found.
 * @returns The skip, which names the file and its lines.
 */
function unparsedSkip(claim: Claim, held: Extract<Held, { status: "unparsed" }>): CodeCheckSkip {
	const { start, end } = held.unparsed;
	const detail = `${held.file}:${start === end ? start : `${start}-${end}`}`;
	return skipped(claim.site, { reason: "symbol-unparsed", repo: repoOf(claim), detail });
}

/**
 * Where the files of a path hold a symbol, or why they cannot be read: a path
 * Git ignores, one never read, or a symbol found only in code that did not
 * parse, each a skip.
 * @param claim The claim, for its skip.
 * @param readable What the pass may read of the path.
 * @param checkout The checkout it is in.
 * @param symbol The symbol.
 * @param pass The pass.
 * @returns Where the files hold it, or undefined when it is skipped.
 */
async function findSymbolOf(
	claim: Claim,
	readable: Readable,
	checkout: ClaimCheckout,
	symbol: string,
	pass: Pass,
): Promise<Held | undefined> {
	if (readable.status !== "files") {
		pass.outcome.skipped.push(unreadable(claim, readable));
		return undefined;
	}
	const accept: Accept = claim.kind === "binding" ? "definition" : "definition-or-reference";
	const held = await heldInFiles(searchOf(checkout, pass), readable.files, symbol, accept);
	if (held.status !== "unparsed") return held;
	pass.outcome.skipped.push(unparsedSkip(claim, held));
	return undefined;
}

/**
 * How one claim searches its checkout, noting each file read as text.
 * @param checkout The checkout.
 * @param pass The pass.
 * @returns The search.
 */
function searchOf(checkout: ClaimCheckout, pass: Pass) {
	return {
		facts: pass.facts,
		checkout,
		/**
		 * Note a file read as text, by its kind.
		 * @param file The file.
		 */
		readAsText: (file: string) => {
			const kinds = pass.readAsText.get(checkout.repo) ?? new Set<string>();
			kinds.add(path.posix.extname(file) || path.posix.basename(file));
			pass.readAsText.set(checkout.repo, kinds);
		},
	};
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
 * @param root The checkout.
 * @returns The finding.
 */
function bindingPathMissing(claim: BindingClaim, root: string): CodeFinding {
	const { binding, site } = claim;
	return warning(
		site,
		"BINDING_PATH_MISSING",
		`Node ${JSON.stringify(site.subject.name)} is bound to ${JSON.stringify(binding.path)} in ` +
			`${JSON.stringify(binding.repo)} on the named draft, and there is no such file or ` +
			`directory in the checkout at ${JSON.stringify(root)}. Naming a draft says that its code ` +
			"is built now: bind the part to where its code lives, write that code, or leave --variant " +
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
 * What the pass reads of a binding, or nothing when its path is not in the
 * checkout: on a named draft that is a finding, and on the current variant the
 * plain check's to report.
 * @param claim The binding.
 * @param checkout Its checkout.
 * @param pass The pass.
 * @returns The resolved path, or undefined.
 */
function boundTarget(claim: BindingClaim, checkout: ClaimCheckout, pass: Pass) {
	const target = resolveLocalCodeTarget(claim.binding, pass.snapshot);
	if (target.ok) return target;
	if (claim.path) pass.outcome.findings.push(bindingPathMissing(claim, checkout.root));
	return undefined;
}

/**
 * Judge a part's binding: on a named draft that its path is in the checkout,
 * and that the bound file or directory defines its symbol.
 * @param claim The binding.
 * @param pass The pass.
 */
async function judgeBinding(claim: BindingClaim, pass: Pass): Promise<void> {
	const checkout = checkoutFor(claim, pass);
	const target = checkout === undefined ? undefined : boundTarget(claim, checkout, pass);
	if (checkout !== undefined && target !== undefined) {
		await judgeBoundSymbol(claim, target, checkout, pass);
	}
}

/**
 * Judge the symbol of a binding whose path is in the checkout.
 * @param claim The binding.
 * @param target Its resolved path.
 * @param checkout Its checkout.
 * @param pass The pass.
 */
async function judgeBoundSymbol(
	claim: BindingClaim,
	target: LocalCodeTarget,
	checkout: ClaimCheckout,
	pass: Pass,
): Promise<void> {
	const { symbol } = claim.binding;
	if (symbol === undefined) return;
	const readable = readableOf(target, checkout.files);
	const held = await findSymbolOf(claim, readable, checkout, symbol, pass);
	if (held?.status === "absent") {
		pass.outcome.findings.push(bindingSymbolMissing(claim, symbol, target.kind, held));
	}
}

/**
 * The warning for an anchor whose file is not in the checkout.
 * @param claim The anchor.
 * @param root The checkout.
 * @returns The finding.
 */
function anchorPathMissing(claim: AnchorClaim, root: string): CodeFinding {
	const { anchor, site } = claim;
	return warning(
		site,
		"ANCHOR_PATH_MISSING",
		`The anchor of ${describeSubject(site.subject)} names ${JSON.stringify(anchor.path)} in ` +
			`${JSON.stringify(anchor.repo)}, and there is no such file in the checkout at ` +
			`${JSON.stringify(root)}. Cite the file that holds the code now, or remove the anchor if ` +
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

/**
 * Judge an anchor: its file is in the checkout and defines or uses its
 * symbol, and where the symbol is defined, an end's bound code holds it.
 * @param claim The anchor.
 * @param pass The pass.
 */
async function judgeAnchor(claim: AnchorClaim, pass: Pass): Promise<void> {
	const checkout = checkoutFor(claim, pass);
	if (checkout === undefined) return;
	const { repo, path: file } = claim.anchor;
	const target = resolveLocalCodeTarget({ repo, path: file }, pass.snapshot);
	if (target.ok && target.kind === "file") {
		await judgeAnchorSymbol(claim, readableOf(target, checkout.files), checkout, pass);
	} else pass.outcome.findings.push(anchorPathMissing(claim, checkout.root));
}

/**
 * Judge the symbol of an anchor whose file is in the checkout.
 * @param claim The anchor.
 * @param readable What the pass may read of its file.
 * @param checkout Its checkout.
 * @param pass The pass.
 */
async function judgeAnchorSymbol(
	claim: AnchorClaim,
	readable: Readable,
	checkout: ClaimCheckout,
	pass: Pass,
): Promise<void> {
	const held = await findSymbolOf(claim, readable, checkout, claim.anchor.symbol, pass);
	if (held?.status === "absent") pass.outcome.findings.push(anchorSymbolMissing(claim, held));
	if (held?.status !== "found") return;
	const mismatch = await anchorMismatch(claim, held.file, checkout, pass);
	if (mismatch !== undefined) pass.outcome.findings.push(mismatch);
}

/**
 * Whether an anchor that holds does not support its relationship or step: its
 * symbol is defined outside the bound code of both ends, or its uses are all
 * of an evidence kind its relationship kind does not accept.
 * @param claim The anchor.
 * @param file The anchored file.
 * @param checkout Its checkout.
 * @param pass The pass.
 * @returns The finding, or undefined when it supports it or the check cannot tell.
 */
async function anchorMismatch(
	claim: AnchorClaim,
	file: string,
	checkout: ClaimCheckout,
	pass: Pass,
): Promise<CodeFinding | undefined> {
	const context = { search: searchOf(checkout, pass), snapshot: pass.snapshot };
	const outside = await judgeSupport(claim, file, checkout, context);
	return outside ?? judgeAnchorKind(claim, await pass.facts.read(checkout, file));
}

/**
 * Hold one board's relationships to the evidence between its bound parts,
 * and its containers' interfaces to what their modules expose.
 * @param read The board, at the variant the check reads.
 * @param pass The pass.
 */
async function judgeBoardRelationships(read: BoardToCheck, pass: Pass): Promise<void> {
	const codes = await partCodesOf(read.variant.content.nodes, {
		snapshot: pass.snapshot,
		checkouts: pass.checkouts,
		/**
		 * How a search reads one checkout in this pass.
		 * @param checkout The checkout.
		 * @returns The search.
		 */
		searchOf: (checkout) => searchOf(checkout, pass),
	});
	const evidence = await evidenceOf(codes, {
		facts: pass.facts,
		/**
		 * Note a file read as text, by its kind.
		 * @param checkout Its checkout.
		 * @param file The file.
		 */
		readAsText: (checkout, file) => {
			searchOf(checkout, pass).readAsText(file);
		},
	});
	const lineages = lineagesOf(codes);
	const judged = judgeRelationships({
		read,
		codes,
		evidence,
		lineages,
		relationshipKinds: read.relationshipKinds,
	});
	const interfaces = await judgeInterfaces({
		read,
		codes,
		lineages,
		pieces: evidence.pieces,
		facts: pass.facts,
		modules: pass.modules,
	});
	pass.outcome.findings.push(...judged.findings, ...interfaces.findings);
	pass.outcome.skipped.push(...judged.skipped, ...interfaces.skipped);
}

/**
 * What the pass says once for each checkout: that it is unavailable, or that
 * it read some of its files as text, so for those it judged anchors and bound
 * symbols by name and nothing that needs references.
 * @param checkouts Each repository's checkout.
 * @param readAsText The kinds of file read as text in each repository.
 * @returns The skips.
 */
function checkoutSkips(
	checkouts: ReadonlyMap<string, Checkout>,
	readAsText: ReadonlyMap<string, ReadonlySet<string>>,
): CodeCheckSkip[] {
	return [...checkouts].flatMap(([repo, checkout]): CodeCheckSkip[] => {
		if (checkout.status === "unavailable") {
			return [{ reason: "checkout-unavailable", repo, detail: checkout.detail }];
		}
		const kinds = [...(readAsText.get(repo) ?? [])].toSorted();
		if (kinds.length === 0) return [];
		const detail =
			`Read as text: ${kinds.join(", ")}. Their anchors and bound symbols were judged by ` +
			"name, and nothing that needs references.";
		return [{ reason: "text-only", repo, detail }];
	});
}

/**
 * The paths a claim resolves: a binding's, or an anchor's and the bindings of
 * the parts whose bound code can hold its symbol's definition.
 * @param claim The claim.
 * @returns Each path, as a binding names it.
 */
function pathsOf(claim: Claim): CodeBinding[] {
	if (claim.kind === "binding") return [claim.binding];
	const holders = claim.holders.flatMap((part) =>
		part.binding === undefined ? [] : [part.binding],
	);
	return [{ repo: claim.anchor.repo, path: claim.anchor.path }, ...holders];
}

/**
 * Judge every claim in the order the boards make them, so the answer keeps
 * that order.
 * @param claims The claims.
 * @param pass The pass.
 */
async function judgeAll(claims: readonly Claim[], pass: Pass): Promise<void> {
	for (const claim of claims) {
		// oxlint-disable-next-line no-await-in-loop -- one claim at a time keeps the findings in board order, and a file one claim reads is cached for the next
		await (claim.kind === "binding" ? judgeBinding(claim, pass) : judgeAnchor(claim, pass));
	}
}

/**
 * Every bound part's binding on the boards.
 * @param boards The boards.
 * @returns Each binding.
 */
function partBindings(boards: readonly BoardToCheck[]): CodeBinding[] {
	return boards.flatMap((read) =>
		read.variant.content.nodes.flatMap((node) =>
			node.binding === undefined ? [] : [node.binding],
		),
	);
}

/**
 * Hold every board's anchors and bound symbols to the code facts of the files
 * on disk, then its relationships to the evidence between its bound parts.
 * @param boards The boards, each at the variant the check reads.
 * @param signal Cancels the pass, every Git command it runs and every file it reads.
 * @returns The findings and what the pass did not read.
 */
async function checkCode(
	boards: readonly BoardToCheck[],
	signal: AbortSignal,
): Promise<CodeCheckOutcome> {
	const claims = boards.flatMap(claimsOf);
	const bound = partBindings(boards);
	const bindings = [...claims.flatMap(pathsOf), ...bound];
	const snapshot = await snapshotCheckoutAccess({ signal, bindings });
	const repos = [...claims.map(repoOf), ...bound.map((binding) => binding.repo)];
	const checkouts = await readCheckouts(repos, snapshot, signal);
	const pass: Pass = {
		snapshot,
		checkouts,
		facts: codeFacts.pass(signal),
		readAsText: new Map(),
		modules: new Map(),
		outcome: { findings: [], skipped: [] },
	};
	await judgeAll(claims, pass);
	for (const read of boards) {
		// oxlint-disable-next-line no-await-in-loop -- one board at a time keeps the findings in board order, and a file one board reads is cached for the next
		await judgeBoardRelationships(read, pass);
	}
	pass.outcome.skipped.push(...checkoutSkips(checkouts, pass.readAsText));
	return pass.outcome;
}

export { type CodeCheckOutcome, checkCode };

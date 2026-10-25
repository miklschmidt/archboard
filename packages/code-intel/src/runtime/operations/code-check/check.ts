// The code pass: every claim a board makes about code, held to the code facts
// of the files on disk (ADR 0046).
//
// A bound symbol must be a definition in the bound file or directory, and an
// anchor's symbol a definition or a use in its file; a file no grammar reads
// holds a symbol wherever its last name stands. A missing path or symbol says
// that something is missing, so the check is sure of it, the code contradicts
// the board, and a right change clears it: each one is a warning, and the only
// finding about its binding or anchor (claim-findings.ts). An anchor that holds, and whose symbol
// is defined outside the bound code of both ends, is `ANCHOR_MISMATCH`
// (support.ts), and so is one whose uses are all of an evidence kind its
// relationship kind does not accept (anchor-kind.ts). Then each board's
// relationships are held to the evidence between its bound parts
// (relationships.ts), and each container's interface to what the module it
// binds exposes (interfaces.ts). Language servers resolve the uses no import
// resolves, and every one has stopped when the pass returns (resolution.ts).
// A draft that lacks a bound part the variant before it holds, while the code
// it describes still holds that part, is `INHERITED_PART_DROPPED`
// (dropped-parts.ts). A document reference whose file is not at the version it
// names is `DOCUMENT_PATH_MISSING` (documents.ts, ADR 0054).
// What the pass cannot read is listed with the reason, never as a finding.

import { createElapsedClock } from "@archboard/timing";
import path from "node:path";
import {
	checkoutSkips,
	readCheckouts,
	readableOf,
	type Checkout,
	type RevisionSnapshot,
	type ReadCheckout,
	type Readable,
} from "#runtime/operations/code-check/checkouts.ts";
import {
	claimsOf,
	type AnchorClaim,
	type BindingClaim,
	type Claim,
	type ClaimSite,
} from "#runtime/operations/code-check/claims/claims.ts";
import { judgeAnchorKind } from "#runtime/operations/code-check/claims/anchor-kind.ts";
import {
	anchorPathMissing,
	anchorSymbolMissing,
	bindingPathMissing,
	bindingSymbolMissing,
} from "#runtime/operations/code-check/claims/claim-findings.ts";
import type { BoardToCheck } from "#runtime/operations/code-check/boards.ts";
import { documentsOf, judgeDocuments } from "#runtime/operations/code-check/claims/documents.ts";
import {
	droppedBindings,
	judgeDroppedParts,
} from "#runtime/operations/code-check/claims/dropped-parts.ts";
import {
	atOwnRef,
	codeFor,
	noServerSkips,
	pinOf,
	readRefCodes,
	refReadsOf,
	routedFacts,
	resolveOnDisk,
	targetIn,
	whereIn,
	type RefCode,
	type RefCodes,
} from "#runtime/operations/code-check/ref-code.ts";
import { joinEnvironment } from "#runtime/operations/code-check/evidence/environment-join.ts";
import { evidenceOf } from "#runtime/operations/code-check/evidence/evidence.ts";
import { infrastructureRunners } from "#runtime/operations/code-check/evidence/infrastructure-runners.ts";
import {
	judgeInterfaces,
	type ModuleReadings,
} from "#runtime/operations/code-check/interfaces/interfaces.ts";
import { lineagesOf } from "#runtime/operations/code-check/evidence/ownership.ts";
import { kubernetesEvidenceOf } from "#runtime/operations/code-check/evidence/kubernetes-evidence.ts";
import { partCodesOf } from "#runtime/operations/code-check/part-code.ts";
import { judgeRelationships } from "#runtime/operations/code-check/evidence/relationships.ts";
import { openResolution, type Resolve } from "#runtime/operations/code-check/resolution.ts";
import { judgeSupport } from "#runtime/operations/code-check/claims/support.ts";
import {
	heldInFiles,
	terraformRootOfTarget,
	type Held,
} from "#runtime/operations/code-check/claims/symbols.ts";
import { terraformEvidenceOf } from "#runtime/operations/code-check/evidence/terraform-evidence.ts";
import { createCodeFacts, type FactsPass } from "#runtime/services/code-facts/reader.ts";
import { type Accept } from "#runtime/operations/code-facts/lookup.ts";
import {
	snapshotCheckoutAccess,
	type CheckoutSnapshot,
	type LocalCodeTarget,
} from "@archboard/code-binding/resolution";
import type { ServerOf } from "#runtime/services/language-servers/session.ts";
import type {
	CheckTiming,
	CodeCheckSkip,
	CodeFinding,
	ContainerExposure,
} from "#shared/protocol/code-check.ts";
import type { CodeBinding } from "@archboard/code-binding/bindings";

/** What one pass found, what it did not read, and what each container it judged exposes. */
interface CodeCheckOutcome {
	readonly timings: CheckTiming[];
	readonly findings: CodeFinding[];
	readonly skipped: CodeCheckSkip[];
	/** The answer never carries it (ADR 0046); the server remembers it for the panes (TASK-539.01). */
	readonly exposures: ContainerExposure[];
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
	/** The refs read from Git where a checkout has another one out. */
	readonly refs: RefCodes;
	/** Where the pass's language servers say a use that no import resolves is defined. */
	readonly resolve: Resolve;
	/** The kinds of file read as text in each repository. */
	readonly readAsText: Map<string, Set<string>>;
	/** What each module a container binds exposes, read once for every board. */
	readonly modules: ModuleReadings;
	readonly outcome: CodeCheckOutcome;
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
 * The checkout a claim reads, or the skip that says why it reads none. A
 * claim pinned to a ref its checkout does not have out reads the tree of that
 * ref from Git, and is skipped only where the checkout cannot resolve the
 * ref. A checkout that is unavailable is said once for the whole checkout, so
 * its claims add nothing.
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
	const code = codeFor(pass.refs, checkout, repo, pin.ref);
	if (code === undefined) {
		pass.outcome.skipped.push(skipped(claim.site, { reason: "ref-not-checked-out", repo, ...pin }));
	}
	return code;
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
 * The skip of a symbol found only in code that did not parse or below a Nix
 * expression it cannot follow, or of an address in a module it does not read.
 * @param claim The claim.
 * @param held Where it was found.
 * @returns The skip, which names the file and its lines, or the module call.
 */
function unparsedSkip(
	claim: Claim,
	held: Extract<Held, { status: "unparsed" | "module-unread" }>,
): CodeCheckSkip {
	const repo = repoOf(claim);
	if (held.status === "module-unread") {
		return skipped(claim.site, { reason: "module-not-read", repo, detail: held.module });
	}
	const { under } = held.unparsed;
	const { path: file, start, end } = held.unparsed.source ?? { path: held.file, ...held.unparsed };
	const detail = `${file}:${start === end ? start : `${start}-${end}`}`;
	const reason = under === undefined ? "symbol-unparsed" : "expression-not-followed";
	return skipped(claim.site, { reason, repo, detail });
}

/**
 * Where the files of a path hold a symbol, or why they cannot be read: a path
 * Git ignores, one never read, a symbol found only in code that did not parse,
 * or an address inside a Terraform module the check does not read, each a skip.
 * @param claim The claim, for its skip.
 * @param readable What the pass may read of the path.
 * @param checkout The checkout it is in.
 * @param symbol The symbol.
 * @param pass The pass.
 * @param root For a binding, the Terraform root module its path names, if any.
 * @returns Where the files hold it, or undefined when it is skipped.
 */
async function findSymbolOf(
	claim: Claim,
	readable: Readable,
	checkout: ClaimCheckout,
	symbol: string,
	pass: Pass,
	root?: string,
): Promise<Held | undefined> {
	if (readable.status !== "files") {
		pass.outcome.skipped.push(unreadable(claim, readable));
		return undefined;
	}
	const accept: Accept = claim.kind === "binding" ? "definition" : "definition-or-reference";
	const held = await heldInFiles(searchOf(checkout, pass), readable.files, symbol, accept, root);
	if (held.status !== "unparsed" && held.status !== "module-unread") return held;
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

/**
 * What the pass reads of a binding, or nothing when its path is not in the
 * checkout: on a named draft that is a finding, and on the current variant the
 * semantics check's to report.
 * @param claim The binding.
 * @param checkout Its checkout.
 * @param pass The pass.
 * @returns The resolved path, or undefined.
 */
function boundTarget(claim: BindingClaim, checkout: ClaimCheckout, pass: Pass) {
	const target = targetIn(claim.binding, checkout, pass);
	if (target.ok) return target;
	if (claim.path) {
		pass.outcome.findings.push(bindingPathMissing(claim, whereIn(checkout, pass.refs)));
	}
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
	const readable = readableOf(target, checkout.files, true);
	const root = terraformRootOfTarget(target, checkout.files);
	const held = await findSymbolOf(claim, readable, checkout, symbol, pass, root);
	if (held?.status === "absent") {
		pass.outcome.findings.push(bindingSymbolMissing(claim, symbol, target.kind, held));
	}
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
	const target = targetIn({ repo, path: file }, checkout, pass);
	if (target.ok && target.kind === "file") {
		await judgeAnchorSymbol(claim, readableOf(target, checkout.files), checkout, pass);
	} else pass.outcome.findings.push(anchorPathMissing(claim, whereIn(checkout, pass.refs)));
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
	const context = { ...pass, search: searchOf(checkout, pass) };
	const outside = await judgeSupport(claim, file, checkout, context);
	const facts = await pass.facts.read(checkout, file);
	return outside ?? judgeAnchorKind(claim, facts, { resolve: pass.resolve, checkout });
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
		refs: pass.refs,
		/**
		 * How a search reads one checkout in this pass.
		 * @param checkout The checkout.
		 * @returns The search.
		 */
		searchOf: (checkout) => searchOf(checkout, pass),
	});
	const lineages = lineagesOf(codes);
	const code = await evidenceOf(codes, {
		facts: pass.facts,
		/**
		 * Note a file read as text, by its kind.
		 * @param checkout Its checkout.
		 * @param file The file.
		 */
		readAsText: (checkout, file) => {
			searchOf(checkout, pass).readAsText(file);
		},
		resolve: pass.resolve,
	});
	const infrastructure = await terraformEvidenceOf(codes, pass.facts, lineages);
	const manifests = await kubernetesEvidenceOf(codes, pass.facts, lineages);
	const evidence = { ...code, pieces: [...code.pieces, ...infrastructure, ...manifests] };
	const runners = await infrastructureRunners(codes, pass.facts);
	const hops = await joinEnvironment(codes, pass.facts, runners);
	const judged = judgeRelationships({
		read,
		codes,
		evidence: { ...evidence, pieces: [...evidence.pieces, ...hops.pieces] },
		lineages,
		relationshipKinds: read.relationshipKinds,
		hops,
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
	pass.outcome.exposures.push(...interfaces.exposures);
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
 * Measure code-facts reads, counting overlapping reads once.
 * @param facts The pass that owns its cache and file reading.
 * @returns Its timed interface and elapsed time.
 */
function timedFacts(facts: FactsPass) {
	const clock = createElapsedClock();
	return {
		facts: {
			...facts,
			/**
			 * Read facts, retaining the pass's cache and cancellation.
			 * @param checkout The checkout and its listed files.
			 * @param relative The relative file path.
			 * @returns The facts of the file.
			 */
			read: (checkout, relative) => clock.measure(() => facts.read(checkout, relative)),
		} satisfies FactsPass,
		/**
		 * Time spent reading facts, excluding server requests and judging.
		 * @returns Elapsed wall milliseconds.
		 */
		elapsedMs: clock.elapsedMs,
	};
}

/**
 * Hold every board's anchors and bound symbols to the code facts of the files
 * on disk, then its relationships to the evidence between its bound parts.
 * @param vault The vault directory the boards were read from: the checkout that holds
 * it is read for its own repository, and the chosen checkout for every other (ADR 0049).
 * @param boards The boards, each at the variant the check reads.
 * @param signal Cancels the pass, every Git command it runs, every file it
 * reads and every language server it started.
 * @param plans The Terraform or OpenTofu plans an agent named (`--plan`).
 * @param serverOf The server of a language in a checkout, where an owner fixes
 * it; by default each checkout's registration decides (ADR 0046).
 * @param revisions Authoritative immutable trees for a historical candidate.
 * @returns The findings and what the pass did not read.
 */
async function checkCode(
	vault: string,
	boards: readonly BoardToCheck[],
	signal: AbortSignal,
	plans: FactsPass["plans"] = [],
	serverOf?: ServerOf,
	revisions?: ReadonlyMap<string, string>,
): Promise<CodeCheckOutcome> {
	const inherited = droppedBindings(boards);
	const asked = boards.flatMap(claimsOf);
	const documents = documentsOf(boards);
	const bindings = [...asked.flatMap(pathsOf), ...partBindings(boards), ...inherited, ...documents];
	const snapshot: RevisionSnapshot = {
		...(await snapshotCheckoutAccess({ vault, signal, bindings, timeoutMs: null })),
		...(revisions === undefined ? {} : { revisions }),
	};
	const repos = [...asked.map(repoOf), ...bindings.map((binding) => binding.repo)];
	const checkouts = await readCheckouts(repos, snapshot, signal);
	const reads =
		revisions === undefined
			? await Promise.all(boards.map((read) => atOwnRef(read, checkouts, signal)))
			: boards;
	const claims = reads.flatMap(claimsOf);
	const bound = [...partBindings(reads), ...documents];
	const refs = await readRefCodes(refReadsOf(claims, bound, snapshot), checkouts, signal);
	const reading = timedFacts(routedFacts(refs, codeFacts.pass(signal, plans)));
	const facts = reading.facts;
	const servers = new Map(
		snapshot.entries.flatMap((entry) =>
			entry.servers === undefined ? [] : [[entry.repo, entry.servers] as const],
		),
	);
	const resolution = openResolution(servers, signal, facts, checkouts, serverOf);
	const withoutServer = new Set<RefCode>();
	const pass: Pass = {
		snapshot,
		checkouts,
		facts,
		refs,
		resolve: resolveOnDisk(resolution.resolve, refs, withoutServer),
		readAsText: new Map(),
		modules: new Map(),
		outcome: { timings: [], findings: [], skipped: [], exposures: [] },
	};
	try {
		await judgeAll(claims, pass);
		const documented = judgeDocuments(reads, pass);
		pass.outcome.findings.push(...documented.findings);
		pass.outcome.skipped.push(...documented.skipped);
		for (const read of reads) {
			// oxlint-disable-next-line no-await-in-loop -- one board at a time keeps the findings in board order, and a file one board reads is cached for the next
			await judgeBoardRelationships(read, pass);
		}
		const dropped = await judgeDroppedParts(boards, { checkouts, facts, signal });
		pass.outcome.findings.push(...dropped.findings);
		pass.outcome.skipped.push(...dropped.skipped);
	} finally {
		pass.outcome.skipped.push(...(await resolution.close()));
	}
	pass.outcome.skipped.push(...noServerSkips(withoutServer));
	pass.outcome.skipped.push(...checkoutSkips(checkouts, pass.readAsText));
	const serverTimings = resolution.timings();
	pass.outcome.timings.push(
		{ check: "code-facts", elapsedMs: reading.elapsedMs() },
		...serverTimings,
	);
	return pass.outcome;
}

export { type CodeCheckOutcome, checkCode };

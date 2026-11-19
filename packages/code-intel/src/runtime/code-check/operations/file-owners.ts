// The modules that own one file, as the code check reads them (ADR 0046, ADR 0080).
//
// The code browser opens a file and asks which modules of a reading own it. The answer is the
// code check's own rule, not a copy: the bound code of each part comes from `partCodesOf`, and
// of the parts that read, the narrowest that hold the file own it (`ownersOfFile`), a part bound
// to a symbol before one bound to the file, and that before one bound to the deepest directory
// above it. A module bound to a symbol in the file is named with the lines of its definition, or
// with none where the code facts do not find it. A relationship whose anchor names the file is
// named with the line of its symbol: a definition's first line, else the first line that uses it.
//
// The pass reads one repository, the one the file is in, and takes the same steps as the code
// pass does for it: the checkout and its files, the refs its parts pin, and the code facts
// through the pass's cache. The owners come from the bindings and the code facts alone, so they
// never depend on whether anyone may read the file's text. The definitions of the text are given
// beside them, for the one that quotes it.

import { snapshotCheckoutAccess, type CheckoutSnapshot } from "@archboard/code-binding/resolution";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import {
	claimsOf,
	type AnchorClaim,
	type Claim,
} from "#runtime/code-check/claims/operations/claims.ts";
import { heldInFiles, type Search } from "#runtime/code-check/claims/operations/symbols.ts";
import { codeFacts } from "#runtime/code-check/operations/check.ts";
import {
	normalized,
	readableOf,
	readCheckouts,
	type ReadCheckout,
} from "#runtime/code-check/operations/checkouts.ts";
import {
	definitionsIn,
	partCodesOf,
	type PartCode,
	type ReadPart,
	type RepoCheckout,
} from "#runtime/code-check/operations/part-code.ts";
import {
	atOwnRef,
	codeFor,
	pinOf,
	readRefCodes,
	refReadsOf,
	routedFacts,
	targetIn,
	type RefCodes,
} from "#runtime/code-check/operations/ref-code.ts";
import { readStatesToCheck, type StateToCheck } from "#runtime/code-check/operations/states.ts";
import { ownersOf, ownersOfFile } from "#runtime/code-check/evidence/operations/ownership.ts";
import type { CodeBinding } from "@archboard/code-binding/bindings";
import type { Definition } from "#runtime/code-facts/operations/facts.ts";
import type { Accept } from "#runtime/code-facts/operations/lookup.ts";
import { definitionsOfText } from "#runtime/code-facts/operations/text-definitions.ts";
import type { z } from "zod";
import type { CodeFileSchema } from "#shared/protocol/code-files.ts";
import type { FactsPass } from "#runtime/code-facts/services/reader.ts";
import type { SemanticNode } from "@archboard/model/content";

type CodeFile = z.infer<typeof CodeFileSchema>;
type CodeFileOwners = NonNullable<CodeFile["owners"]>;
type CodeFileSource = Extract<CodeFile["source"], { status: "quoted" }>;
type CodeFileDefinition = CodeFileSource["definitions"][number];

/** What to read: the file, and the reading of the model that names its owners. */
interface FileOwnersRequest {
	/** The vault whose model is read, and whose checkouts the repository is found in. */
	readonly vault: string;
	/** The repository identity, as a binding names it. */
	readonly repo: string;
	/** The file, relative to the repository, with `/` between names. */
	readonly path: string;
	/** The canonical model, where the vault holds several. */
	readonly model?: string | undefined;
	/** A proposal or state selector, as the model route takes it. */
	readonly state?: string | undefined;
	/** An exact retained checkpoint, in place of a state. */
	readonly checkpoint?: string | undefined;
	/** The source ref holding the selected model inputs. */
	readonly ref?: string | undefined;
	/** The file's text, when the caller quoted it: its definitions are given too. */
	readonly text?: string | undefined;
	/** Ends the reading when the request is abandoned. */
	readonly signal: AbortSignal;
}

/** The owners of the file, and the definitions of its text. */
interface FileOwners {
	readonly success: true;
	readonly owners: CodeFileOwners;
	/** In source order; empty when no text was given or no grammar reads it. */
	readonly definitions: readonly CodeFileDefinition[];
}

/** Why the model cannot be read: the model route's own refusal. */
type ModelRefusal = Extract<ArchitectureModelRead, { success: false }>;

/** The code facts of a pass note a file they read as text, which the browser has no use for. */
function noteNothing(): void {
	// Nothing says "read as text" to a person who opened the file.
}

/** What an anchor's symbol may be: a definition, or a use. */
const ANCHOR_ACCEPTS: Accept = "definition-or-reference";

/** The owners of a file no part of the reading binds. */
const EMPTY: CodeFileOwners = { file: [], symbols: [], anchors: [] };

/**
 * A definition as the answer gives it.
 * @param definition The definition of the code facts.
 * @returns Its symbol, kind, lines and offsets.
 */
function answered(definition: Definition): CodeFileDefinition {
	const { symbol, kind, start, end, source } = definition;
	return { symbol, kind, start, end, ...(source === undefined ? {} : { source }) };
}

/** What one reading of the file's repository holds. */
interface RepoReading {
	readonly repo: string;
	readonly file: string;
	readonly snapshot: CheckoutSnapshot;
	/** The repository's checkout, when this machine reads it. */
	readonly checkout: ReadCheckout | undefined;
	readonly refs: RefCodes;
	readonly facts: FactsPass;
	/** The bound code of each part that names the repository, by its id. */
	readonly codes: ReadonlyMap<string, PartCode>;
	/** The relationships anchored in the file. */
	readonly anchors: readonly AnchorClaim[];
}

/**
 * The parts that name a repository.
 * @param nodes The reading's parts.
 * @param repo The repository.
 * @returns The parts bound to it.
 */
function partsIn(nodes: readonly SemanticNode[], repo: string): SemanticNode[] {
	return nodes.filter((node) => node.binding?.repo === repo);
}

/**
 * Whether a claim is the anchor of a relationship in a file.
 * @param claim The claim.
 * @param repo The repository.
 * @param file The file.
 * @returns True for a relationship, not a flow step, whose anchor names the file.
 */
function anchoredAt(claim: Claim, repo: string, file: string): claim is AnchorClaim {
	return (
		claim.kind === "anchor" &&
		claim.site.subject.kind === "edge" &&
		claim.anchor.repo === repo &&
		normalized(claim.anchor.path) === file
	);
}

/**
 * The module bound to a symbol in a file.
 * @param code One part's bound code.
 * @param repo The repository of the file.
 * @param file The file.
 * @returns The module, its symbol and the definition code facts find there, or null where they
 * find none; undefined for a part bound to no symbol in the file.
 */
function symbolOwner(
	code: PartCode,
	repo: string,
	file: string,
): CodeFileOwners["symbols"][number] | undefined {
	const { binding } = code.node;
	if (binding?.symbol === undefined) return undefined;
	const named = { subject: code.node.id, symbol: binding.symbol };
	if (code.status === "read") {
		const [definition] = definitionsIn(code, file);
		return definition === undefined ? undefined : { ...named, definition: answered(definition) };
	}
	return namesFile(binding, repo, file) ? { ...named, definition: null } : undefined;
}

/**
 * Whether a binding names a file.
 * @param binding The binding.
 * @param repo The repository of the file.
 * @param file The file.
 * @returns True when it names that repository and path.
 */
function namesFile(
	binding: Pick<CodeBinding, "repo" | "path">,
	repo: string,
	file: string,
): boolean {
	return binding.repo === repo && normalized(binding.path) === file;
}

/**
 * The code a claim's anchor reads in the file's repository: the checkout's files, or the ref its
 * end is pinned to.
 * @param claim The anchor.
 * @param reading What the pass read.
 * @returns The code, or undefined when this machine does not read it.
 */
function anchorCode(claim: AnchorClaim, reading: RepoReading): RepoCheckout | undefined {
	const { checkout, refs, snapshot, repo } = reading;
	return checkout === undefined
		? undefined
		: codeFor(refs, checkout, repo, pinOf(claim, snapshot).ref);
}

/**
 * The code and the files of an anchor's file that the pass may read.
 * @param claim The anchor.
 * @param reading What the pass read.
 * @returns The code and the files, or undefined when the pass reads none of them.
 */
function anchorFiles(
	claim: AnchorClaim,
	reading: RepoReading,
): { readonly code: RepoCheckout; readonly files: readonly string[] } | undefined {
	const { refs, snapshot, repo, file } = reading;
	const code = anchorCode(claim, reading);
	if (code === undefined) return undefined;
	const target = targetIn({ repo, path: file }, code, { refs, snapshot });
	const readable = target.ok && target.kind === "file" ? readableOf(target, code.files) : undefined;
	return readable?.status === "files" ? { code, files: readable.files } : undefined;
}

/**
 * The line of an anchor's symbol in its file.
 * @param claim The anchor.
 * @param reading What the pass read.
 * @returns A definition's first line, else the first line that uses the symbol, else null.
 */
async function anchorLine(claim: AnchorClaim, reading: RepoReading): Promise<number | null> {
	const readable = anchorFiles(claim, reading);
	if (readable === undefined) return null;
	const search: Search = { facts: reading.facts, checkout: readable.code, readAsText: noteNothing };
	const held = await heldInFiles(search, readable.files, claim.anchor.symbol, ANCHOR_ACCEPTS);
	return held.status === "found" ? (held.line ?? null) : null;
}

/**
 * Read the code of the file's repository as the code pass reads it: the checkout and its files,
 * the refs its parts pin, the code facts through the pass's cache, and the bound code of each part.
 * @param state The reading of the model.
 * @param request The file and the signal that cancels the reading.
 * @param file The file, normalized.
 * @returns What the pass read.
 */
async function readRepo(
	state: StateToCheck,
	request: FileOwnersRequest,
	file: string,
): Promise<RepoReading> {
	const { vault, repo, signal } = request;
	const bound = partsIn(state.variant.content.nodes, repo).flatMap((node) => node.binding ?? []);
	const bindings = [{ repo, path: file }, ...bound];
	const snapshot = await snapshotCheckoutAccess({ vault, signal, bindings, timeoutMs: null });
	const checkouts = await readCheckouts([repo], snapshot, signal);
	const reading = await atOwnRef(state, checkouts, signal);
	const nodes = partsIn(reading.variant.content.nodes, repo);
	const anchors = claimsOf(reading).filter((claim) => anchoredAt(claim, repo, file));
	const pinned = nodes.flatMap((node) => node.binding ?? []);
	const refs = await readRefCodes(refReadsOf(anchors, pinned, snapshot), checkouts, signal);
	const facts = routedFacts(refs, codeFacts.pass(signal));
	/**
	 * How a search reads one checkout.
	 * @param checkout The checkout.
	 * @returns The search.
	 */
	const searchOf = (checkout: RepoCheckout): Search => ({
		facts,
		checkout,
		readAsText: noteNothing,
	});
	const codes = await partCodesOf(nodes, { snapshot, checkouts, refs, searchOf });
	const checkout = checkouts.get(repo);
	return {
		repo,
		file,
		snapshot,
		checkout: checkout?.status === "read" ? checkout : undefined,
		refs,
		facts,
		codes,
		anchors,
	};
}

/**
 * The owners of the file in what the pass read.
 * @param reading What the pass read.
 * @returns The modules that own the file as a whole, by symbol, and by anchor.
 */
async function ownersIn(reading: RepoReading): Promise<CodeFileOwners> {
	const { repo, file, codes, anchors } = reading;
	const read = [...codes.values()].filter((code): code is ReadPart => code.status === "read");
	const exact = [...codes.values()].filter((code) => {
		if (code.status === "read") return code.grain.kind === "file" && code.grain.file === file;
		const { binding } = code.node;
		return binding !== undefined && binding.symbol === undefined && namesFile(binding, repo, file);
	});
	return {
		file: (exact.length > 0 ? exact : ownersOfFile(ownersOf(read), file)).map(
			(part) => part.node.id,
		),
		symbols: [...codes.values()].flatMap((code) => symbolOwner(code, repo, file) ?? []),
		anchors: await Promise.all(
			anchors.map(async (claim) => ({
				subject: claim.site.subject.id,
				symbol: claim.anchor.symbol,
				line: await anchorLine(claim, reading),
			})),
		),
	};
}

/**
 * The definitions of the text the caller quoted.
 * @param reading What the pass read.
 * @param request The request, which holds the text.
 * @returns The definitions; none without a text or a checkout.
 */
async function definitionsOf(
	reading: RepoReading,
	request: FileOwnersRequest,
): Promise<CodeFileDefinition[]> {
	const root = reading.checkout?.root;
	if (request.text === undefined || root === undefined) return [];
	return (await definitionsOfText(root, reading.file, request.text, request.signal)).map(answered);
}

/**
 * The owners of a file in one reading of a model, and the definitions of its text.
 * @param request The file, the reading, and the signal that cancels it.
 * @returns The owners and definitions, or the model route's refusal.
 */
async function readFileOwners(request: FileOwnersRequest): Promise<FileOwners | ModelRefusal> {
	const file = normalized(request.path);
	const read = await readStatesToCheck(request.vault, request.state, {
		model: request.model,
		checkpoint: request.checkpoint,
		ref: request.ref,
	});
	if (!("ok" in read)) return read;
	const [state] = read.states;
	if (state === undefined) return { success: true, owners: EMPTY, definitions: [] };
	const reading = await readRepo(state, request, file);
	return {
		success: true,
		owners: await ownersIn(reading),
		definitions: await definitionsOf(reading, request),
	};
}

export { type FileOwners, readFileOwners };

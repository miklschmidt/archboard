// A variant's document references, held to the files at the version each
// names (TASK-498, ADR 0054).
//
// A reference has a binding's shape, so the pass reads it as it reads a
// binding of the same repository and ref: the checkout's files where nothing
// is pinned away from them, else the tree of the ref read from Git. It reads
// the references of every variant the check reads, a draft's too, because a
// document comes before the code that a draft plans: a design names a document
// that is already written. A reference names a file, so a directory is
// missing too. A repository this machine has not registered and a ref the
// checkout cannot resolve are skipped with the reason, as a binding's are.

import type { BoardToCheck } from "@/runtime/code-check/lib/boards";
import { otherRefOf, type Checkout } from "@/runtime/code-check/lib/checkouts";
import {
	codeFor,
	targetIn,
	whereIn,
	type RefCodes,
	type RepoCheckout,
} from "@/runtime/code-check/lib/ref-code";
import type { CheckoutSnapshot } from "@archboard/code-binding/resolution";
import type { CodeCheckSkip, CodeFinding } from "@/shared/code-check/index";
import type { DocumentReference } from "@archboard/code-binding/bindings";

/** What reading the references needs of the pass. */
interface DocumentReading {
	readonly snapshot: CheckoutSnapshot;
	readonly checkouts: ReadonlyMap<string, Checkout>;
	readonly refs: RefCodes;
}

/**
 * Every document reference of the variants the check reads.
 * @param boards The boards, each at the variant the check reads.
 * @returns The references.
 */
function documentsOf(boards: readonly BoardToCheck[]): DocumentReference[] {
	return boards.flatMap((read) => read.variant.documents ?? []);
}

/**
 * The warning for a reference whose file is not at the version it names.
 * @param read The board, at the variant that holds the reference.
 * @param index Where the reference is in the variant's list.
 * @param where The code that was read: the checkout, or a ref in it.
 * @returns The finding.
 */
function documentPathMissing(read: BoardToCheck, index: number, where: string): CodeFinding {
	const document = read.variant.documents?.[index];
	return {
		severity: "warning",
		code: "DOCUMENT_PATH_MISSING",
		file: read.file,
		board: read.board.name,
		variant: read.variant.id,
		path: `variants.${read.variant.id}.documents.${index}`,
		message:
			`Variant ${JSON.stringify(read.variant.name)} names the document ` +
			`${JSON.stringify(document?.path)} in ${JSON.stringify(document?.repo)}, and there is no ` +
			`such file in ${where}. Name the file where the document is now, pin the reference to a ` +
			"commit that holds it, or remove it from the variant's documents.",
	};
}

/** What one reference comes to: a finding, a skip, or nothing when its file is there. */
type Judged = { readonly finding: CodeFinding } | { readonly skip: CodeCheckSkip } | undefined;

/**
 * The code a reference is read in, or why it is not read: the checkout's
 * files, or the tree of the ref it pins.
 * @param document The reference.
 * @param at The board and variant that hold it, for a skip.
 * @param reading What the pass read.
 * @returns The code, a skip, or undefined where the checkout is unavailable,
 * which the pass says once for the whole checkout.
 */
function codeOf(
	document: DocumentReference,
	at: Pick<CodeCheckSkip, "board" | "variant">,
	reading: DocumentReading,
): RepoCheckout | { readonly skip: CodeCheckSkip } | undefined {
	const { repo, path } = document;
	const checkout = reading.checkouts.get(repo);
	if (checkout?.status === "unregistered") {
		return { skip: { reason: "repository-unregistered", ...at, repo, detail: path } };
	}
	if (checkout?.status !== "read") return undefined;
	const ref = otherRefOf(document, reading.snapshot);
	const code = codeFor(reading.refs, checkout, repo, ref);
	return code ?? { skip: { reason: "ref-not-checked-out", ...at, repo, ref, detail: path } };
}

/**
 * Hold one reference to the file at the version it names.
 * @param read The board, at the variant that holds the reference.
 * @param index Where the reference is in the variant's list.
 * @param document The reference.
 * @param reading What the pass read.
 * @returns What it comes to.
 */
function judgeDocument(
	read: BoardToCheck,
	index: number,
	document: DocumentReference,
	reading: DocumentReading,
): Judged {
	const code = codeOf(document, { board: read.board.name, variant: read.variant.id }, reading);
	if (code === undefined || "skip" in code) return code;
	const target = targetIn(document, code, reading);
	if (target.ok && target.kind === "file") return undefined;
	return { finding: documentPathMissing(read, index, whereIn(code, reading.refs)) };
}

/**
 * Hold each document reference to the file at the version it names.
 * @param boards The boards, each at the variant the check reads.
 * @param reading The registered checkouts, each repository's checkout and the refs read from Git.
 * @returns The findings, and the references that were not read with the reason.
 */
function judgeDocuments(
	boards: readonly BoardToCheck[],
	reading: DocumentReading,
): { findings: CodeFinding[]; skipped: CodeCheckSkip[] } {
	const judged = boards.flatMap((read) =>
		(read.variant.documents ?? []).map((document, index) =>
			judgeDocument(read, index, document, reading),
		),
	);
	return {
		findings: judged.flatMap((one) => (one !== undefined && "finding" in one ? [one.finding] : [])),
		skipped: judged.flatMap((one) => (one !== undefined && "skip" in one ? [one.skip] : [])),
	};
}

export { documentsOf, judgeDocuments };

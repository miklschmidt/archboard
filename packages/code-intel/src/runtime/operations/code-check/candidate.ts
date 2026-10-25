// A historical correction is checked before it is written, against immutable
// Git trees rather than the checkout's possibly dirty working files.

import {
	snapshotCheckoutAccess,
	resolveRegisteredCheckout,
} from "@archboard/code-binding/resolution";
import { HistoricalRevisionSchema } from "@archboard/board/commands";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import { readSemanticBoardConfiguration } from "@archboard/board/vault-policy";
import { commitOf } from "#runtime/clients/history-lens/source-history.ts";
import { messagesOf } from "@archboard/board/flow";
import type { CodeBinding } from "@archboard/code-binding/bindings";
import { gitAnswer } from "#runtime/clients/history-lens/git.ts";
import type { CodeCheckSkip } from "#shared/protocol/code-check.ts";
import { checkCode, type CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import type { BoardToCheck } from "#runtime/operations/code-check/boards.ts";
import type { z } from "zod";

type HistoricalRevision = z.infer<typeof HistoricalRevisionSchema>;

/** A complete immutable revision for one repository the correction describes. */
type CandidateRevision = Readonly<HistoricalRevision>;

/** The in-memory candidate and the immutable code it is to describe. */
interface CandidateCodeRequest {
	readonly vault: string;
	readonly board: SemanticBoard;
	readonly file: string;
	readonly variant: SemanticVariant;
	readonly revisions: readonly CandidateRevision[];
	readonly signal: AbortSignal;
}

type CandidateCodeResult =
	| ({ readonly ok: true } & CodeCheckOutcome)
	| { readonly ok: false; readonly problem: string };

/**
 * Check that every supplied revision identifies one immutable tree.
 * @param input The stated repository revisions.
 * @returns The revisions, or their refusal.
 */
function candidateRevisions(
	input: readonly CandidateRevision[],
): Map<string, string> | { readonly ok: false; readonly problem: string } {
	const revisions = new Map<string, string>();
	for (const revision of input) {
		if (revisions.has(revision.repo))
			return { ok: false, problem: `Repository ${revision.repo} has more than one revision.` };
		if (!HistoricalRevisionSchema.safeParse(revision).success)
			return {
				ok: false,
				problem: `Repository ${revision.repo} needs a full immutable Git commit.`,
			};
		revisions.set(revision.repo, revision.commit.toLowerCase());
	}
	return revisions;
}

/**
 * Every repository path a variant describes or cites.
 * @param variant The variant whose code is read.
 * @returns Bindings, relationship anchors, flow anchors and documents.
 */
function candidateBindings(variant: SemanticVariant): CodeBinding[] {
	return [
		...variant.content.nodes.flatMap((node) => (node.binding === undefined ? [] : [node.binding])),
		...variant.content.edges.flatMap((edge) => (edge.anchor === undefined ? [] : [edge.anchor])),
		...variant.content.flows.flatMap((flow) =>
			messagesOf(flow.steps).flatMap((step) => (step.anchor === undefined ? [] : [step.anchor])),
		),
		...(variant.documents ?? []),
	];
}

/**
 * Whether a tree became unavailable during the check.
 * @param skipped The check's unread evidence.
 * @returns The refusal, if any.
 */
function unreadableEvidence(skipped: readonly CodeCheckSkip[]): string | undefined {
	const unavailable = skipped.find((skip) =>
		["checkout-unavailable", "repository-unregistered", "ref-not-checked-out"].includes(
			skip.reason,
		),
	);
	if (unavailable === undefined) return undefined;
	return `Historical code could not be read for ${unavailable.repo}: ${unavailable.reason}.`;
}

/** A suggested revision requires inspection before it becomes correction evidence. */
interface HistoricalCommitSuggestion {
	readonly repo: string;
	readonly commit: string | null;
	readonly problem?: string;
}

/**
 * Suggest each repository's last HEAD ancestor committed before a historical point.
 * These are guesses: timestamps cannot establish what was deployed or adopted.
 * @param vault The vault whose checkout context is read.
 * @param variant The historical variant.
 * @param at The end of its current interval, as an ISO timestamp.
 * @param signal Cancels checkout and Git reads.
 * @returns One suggestion or explanation per repository the variant describes.
 */
async function suggestHistoricalCommits(
	vault: string,
	variant: SemanticVariant,
	at: string,
	signal: AbortSignal,
): Promise<readonly HistoricalCommitSuggestion[]> {
	const bindings = candidateBindings(variant);
	const repos = [...new Set(bindings.map((binding) => binding.repo))];
	if (!Number.isFinite(Date.parse(at)))
		return repos.map((repo) => ({
			repo,
			commit: null,
			problem: "The historical timestamp is invalid.",
		}));
	const snapshot = await snapshotCheckoutAccess({ vault, signal, bindings, timeoutMs: null });
	return Promise.all(
		repos.map(async (repo): Promise<HistoricalCommitSuggestion> => {
			const checkout = resolveRegisteredCheckout(repo, snapshot);
			if (!checkout.ok) return { repo, commit: null, problem: checkout.error };
			const commit = await gitAnswer(
				checkout.root,
				["log", "-1", "--format=%H", `--before=${new Date(at).toISOString()}`, "HEAD", "--"],
				{ signal },
			);
			return commit
				? { repo, commit }
				: { repo, commit: null, problem: "No commit in HEAD ancestry precedes this timestamp." };
		}),
	);
}

/**
 * Hold an in-memory historical correction to the complete stated Git trees.
 * Every binding, anchor and document reads its repository's stated commit;
 * existing binding pins and the checkout's HEAD do not affect this reading.
 * @param request The candidate, revisions and cancellation signal.
 * @returns Findings, or the missing immutable evidence that prevents checking.
 */
async function checkCandidateCode(request: CandidateCodeRequest): Promise<CandidateCodeResult> {
	const { vault, board, file, variant, signal } = request;
	const parsed = candidateRevisions(request.revisions);
	if (!(parsed instanceof Map)) return parsed;
	const revisions = parsed;
	const { relationshipKinds } = readSemanticBoardConfiguration(vault).configuration;
	const read: BoardToCheck = { board, file, variant, named: true, relationshipKinds };
	const bindings = candidateBindings(variant);
	const missing = bindings.find((binding) => !revisions.has(binding.repo));
	if (missing !== undefined)
		return {
			ok: false,
			problem: `Repository ${missing.repo} needs an immutable revision before this correction can be checked.`,
		};
	const snapshot = await snapshotCheckoutAccess({ vault, signal, bindings, timeoutMs: null });
	const checked = await Promise.all(
		[...revisions].map(async ([repo, commit]) => {
			const checkout = resolveRegisteredCheckout(repo, snapshot);
			if (!checkout.ok) return `Repository ${repo} cannot be read: ${checkout.error}`;
			const resolved = await commitOf(checkout.root, commit, { signal });
			return resolved?.toLowerCase() === commit
				? undefined
				: `Repository ${repo} does not have commit ${commit}.`;
		}),
	);
	const problem = checked.find((one) => one !== undefined);
	if (problem !== undefined) return { ok: false, problem };
	const outcome = await checkCode(vault, [read], signal, [], undefined, revisions);
	const unavailable = unreadableEvidence(outcome.skipped);
	if (unavailable !== undefined) return { ok: false, problem: unavailable };

	return { ok: true, ...outcome };
}

export {
	checkCandidateCode,
	suggestHistoricalCommits,
	type HistoricalCommitSuggestion,
	type CandidateCodeRequest,
	type CandidateCodeResult,
	type CandidateRevision,
};

import { createCodexThreadLinkBindingController } from "@/runtime/codex-thread-link/lib/binding";
import {
	createCodexThreadLinkClassifier,
	discoverCodexThreadLinkCandidates,
} from "@/runtime/codex-thread-link/lib/classifier";
import { CodexThreadLinkConflictError } from "@/runtime/codex-thread-link/lib/contract";
import type {
	CodexThreadLinkClassifierOptions,
	CodexThreadLinkPort,
	ThreadLinkEpochAuthority,
} from "@/runtime/codex-thread-link/lib/contract";

export { createCodexThreadLinkBinding } from "@/runtime/codex-thread-link/lib/binding";
export {
	classifyCodexThreadLink,
	createCodexThreadLinkClassifier,
} from "@/runtime/codex-thread-link/lib/classifier";
export {
	CodexThreadLinkConflictError,
	CodexThreadLinkError,
} from "@/runtime/codex-thread-link/lib/contract";
export type {
	CodexThreadLinkClassifier,
	CodexThreadLinkClassifierOptions,
	CodexThreadLinkPort,
	EpochExecutionProof,
	EpochOperationOutcome,
	EpochOperationRecord,
	EpochOperationStatus,
	SessionLoadedThreadPageResult,
	SessionThread,
	SessionThreadPageResult,
	SessionThreadSource,
	ExecutableThreadLink,
	InspectOnlyThreadLink,
	ThreadLink,
	ThreadLinkAllowedSource,
	ThreadLinkBindingSnapshot,
	ThreadLinkCasToken,
	ThreadLinkClassification,
	ThreadLinkCandidate,
	ThreadLinkCandidateDiscovery,
	ThreadLinkCandidateSource,
	ThreadLinkClassificationErrorCode,
	ThreadLinkCompareAndSwapInput,
	ThreadLinkCurrentEpoch,
	ThreadLinkCurrentEpochSource,
	ThreadLinkCondition,
	ThreadLinkEpochProof,
	ThreadLinkEpochAuthority,
	ThreadLinkExecutableStatus,
	ThreadLinkNonExecutableSnapshot,
	ThreadLinkObservation,
	ThreadLinkReasonCode,
	ThreadLinkSnapshot,
	ThreadLinkSource,
	ThreadLinkState,
	ThreadLinkStatus,
	ThreadLinkTarget,
	UnboundThreadLink,
} from "@/runtime/codex-thread-link/lib/contract";

export interface CodexThreadLinkOptions extends Omit<CodexThreadLinkClassifierOptions, "epoch"> {
	readonly epoch: ThreadLinkEpochAuthority;
}

type CandidateTargets = Awaited<ReturnType<typeof discoverCodexThreadLinkCandidates>>["targets"];

/**
 * Combines deterministic classification with a proof-checked pane binding boundary, so a pane
 * only ever adopts a link that was classified against the live authorities a moment earlier.
 * @param options The session, the durable epoch authority, and any live epoch source.
 * @returns The port panes bind and classify through.
 */
export function createCodexThreadLink(options: CodexThreadLinkOptions): CodexThreadLinkPort {
	const classifier = createCodexThreadLinkClassifier(options);
	const binding = createCodexThreadLinkBindingController(options);
	let discoveryGeneration = 0;
	let candidateTargets: CandidateTargets = new Map();

	/**
	 * Classifies twice through the live authorities, then adopts the second result by CAS.
	 * @param paneId The pane.
	 * @param expected The pane's CAS token, or null for a first binding.
	 * @param target The thread to classify.
	 * @returns The new binding snapshot.
	 */
	const classifyAndBind: CodexThreadLinkPort["classifyAndBind"] = async (
		paneId,
		expected,
		target,
	) => {
		// The first pass may observe a list/epoch transition. The second pass is
		// the only result handed to the synchronous CAS boundary.
		await classifier.classify(target);
		const fresh = await classifier.classify(target);
		return binding.commitClassified(paneId, expected, fresh);
	};
	/**
	 * Publishes a candidate listing and retains its targets, discarding a listing that a newer
	 * discovery has already replaced.
	 * @returns The candidates a browser may offer for explicit binding.
	 */
	const discoverCandidates: CodexThreadLinkPort["discoverCandidates"] = async () => {
		const generation = ++discoveryGeneration;
		candidateTargets = new Map();
		const inventory = await discoverCodexThreadLinkCandidates(options);
		if (generation !== discoveryGeneration) {
			throw new CodexThreadLinkConflictError(
				"A newer thread-candidate discovery replaced this result; refresh the candidate list.",
			);
		}
		candidateTargets = new Map(inventory.targets);
		return inventory.result;
	};
	/**
	 * Resolves one opaque candidate exactly once, then adopts it through fresh classification.
	 * @param paneId The pane.
	 * @param expected The pane's CAS token, or null for a first binding.
	 * @param selectionId The candidate the browser chose.
	 * @returns The new binding snapshot.
	 */
	const bindCandidate: CodexThreadLinkPort["bindCandidate"] = async (
		paneId,
		expected,
		selectionId,
	) => {
		const retained = candidateTargets.get(selectionId);
		if (typeof selectionId !== "string" || selectionId.length === 0 || retained === undefined) {
			throw new CodexThreadLinkConflictError(
				"The thread-candidate selection is unknown, stale, or already used; refresh the candidate list.",
			);
		}
		candidateTargets.delete(selectionId);
		const current = options.epoch.snapshot().cas;
		if (
			current.revision !== retained.epochRevision ||
			current.bytesHash !== retained.epochBytesHash
		) {
			throw new CodexThreadLinkConflictError(
				"The thread-candidate selection is unknown, stale, or already used; refresh the candidate list.",
			);
		}
		return classifyAndBind(paneId, expected, retained.target);
	};
	return Object.freeze({
		classify: classifier.classify,
		discoverCandidates,
		bindCandidate,
		snapshot: binding.snapshot,
		read: binding.read,
		compareAndSwap: binding.compareAndSwap,
		clear: binding.clear,
		classifyAndBind,
	});
}

import { createCodexThreadLinkBindingController } from "./lib/binding.js";
import { createCodexThreadLinkClassifier } from "./lib/classifier.js";
import type { CodexThreadLinkClassifierOptions, CodexThreadLinkPort } from "./lib/contract.js";

export { createCodexThreadLinkBinding } from "./lib/binding.js";
export { classifyCodexThreadLink, createCodexThreadLinkClassifier } from "./lib/classifier.js";
export { CodexThreadLinkConflictError, CodexThreadLinkError } from "./lib/contract.js";
export type {
	CodexThreadLinkClassifier,
	CodexThreadLinkClassifierOptions,
	CodexThreadLinkBindingOptions,
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
} from "./lib/contract.js";

export type CodexThreadLinkOptions = CodexThreadLinkClassifierOptions;

/** Combine deterministic classification with a proof-checked pane binding boundary. */
export function createCodexThreadLink(options: CodexThreadLinkOptions): CodexThreadLinkPort {
	const classifier = createCodexThreadLinkClassifier(options);
	const binding = createCodexThreadLinkBindingController(options);
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
	return Object.freeze({
		classify: classifier.classify,
		snapshot: binding.snapshot,
		read: binding.read,
		compareAndSwap: binding.compareAndSwap,
		clear: binding.clear,
		classifyAndBind,
	});
}

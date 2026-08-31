import { createCodexThreadLinkBinding } from "./lib/binding.js";
import { createCodexThreadLinkClassifier } from "./lib/classifier.js";
import type {
	CodexThreadLinkClassifierOptions,
	CodexThreadLinkPort,
	ThreadLinkBindingStore,
} from "./lib/contract.js";

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
	ThreadLinkEpochProof,
	ThreadLinkExecutableStatus,
	ThreadLinkObservation,
	ThreadLinkReasonCode,
	ThreadLinkSnapshot,
	ThreadLinkSource,
	ThreadLinkState,
	ThreadLinkStatus,
	ThreadLinkTarget,
	UnboundThreadLink,
} from "./lib/contract.js";

export interface CodexThreadLinkOptions extends CodexThreadLinkClassifierOptions {
	readonly binding?: ThreadLinkBindingStore;
}

/** Combine deterministic classification with the pane binding CAS boundary. */
export function createCodexThreadLink(options: CodexThreadLinkOptions): CodexThreadLinkPort {
	const classifier = createCodexThreadLinkClassifier(options);
	const binding = options.binding ?? createCodexThreadLinkBinding(options);
	return Object.freeze({ ...classifier, ...binding });
}

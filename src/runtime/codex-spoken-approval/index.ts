export {
	SPOKEN_APPROVAL_CLASSIFIER_SHA256,
	SPOKEN_APPROVAL_CLASSIFIER_TEMPLATE,
	createSpokenApprovalClassifierPrompt,
	verifySpokenApprovalClassifierIntegrity,
} from "./lib/classifier.js";

export { createCodexSpokenApprovalGate, CodexSpokenApprovalError } from "./lib/gate.js";

export type {
	CodexSpokenApprovalGate,
	CodexSpokenApprovalGateOptions,
	SpokenApprovalArmInput,
	SpokenApprovalClassifierInput,
	SpokenApprovalEffectPrompt,
	SpokenApprovalFallbackReason,
	SpokenApprovalGateState,
	SpokenApprovalSnapshot,
	SpokenApprovalToolResult,
} from "./lib/contract.js";

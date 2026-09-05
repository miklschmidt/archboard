// Field-wise view equality, because it runs on every published change and
// JSON does not.

import type {
	VoiceSessionBinding,
	VoiceSessionControls,
	VoiceSessionFailure,
	VoiceSessionOutcome,
	VoiceSessionView,
} from "@/ui/voice-session/contract";

/**
 * Whether two failures are the same.
 * @param left One failure.
 * @param right Another failure.
 * @returns True when equal.
 */
function sameFailure(left: VoiceSessionFailure | null, right: VoiceSessionFailure | null): boolean {
	if (left === null || right === null) {
		return left === right;
	}
	return (
		left.code === right.code &&
		left.recoverable === right.recoverable &&
		left.message === right.message
	);
}

/**
 * The control a retry names, or null for any other outcome.
 * @param outcome The outcome.
 * @returns The control name, or null.
 */
function retryControl(outcome: VoiceSessionOutcome): string | null {
	return outcome.kind === "retry" ? outcome.control : null;
}

/**
 * Whether two outcomes are the same.
 * @param left One outcome.
 * @param right Another outcome.
 * @returns True when equal.
 */
function sameOutcome(left: VoiceSessionOutcome, right: VoiceSessionOutcome): boolean {
	if (left.kind !== right.kind) {
		return false;
	}
	if (left.kind === "none" || right.kind === "none") {
		return true;
	}
	return (
		left.label === right.label &&
		left.recovery === right.recovery &&
		retryControl(left) === retryControl(right)
	);
}

/**
 * Whether two control sets are the same.
 * @param left One set.
 * @param right Another set.
 * @returns True when equal.
 */
function sameControls(left: VoiceSessionControls, right: VoiceSessionControls): boolean {
	return (
		left.canStart === right.canStart &&
		left.canMute === right.canMute &&
		left.canUnmute === right.canUnmute &&
		left.canStop === right.canStop &&
		left.canRestart === right.canRestart &&
		left.canClose === right.canClose
	);
}

/**
 * Whether two bindings name the same identities.
 * @param left One binding.
 * @param right Another binding.
 * @returns True when equal.
 */
function sameBindingFields(left: VoiceSessionBinding, right: VoiceSessionBinding): boolean {
	return (
		left.paneId === right.paneId &&
		left.childId === right.childId &&
		left.epoch === right.epoch &&
		left.workhorseThreadId === right.workhorseThreadId &&
		left.coordinatorThreadId === right.coordinatorThreadId
	);
}

/**
 * Whether two bindings are the same.
 * @param left One binding.
 * @param right Another binding.
 * @returns True when equal.
 */
function sameBinding(left: VoiceSessionBinding | null, right: VoiceSessionBinding | null): boolean {
	if (left === null || right === null) {
		return left === right;
	}
	return sameBindingFields(left, right);
}

/**
 * Whether two views' scalar fields are the same.
 * @param left One view.
 * @param right Another view.
 * @returns True when equal.
 */
function sameScalars(left: VoiceSessionView, right: VoiceSessionView): boolean {
	return (
		left.status === right.status &&
		left.label === right.label &&
		left.detail === right.detail &&
		left.accessibleStatus === right.accessibleStatus &&
		left.sessionId === right.sessionId &&
		left.busy === right.busy
	);
}

/**
 * Whether two views are the same.
 * @param left One view.
 * @param right Another view.
 * @returns True when equal.
 */
function sameView(left: VoiceSessionView, right: VoiceSessionView): boolean {
	return (
		sameScalars(left, right) &&
		sameFailure(left.failure, right.failure) &&
		sameOutcome(left.outcome, right.outcome) &&
		sameControls(left.controls, right.controls) &&
		sameBinding(left.binding, right.binding)
	);
}

export { sameView };

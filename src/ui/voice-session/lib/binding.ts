// The binding one session keeps: what the transport says this pane is bound
// to, whether that replaces the captured binding, and the capture itself.
// Every field is read from the published snapshot; nothing here calls the
// transport's lease surface, so a projection stays a read.

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type { VoiceSessionBinding, VoiceTransportPort } from "@/ui/voice-session/contract";

/** What the current snapshot says this pane is bound to, when it can say. */
type ObservedBinding = VoiceSessionBinding | null | "gone";

/**
 * A nullable identity as a plain string.
 * @param value The identity.
 * @returns The string, or null.
 */
function text(value: string | null | undefined): string | null {
	return value ?? null;
}

/**
 * The coordinator thread the host published, as a plain string.
 * @param snapshot The snapshot.
 * @returns The thread id, or null.
 */
function coordinatorThreadId(snapshot: BrowserSnapshot | null): string | null {
	return text(snapshot?.coordinator.threadId ?? null);
}

/**
 * What the transport currently says this pane is bound to. `null` means the
 * binding cannot be observed: a reconnect that retired the snapshot, or a stale
 * snapshot, is not evidence that anything was replaced. `"gone"` means a
 * current readiness projection published no executable thread link at all.
 * @param transport The transport port.
 * @param paneId The caller's pane.
 * @returns The observed binding.
 */
function observeBinding(transport: VoiceTransportPort, paneId: string): ObservedBinding {
	const state = transport.state();
	// Only a current readiness projection is evidence about the link.
	if (state.kind !== "readiness") {
		return null;
	}
	const snapshot = state.snapshot;
	const link = snapshot.threadLink;
	if (link.state !== "executable") {
		return "gone";
	}
	return {
		paneId,
		childId: String(link.childId),
		epoch: String(link.epoch),
		workhorseThreadId: String(link.threadId),
		coordinatorThreadId: coordinatorThreadId(snapshot),
	};
}

/**
 * Whether the identities that name a session moved.
 * @param bound The binding the session started with.
 * @param observed What the transport says now.
 * @returns True when the child, epoch, workhorse or pane differs.
 */
function identityMoved(bound: VoiceSessionBinding, observed: VoiceSessionBinding): boolean {
	return (
		observed.childId !== bound.childId ||
		observed.epoch !== bound.epoch ||
		observed.workhorseThreadId !== bound.workhorseThreadId ||
		observed.paneId !== bound.paneId
	);
}

/**
 * Whether an observed binding replaces the bound one. A coordinator the host
 * has not published yet is not a replacement; a different published one is.
 * @param bound The binding the session started with.
 * @param observed What the transport says now.
 * @returns True when the session was replaced under its binding.
 */
function bindingReplaced(bound: VoiceSessionBinding, observed: ObservedBinding): boolean {
	if (observed === null) {
		return false;
	}
	if (observed === "gone") {
		return true;
	}
	return identityMoved(bound, observed) || coordinatorMoved(bound, observed);
}

/**
 * Whether a published coordinator differs from the bound one.
 * @param bound The binding the session started with.
 * @param observed What the transport says now.
 * @returns True when both name a coordinator and they differ.
 */
function coordinatorMoved(bound: VoiceSessionBinding, observed: VoiceSessionBinding): boolean {
	return (
		observed.coordinatorThreadId !== null &&
		bound.coordinatorThreadId !== null &&
		observed.coordinatorThreadId !== bound.coordinatorThreadId
	);
}

/**
 * Captures the binding a new session starts on.
 * @param transport The transport port.
 * @param paneId The caller's pane.
 * @returns The frozen binding.
 */
function captureBinding(transport: VoiceTransportPort, paneId: string): VoiceSessionBinding {
	const snapshot = transport.snapshot();
	const link = snapshot?.threadLink;
	if (link?.state !== "executable") {
		throw new Error("A voice session requires an executable thread link to bind to.");
	}
	return Object.freeze({
		paneId,
		childId: String(link.childId),
		epoch: String(link.epoch),
		workhorseThreadId: String(link.threadId),
		coordinatorThreadId: coordinatorThreadId(snapshot),
	});
}

export { bindingReplaced, captureBinding, observeBinding };

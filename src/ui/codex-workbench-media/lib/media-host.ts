// The neutral realtime host over one workbench transport: the start offer
// rides the exact start lease, text and stop ride the current session handle,
// and remote media lands on an audio element the owner mounts.

import type { BrowserCommandLease } from "@/shared/codex-browser-model";
import type {
	AppendOutcome,
	CommandOutcome,
	CreateOfferSdp,
	RealtimeCorrelation,
	RealtimeHost,
} from "@/ui/codex-realtime";
import { executableThread, sameLeaseTarget } from "@/ui/codex-workbench-media/lib/media-state";
import type { BrowserAudioElementPort } from "@/ui/codex-workbench-media/lib/media-state";
import type {
	BrowserWorkbenchCommandResult,
	BrowserWorkbenchTransport,
} from "@/ui/workbench-transport";

/** The mutable session record the host reads and writes. */
interface MediaSessionRecord {
	handle: BrowserCommandLease["commandId"] | null;
	startOperation: StartOperation | null;
}

/** One start in flight, and the lease it was granted. */
interface StartOperation {
	lease: BrowserCommandLease | null;
}

/** What the host needs from the run that owns it. */
interface MediaRunPort {
	readonly transport: BrowserWorkbenchTransport;
	readonly audioElements: BrowserAudioElementPort;
	readonly mountedElements: Set<HTMLAudioElement>;
	readonly session: MediaSessionRecord;
	/** Throws once this run was replaced. */
	readonly requireCurrent: () => void;
	/** Throws once this run or its start was replaced. */
	readonly requireCurrentStart: (operation: StartOperation) => void;
}

/**
 * A refusal or an uncertain outcome for one request.
 * @param request The request.
 * @param outcome The transport's outcome.
 * @returns The host outcome.
 */
function refusal<T extends RealtimeCorrelation>(
	request: T,
	outcome: "not_delivered" | "outcome_unknown",
): T &
	(
		| { readonly outcome: "not_delivered"; readonly reason: "rejected" }
		| { readonly outcome: "outcome_unknown"; readonly reason: "response_lost" }
	) {
	return outcome === "outcome_unknown"
		? { ...request, outcome, reason: "response_lost" }
		: { ...request, outcome: "not_delivered", reason: "rejected" };
}

/**
 * The lease a start offer must ride, checked against the offer's identity.
 * @param run The run.
 * @param offer The offer.
 * @returns The lease and the operation it belongs to.
 */
function startLease(
	run: MediaRunPort,
	offer: CreateOfferSdp,
): { readonly lease: BrowserCommandLease; readonly operation: StartOperation } {
	run.requireCurrent();
	const operation = run.session.startOperation;
	if (operation === null) {
		throw new Error("The realtime start operation is absent.");
	}
	run.requireCurrentStart(operation);
	const lease = operation.lease;
	if (lease === null) {
		throw new Error("The realtime start lease is absent.");
	}
	const commandId = String(lease.commandId);
	if (commandId !== String(offer.sessionId) || commandId !== String(offer.correlationId)) {
		throw new Error("The realtime offer does not belong to the current start operation.");
	}
	if (!sameLeaseTarget(run.transport.captureCommandTarget(), lease)) {
		throw new Error("The realtime start lease is no longer the current command target.");
	}
	return { lease, operation };
}

/**
 * Whether a delivered answer names the offer and rides the start lease.
 * @param answer The host's answer.
 * @param handle The session handle the host returned.
 * @param offer The offer.
 * @param lease The start lease.
 * @returns True when every identity matches.
 */
function answerMatches(
	answer: CreateOfferSdp,
	handle: string,
	offer: CreateOfferSdp,
	lease: BrowserCommandLease,
): boolean {
	return (
		answer.sessionId === offer.sessionId &&
		answer.correlationId === offer.correlationId &&
		handle === String(lease.commandId)
	);
}

/**
 * The answer a delivered start carries, verified against the offer and lease.
 * @param value The transport result.
 * @param offer The offer.
 * @param lease The start lease.
 * @returns The answer.
 */
function startAnswer(
	value: BrowserWorkbenchCommandResult,
	offer: CreateOfferSdp,
	lease: BrowserCommandLease,
): NonNullable<BrowserWorkbenchCommandResult["realtimeAnswer"]> {
	const answer = value.realtimeAnswer;
	const handle = value.realtimeSessionHandle;
	if (value.outcome !== "delivered" || answer === undefined || handle === undefined) {
		throw new Error("Realtime negotiation was unavailable or failed.");
	}
	if (!answerMatches(answer, handle, offer, lease)) {
		throw new Error("The realtime answer did not match the exact start lease.");
	}
	return answer;
}

/**
 * Sends the start offer on the exact start lease.
 * @param run The run.
 * @param offer The offer.
 * @returns The host's answer.
 */
async function createOffer(
	run: MediaRunPort,
	offer: CreateOfferSdp,
): Promise<NonNullable<BrowserWorkbenchCommandResult["realtimeAnswer"]>> {
	const { lease, operation } = startLease(run, offer);
	const value = await run.transport.command({
		command: "realtimeStart",
		threadId: executableThread(run.transport),
		sdp: offer.sdp,
	});
	run.requireCurrentStart(operation);
	const answer = startAnswer(value, offer, lease);
	run.session.handle = lease.commandId;
	return answer;
}

/**
 * Appends text to the active session. The intent is captured beside the
 * session so authority waits behind pending work rather than being claimed
 * separately and lost before dispatch.
 * @param run The run.
 * @param request The append request.
 * @returns The append outcome.
 */
async function appendText(
	run: MediaRunPort,
	request: RealtimeCorrelation & { readonly text: string },
): Promise<AppendOutcome> {
	run.requireCurrent();
	const handle = run.session.handle;
	if (handle === null) {
		return { ...request, outcome: "not_delivered", reason: "stale_session" };
	}
	const intent = run.transport.captureCommandIntent();
	const value = await run.transport.executeCommand(
		{
			command: "realtimeAppendText",
			threadId: executableThread(run.transport),
			realtimeSessionHandle: handle,
			text: request.text,
		},
		intent,
	);
	run.requireCurrent();
	return value.outcome === "delivered"
		? { ...request, outcome: "delivered" }
		: refusal(request, value.outcome);
}

/**
 * Stops the active session on the wire.
 * @param run The run.
 * @param request The stop request.
 * @returns The command outcome.
 */
async function stop(run: MediaRunPort, request: RealtimeCorrelation): Promise<CommandOutcome> {
	run.requireCurrent();
	const handle = run.session.handle;
	if (handle === null) {
		return { ...request, outcome: "not_delivered", reason: "stale_session" };
	}
	const intent = run.transport.captureCommandIntent();
	const value = await run.transport.executeCommand(
		{
			command: "realtimeStop",
			threadId: executableThread(run.transport),
			realtimeSessionHandle: handle,
		},
		intent,
	);
	run.requireCurrent();
	if (value.outcome === "delivered") {
		run.session.handle = null;
		return { ...request, outcome: "delivered" };
	}
	return refusal(request, value.outcome);
}

/**
 * The host for one run.
 * @param run The run.
 * @returns The neutral realtime host.
 */
function createMediaHost(run: MediaRunPort): RealtimeHost {
	return {
		/**
		 * Sends the start offer.
		 * @param offer The offer.
		 * @returns The answer.
		 */
		createOffer: (offer) => createOffer(run, offer),
		/**
		 * Mounts an audio element and hands it to the session.
		 * @param attachment The attachment.
		 */
		attachRemoteMedia: (attachment) => {
			run.requireCurrent();
			const element = run.audioElements.create();
			run.mountedElements.add(element);
			attachment.attachTo(element);
		},
		/**
		 * The browser receives no semantic events.
		 * @returns A no-op unsubscribe.
		 */
		onSemanticEvent: () => () => undefined,
		/**
		 * Appends text.
		 * @param request The request.
		 * @returns The outcome.
		 */
		appendText: (request) => appendText(run, request),
		/**
		 * Speech append is not a browser operation.
		 * @param request The request.
		 * @returns Rejected.
		 */
		appendSpeech: (request) =>
			Promise.resolve({ ...request, outcome: "not_delivered", reason: "rejected" }),
		/**
		 * Stops the session.
		 * @param request The request.
		 * @returns The outcome.
		 */
		stop: (request) => stop(run, request),
		/**
		 * Recovery is not a browser operation.
		 * @param request The request.
		 * @returns Rejected.
		 */
		recover: (request) =>
			Promise.resolve({ ...request, outcome: "not_delivered", reason: "rejected" }),
	};
}

export { createMediaHost, type MediaRunPort, type StartOperation };

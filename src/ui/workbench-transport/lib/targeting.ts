// Command targeting: the checks that bind a command to the target it was
// composed against, so navigation, expiry and settlement refuse it rather
// than retarget it. Every predicate reads the snapshot; nothing remembers.

import type {
	BrowserCommand,
	BrowserCommandLease,
	BrowserDynamicApproval,
	BrowserSnapshot,
	BrowserThreadLink,
} from "@/shared/codex-browser-model";
import type {
	BrowserCommandAuthority,
	BrowserCommandDraft,
	BrowserCommandName,
	BrowserWorkbenchCommandTarget,
	BrowserWorkbenchTransportErrorCode,
} from "@/ui/workbench-transport/contract";
import { parseBrowserDynamicApprovalResponse } from "@/ui/workbench-transport/lib/wire";

const ACCOUNT_COMMANDS: ReadonlySet<BrowserCommandName> = new Set([
	"accountLogin",
	"accountLoginCancel",
	"accountLogout",
]);
/**
 * Every command that chooses or discovers a pane's link. None needs an
 * executable link, because choosing one is exactly what a pane without one does.
 */
const THREAD_LINK_COMMANDS: ReadonlySet<BrowserCommandName> = new Set([
	"threadLinkCreate",
	"threadLinkRefresh",
	"threadLinkAttach",
	"threadLinkRelink",
]);
/** These callers already hold authority bound to a request or realtime session. */
const EXACT_AUTHORITY_COMMANDS: ReadonlySet<BrowserCommandName> = new Set([
	"dynamicApprovalRespond",
	"realtimeStart",
]);
const QUEUE_COMMANDS: ReadonlySet<BrowserCommandName> = new Set([
	"queueAdd",
	"queueUpdate",
	"queueDelete",
	"queueReorder",
	"queueStart",
]);

const LEASE_TARGET_FIELDS = ["commandId", "paneId", "childId", "epoch"] as const;
const LINK_FIELDS = ["state", "threadId", "childId", "epoch"] as const;
const DYNAMIC_IDENTITY_FIELDS = [
	"child",
	"epoch",
	"threadId",
	"turnId",
	"callId",
	"namespace",
	"tool",
	"manifestHash",
	"operationId",
] as const;

type ApprovalRecord = BrowserSnapshot["approvals"][number];
type DynamicBinding = NonNullable<BrowserDynamicApproval["binding"]>;
type DynamicLink = DynamicBinding["capturedLink"];
type DynamicIdentity = BrowserDynamicApproval["identity"];
type DynamicDraft = Extract<BrowserCommandDraft, { readonly command: "dynamicApprovalRespond" }>;
type ApprovalDraft = Extract<BrowserCommandDraft, { readonly command: "approvalRespond" }>;

/** The identity an ordinary approval must still be bound to. */
interface ApprovalTargetIdentity {
	readonly childId: BrowserCommandLease["childId"];
	readonly epoch: BrowserCommandLease["epoch"];
	readonly threadId: BrowserThreadLink["threadId"];
}

/** A refusal decided before anything reaches the wire. */
interface CommandRefusal {
	readonly code: BrowserWorkbenchTransportErrorCode;
	readonly message: string;
}

/**
 * Whether two values agree on every named field.
 * @param left One value.
 * @param right The other.
 * @param fields The fields compared by identity.
 * @returns True when every field is equal.
 */
function sameFields<Value>(left: Value, right: Value, fields: readonly (keyof Value)[]): boolean {
	return fields.every((field) => left[field] === right[field]);
}

/**
 * Whether two lease identities name the same authority.
 * @param left One.
 * @param right The other.
 * @returns True when equal.
 */
function sameLeaseTarget(left: BrowserCommandAuthority, right: BrowserCommandAuthority): boolean {
	return sameFields(left, right, LEASE_TARGET_FIELDS);
}

/**
 * Whether two thread links name the same link in the same state.
 * @param left One.
 * @param right The other.
 * @returns True when equal.
 */
function sameCapturedLink(left: BrowserThreadLink, right: BrowserThreadLink): boolean {
	return sameFields(left, right, LINK_FIELDS);
}

/**
 * Whether two command targets are the same authority against the same link.
 * @param left One.
 * @param right The other.
 * @returns True when equal.
 */
function sameCommandTarget(
	left: BrowserWorkbenchCommandTarget,
	right: BrowserWorkbenchCommandTarget,
): boolean {
	return (
		sameLeaseTarget(left, right) &&
		sameCapturedLink(left.capturedThreadLink, right.capturedThreadLink)
	);
}

/**
 * Whether a dynamic approval's captured link names the thread link.
 * @param link The captured link.
 * @param threadLink The thread link.
 * @returns True when they agree on thread, child and epoch.
 */
function sameDynamicLink(link: DynamicLink, threadLink: BrowserThreadLink): boolean {
	return (
		link.threadId === threadLink.threadId &&
		link.childId === threadLink.childId &&
		link.epoch === threadLink.epoch
	);
}

/**
 * Whether a dynamic approval is still open and unexpired.
 * @param candidate The approval.
 * @param now The clock.
 * @returns True while it can still be answered.
 */
function dynamicApprovalOpen(candidate: BrowserDynamicApproval, now: () => number): boolean {
	return (
		candidate.state === "pending" &&
		candidate.decision === null &&
		candidate.delivery === null &&
		candidate.toolResult === null &&
		candidate.expiresAtMs > now()
	);
}

/**
 * Whether a dynamic approval's binding names an authority against a link.
 * @param binding The binding, or null when the approval is no longer offered.
 * @param authority The lease identity.
 * @param link The thread link.
 * @returns True when the binding matches.
 */
function dynamicBindingMatches(
	binding: DynamicBinding | null,
	authority: BrowserCommandAuthority,
	link: BrowserThreadLink,
): boolean {
	return (
		binding !== null &&
		binding.commandId === authority.commandId &&
		binding.paneId === authority.paneId &&
		sameDynamicLink(binding.capturedLink, link)
	);
}

/**
 * Whether a dynamic approval's identity names an authority's child, epoch and thread.
 * @param identity The approval identity.
 * @param authority The lease identity.
 * @param link The thread link.
 * @returns True when they agree.
 */
function dynamicIdentityMatches(
	identity: DynamicIdentity,
	authority: BrowserCommandAuthority,
	link: BrowserThreadLink,
): boolean {
	return (
		identity.child === authority.childId &&
		identity.epoch === authority.epoch &&
		identity.threadId === link.threadId
	);
}

/**
 * Whether a dynamic approval is bound to a lease against a thread link.
 * @param candidate The approval.
 * @param authority The lease identity.
 * @param link The thread link.
 * @returns True when identity and binding both match.
 */
function dynamicApprovalBoundTo(
	candidate: BrowserDynamicApproval,
	authority: BrowserCommandAuthority,
	link: BrowserThreadLink,
): boolean {
	return (
		dynamicIdentityMatches(candidate.identity, authority, link) &&
		dynamicBindingMatches(candidate.binding, authority, link)
	);
}

/**
 * Whether the snapshot holds a dynamic approval the lease can answer.
 * @param snapshot The snapshot, or null.
 * @param lease The lease, or null.
 * @param now The clock.
 * @returns True when one is usable.
 */
function hasUsableDynamicApproval(
	snapshot: BrowserSnapshot | null,
	lease: BrowserCommandLease | null,
	now: () => number,
): boolean {
	const link = snapshot?.threadLink;
	if (snapshot === null || lease === null || link?.state !== "executable") {
		return false;
	}
	return snapshot.dynamicApprovals.some(
		(candidate) =>
			dynamicApprovalOpen(candidate, now) && dynamicApprovalBoundTo(candidate, lease, link),
	);
}

/**
 * Whether the pending approval the draft answers is the one the snapshot holds.
 * @param candidate The approval.
 * @param draft The draft.
 * @returns True when identity and effect hash agree.
 */
function dynamicApprovalMatchesDraft(
	candidate: BrowserDynamicApproval,
	draft: DynamicDraft,
): boolean {
	return (
		candidate.effectHash === draft.effectHash &&
		sameFields<DynamicIdentity>(candidate.identity, draft.identity, DYNAMIC_IDENTITY_FIELDS)
	);
}

/**
 * Whether a dynamic response answers one live pending approval bound to the
 * target, and parses against it.
 * @param snapshot The snapshot, or null.
 * @param draft The draft.
 * @param target The command target.
 * @param fullCommand The command as it would be sent.
 * @param now The clock.
 * @returns True when it may be sent.
 */
function dynamicApprovalMatchesTarget(
	snapshot: BrowserSnapshot | null,
	draft: DynamicDraft,
	target: BrowserWorkbenchCommandTarget,
	fullCommand: BrowserCommand,
	now: () => number,
): boolean {
	const link = target.capturedThreadLink;
	if (
		snapshot === null ||
		!dynamicIdentityMatches(draft.identity, target, link) ||
		!sameDynamicLink(draft.capturedLink, link)
	) {
		return false;
	}
	const pending = snapshot.dynamicApprovals.find(
		(candidate) =>
			dynamicApprovalOpen(candidate, now) &&
			dynamicApprovalMatchesDraft(candidate, draft) &&
			dynamicApprovalBoundTo(candidate, target, link),
	);
	if (pending === undefined) {
		return false;
	}
	try {
		parseBrowserDynamicApprovalResponse(pending, fullCommand);
		return true;
	} catch {
		return false;
	}
}

/**
 * Whether an ordinary approval is pending, unexpired and bound to an identity.
 * The binding's `link` is deliberately not compared: it is nullable free-form
 * text with no guaranteed value, not an identity.
 * @param candidate The approval.
 * @param identity The child, epoch and thread.
 * @param now The clock.
 * @returns True when bound and open.
 */
function approvalBoundTo(
	candidate: ApprovalRecord,
	identity: ApprovalTargetIdentity,
	now: () => number,
): boolean {
	return (
		candidate.threadId === identity.threadId &&
		candidate.lifecycle.state === "pending" &&
		candidate.expiresAtMs > now() &&
		candidate.binding.child === identity.childId &&
		candidate.binding.epoch === identity.epoch
	);
}

/**
 * Whether the approval a draft answers is still pending for the target. An
 * ordinary approval carries no thread id of its own, so the snapshot's own
 * approval is the check: pending, unexpired, and bound to the exact child,
 * epoch and thread the target captured.
 * @param snapshot The snapshot, or null.
 * @param draft The draft.
 * @param target The command target.
 * @param now The clock.
 * @returns True when it may be sent.
 */
function approvalMatchesTarget(
	snapshot: BrowserSnapshot | null,
	draft: ApprovalDraft,
	target: BrowserWorkbenchCommandTarget,
	now: () => number,
): boolean {
	const link = target.capturedThreadLink;
	if (snapshot === null || link.state !== "executable" || draft.requestId.length === 0) {
		return false;
	}
	const identity = { childId: target.childId, epoch: target.epoch, threadId: link.threadId };
	return snapshot.approvals.some(
		(candidate) =>
			candidate.requestId === draft.requestId &&
			candidate.approvalId === draft.approvalId &&
			approvalBoundTo(candidate, identity, now),
	);
}

/**
 * Whether the snapshot holds an ordinary approval answerable under an authority.
 * @param snapshot The snapshot, or null.
 * @param authority The child and epoch to answer under, or null.
 * @param now The clock.
 * @returns True when one is usable.
 */
function hasUsableApproval(
	snapshot: BrowserSnapshot | null,
	authority: Pick<BrowserCommandLease, "childId" | "epoch"> | null,
	now: () => number,
): boolean {
	const link = snapshot?.threadLink;
	if (snapshot === null || authority === null || link?.state !== "executable") {
		return false;
	}
	const identity = { childId: authority.childId, epoch: authority.epoch, threadId: link.threadId };
	return snapshot.approvals.some((candidate) => approvalBoundTo(candidate, identity, now));
}

/**
 * The submission ids a queue command names.
 * @param draft The draft.
 * @returns The ids, possibly none.
 */
function queueSubmissionIds(draft: BrowserCommandDraft): readonly string[] {
	if (draft.command === "queueReorder") {
		return draft.orderedSubmissionIds;
	}
	if ("submissionId" in draft) {
		return [draft.submissionId];
	}
	return [];
}

/**
 * Why a queue command is refused, or null. The queue commands carry no thread
 * identity: the four that name submissions are anchored by ids that belong to
 * one link's queue; `queueAdd` names none and must carry its target instead.
 * @param snapshot The snapshot, or null.
 * @param draft The draft.
 * @returns The refusal, or null.
 */
function queueCommandRefusal(
	snapshot: BrowserSnapshot | null,
	draft: BrowserCommandDraft,
): CommandRefusal | null {
	const queue = snapshot?.queue;
	if (queue === undefined || queue.status === "unavailable") {
		return {
			code: "link_changed",
			message: "The workbench queue no longer belongs to the captured thread link.",
		};
	}
	const present = new Set<string>(queue.entries.map((entry) => entry.submissionId));
	const missing = queueSubmissionIds(draft).some((submissionId) => !present.has(submissionId));
	return missing
		? {
				code: "invalid_command",
				message: "The queued submission is no longer in the captured workbench queue.",
			}
		: null;
}

/**
 * Whether a command is anchored by its link: account and thread-link commands
 * are not, every other command needs an executable link naming its thread.
 * @param draft The draft.
 * @param link The captured link.
 * @returns True when the command may go to this link.
 */
function commandAnchoredToLink(draft: BrowserCommandDraft, link: BrowserThreadLink): boolean {
	if (ACCOUNT_COMMANDS.has(draft.command) || THREAD_LINK_COMMANDS.has(draft.command)) {
		return true;
	}
	if (link.state !== "executable") {
		return false;
	}
	return !("threadId" in draft) || draft.threadId === link.threadId;
}

export {
	ACCOUNT_COMMANDS,
	EXACT_AUTHORITY_COMMANDS,
	QUEUE_COMMANDS,
	THREAD_LINK_COMMANDS,
	approvalMatchesTarget,
	commandAnchoredToLink,
	dynamicApprovalMatchesTarget,
	hasUsableApproval,
	hasUsableDynamicApproval,
	queueCommandRefusal,
	sameCapturedLink,
	sameCommandTarget,
	sameLeaseTarget,
	type CommandRefusal,
};

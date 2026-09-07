import { isAllowedSource } from "@/runtime/codex-dynamic-tools/lib/classification";
import {
	isDynamicEpochState,
	isDynamicOwnership,
	isDynamicStatus,
} from "@/runtime/codex-dynamic-tools/lib/vocabulary";
import { isNonEmptyString, isRecord } from "@/runtime/codex-dynamic-tools/lib/value-shape";
import {
	dynamicError,
	isNullOrNonEmptyString,
	sameProof,
	sameSource,
	type AuthorityFacts,
	type AuthorityShape,
	type CallerFacts,
	type LinkEvidence,
} from "@/runtime/codex-dynamic-tools/lib/authority-facts";

/**
 * Refuse live link evidence that names another thread or observed the thread
 * differently from the authority record.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 */
function assertLinkObservesRecord(record: AuthorityFacts, link: LinkEvidence): void {
	if (link.link.threadId !== record.threadId) {
		throw dynamicError("unknown_provenance", "The live thread-link proof names another thread.");
	}
	if (
		link.observation.loaded !== record.loaded ||
		link.observation.canAcceptDirectInput !== record.directInput ||
		link.observation.status !== record.status ||
		!sameSource(link.observation.source, record.source)
	) {
		throw dynamicError(
			"unknown_provenance",
			"The live thread-link observation changed during dispatch.",
		);
	}
}

/**
 * Refuse an executable link that lacks current durable provenance.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 */
function assertExecutableLinkProvenance(record: AuthorityFacts, link: LinkEvidence): void {
	if (
		link.link.state === "executable" &&
		(record.epochState !== "current" || link.proof === null || record.provenance === null)
	) {
		throw dynamicError(
			"unknown_provenance",
			"An executable thread-link is missing current durable provenance.",
		);
	}
}

/**
 * Refuse an executable link whose identity differs from the authority record.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 */
function assertExecutableLinkIdentity(record: AuthorityFacts, link: LinkEvidence): void {
	if (
		link.link.state === "executable" &&
		(link.link.childId !== record.childId ||
			link.link.epoch !== record.epoch ||
			link.link.source !== record.source ||
			link.link.status !== record.status)
	) {
		throw dynamicError(
			"unknown_provenance",
			"The executable thread-link identity changed during dispatch.",
		);
	}
}

/**
 * Whether the authority record and the live link agree on the current child epoch.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 * @returns Whether both name the same current child epoch.
 */
function currentEpochMatches(record: AuthorityFacts, link: LinkEvidence): boolean {
	return (
		record.childId !== null &&
		record.epoch !== null &&
		link.currentEpoch !== null &&
		link.currentEpoch.childId === record.childId &&
		link.currentEpoch.epoch === record.epoch
	);
}

/**
 * Refuse a record outside the current child epoch unless inspect-only epochs
 * are allowed for this classification.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 * @param allowInspectOnlyEpoch Whether prior or unknown epochs are tolerated.
 */
function assertEpochOwnership(
	record: AuthorityFacts,
	link: LinkEvidence,
	allowInspectOnlyEpoch: boolean,
): void {
	if (record.epochState === "current") {
		if (!currentEpochMatches(record, link)) {
			throw dynamicError("stale_child", "The target is no longer in the current child epoch.");
		}
		return;
	}
	if (allowInspectOnlyEpoch) {
		return;
	}
	if (record.epochState === "prior") {
		throw dynamicError("prior_epoch", "The target belongs to a prior child epoch.");
	}
	throw dynamicError("unknown_provenance", "The target epoch ownership is unproven.");
}

/**
 * Cross-check an authority record against the live thread-link evidence so a
 * stale or forged record cannot authorize an effect.
 * @param record The authority's thread facts.
 * @param link Live thread-link evidence.
 * @param allowInspectOnlyEpoch Whether prior or unknown epochs are tolerated.
 */
function linkEvidenceMatches(
	record: AuthorityFacts,
	link: LinkEvidence,
	allowInspectOnlyEpoch: boolean,
): void {
	assertLinkObservesRecord(record, link);
	if (!sameProof(link.proof, record.provenance)) {
		throw dynamicError(
			"unknown_provenance",
			"The live thread-link proof is not the durable proof supplied by the authority.",
		);
	}
	assertExecutableLinkProvenance(record, link);
	assertExecutableLinkIdentity(record, link);
	assertEpochOwnership(record, link, allowInspectOnlyEpoch);
}

/**
 * Refuse a caller outside the current epoch, not created by Archboard, or
 * from a non-executable source.
 * @param caller The caller's thread facts.
 */
function assertCallerEpoch(caller: CallerFacts): void {
	if (caller.epochState !== "current") {
		throw caller.epochState === "prior"
			? dynamicError("prior_epoch", "The dynamic caller belongs to a prior epoch.")
			: dynamicError("stale_child", "The dynamic caller has no current child epoch.");
	}
	if (caller.ownership !== "created") {
		throw dynamicError("unknown_provenance", "The dynamic caller was not created by Archboard.");
	}
	if (!isAllowedSource(caller.source)) {
		throw dynamicError(
			"unknown_provenance",
			"The dynamic caller source is not executable provenance.",
		);
	}
}

/**
 * Refuse a caller that is not loaded or cannot accept direct input.
 * @param caller The caller's thread facts.
 */
function assertCallerLoaded(caller: CallerFacts): void {
	if (!caller.loaded || caller.status === "notLoaded") {
		throw dynamicError("not_loaded", "The dynamic caller is not loaded.");
	}
	if (caller.directInput !== true) {
		throw dynamicError("not_controllable", "The dynamic caller cannot accept direct input.");
	}
}

/**
 * Refuse a caller that is not executing an active turn with durable proof.
 * @param caller The caller's thread facts.
 */
function assertCallerActive(caller: CallerFacts): void {
	if (caller.status !== "active") {
		throw caller.status === "systemError"
			? dynamicError("system_error", "The dynamic caller is in a system error state.")
			: dynamicError("invalid_call", "The dynamic caller is not executing an active turn.");
	}
	if (caller.provenance === null) {
		throw dynamicError("unknown_provenance", "The dynamic caller has no durable execution proof.");
	}
}

/**
 * Apply every caller-state rule in the reviewed order.
 * @param caller The caller's thread facts.
 */
function assertCallerState(caller: CallerFacts): void {
	assertCallerEpoch(caller);
	assertCallerLoaded(caller);
	assertCallerActive(caller);
}

/**
 * Whether an authority record carries a well-formed role and thread identity.
 * @param authority Record returned by the host authority.
 * @param role The role this record must claim.
 * @returns Whether the identity fields are well-formed.
 */
function hasAuthorityIdentity(authority: AuthorityShape, role: "caller" | "target"): boolean {
	return (
		authority.role === role &&
		isNonEmptyString(authority.authority) &&
		isNonEmptyString(authority.threadId) &&
		isNonEmptyString(authority.wireThreadId)
	);
}

/**
 * Whether an authority record carries well-formed epoch and ownership fields.
 * @param authority Record returned by the host authority.
 * @returns Whether the epoch fields are well-formed.
 */
function hasAuthorityEpochFields(authority: AuthorityShape): boolean {
	return (
		isNullOrNonEmptyString(authority.childId) &&
		isNullOrNonEmptyString(authority.epoch) &&
		isDynamicEpochState(authority.epochState) &&
		isDynamicOwnership(authority.ownership)
	);
}

/**
 * Whether an authority record carries well-formed observation fields and a
 * thread-link target naming the same thread.
 * @param authority Record returned by the host authority.
 * @returns Whether the observation fields are well-formed.
 */
function hasAuthorityObservation(authority: AuthorityShape): boolean {
	return (
		typeof authority.loaded === "boolean" &&
		(authority.directInput === null || typeof authority.directInput === "boolean") &&
		isDynamicStatus(authority.status) &&
		isRecord(authority.threadLinkTarget) &&
		authority.threadLinkTarget.threadId === authority.threadId
	);
}

/**
 * Refuse an authority record whose shape is not the reviewed identity shape,
 * whatever its static type promised.
 * @param authority Record returned by the host authority.
 * @param role The role this record must claim.
 */
function assertAuthorityShape(authority: AuthorityShape, role: "caller" | "target"): void {
	if (
		!hasAuthorityIdentity(authority, role) ||
		!hasAuthorityEpochFields(authority) ||
		!hasAuthorityObservation(authority)
	) {
		throw dynamicError("invalid_call", `The ${role} authority returned an invalid identity shape.`);
	}
}

export {
	assertAuthorityShape,
	assertCallerState,
	assertEpochOwnership,
	assertExecutableLinkIdentity,
	assertExecutableLinkProvenance,
	assertLinkObservesRecord,
	currentEpochMatches,
	linkEvidenceMatches,
};

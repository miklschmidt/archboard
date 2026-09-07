import { boundTextDrift, labelAnchorOf, planLabelRepair } from "@/runtime/engine/labels";
import type { InspectionFinding } from "@/runtime/board-inspection/schemas";
import { type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import { type ExactPoint } from "@/runtime/board-inspection/lib/geometry";
import {
	type InspectionModel,
	type LabelOwnershipClassification,
} from "@/runtime/board-inspection/lib/model";
import { compareIdentity } from "@/runtime/board-inspection/lib/ordering";
import { affectedOf, make, uniqueRefs } from "@/runtime/board-inspection/lib/finding-builder";

/** The records a finding names, in the order it names them. */
type RecordMap = InspectionModel["byId"];

/**
 * The raw records the label planner reads: live, uniquely identified, and typed. The planner
 * works in board records rather than decoded ones, so it is given exactly those.
 * @param records the decoded records
 * @returns the raw records to plan over
 */
function plannableRecords(records: readonly DecodedRecord[]): Record<string, unknown>[] {
	return records.filter(isPlannable).map((record) => record.raw!);
}

/**
 * Whether a record is one the label planner can reason about at all.
 * @param record the decoded record
 * @returns true for a live, uniquely identified, typed record
 */
function isPlannable(record: DecodedRecord): boolean {
	if (!record.live || !record.raw) {
		return false;
	}
	return record.usableId && record.id !== null && record.type !== null;
}

/**
 * Resolve a list of ids to the records that carry them, dropping the ones nothing carries.
 * @param byId the records by id
 * @param ids the ids to resolve
 * @returns the records found
 */
function recordsFor(byId: RecordMap, ids: readonly string[]): DecodedRecord[] {
	return ids.flatMap((id) => {
		const record = byId.get(id);
		return record ? [record] : [];
	});
}

/**
 * The findings for containers that carry more than one label, which is a corruption the
 * planner reports as a repair it would make.
 * @param plan the label repair plan
 * @param byId the records by id
 * @returns one finding per container
 */
function duplicateFindings(
	plan: ReturnType<typeof planLabelRepair>,
	byId: RecordMap,
): InspectionFinding[] {
	return plan.duplicates.map((duplicate) => {
		const involved = recordsFor(byId, [duplicate.containerId, duplicate.keep, ...duplicate.remove]);
		return make({
			code: "LABEL_CORRUPTION",
			reason: "duplicate",
			severity: "error",
			affectsCoverage: false,
			details: {
				containerId: duplicate.containerId,
				keeperId: duplicate.keep,
				duplicateIds: [...duplicate.remove].toSorted(compareIdentity),
			},
			message: `Container ${duplicate.containerId} has duplicate labels.`,
			elements: uniqueRefs(involved),
			affected: affectedOf(involved),
		});
	});
}

/**
 * The findings for labels that name a container the board does not have.
 * @param plan the label repair plan
 * @param byId the records by id
 * @returns one finding per orphaned label
 */
function orphanFindings(
	plan: ReturnType<typeof planLabelRepair>,
	byId: RecordMap,
): InspectionFinding[] {
	return plan.orphanIds.flatMap((textId) => {
		const text = byId.get(textId);
		if (!text) {
			return [];
		}
		const raw = text.raw?.containerId;
		return [
			make({
				code: "LABEL_CORRUPTION",
				reason: "orphan",
				severity: "error",
				affectsCoverage: true,
				details: { textId, containerId: typeof raw === "string" ? raw : "unknown" },
				message: `Label ${textId} names missing container ${typeof raw === "string" ? raw : "unknown"}.`,
				elements: [text.ref],
				affected: text.evidenceBox,
			}),
		];
	});
}

/**
 * The findings for labels that have drifted away from the container they are bound to.
 * @param valid the raw records the planner reads
 * @param byId the records by id
 * @returns one finding per drifted label
 */
function driftFindings(
	valid: readonly Record<string, unknown>[],
	byId: RecordMap,
): InspectionFinding[] {
	// The drift planner works in board records; the snapshot has already admitted these.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- admitted records read as the board records they are
	return boundTextDrift(valid as never).flatMap((drift) => {
		const text = byId.get(drift.textId);
		const container = byId.get(drift.containerId);
		if (!text || !container) {
			return [];
		}
		return [driftFinding(drift, text, container)];
	});
}

/**
 * One drifted label's finding, pointing at both where the label should be anchored and where
 * it actually sits.
 * @param drift what the planner measured
 * @param text the label record
 * @param container the container record
 * @returns the finding
 */
function driftFinding(
	drift: ReturnType<typeof boundTextDrift>[number],
	text: DecodedRecord,
	container: DecodedRecord,
): InspectionFinding {
	// The anchor is read from the container's own board record.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an admitted record read as the board record it is
	const anchor = labelAnchorOf(container.raw as never);
	const centre = text.box
		? { x: text.box.x + text.box.width / 2, y: text.box.y + text.box.height / 2 }
		: null;
	return make({
		code: "LABEL_CORRUPTION",
		reason: "drift",
		severity: "error",
		affectsCoverage: false,
		details: {
			textId: drift.textId,
			containerId: drift.containerId,
			distance: drift.distance,
			allowed: drift.allowed,
		},
		message: `Label ${drift.textId} has drifted from ${drift.containerId}.`,
		elements: [text.ref, container.ref],
		points: [anchor, centre].filter((candidate): candidate is ExactPoint => Boolean(candidate)),
		affected: affectedOf([text, container]),
	});
}

/**
 * The findings for elements that persist a label or text seed. Those fields are input
 * spellings the write boundary spends; a persisted one means a write bypassed it.
 * @param records the decoded records
 * @returns one finding per persisted seed
 */
function persistedSeedFindings(records: readonly DecodedRecord[]): InspectionFinding[] {
	return records
		.filter(canPersistSeed)
		.flatMap((record) =>
			persistedSeedsOf(record).map((seedField) => persistedSeedFinding(record, seedField)),
		);
}

/**
 * Whether an element is one a seed could have been left on: a live, identified element that
 * is not itself a text element.
 * @param record the decoded record
 * @returns true when the element is worth checking
 */
function canPersistSeed(record: DecodedRecord): boolean {
	if (!record.live || !record.raw || record.id === null) {
		return false;
	}
	return record.type !== "text";
}

/**
 * The input-only seeds an element has persisted.
 * @param record the decoded record
 * @returns the seed fields present
 */
function persistedSeedsOf(record: DecodedRecord): ("label" | "text")[] {
	const seeds: ("label" | "text")[] = [];
	const label = record.raw?.label;
	if (typeof label === "object" && label !== null) {
		seeds.push("label");
	}
	if (typeof record.raw?.text === "string") {
		seeds.push("text");
	}
	return seeds;
}

/**
 * One persisted-seed finding.
 * @param record the element carrying the seed
 * @param seedField which seed it carries
 * @returns the finding
 */
function persistedSeedFinding(
	record: DecodedRecord,
	seedField: "label" | "text",
): InspectionFinding {
	return make({
		code: "LABEL_CORRUPTION",
		reason: "persisted-seed",
		severity: "error",
		affectsCoverage: false,
		details: { elementId: record.id!, seedField },
		message: `Element ${record.id} persists an input-only ${seedField === "text" ? "text" : "label"} seed.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	});
}

/**
 * The findings for a label whose two sides do not agree: the label names a container that
 * does not name it back, or a container names a label that does not name it.
 * @param ownership the label's ownership classification
 * @param text the label record
 * @param byId the records by id
 * @returns the findings
 */
function reciprocalFindings(
	ownership: LabelOwnershipClassification,
	text: DecodedRecord,
	byId: RecordMap,
): InspectionFinding[] {
	if (ownership.state === "forward-only" && ownership.forwardOwnerId) {
		const owner = byId.get(ownership.forwardOwnerId);
		return owner ? [missingReciprocal(ownership.labelId, text, owner, "container")] : [];
	}
	if (!isReverseOnlyOwnership(ownership)) {
		return [];
	}
	return recordsFor(byId, ownership.reverseOwnerIds).map((owner) =>
		missingReciprocal(ownership.labelId, text, owner, "text"),
	);
}

/**
 * Whether a label is named by containers without naming any of them back.
 * @param ownership the label's ownership classification
 * @returns true when only the reverse side names anything
 */
function isReverseOnlyOwnership(ownership: LabelOwnershipClassification): boolean {
	if (ownership.state === "reverse-only") {
		return true;
	}
	return ownership.forwardOwnerId === null && ownership.state === "conflicting";
}

/**
 * One missing-reciprocal finding, naming which side is missing.
 * @param textId the label
 * @param text the label record
 * @param owner the container record
 * @param missingSide which side fails to name the other
 * @returns the finding
 */
function missingReciprocal(
	textId: string,
	text: DecodedRecord,
	owner: DecodedRecord,
	missingSide: "container" | "text",
): InspectionFinding {
	const message =
		missingSide === "container"
			? `Label ${textId} is not named by container ${owner.id}.`
			: `Container ${owner.id} names label ${textId}, but the label does not name it.`;
	return make({
		code: "LABEL_CORRUPTION",
		reason: "missing-reciprocal",
		severity: "error",
		affectsCoverage: false,
		details: { textId, containerId: owner.id!, missingSide },
		message,
		elements: [text.ref, owner.ref],
		affected: affectedOf([text, owner]),
	});
}

/**
 * The findings for a label more than one container claims: which containers those are, and
 * that the label's own side disagrees with them when it names one.
 * @param ownership the label's ownership classification
 * @param text the label record
 * @param byId the records by id
 * @returns the findings
 */
function conflictingOwnerFindings(
	ownership: LabelOwnershipClassification,
	text: DecodedRecord,
	byId: RecordMap,
): InspectionFinding[] {
	const primaryOwnerId = ownership.forwardOwnerId ?? ownership.reverseOwnerIds[0];
	if (primaryOwnerId === undefined) {
		return [];
	}
	const other = ownership.candidateOwnerIds.filter((ownerId) => ownerId !== primaryOwnerId);
	const involved = [text, ...recordsFor(byId, ownership.candidateOwnerIds)];
	const findings: InspectionFinding[] = [];
	if (ownership.forwardOwnerId) {
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "conflicting-bound-label-owner",
				severity: "error",
				affectsCoverage: true,
				details: {
					textId: ownership.labelId,
					forwardContainerId: ownership.forwardOwnerId,
					reverseContainerIds: ownership.reverseOwnerIds,
				},
				message: `Label ${ownership.labelId} has conflicting owners.`,
				elements: uniqueRefs(involved),
				affected: affectedOf(involved),
			}),
		);
	}
	findings.push(
		make({
			code: "LABEL_CORRUPTION",
			reason: "conflicting-owner",
			severity: "error",
			affectsCoverage: true,
			details: { textId: ownership.labelId, containerId: primaryOwnerId, otherContainerIds: other },
			message: `Label ${ownership.labelId} is bound to more than one container.`,
			elements: uniqueRefs(involved),
			affected: affectedOf(involved),
		}),
	);
	return findings;
}

/**
 * The findings for how every text label's ownership resolved.
 * @param model the inspection model
 * @returns the ownership findings, label by label
 */
function ownershipFindings(model: InspectionModel): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const ownership of model.labelOwnership.values()) {
		const text = model.byId.get(ownership.labelId);
		if (text?.type !== "text") {
			continue;
		}
		findings.push(...reciprocalFindings(ownership, text, model.byId));
		if (ownership.state === "conflicting") {
			findings.push(...conflictingOwnerFindings(ownership, text, model.byId));
		}
	}
	return findings;
}

/**
 * Everything that can be wrong about a board's labels: duplicates and orphans the repair
 * planner names, labels that have drifted from their container, input-only seeds a write
 * left behind, and labels whose two sides disagree about who owns them.
 * @param records the decoded records
 * @param model the inspection model
 * @returns the findings, in detector order
 */
function labelFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
): InspectionFinding[] {
	const valid = plannableRecords(records);
	// The repair planner works in board records; the snapshot has already admitted these.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- admitted records read as the board records they are
	const plan = planLabelRepair(valid as never);
	return [
		...duplicateFindings(plan, model.byId),
		...orphanFindings(plan, model.byId),
		...driftFindings(valid, model.byId),
		...persistedSeedFindings(records),
		...ownershipFindings(model),
	];
}

export { labelFindings };

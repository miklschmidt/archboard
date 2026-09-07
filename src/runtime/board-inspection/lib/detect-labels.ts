import { boundTextDrift, labelAnchorOf, planLabelRepair } from "@/runtime/engine/labels";
import type { InspectionFinding } from "@/runtime/board-inspection/schemas";
import { type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import { type ExactPoint } from "@/runtime/board-inspection/lib/geometry";
import { type InspectionModel } from "@/runtime/board-inspection/lib/model";
import { compareIdentity } from "@/runtime/board-inspection/lib/ordering";
import { affectedOf, make, uniqueRefs } from "@/runtime/board-inspection/lib/finding-builder";

function labelFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
): InspectionFinding[] {
	const valid: Array<Record<string, unknown>> = [];
	for (const record of records) {
		if (record.live && record.raw && record.usableId && record.id && record.type) {
			valid.push(record.raw);
		}
	}
	const findings: InspectionFinding[] = [];
	const byId = model.byId;
	const emit = (finding: InspectionFinding): void => {
		findings.push(finding);
	};
	const plan = planLabelRepair(valid as never);
	for (const duplicate of plan.duplicates) {
		const involved = [
			byId.get(duplicate.containerId),
			byId.get(duplicate.keep),
			...duplicate.remove.map((id) => byId.get(id)),
		].filter((r): r is DecodedRecord => !!r);
		emit(
			make({
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
			}),
		);
	}
	for (const textId of plan.orphanIds) {
		const text = byId.get(textId);
		const containerId =
			typeof text?.raw?.containerId === "string" ? text.raw.containerId : "unknown";
		if (text) {
			emit(
				make({
					code: "LABEL_CORRUPTION",
					reason: "orphan",
					severity: "error",
					affectsCoverage: true,
					details: { textId, containerId },
					message: `Label ${textId} names missing container ${containerId}.`,
					elements: [text.ref],
					affected: text.evidenceBox,
				}),
			);
		}
	}
	const drifted = boundTextDrift(valid as never);
	for (const drift of drifted) {
		const text = byId.get(drift.textId),
			container = byId.get(drift.containerId);
		if (!text || !container) {
			continue;
		}
		const anchor = labelAnchorOf(container.raw as never);
		const centre = text.box
			? { x: text.box.x + text.box.width / 2, y: text.box.y + text.box.height / 2 }
			: null;
		emit(
			make({
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
				points: [anchor, centre].filter((p): p is ExactPoint => !!p),
				affected: affectedOf([text, container]),
			}),
		);
	}
	for (const record of records.filter((r) => r.live && r.raw && r.id)) {
		if (record.type !== "text" && record.raw?.label && typeof record.raw.label === "object") {
			emit(
				make({
					code: "LABEL_CORRUPTION",
					reason: "persisted-seed",
					severity: "error",
					affectsCoverage: false,
					details: { elementId: record.id!, seedField: "label" },
					message: `Element ${record.id} persists an input-only label seed.`,
					elements: [record.ref],
					affected: record.evidenceBox,
				}),
			);
		}
		if (record.type !== "text" && typeof record.raw?.text === "string") {
			emit(
				make({
					code: "LABEL_CORRUPTION",
					reason: "persisted-seed",
					severity: "error",
					affectsCoverage: false,
					details: { elementId: record.id!, seedField: "text" },
					message: `Element ${record.id} persists an input-only text seed.`,
					elements: [record.ref],
					affected: record.evidenceBox,
				}),
			);
		}
	}
	for (const ownership of model.labelOwnership.values()) {
		const textId = ownership.labelId;
		const text = byId.get(textId);
		if (text?.type !== "text") {
			continue;
		}
		if (ownership.state === "forward-only" && ownership.forwardOwnerId) {
			const owner = byId.get(ownership.forwardOwnerId);
			if (owner) {
				emit(
					make({
						code: "LABEL_CORRUPTION",
						reason: "missing-reciprocal",
						severity: "error",
						affectsCoverage: false,
						details: { textId, containerId: owner.id!, missingSide: "container" },
						message: `Label ${textId} is not named by container ${owner.id}.`,
						elements: [text.ref, owner.ref],
						affected: affectedOf([text, owner]),
					}),
				);
			}
		}
		if (
			ownership.state === "reverse-only" ||
			(!ownership.forwardOwnerId && ownership.state === "conflicting")
		) {
			for (const ownerId of ownership.reverseOwnerIds) {
				const owner = byId.get(ownerId);
				if (!owner) {
					continue;
				}
				emit(
					make({
						code: "LABEL_CORRUPTION",
						reason: "missing-reciprocal",
						severity: "error",
						affectsCoverage: false,
						details: { textId, containerId: ownerId, missingSide: "text" },
						message: `Container ${ownerId} names label ${textId}, but the label does not name it.`,
						elements: [text.ref, owner.ref],
						affected: affectedOf([text, owner]),
					}),
				);
			}
		}
		if (ownership.state !== "conflicting") {
			continue;
		}
		const primaryOwnerId = ownership.forwardOwnerId ?? ownership.reverseOwnerIds[0];
		if (!primaryOwnerId) {
			continue;
		}
		const other: string[] = [];
		const involved: DecodedRecord[] = [text];
		for (const ownerId of ownership.candidateOwnerIds) {
			if (ownerId !== primaryOwnerId) {
				other.push(ownerId);
			}
			const owner = byId.get(ownerId);
			if (owner) {
				involved.push(owner);
			}
		}
		if (ownership.forwardOwnerId) {
			emit(
				make({
					code: "BROKEN_REFERENCE",
					reason: "conflicting-bound-label-owner",
					severity: "error",
					affectsCoverage: true,
					details: {
						textId,
						forwardContainerId: ownership.forwardOwnerId,
						reverseContainerIds: ownership.reverseOwnerIds,
					},
					message: `Label ${textId} has conflicting owners.`,
					elements: uniqueRefs(involved),
					affected: affectedOf(involved),
				}),
			);
		}
		emit(
			make({
				code: "LABEL_CORRUPTION",
				reason: "conflicting-owner",
				severity: "error",
				affectsCoverage: true,
				details: { textId, containerId: primaryOwnerId, otherContainerIds: other },
				message: `Label ${textId} is bound to more than one container.`,
				elements: uniqueRefs(involved),
				affected: affectedOf(involved),
			}),
		);
	}
	return findings;
}

export { labelFindings };

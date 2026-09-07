import type { InspectionFinding, InspectionPolicy } from "@/runtime/board-inspection/schemas";
import { stableDescription, type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import { type Segment } from "@/runtime/board-inspection/lib/geometry";
import {
	archboardMetadata,
	groupIds,
	libraryAttribution,
	type InspectionModel,
} from "@/runtime/board-inspection/lib/model";
import { make } from "@/runtime/board-inspection/lib/finding-builder";
import {
	connectorBindingFindings,
	connectorGeometryFindings,
	persistedEndpointFindings,
	type RawRecord,
	type RecordMap,
} from "@/runtime/board-inspection/lib/detect-connectors";
import {
	boundElementFindings,
	containerFindings,
	incomingReferenceIds,
} from "@/runtime/board-inspection/lib/detect-element-references";
import {
	fontFindings,
	libraryFindings,
	metadataFindings,
} from "@/runtime/board-inspection/lib/detect-element-metadata";
import {
	CLOSED_ELEMENT_TYPES,
	KNOWN_ELEMENT_TYPES,
} from "@/runtime/board-inspection/lib/element-types";

/** The run's segment budget, counted up as each connector's path is walked. */
interface SegmentWork {
	pathSegmentChecks: number;
}

/**
 * Whether a closed element carries an angle that does not read as a finite number, which is a
 * rotation nothing can measure and so evidence the element was meant to be laid out.
 * @param record the element
 * @returns true when the angle is present and unreadable
 */
function malformedClosedAngle(record: DecodedRecord): boolean {
	if (!CLOSED_ELEMENT_TYPES.has(record.type ?? "")) {
		return false;
	}
	const angle = record.raw?.angle;
	if (angle === undefined) {
		return false;
	}
	return typeof angle !== "number" || !Number.isFinite(angle);
}

/** The element types that are always standing in a role by being what they are. */
const ROLE_BEARING_TYPES = new Set(["arrow", "line", "text"]);

/** The raw fields whose mere presence shows an element was standing in some role. */
const ROLE_EVIDENCE_FIELDS = [
	"boundElements",
	"containerId",
	"startBinding",
	"endBinding",
	"points",
] as const;

/**
 * Whether an element's own fields show it was standing in a role.
 * @param record the element
 * @returns true when any role-bearing field is present
 */
function fieldRoleEvidence(record: DecodedRecord): boolean {
	const raw = record.raw;
	if (!raw) {
		return false;
	}
	return ROLE_EVIDENCE_FIELDS.some((field) => raw[field] !== undefined);
}

/**
 * Whether an element's metadata and attributions show it was standing in a role: a library
 * component, a group member, or a member of a semantic node.
 * @param record the element
 * @returns true when any of them is present
 */
function metadataRoleEvidence(record: DecodedRecord): boolean {
	if (libraryAttribution(record) !== null || groupIds(record).length > 0) {
		return true;
	}
	const metadata = archboardMetadata(record);
	return metadata !== null && "node" in metadata;
}

/**
 * Whether an element was evidently standing in some role on the board. Geometry the inspection
 * cannot model is only worth reporting on an element something was relying on; an element with
 * no role at all costs the board nothing by not being modelled.
 * @param record the element
 * @param hasIncomingReference whether anything on the board points at it
 * @returns true when the element was standing in a role
 */
function hasCoverageRoleEvidence(record: DecodedRecord, hasIncomingReference: boolean): boolean {
	if (hasIncomingReference || malformedClosedAngle(record)) {
		return true;
	}
	if (ROLE_BEARING_TYPES.has(record.type ?? "")) {
		return true;
	}
	return metadataRoleEvidence(record) || fieldRoleEvidence(record);
}

/**
 * Whether a non-connector element carries a rotation. Connectors report their own rotation
 * against their path, so they are left to the connector detector.
 * @param record the element
 * @param raw the element's raw fields
 * @returns true when the element is rotated
 */
function rotatedElement(record: DecodedRecord, raw: RawRecord): boolean {
	if (record.type === "arrow" || record.type === "line") {
		return false;
	}
	return raw["angle"] !== undefined && raw["angle"] !== 0;
}

/**
 * The finding for a rotated element, whose angle the inspection's axis-aligned model does not
 * stand for.
 * @param record the element
 * @param raw the element's raw fields
 * @returns the finding
 */
function rotationFinding(record: DecodedRecord, raw: RawRecord): InspectionFinding {
	const angle = raw["angle"];
	return make({
		code: "UNSUPPORTED_GEOMETRY",
		reason: "rotation",
		severity: "warning",
		affectsCoverage: true,
		details: {
			angle: typeof angle === "number" && Number.isFinite(angle) ? angle : stableDescription(angle),
		},
		message: `Element ${record.id ?? record.sourceIndex} is rotated.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	});
}

/**
 * Whether an element's persisted type is one the inspection knows how to reason about.
 * @param raw the element's raw fields
 * @returns true when the type is a known one
 */
function knownType(raw: RawRecord): boolean {
	const rawType = raw["type"];
	if (typeof rawType !== "string" || rawType.length === 0) {
		return false;
	}
	return KNOWN_ELEMENT_TYPES.has(rawType);
}

/**
 * The finding for an element of a type the inspection does not model, which it therefore
 * describes but does not measure.
 * @param record the element
 * @param raw the element's raw fields
 * @returns the finding
 */
function unsupportedTypeFinding(record: DecodedRecord, raw: RawRecord): InspectionFinding {
	const rawType = raw["type"];
	const described = typeof rawType === "string" ? rawType : stableDescription(rawType);
	return make({
		code: "UNSUPPORTED_GEOMETRY",
		reason: "unsupported-type",
		severity: "warning",
		affectsCoverage: true,
		details: { rawType: described },
		message: `Element ${record.id ?? record.sourceIndex} has unsupported type ${described}.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	});
}

/**
 * The geometry the inspection will not model on a non-connector element: a rotation, and a type
 * it does not know. Both are only reported on an element that was standing in a role, so a
 * board is not told about geometry nothing was relying on.
 * @param record the element
 * @param raw the element's raw fields
 * @param hasIncomingReference whether anything on the board points at it
 * @returns the findings
 */
function unsupportedGeometryFindings(
	record: DecodedRecord,
	raw: RawRecord,
	hasIncomingReference: boolean,
): InspectionFinding[] {
	const rotated = rotatedElement(record, raw);
	const unsupportedType = !knownType(raw);
	if (!rotated && !unsupportedType) {
		return [];
	}
	if (!hasCoverageRoleEvidence(record, hasIncomingReference)) {
		return [];
	}
	const findings: InspectionFinding[] = [];
	if (rotated) {
		findings.push(rotationFinding(record, raw));
	}
	if (unsupportedType) {
		findings.push(unsupportedTypeFinding(record, raw));
	}
	return findings;
}

/**
 * A connector's own findings: its path geometry, its bindings, and any input-only endpoint it
 * has persisted.
 * @param record the connector
 * @param raw the connector's raw fields
 * @param policy the run's policy
 * @param model the inspection model
 * @param segments the run's segments, added to in place
 * @param work the run's segment budget, advanced in place
 * @returns the findings
 */
function connectorFindings(
	record: DecodedRecord,
	raw: RawRecord,
	policy: InspectionPolicy,
	model: InspectionModel,
	segments: Segment[],
	work: SegmentWork,
): InspectionFinding[] {
	const findings = [
		...connectorGeometryFindings(record, raw, policy, segments, work),
		...connectorBindingFindings(record, raw, model.byId, model.duplicateIds),
	];
	return record.usableId ? [...findings, ...persistedEndpointFindings(record, raw)] : findings;
}

/**
 * Everything one element says about itself: its bindings and bound elements, its container, its
 * metadata, its library attribution, its font, and any geometry the inspection will not model.
 * @param record the element
 * @param raw the element's raw fields
 * @param context the run's policy, model, segments and budget
 * @param hasIncomingReference whether anything on the board points at it
 * @returns the findings
 */
function recordFindings(
	record: DecodedRecord,
	raw: RawRecord,
	context: StructuralContext,
	hasIncomingReference: boolean,
): InspectionFinding[] {
	const byId: RecordMap = context.model.byId;
	const findings: InspectionFinding[] = [];
	if (record.type === "arrow" || record.type === "line") {
		findings.push(
			...connectorFindings(
				record,
				raw,
				context.policy,
				context.model,
				context.segments,
				context.work,
			),
		);
	}
	findings.push(...boundElementFindings(record, raw, byId, context.model.duplicateIds));
	findings.push(...containerFindings(record, raw));
	findings.push(...metadataFindings(record, raw));
	if (record.usableId) {
		findings.push(...libraryFindings(record, context.model));
	}
	findings.push(...fontFindings(record, raw, context.policy));
	findings.push(...unsupportedGeometryFindings(record, raw, hasIncomingReference));
	return findings;
}

/** What one structural pass carries across the records it walks. */
interface StructuralContext {
	policy: InspectionPolicy;
	model: InspectionModel;
	segments: Segment[];
	work: SegmentWork;
}

/**
 * Walk the board's live records once, collecting everything each of them says about itself and
 * the connector segments the later sweeps compare against each other.
 * @param records the decoded records
 * @param policy the run's policy
 * @param model the inspection model
 * @returns the findings, the segments, and how much segment work the pass did
 */
function structuralFindings(
	records: readonly DecodedRecord[],
	policy: InspectionPolicy,
	model: InspectionModel,
): { findings: InspectionFinding[]; segments: Segment[]; pathSegmentChecks: number } {
	const context: StructuralContext = {
		policy,
		model,
		segments: [],
		work: { pathSegmentChecks: 0 },
	};
	const incomingReferences = incomingReferenceIds(records);
	const findings: InspectionFinding[] = [];
	for (const record of records) {
		const raw = record.raw;
		if (!record.live || !raw) {
			continue;
		}
		const referenced = record.id !== null && incomingReferences.has(record.id);
		findings.push(...recordFindings(record, raw, context, referenced));
	}
	return {
		findings,
		segments: context.segments,
		pathSegmentChecks: context.work.pathSegmentChecks,
	};
}

export { structuralFindings };

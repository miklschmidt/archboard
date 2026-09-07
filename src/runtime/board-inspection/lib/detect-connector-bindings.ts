import type { InspectionFinding } from "@/runtime/board-inspection/schemas";
import { kindOf, type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import {
	classifyBindingTarget,
	type BlockingBindingIssue,
} from "@/runtime/board-inspection/lib/model";
import { affectedOf, make } from "@/runtime/board-inspection/lib/finding-builder";
import type { RawRecord, RecordMap } from "@/runtime/board-inspection/lib/connector-records";

/** Which end of a connector a finding is about. */
type ConnectorEnd = "start" | "end";

/** Both ends, in the order a connector's findings are reported in. */
const CONNECTOR_ENDS: readonly ConnectorEnd[] = ["start", "end"];

type BindingIssue =
	| BlockingBindingIssue
	| "missing-focus"
	| "nonfinite-focus"
	| "missing-gap"
	| "nonfinite-gap"
	| "invalid-fixed-point";

type BindingInspection =
	| {
			binding: Record<string, unknown> | null;
			issue: BlockingBindingIssue;
			readableTargetId: null;
			classificationBlocked: true;
	  }
	| {
			binding: Record<string, unknown>;
			issue: Exclude<BindingIssue, BlockingBindingIssue> | null;
			readableTargetId: string;
			classificationBlocked: false;
	  };

/** A binding inspection that found something wrong, which is what a finding is made from. */
type MalformedBinding = BindingInspection & { issue: BindingIssue };

/**
 * A binding value as a plain record, when that is what it is.
 * @param value the raw binding value
 * @returns the record, or null when the value is not one
 */
function bindingRecord(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return Object.fromEntries(Object.entries(value));
}

/**
 * Whether a value is a finite number, which is what a binding's focus and gap must be.
 * @param value the raw value
 * @returns true when the value is a finite number
 */
function finiteNumber(value: unknown): boolean {
	return typeof value === "number" && Number.isFinite(value);
}

/**
 * Whether a binding's fixed point is well formed: absent, or a pair of finite numbers.
 * @param value the raw fixedPoint value
 * @returns true when the fixed point is usable
 */
function validFixedPoint(value: unknown): boolean {
	if (value === null || value === undefined) {
		return true;
	}
	if (!Array.isArray(value) || value.length !== 2) {
		return false;
	}
	return value.every((component) => finiteNumber(component));
}

/**
 * The first thing wrong with a readable binding's own fields, checked in the order a reader
 * would need them: the focus first, then the gap, then the fixed point.
 * @param binding the binding as a record
 * @returns the issue, or null when every field reads
 */
function bindingFieldIssue(
	binding: Record<string, unknown>,
): Exclude<BindingIssue, BlockingBindingIssue> | null {
	if (!("focus" in binding)) {
		return "missing-focus";
	}
	if (!finiteNumber(binding["focus"])) {
		return "nonfinite-focus";
	}
	if (!("gap" in binding)) {
		return "missing-gap";
	}
	if (!finiteNumber(binding["gap"])) {
		return "nonfinite-gap";
	}
	return validFixedPoint(binding["fixedPoint"]) ? null : "invalid-fixed-point";
}

/**
 * What a connector's binding says, and whether it says it well enough to be followed. A
 * blocking issue stops the target from being classified at all; anything else still names a
 * readable target that the rest of the detector can go on to check.
 * @param value the raw binding value
 * @returns the inspection of the binding
 */
function bindingIssue(value: unknown): BindingInspection {
	const binding = bindingRecord(value);
	const target = classifyBindingTarget(value);
	if (target.blockingIssue !== null) {
		return {
			binding,
			issue: target.blockingIssue,
			readableTargetId: null,
			classificationBlocked: true,
		};
	}
	return {
		binding: binding ?? {},
		issue: binding === null ? null : bindingFieldIssue(binding),
		readableTargetId: target.readableTargetId ?? "",
		classificationBlocked: false,
	};
}

/**
 * Whether a binding inspection found something wrong.
 * @param inspection the inspection
 * @returns true when it names an issue
 */
function hasIssue(inspection: BindingInspection): inspection is MalformedBinding {
	return inspection.issue !== null;
}

/**
 * The finding for a binding whose own fields do not read. A binding that could not even be
 * classified affects coverage, because nothing downstream can tell what it meant.
 * @param record the connector
 * @param end which end the binding is on
 * @param value the raw binding value
 * @param inspection what the binding was found to say, with an issue in it
 * @returns the finding
 */
function malformedBindingFinding(
	record: DecodedRecord,
	end: ConnectorEnd,
	value: unknown,
	inspection: MalformedBinding,
): InspectionFinding {
	const shared = {
		code: "BROKEN_REFERENCE",
		reason: `malformed-${end}-binding`,
		severity: "error",
		message: `Connector ${record.id ?? record.sourceIndex} has a malformed ${end} binding.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	} as const;
	const shape = {
		connectorId: record.id,
		sourceIndex: record.sourceIndex,
		rawKind: kindOf(value),
	};
	return inspection.classificationBlocked
		? make({
				...shared,
				affectsCoverage: true,
				details: {
					...shape,
					issue: inspection.issue,
					readableTargetId: inspection.readableTargetId,
					classificationBlocked: true,
				},
			})
		: make({
				...shared,
				affectsCoverage: false,
				details: {
					...shape,
					issue: inspection.issue,
					readableTargetId: inspection.readableTargetId,
					classificationBlocked: false,
				},
			});
}

/**
 * Whether a bound element entry is the target naming this connector back.
 * @param entry one entry of the target's boundElements
 * @param connectorId the connector's identity
 * @returns true when the entry names the connector as an arrow
 */
function namesConnector(entry: unknown, connectorId: string): boolean {
	const record = bindingRecord(entry);
	if (record === null) {
		return false;
	}
	return record["id"] === connectorId && record["type"] === "arrow";
}

/**
 * The finding for a target a connector binds to that is not the kind of thing a binding can
 * point at, or that does not name the connector back.
 * @param record the connector
 * @param end which end the binding is on
 * @param connectorId the connector's identity
 * @param targetId the identity the binding names
 * @param target the record the binding names
 * @returns the finding, or null when the target is sound
 */
function boundTargetFinding(
	record: DecodedRecord,
	end: ConnectorEnd,
	connectorId: string,
	targetId: string,
	target: DecodedRecord,
): InspectionFinding | null {
	if (target.type === "arrow" || target.type === "line") {
		return make({
			code: "BROKEN_REFERENCE",
			reason: "invalid-binding-target-type",
			severity: "error",
			affectsCoverage: true,
			details: { connectorId, end, targetId, targetType: target.type },
			message: `Connector ${connectorId} binds to another connector.`,
			elements: [record.ref, target.ref],
			affected: affectedOf([record, target]),
		});
	}
	return reciprocalFinding(record, end, connectorId, targetId, target);
}

/**
 * The finding for a target that does not name the connector back, which leaves the binding
 * one-sided.
 * @param record the connector
 * @param end which end the binding is on
 * @param connectorId the connector's identity
 * @param targetId the identity the binding names
 * @param target the record the binding names
 * @returns the finding, or null when the target names the connector back
 */
function reciprocalFinding(
	record: DecodedRecord,
	end: ConnectorEnd,
	connectorId: string,
	targetId: string,
	target: DecodedRecord,
): InspectionFinding | null {
	const bounds = target.raw?.boundElements;
	if (Array.isArray(bounds) && bounds.some((entry) => namesConnector(entry, connectorId))) {
		return null;
	}
	return make({
		code: "BROKEN_REFERENCE",
		reason: "missing-binding-reciprocal",
		severity: "error",
		affectsCoverage: false,
		details: { connectorId, end, targetId },
		message: `Target ${targetId} does not name connector ${connectorId}.`,
		elements: [record.ref, target.ref],
		affected: affectedOf([record, target]),
	});
}

/**
 * The finding for the target a readable binding names: missing, of a kind a binding cannot
 * point at, or not naming the connector back.
 * @param record the connector
 * @param end which end the binding is on
 * @param targetId the identity the binding names
 * @param byId the board's records by identity
 * @returns the finding, or null when the target is sound
 */
function bindingTargetFinding(
	record: DecodedRecord,
	end: ConnectorEnd,
	targetId: string,
	byId: RecordMap,
): InspectionFinding | null {
	const connectorId = record.id ?? "";
	const target = byId.get(targetId);
	if (target === undefined) {
		return make({
			code: "BROKEN_REFERENCE",
			reason: "missing-binding-target",
			severity: "error",
			affectsCoverage: true,
			details: { connectorId, end, targetId },
			message: `Connector ${connectorId} names missing target ${targetId}.`,
			elements: [record.ref],
			affected: record.evidenceBox,
		});
	}
	return boundTargetFinding(record, end, connectorId, targetId, target);
}

/**
 * The identity a binding names, when it is one worth looking up: the binding must have been
 * classified, the connector must have a usable identity of its own, and the target's identity
 * must not be one several records claim, since then nothing says which one it meant.
 * @param record the connector
 * @param inspection what the binding was found to say
 * @param duplicateIds the identities more than one record claims
 * @returns the identity, or null when the target cannot be followed
 */
function followableTargetId(
	record: DecodedRecord,
	inspection: BindingInspection,
	duplicateIds: ReadonlySet<string>,
): string | null {
	if (inspection.classificationBlocked || !record.usableId || record.id === null) {
		return null;
	}
	const targetId = inspection.readableTargetId;
	if (targetId === "" || duplicateIds.has(targetId)) {
		return null;
	}
	return targetId;
}

/**
 * One end's binding findings: what the binding itself says, and what the target it names does.
 * @param record the connector
 * @param raw the connector's raw fields
 * @param end which end to check
 * @param byId the board's records by identity
 * @param duplicateIds the identities more than one record claims
 * @returns the findings for that end
 */
function endBindingFindings(
	record: DecodedRecord,
	raw: RawRecord,
	end: ConnectorEnd,
	byId: RecordMap,
	duplicateIds: ReadonlySet<string>,
): InspectionFinding[] {
	const value = raw[`${end}Binding`] ?? null;
	if (value === null) {
		return [];
	}
	const inspection = bindingIssue(value);
	const findings = hasIssue(inspection)
		? [malformedBindingFinding(record, end, value, inspection)]
		: [];
	const targetId = followableTargetId(record, inspection, duplicateIds);
	if (targetId === null) {
		return findings;
	}
	const targetFinding = bindingTargetFinding(record, end, targetId, byId);
	return targetFinding === null ? findings : [...findings, targetFinding];
}

/**
 * Everything wrong with a connector's bindings, at both ends: a binding that does not read, a
 * target that is not there, one of a kind a binding cannot point at, and one that does not
 * name the connector back.
 * @param record the connector
 * @param raw the connector's raw fields
 * @param byId the board's records by identity
 * @param duplicateIds the identities more than one record claims
 * @returns the binding findings
 */
function connectorBindingFindings(
	record: DecodedRecord,
	raw: RawRecord,
	byId: RecordMap,
	duplicateIds: ReadonlySet<string>,
): InspectionFinding[] {
	return CONNECTOR_ENDS.flatMap((end) => endBindingFindings(record, raw, end, byId, duplicateIds));
}

/**
 * The identity an input-only endpoint names, when the endpoint is a record naming one.
 * @param value the raw endpoint value
 * @returns the identity, or null
 */
function endpointTargetId(value: unknown): string | null {
	const endpoint = bindingRecord(value);
	const id = endpoint === null ? undefined : endpoint["id"];
	return typeof id === "string" && id !== "" ? id : null;
}

/**
 * The finding for one end whose input-only endpoint was persisted: the board holds a `start`
 * or `end` seed that the write boundary should have spent into a binding.
 * @param record the connector
 * @param raw the connector's raw fields
 * @param end which end to check
 * @param connectorId the connector's identity
 * @returns the finding, or null when nothing was persisted or the binding agrees with it
 */
function persistedEndpointFinding(
	record: DecodedRecord,
	raw: RawRecord,
	end: ConnectorEnd,
	connectorId: string,
): InspectionFinding | null {
	const inputId = endpointTargetId(raw[end]);
	if (inputId === null) {
		return null;
	}
	const binding = bindingRecord(raw[`${end}Binding`]);
	const bindingId = binding === null ? null : binding["elementId"];
	if (bindingId === inputId) {
		return null;
	}
	return make({
		code: "BROKEN_REFERENCE",
		reason: "persisted-agent-endpoint",
		severity: "error",
		affectsCoverage: true,
		details: {
			connectorId,
			end,
			inputTargetId: inputId,
			bindingTargetId: typeof bindingId === "string" ? bindingId : null,
		},
		message: `Connector ${connectorId} persists an input-only ${end} endpoint.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	});
}

/**
 * The findings for input-only endpoints a connector has persisted. `start` and `end` are
 * spellings spent at the write boundary; a board that still holds one has kept a seed the
 * binding no longer agrees with.
 * @param record the connector
 * @param raw the connector's raw fields
 * @returns the findings
 */
function persistedEndpointFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	const connectorId = record.id;
	if (connectorId === null) {
		return [];
	}
	return CONNECTOR_ENDS.flatMap((end) => {
		const finding = persistedEndpointFinding(record, raw, end, connectorId);
		return finding === null ? [] : [finding];
	});
}

export { connectorBindingFindings, persistedEndpointFindings };

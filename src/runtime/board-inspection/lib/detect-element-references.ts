import type { InspectionFinding } from "@/runtime/board-inspection/schemas";
import {
	kindOf,
	stableDescription,
	type DecodedRecord,
} from "@/runtime/board-inspection/lib/decode";
import {
	boundElementTargetCompatible,
	classifyBoundElements,
} from "@/runtime/board-inspection/lib/model";
import { affectedOf, make } from "@/runtime/board-inspection/lib/finding-builder";
import type { RawRecord, RecordMap } from "@/runtime/board-inspection/lib/connector-records";
import { KNOWN_ELEMENT_TYPES } from "@/runtime/board-inspection/lib/element-types";

/** One entry of a well-formed boundElements list. */
type BoundEntry = ReturnType<typeof classifyBoundElements>["readableEntries"][number];

/** One entry of a boundElements list that could not be read. */
type BoundProblem = ReturnType<typeof classifyBoundElements>["problems"][number];

/**
 * The finding for a boundElements entry that does not read, which stops the owner's bindings
 * from being classified at all.
 * @param record the owning element
 * @param bounds the raw boundElements value
 * @param problem what could not be read
 * @param readableEntries the entries that did read
 * @returns the finding
 */
function malformedBoundsFinding(
	record: DecodedRecord,
	bounds: unknown,
	problem: BoundProblem,
	readableEntries: BoundEntry[],
): InspectionFinding {
	return make({
		code: "BROKEN_REFERENCE",
		reason: "malformed-bound-elements",
		severity: "error",
		affectsCoverage: true,
		details: {
			ownerId: record.id,
			sourceIndex: record.sourceIndex,
			rawKind: kindOf(bounds),
			entryIndex: problem.entryIndex,
			issue: problem.issue,
			readableEntries,
			classificationBlocked: true,
		},
		message: `Element ${record.id ?? record.sourceIndex} has malformed boundElements.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	});
}

/**
 * The finding for a bound entry that names nothing on the board.
 * @param record the owning element
 * @param ownerId the owner's identity
 * @param entry the entry that names the missing target
 * @returns the finding
 */
function danglingBoundFinding(
	record: DecodedRecord,
	ownerId: string,
	entry: BoundEntry,
): InspectionFinding {
	return make({
		code: "BROKEN_REFERENCE",
		reason: entry.type === "text" ? "dangling-bound-text" : "dangling-bound-arrow",
		severity: "error",
		affectsCoverage: false,
		details: { ownerId, targetId: entry.id },
		message: `Element ${ownerId} names missing bound ${entry.type} ${entry.id}.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	});
}

/**
 * The finding for a bound entry whose target is on the board but is not the kind of thing the
 * entry says it is.
 * @param record the owning element
 * @param ownerId the owner's identity
 * @param entry the entry declaring the target's kind
 * @param target the record the entry names
 * @param targetType the kind the target actually is
 * @returns the finding
 */
function boundTypeMismatchFinding(
	record: DecodedRecord,
	ownerId: string,
	entry: BoundEntry,
	target: DecodedRecord,
	targetType: string,
): InspectionFinding {
	return make({
		code: "BROKEN_REFERENCE",
		reason: "bound-element-target-type-mismatch",
		severity: "error",
		affectsCoverage: true,
		details: { ownerId, targetId: entry.id, declaredType: entry.type, actualType: targetType },
		message: `Element ${ownerId} declares ${entry.id} as bound ${entry.type}, but it is ${targetType}.`,
		elements: [record.ref, target.ref],
		affected: affectedOf([record, target]),
	});
}

/**
 * What is wrong with one bound entry's target: nothing there, or something of a kind the entry
 * does not describe. An entry whose identity several records claim is left alone, because
 * nothing says which of them it meant.
 * @param record the owning element
 * @param ownerId the owner's identity
 * @param entry the entry to follow
 * @param byId the board's records by identity
 * @param duplicateIds the identities more than one record claims
 * @returns the finding, or null when the entry is sound or cannot be followed
 */
function boundEntryFinding(
	record: DecodedRecord,
	ownerId: string,
	entry: BoundEntry,
	byId: RecordMap,
	duplicateIds: ReadonlySet<string>,
): InspectionFinding | null {
	if (duplicateIds.has(entry.id)) {
		return null;
	}
	const target = byId.get(entry.id);
	if (target === undefined) {
		return danglingBoundFinding(record, ownerId, entry);
	}
	const targetType = target.type;
	if (targetType === null || !KNOWN_ELEMENT_TYPES.has(targetType)) {
		return null;
	}
	return boundElementTargetCompatible(entry.type, targetType)
		? null
		: boundTypeMismatchFinding(record, ownerId, entry, target, targetType);
}

/**
 * Everything wrong with an element's boundElements: entries that do not read, entries naming
 * nothing, and entries whose target is not the kind of thing they declare.
 * @param record the owning element
 * @param raw the element's raw fields
 * @param byId the board's records by identity
 * @param duplicateIds the identities more than one record claims
 * @returns the findings
 */
function boundElementFindings(
	record: DecodedRecord,
	raw: RawRecord,
	byId: RecordMap,
	duplicateIds: ReadonlySet<string>,
): InspectionFinding[] {
	const bounds = raw["boundElements"] ?? null;
	if (bounds === null) {
		return [];
	}
	const { readableEntries, problems } = classifyBoundElements(bounds);
	const findings = problems.map((problem) =>
		malformedBoundsFinding(record, bounds, problem, readableEntries),
	);
	const ownerId = record.usableId ? record.id : null;
	if (ownerId === null) {
		return findings;
	}
	return [
		...findings,
		...readableEntries.flatMap((entry) => {
			const finding = boundEntryFinding(record, ownerId, entry, byId, duplicateIds);
			return finding === null ? [] : [finding];
		}),
	];
}

/**
 * The finding for a text element whose containerId is present but unusable, which leaves the
 * label with no owner anything can classify.
 * @param record the text element
 * @param raw the element's raw fields
 * @returns the findings
 */
function containerFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	const containerId = raw["containerId"] ?? null;
	if (record.type !== "text" || containerId === null) {
		return [];
	}
	return usableContainerId(containerId) ? [] : [malformedContainerFinding(record, containerId)];
}

/**
 * The finding for a containerId that is present but names no owner.
 * @param record the text element
 * @param containerId the raw containerId
 * @returns the finding
 */
function malformedContainerFinding(record: DecodedRecord, containerId: unknown): InspectionFinding {
	return make({
		code: "BROKEN_REFERENCE",
		reason: "malformed-container-id",
		severity: "error",
		affectsCoverage: true,
		details: {
			textId: record.id,
			sourceIndex: record.sourceIndex,
			rawKind: kindOf(containerId),
			rawDescription: stableDescription(containerId),
			issue: containerId === "" ? "empty-container-id" : "non-string-container-id",
			ownerClassificationBlocked: true,
		},
		message: `Text ${record.id ?? record.sourceIndex} has a malformed containerId.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	});
}

/**
 * Whether a containerId names an owner anything can look up.
 * @param containerId the raw containerId
 * @returns true when it is a nonempty string
 */
function usableContainerId(containerId: unknown): boolean {
	return typeof containerId === "string" && containerId.length > 0;
}

/**
 * A record's own fields as a plain record, when it is one.
 * @param value the raw value
 * @returns the record, or null
 */
function plainRecord(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return Object.fromEntries(Object.entries(value));
}

/**
 * The identities one record points at: the container it is a label of, the targets its two
 * bindings name, and every bound element it lists.
 * @param raw the record's raw fields
 * @returns the identities it names
 */
function referencedIds(raw: RawRecord): string[] {
	const named: unknown[] = [raw["containerId"]];
	for (const end of ["start", "end"] as const) {
		named.push(plainRecord(raw[`${end}Binding`])?.["elementId"]);
	}
	const bounds = raw["boundElements"];
	if (Array.isArray(bounds)) {
		for (const entry of bounds) {
			named.push(plainRecord(entry)?.["id"]);
		}
	}
	return named.filter((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * Every identity anything on the board points at. An element that nothing names is one the
 * inspection can leave alone when it cannot model its geometry.
 * @param records the decoded records
 * @returns the identities with something pointing at them
 */
function incomingReferenceIds(records: readonly DecodedRecord[]): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const record of records) {
		if (!record.live || !record.raw) {
			continue;
		}
		for (const id of referencedIds(record.raw)) {
			ids.add(id);
		}
	}
	return ids;
}

export { boundElementFindings, containerFindings, incomingReferenceIds };

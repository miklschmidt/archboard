import type { InspectionFinding } from "@/runtime/board-inspection/schemas";
import {
	kindOf,
	stableDescription,
	type DecodedRecord,
} from "@/runtime/board-inspection/lib/decode";
import {
	aggregateBoxes,
	finite,
	focusBox,
	type ExactBox,
} from "@/runtime/board-inspection/lib/geometry";
import {
	archboardMetadata,
	groupIds,
	libraryAttribution,
	type InspectionModel,
} from "@/runtime/board-inspection/lib/model";
import {
	affectedOf,
	evidenceBoxesOf,
	make,
	uniqueRefs,
} from "@/runtime/board-inspection/lib/finding-builder";

/** The shapes a node body can be. */
const BODY_TYPES = new Set(["rectangle", "ellipse", "diamond"]);
/** The shapes that join two other elements rather than enclosing anything. */
const CONNECTOR_TYPES = new Set(["arrow", "line"]);
/** The shapes that enclose an interior, which is what makes them a boundary. */
const CLOSED_BOUNDARY_TYPES = new Set(["rectangle", "ellipse", "diamond", "frame"]);

/** Where a record sits on the canvas, when both of its coordinates read as finite numbers. */
interface RecordOrigin {
	x: number;
	y: number;
}

type IntendedRole = Extract<
	InspectionFinding,
	{ code: "BROKEN_REFERENCE"; reason: "invalid-element-identity" }
>["details"]["intendedRoles"][number];

/**
 * What a record without a usable identity was evidently for, so a broken-identity finding can
 * say what the board loses by it rather than only that an id is missing.
 * @param record the decoded record
 * @returns the roles the record was standing in, in a stable order
 */
function identityRoles(record: DecodedRecord): IntendedRole[] {
	const roles = new Set<IntendedRole>();
	addShapeRoles(record, roles);
	addTextRoles(record, roles);
	const metadata = archboardMetadata(record);
	if (metadata && "node" in metadata) {
		roles.add("semantic-node-member");
	}
	if (record.raw?.boundElements !== undefined) {
		roles.add("label-container");
	}
	return [...roles].toSorted();
}

/**
 * The roles a record's shape gives it: a connector, a closed boundary, or a body that can
 * carry library attribution, a qualifying group, or a node overlap.
 * @param record the decoded record
 * @param roles the accumulating roles, added to in place
 */
function addShapeRoles(record: DecodedRecord, roles: Set<IntendedRole>): void {
	const type = record.type ?? "";
	if (CONNECTOR_TYPES.has(type)) {
		roles.add("connector");
	}
	if (CLOSED_BOUNDARY_TYPES.has(type)) {
		roles.add("closed-boundary");
	}
	if (BODY_TYPES.has(type)) {
		addBodyRoles(record, roles);
	}
}

/**
 * The roles a node body has: it is something a node can overlap, and it may carry a valid
 * library attribution or belong to a group that qualifies it.
 * @param record the decoded record
 * @param roles the accumulating roles, added to in place
 */
function addBodyRoles(record: DecodedRecord, roles: Set<IntendedRole>): void {
	if (libraryAttribution(record)?.valid === true) {
		roles.add("valid-library-body");
	}
	if (groupIds(record).length > 0) {
		roles.add("qualifying-group-body");
	}
	roles.add("node-overlap-body");
}

/**
 * The roles a text record has: it is judged by the font policy, it can overlap a label, and
 * it may be bound to a container.
 * @param record the decoded record
 * @param roles the accumulating roles, added to in place
 */
function addTextRoles(record: DecodedRecord, roles: Set<IntendedRole>): void {
	if (record.type !== "text") {
		return;
	}
	roles.add("font-policy-text");
	roles.add("label-overlap-body");
	if (record.raw?.containerId !== undefined) {
		roles.add("bound-label");
	}
}

/**
 * Everything wrong with the board's identities: records that carry no usable id, and ids that
 * more than one record claims. Both break every reference that names them.
 * @param records the decoded records
 * @returns the findings, unusable identities first
 */
function identityFindings(records: readonly DecodedRecord[]): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	const duplicate = new Map<string, DecodedRecord[]>();
	for (const record of records.filter((candidate) => candidate.live)) {
		if (record.id === null) {
			findings.push(invalidIdentityFinding(record));
			continue;
		}
		const list = duplicate.get(record.id) ?? [];
		list.push(record);
		duplicate.set(record.id, list);
	}
	for (const [id, matches] of duplicate) {
		if (matches.length > 1) {
			findings.push(duplicateIdentityFinding(id, matches));
		}
	}
	return findings;
}

/**
 * Which way a record's identity is unusable.
 * @param record the decoded record
 * @returns the identity issue
 */
function identityIssueOf(
	record: DecodedRecord,
): "missing-id" | "empty-string-id" | "non-string-id" {
	if (!hasIdField(record)) {
		return "missing-id";
	}
	return record.raw?.id === "" ? "empty-string-id" : "non-string-id";
}

/**
 * Whether a record carries an id field at all, however unusable its value.
 * @param record the decoded record
 * @returns true when the field is present with a value
 */
function hasIdField(record: DecodedRecord): boolean {
	if (!record.raw || !("id" in record.raw)) {
		return false;
	}
	return record.raw.id !== undefined;
}

/**
 * The finding for a record whose identity cannot be used, saying what the record was for so a
 * reader knows what the board loses.
 * @param record the decoded record
 * @returns the finding
 */
function invalidIdentityFinding(record: DecodedRecord): InspectionFinding {
	const roles = identityRoles(record);
	const issue = identityIssueOf(record);
	const rawId = record.raw?.id;
	const details = {
		identityIssue: issue,
		rawIdType: hasIdField(record) ? kindOf(rawId) : ("missing" as const),
		rawIdDescription: stableDescription(rawId),
		sourceIndex: record.sourceIndex,
		intendedRoles: roles,
		availableElementType: record.type,
	};
	const shared = {
		code: "BROKEN_REFERENCE",
		reason: "invalid-element-identity",
		severity: "error",
		message: `Element at source index ${record.sourceIndex} has ${issue}.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	} as const;
	// A record that was standing in no role is not counted against coverage: nothing on the
	// board was relying on it, so its unusable identity costs the inspection nothing.
	return roles.length > 0
		? make({ ...shared, affectsCoverage: true, details })
		: make({ ...shared, affectsCoverage: false, details: { ...details, intendedRoles: [] } });
}

/**
 * The finding for one identity that several records claim.
 * @param id the duplicated identity
 * @param matches the records claiming it
 * @returns the finding
 */
function duplicateIdentityFinding(
	id: string,
	matches: readonly DecodedRecord[],
): InspectionFinding {
	return make({
		code: "BROKEN_REFERENCE",
		reason: "duplicate-element-id",
		severity: "error",
		affectsCoverage: true,
		details: {
			duplicateId: id,
			sourceIndexes: matches.map((record) => record.sourceIndex).toSorted((a, b) => a - b),
		},
		message: `Element id ${id} occurs ${matches.length} times.`,
		elements: uniqueRefs(matches),
		affected: affectedOf(matches),
	});
}

/**
 * The findings for records whose render geometry does not read as finite numbers: one that
 * cannot even be located, and one that can be located but not drawn.
 * @param records the decoded records
 * @returns the findings
 */
function renderFindings(records: readonly DecodedRecord[]): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const record of records) {
		if (!record.live || record.invalidRenderFields.length === 0) {
			continue;
		}
		const origin = renderOrigin(record);
		findings.push(
			origin === null ? unlocatableFinding(record) : invalidRenderFinding(record, origin),
		);
	}
	return findings;
}

/**
 * The origin a record can still be pointed at, when both its coordinates read as finite.
 * @param record the decoded record
 * @returns the origin, or null when the record cannot be located
 */
function renderOrigin(record: DecodedRecord): RecordOrigin | null {
	const raw = record.raw;
	if (!raw || typeof raw.x !== "number" || typeof raw.y !== "number") {
		return null;
	}
	return Number.isFinite(raw.x) && Number.isFinite(raw.y) ? { x: raw.x, y: raw.y } : null;
}

/**
 * The finding for a record that cannot be placed on the canvas at all.
 * @param record the decoded record
 * @returns the finding
 */
function unlocatableFinding(record: DecodedRecord): InspectionFinding {
	return make({
		code: "INVALID_RENDER_GEOMETRY",
		reason: "unlocatable-record",
		severity: "error",
		affectsCoverage: true,
		details: {
			recordKind: record.type ?? kindOf(record.raw),
			invalidFields: record.invalidRenderFields,
			sourceIndex: record.sourceIndex,
		},
		message: `Element at source index ${record.sourceIndex} cannot be located.`,
		elements: [record.ref],
		affected: null,
	});
}

/**
 * The finding for a record that can be placed but whose geometry does not read.
 * @param record the decoded record
 * @param origin the origin it can still be pointed at
 * @returns the finding
 */
function invalidRenderFinding(record: DecodedRecord, origin: RecordOrigin): InspectionFinding {
	const fields = record.invalidRenderFields;
	return make({
		code: "INVALID_RENDER_GEOMETRY",
		reason: "invalid-render-fields",
		severity: "error",
		affectsCoverage: true,
		details: {
			invalidFields: fields,
			valueKinds: Object.fromEntries(fields.map((field) => [field, kindOf(record.raw?.[field])])),
		},
		message: `Element ${record.id ?? `at source index ${record.sourceIndex}`} has invalid render geometry.`,
		elements: [record.ref],
		points: [origin],
		affected: record.evidenceBox,
	});
}

type CoordinateSpanScope = Extract<
	InspectionFinding,
	{ code: "AMBIGUOUS_GEOMETRY"; reason: "unrepresentable-coordinate-span" }
>["details"]["scope"];

/**
 * The box a coordinate-span finding is drawn around: the members' aggregate when it is
 * representable, the representative the aggregate fell back to, and failing both a zero-sized
 * box at the earliest member that still has a finite origin, so the finding can be focused.
 * @param members the records whose span does not resolve
 * @returns the box, or null when no member has a usable origin
 */
function coordinateSpanBox(members: readonly DecodedRecord[]): ExactBox | null {
	const aggregate = aggregateBoxes(evidenceBoxesOf(members));
	if (aggregate.kind === "representable") {
		return aggregate.box;
	}
	if (aggregate.kind === "unrepresentable") {
		return aggregate.representative;
	}
	return originBox(members);
}

/**
 * A zero-sized box at the earliest member that still reads as a finite point.
 * @param members the records whose span does not resolve
 * @returns the box, or null when no member has a finite origin
 */
function originBox(members: readonly DecodedRecord[]): ExactBox | null {
	const located = members.filter((record) => finiteOrigin(record) !== null);
	const earliest = located.toSorted((a, b) => a.sourceIndex - b.sourceIndex)[0];
	const origin = earliest === undefined ? null : finiteOrigin(earliest);
	return origin === null ? null : { x: origin.x, y: origin.y, width: 0, height: 0 };
}

/**
 * A record's origin when both of its coordinates read as finite numbers.
 * @param record the decoded record
 * @returns the origin, or null
 */
function finiteOrigin(record: DecodedRecord): RecordOrigin | null {
	const raw = record.raw;
	if (!raw || !finite(raw.x) || !finite(raw.y)) {
		return null;
	}
	return typeof raw.x === "number" && typeof raw.y === "number" ? { x: raw.x, y: raw.y } : null;
}

/**
 * The finding for a set of records whose individually finite geometry has no finite union, so
 * nothing on the canvas can be drawn around all of them at once.
 * @param scope what the span was being taken over
 * @param subjectId the subject the span belongs to, when it has one
 * @param members the records in the span
 * @returns the finding
 */
function coordinateSpanFinding(
	scope: CoordinateSpanScope,
	subjectId: string | null,
	members: readonly DecodedRecord[],
): InspectionFinding {
	const sources = members.map((record) => record.sourceIndex).toSorted((a, b) => a - b);
	const affected = coordinateSpanBox(members);
	return make({
		code: "AMBIGUOUS_GEOMETRY",
		reason: "unrepresentable-coordinate-span",
		severity: "warning",
		affectsCoverage: true,
		details: {
			scope,
			subjectId,
			sourceIndexes: sources,
			issue: "finite-constituents-have-no-finite-union",
		},
		message: `${scope} ${subjectId ?? sources.join(",")} has no finite aggregate coordinate span.`,
		elements: uniqueRefs(members),
		affected,
	});
}

/**
 * Everywhere a coordinate span fails to resolve: one record's own extent, an aggregate the
 * model already failed on, and the union of what an existing finding names.
 * @param records the decoded records
 * @param model the inspection model
 * @param produced the findings the detectors have already made
 * @returns the coordinate-span findings
 */
function coordinateSpanFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
	produced: readonly InspectionFinding[],
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const record of records.filter(hasUnrepresentableExtent)) {
		findings.push(coordinateSpanFinding("record-extent", record.id, [record]));
	}
	for (const failure of model.aggregateFailures) {
		findings.push(coordinateSpanFinding(failure.scope, failure.subjectId, failure.members));
	}
	return [...findings, ...affectedUnionFindings(records, produced)];
}

/**
 * Whether a record that reads as valid geometry still has no representable extent of its own.
 * @param record the decoded record
 * @returns true when its own extent does not resolve
 */
function hasUnrepresentableExtent(record: DecodedRecord): boolean {
	if (!record.live || !record.raw || record.invalidRenderFields.length > 0) {
		return false;
	}
	return !record.extentRepresentable;
}

/**
 * The findings for existing findings whose own named elements have no finite union, reported
 * once per distinct set of elements so one span is not named twice.
 * @param records the decoded records
 * @param produced the findings the detectors have already made
 * @returns the union findings
 */
function affectedUnionFindings(
	records: readonly DecodedRecord[],
	produced: readonly InspectionFinding[],
): InspectionFinding[] {
	const bySource = new Map(records.map((record) => [record.sourceIndex, record]));
	const findings: InspectionFinding[] = [];
	const seen = new Set<string>();
	for (const finding of produced) {
		const members = evidencedMembers(finding, bySource);
		if (members.length < 2 || aggregateBoxes(evidenceBoxesOf(members)).kind !== "unrepresentable") {
			continue;
		}
		const key = members
			.map((record) => record.sourceIndex)
			.toSorted((a, b) => a - b)
			.join(",");
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		findings.push(coordinateSpanFinding("finding-affected-union", null, members));
	}
	return findings;
}

/**
 * The records a finding names that carry evidence of where they are.
 * @param finding the finding
 * @param bySource the records by their input slot
 * @returns the evidenced records
 */
function evidencedMembers(
	finding: InspectionFinding,
	bySource: ReadonlyMap<number, DecodedRecord>,
): DecodedRecord[] {
	return finding.elements
		.map((reference) => bySource.get(reference.sourceIndex))
		.filter(
			(record): record is DecodedRecord => record !== undefined && record.evidenceBox !== null,
		);
}

/**
 * The findings for findings that cannot be focused: their own box plus the report's exact 16px
 * padding is not a finite, representable box, so pointing a reader at them would move them.
 * @param produced the findings the detectors have already made
 * @returns the focus-padding findings
 */
function focusPaddingFindings(produced: readonly InspectionFinding[]): InspectionFinding[] {
	return produced.flatMap((finding) => {
		if (
			finding.affectedBBox === null ||
			finding.focusBBox !== null ||
			(finding.code === "AMBIGUOUS_GEOMETRY" && finding.reason === "unrepresentable-focus-padding")
		) {
			return [];
		}
		const focusResult = focusBox(finding.affectedBBox);
		if (focusResult.kind !== "unrepresentable") {
			return [];
		}
		return [
			make({
				code: "AMBIGUOUS_GEOMETRY",
				reason: "unrepresentable-focus-padding",
				severity: "warning",
				affectsCoverage: true,
				details: {
					padding: 16,
					failedDeltas: focusResult.failedDeltas,
					issue: "exact-16px-padding-is-not-finite-and-representable",
				},
				message: `Finding ${finding.code}/${finding.reason} cannot represent exact 16px focus padding.`,
				elements: finding.elements,
				nodes: finding.nodes,
				obstacles: finding.obstacles,
				points: finding.points,
				affected: finding.affectedBBox,
			}),
		];
	});
}

export { coordinateSpanFindings, focusPaddingFindings, identityFindings, renderFindings };

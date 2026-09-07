import type { InspectionFinding } from "@/runtime/board-inspection/schemas";
import {
	kindOf,
	stableDescription,
	type DecodedRecord,
} from "@/runtime/board-inspection/lib/decode";
import { aggregateBoxes, finite, focusBox } from "@/runtime/board-inspection/lib/geometry";
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

type IntendedRole = Extract<
	InspectionFinding,
	{ code: "BROKEN_REFERENCE"; reason: "invalid-element-identity" }
>["details"]["intendedRoles"][number];

function identityRoles(record: DecodedRecord): IntendedRole[] {
	const roles = new Set<IntendedRole>();
	const type = record.type;
	const metadata = archboardMetadata(record);
	if (type === "arrow" || type === "line") {
		roles.add("connector");
	}
	if (metadata && "node" in metadata) {
		roles.add("semantic-node-member");
	}
	if (type === "rectangle" || type === "ellipse" || type === "diamond") {
		if (libraryAttribution(record)?.valid) {
			roles.add("valid-library-body");
		}
		if (groupIds(record).length > 0) {
			roles.add("qualifying-group-body");
		}
		roles.add("node-overlap-body");
	}
	if (type === "text") {
		roles.add("font-policy-text");
		roles.add("label-overlap-body");
	}
	if (type === "text" && record.raw?.containerId !== undefined) {
		roles.add("bound-label");
	}
	if (record.raw?.boundElements !== undefined) {
		roles.add("label-container");
	}
	if (["rectangle", "ellipse", "diamond", "frame"].includes(type ?? "")) {
		roles.add("closed-boundary");
	}
	return [...roles].toSorted();
}

function identityFindings(records: readonly DecodedRecord[]): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	const duplicate = new Map<string, DecodedRecord[]>();
	for (const record of records.filter((candidate) => candidate.live)) {
		const rawId = record.raw?.id;
		if (!record.id) {
			const roles = identityRoles(record);
			const missing = !record.raw || !("id" in record.raw) || rawId === undefined;
			const issue: "missing-id" | "empty-string-id" | "non-string-id" = missing
				? "missing-id"
				: rawId === ""
					? "empty-string-id"
					: "non-string-id";
			const rawIdType: ReturnType<typeof kindOf> | "missing" =
				!record.raw || !("id" in record.raw) ? "missing" : kindOf(rawId);
			const shared = {
				code: "BROKEN_REFERENCE",
				reason: "invalid-element-identity",
				severity: "error",
				message: `Element at source index ${record.sourceIndex} has ${issue}.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			} as const;
			const details = {
				identityIssue: issue,
				rawIdType,
				rawIdDescription: stableDescription(rawId),
				sourceIndex: record.sourceIndex,
				intendedRoles: roles,
				availableElementType: record.type,
			};
			findings.push(
				roles.length > 0
					? make({ ...shared, affectsCoverage: true, details })
					: make({ ...shared, affectsCoverage: false, details: { ...details, intendedRoles: [] } }),
			);
		} else {
			const list = duplicate.get(record.id) ?? [];
			list.push(record);
			duplicate.set(record.id, list);
		}
	}
	for (const [id, matches] of duplicate) {
		if (matches.length > 1) {
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "duplicate-element-id",
					severity: "error",
					affectsCoverage: true,
					details: {
						duplicateId: id,
						sourceIndexes: matches.map((r) => r.sourceIndex).toSorted((a, b) => a - b),
					},
					message: `Element id ${id} occurs ${matches.length} times.`,
					elements: uniqueRefs(matches),
					affected: affectedOf(matches),
				}),
			);
		}
	}
	return findings;
}

function renderFindings(records: readonly DecodedRecord[]): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const record of records.filter((candidate) => candidate.live)) {
		const raw = record.raw;
		const fields = record.invalidRenderFields;
		if (fields.length === 0) {
			continue;
		}
		const locatable =
			typeof raw?.x === "number" &&
			Number.isFinite(raw.x) &&
			typeof raw?.y === "number" &&
			Number.isFinite(raw.y);
		if (!locatable) {
			findings.push(
				make({
					code: "INVALID_RENDER_GEOMETRY",
					reason: "unlocatable-record",
					severity: "error",
					affectsCoverage: true,
					details: {
						recordKind: record.type ?? kindOf(record.raw),
						invalidFields: fields,
						sourceIndex: record.sourceIndex,
					},
					message: `Element at source index ${record.sourceIndex} cannot be located.`,
					elements: [record.ref],
					affected: null,
				}),
			);
		} else {
			findings.push(
				make({
					code: "INVALID_RENDER_GEOMETRY",
					reason: "invalid-render-fields",
					severity: "error",
					affectsCoverage: true,
					details: {
						invalidFields: fields,
						valueKinds: Object.fromEntries(fields.map((f) => [f, kindOf(raw?.[f])])),
					},
					message: `Element ${record.id ?? `at source index ${record.sourceIndex}`} has invalid render geometry.`,
					elements: [record.ref],
					points: [{ x: raw.x, y: raw.y }],
					affected: record.evidenceBox,
				}),
			);
		}
	}
	return findings;
}

type CoordinateSpanScope = Extract<
	InspectionFinding,
	{ code: "AMBIGUOUS_GEOMETRY"; reason: "unrepresentable-coordinate-span" }
>["details"]["scope"];

function coordinateSpanFinding(
	scope: CoordinateSpanScope,
	subjectId: string | null,
	members: readonly DecodedRecord[],
): InspectionFinding {
	const sourceInput = members.map((record) => record.sourceIndex);
	const sources = sourceInput.toSorted((a, b) => a - b);
	const aggregate = aggregateBoxes(evidenceBoxesOf(members));
	const originCandidates = members.filter(
		(record) => record.raw && finite(record.raw.x) && finite(record.raw.y),
	);
	const originEvidence = originCandidates.toSorted((a, b) => a.sourceIndex - b.sourceIndex)[0];
	const affected =
		aggregate.kind === "representable"
			? aggregate.box
			: aggregate.kind === "unrepresentable"
				? aggregate.representative
				: originEvidence?.raw
					? {
							x: originEvidence.raw.x as number,
							y: originEvidence.raw.y as number,
							width: 0,
							height: 0,
						}
					: null;
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

function coordinateSpanFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
	produced: readonly InspectionFinding[],
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const record of records) {
		if (
			record.live &&
			record.raw &&
			record.invalidRenderFields.length === 0 &&
			!record.extentRepresentable
		) {
			findings.push(coordinateSpanFinding("record-extent", record.id, [record]));
		}
	}
	for (const failure of model.aggregateFailures) {
		findings.push(coordinateSpanFinding(failure.scope, failure.subjectId, failure.members));
	}
	const bySource = new Map(records.map((record) => [record.sourceIndex, record]));
	const seen = new Set<string>();
	for (const finding of produced) {
		const members = finding.elements
			.map((reference) => bySource.get(reference.sourceIndex))
			.filter((record): record is DecodedRecord => !!record && !!record.evidenceBox);
		if (members.length < 2 || aggregateBoxes(evidenceBoxesOf(members)).kind !== "unrepresentable") {
			continue;
		}
		const keyMembers = members.map((record) => record.sourceIndex);
		const key = keyMembers.toSorted((a, b) => a - b).join(",");
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		findings.push(coordinateSpanFinding("finding-affected-union", null, members));
	}
	return findings;
}

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

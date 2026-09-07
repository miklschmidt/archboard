import type { InspectionFinding, InspectionPolicy } from "@/runtime/board-inspection/schemas";
import {
	kindOf,
	stableDescription,
	type DecodedRecord,
} from "@/runtime/board-inspection/lib/decode";
import { type Segment } from "@/runtime/board-inspection/lib/geometry";
import {
	archboardMetadata,
	boundElementTargetCompatible,
	classifyBoundElements,
	groupIds,
	libraryAttribution,
	type InspectionModel,
} from "@/runtime/board-inspection/lib/model";
import { affectedOf, make } from "@/runtime/board-inspection/lib/finding-builder";
import {
	connectorBindingFindings,
	connectorGeometryFindings,
	persistedEndpointFindings,
	type RawRecord,
	type RecordMap,
} from "@/runtime/board-inspection/lib/detect-connectors";

function boundElementFindings(
	record: DecodedRecord,
	raw: RawRecord,
	byId: RecordMap,
	duplicateIds: ReadonlySet<string>,
): InspectionFinding[] {
	const bounds = raw["boundElements"];
	if (bounds == null) {
		return [];
	}
	const findings: InspectionFinding[] = [];
	const { readableEntries, problems } = classifyBoundElements(bounds);
	for (const problem of problems) {
		findings.push(
			make({
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
			}),
		);
	}
	if (!record.usableId || !record.id) {
		return findings;
	}
	for (const entry of readableEntries) {
		if (duplicateIds.has(entry.id)) {
			continue;
		}
		const target = byId.get(entry.id);
		if (!target) {
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: entry.type === "text" ? "dangling-bound-text" : "dangling-bound-arrow",
					severity: "error",
					affectsCoverage: false,
					details: { ownerId: record.id, targetId: entry.id },
					message: `Element ${record.id} names missing bound ${entry.type} ${entry.id}.`,
					elements: [record.ref],
					affected: record.evidenceBox,
				}),
			);
		} else if (
			target.type !== null &&
			KNOWN_ELEMENT_TYPES.has(target.type) &&
			!boundElementTargetCompatible(entry.type, target.type)
		) {
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "bound-element-target-type-mismatch",
					severity: "error",
					affectsCoverage: true,
					details: {
						ownerId: record.id,
						targetId: entry.id,
						declaredType: entry.type,
						actualType: target.type,
					},
					message: `Element ${record.id} declares ${entry.id} as bound ${entry.type}, but it is ${target.type}.`,
					elements: [record.ref, target.ref],
					affected: affectedOf([record, target]),
				}),
			);
		}
	}
	return findings;
}

function metadataFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	const metadata = archboardMetadata(record);
	if (
		metadata &&
		"node" in metadata &&
		(typeof metadata["node"] !== "string" || metadata["node"].length === 0) &&
		record.id
	) {
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "invalid-node-metadata",
				severity: "error",
				affectsCoverage: true,
				details: { elementId: record.id, valueKind: kindOf(metadata["node"]) },
				message: `Element ${record.id} has invalid node metadata.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	}
	const binding = metadata?.["binding"];
	if (binding === undefined || !record.id) {
		return findings;
	}
	const object =
		binding && typeof binding === "object" && !Array.isArray(binding)
			? (binding as Record<string, unknown>)
			: null;
	const issues: string[] = [];
	if (!object) {
		issues.push("binding must be an object");
	} else {
		if (typeof object["path"] !== "string" || !object["path"]) {
			issues.push("path must be a nonempty string");
		}
		if (
			typeof object["path"] === "string" &&
			(object["path"].startsWith("/") || object["path"].split("/").includes(".."))
		) {
			issues.push("path must be repository-relative and usable");
		}
		if (object["repo"] !== undefined && typeof object["repo"] !== "string") {
			issues.push("repo must be a string");
		}
	}
	if (issues.length) {
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "invalid-code-binding",
				severity: "error",
				affectsCoverage: false,
				details: { elementId: record.id, issues },
				message: `Element ${record.id} has an invalid code binding.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	}
	if (typeof raw["link"] === "string" && raw["link"]) {
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "derived-link-persisted",
				severity: "error",
				affectsCoverage: false,
				details: { elementId: record.id, link: raw["link"] },
				message: `Element ${record.id} persists a derived binding link.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	}
	return findings;
}

function fontFindings(
	record: DecodedRecord,
	raw: RawRecord,
	policy: InspectionPolicy,
): InspectionFinding[] {
	if (record.type !== "text") {
		return [];
	}
	const allowed = policy.allowedFontFamilies;
	const points = record.box
		? [
				{
					x: record.box.x + record.box.width / 2,
					y: record.box.y + record.box.height / 2,
				},
			]
		: [];
	if (!("fontFamily" in raw) || raw["fontFamily"] === undefined) {
		return allowed !== "any" && !allowed.includes(1)
			? [
					make({
						code: "FONT_POLICY_VIOLATION",
						reason: "missing-font-family",
						severity: "warning",
						affectsCoverage: false,
						details: { effectiveFamily: 1, allowedFamilies: allowed },
						message: `Text ${record.id ?? record.sourceIndex} uses legacy font family 1.`,
						elements: [record.ref],
						points,
						affected: record.evidenceBox,
					}),
				]
			: [];
	}
	if (
		typeof raw["fontFamily"] !== "number" ||
		!Number.isInteger(raw["fontFamily"]) ||
		![1, 2, 3, 5, 6, 7, 8].includes(raw["fontFamily"])
	) {
		return [
			make({
				code: "FONT_POLICY_VIOLATION",
				reason: "invalid-font-family",
				severity: "warning",
				affectsCoverage: false,
				details: {
					rawType: kindOf(raw["fontFamily"]),
					rawDescription: stableDescription(raw["fontFamily"]),
					allowedFamilies: allowed,
				},
				message: `Text ${record.id ?? record.sourceIndex} has invalid persisted fontFamily.`,
				elements: [record.ref],
				points,
				affected: record.evidenceBox,
			}),
		];
	}
	return allowed !== "any" && !allowed.includes(raw["fontFamily"] as 1 | 2 | 3 | 5 | 6 | 7 | 8)
		? [
				make({
					code: "FONT_POLICY_VIOLATION",
					reason: "disallowed-font-family",
					severity: "warning",
					affectsCoverage: false,
					details: {
						rawFamily: raw["fontFamily"],
						effectiveFamily: raw["fontFamily"],
						allowedFamilies: allowed,
					},
					message: `Text ${record.id ?? record.sourceIndex} uses disallowed font family ${raw["fontFamily"]}.`,
					elements: [record.ref],
					points,
					affected: record.evidenceBox,
				}),
			]
		: [];
}

function containerFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	if (
		record.type !== "text" ||
		raw["containerId"] == null ||
		(typeof raw["containerId"] === "string" && raw["containerId"].length > 0)
	) {
		return [];
	}
	return [
		make({
			code: "BROKEN_REFERENCE",
			reason: "malformed-container-id",
			severity: "error",
			affectsCoverage: true,
			details: {
				textId: record.id,
				sourceIndex: record.sourceIndex,
				rawKind: kindOf(raw["containerId"]),
				rawDescription: stableDescription(raw["containerId"]),
				issue: raw["containerId"] === "" ? "empty-container-id" : "non-string-container-id",
				ownerClassificationBlocked: true,
			},
			message: `Text ${record.id ?? record.sourceIndex} has a malformed containerId.`,
			elements: [record.ref],
			affected: record.evidenceBox,
		}),
	];
}

function libraryFindings(record: DecodedRecord, model: InspectionModel): InspectionFinding[] {
	const library = libraryAttribution(record);
	if (!library || library.valid || !record.id) {
		return [];
	}
	const rescuedByGroup = model.qualifyingGroupedObstacleElementIds.has(record.id);
	const shared = {
		code: "BROKEN_REFERENCE",
		reason: "invalid-library-attribution",
		severity: "error",
		message: `Element ${record.id} has invalid library attribution.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	} as const;
	return rescuedByGroup
		? [
				make({
					...shared,
					affectsCoverage: false,
					details: {
						elementId: record.id,
						issues: library.issues,
						rescuedByGroup: true,
					},
				}),
			]
		: [
				make({
					...shared,
					affectsCoverage: true,
					details: {
						elementId: record.id,
						issues: library.issues,
						rescuedByGroup: false,
					},
				}),
			];
}

const KNOWN_ELEMENT_TYPES = new Set([
	"rectangle",
	"ellipse",
	"diamond",
	"frame",
	"text",
	"arrow",
	"line",
	"image",
	"freedraw",
]);

function hasCoverageRoleEvidence(record: DecodedRecord, hasIncomingReference: boolean): boolean {
	const raw = record.raw;
	const metadata = archboardMetadata(record);
	const malformedClosedAngle =
		["rectangle", "ellipse", "diamond", "frame"].includes(record.type ?? "") &&
		raw?.angle !== undefined &&
		(typeof raw.angle !== "number" || !Number.isFinite(raw.angle));
	return (
		hasIncomingReference ||
		malformedClosedAngle ||
		record.type === "arrow" ||
		record.type === "line" ||
		record.type === "text" ||
		libraryAttribution(record) !== null ||
		groupIds(record).length > 0 ||
		(metadata !== null && "node" in metadata) ||
		raw?.boundElements !== undefined ||
		raw?.containerId !== undefined ||
		raw?.startBinding !== undefined ||
		raw?.endBinding !== undefined ||
		raw?.points !== undefined
	);
}

function unsupportedGeometryFindings(
	record: DecodedRecord,
	raw: RawRecord,
	hasIncomingReference: boolean,
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	if (
		record.type !== "arrow" &&
		record.type !== "line" &&
		raw["angle"] !== undefined &&
		raw["angle"] !== 0 &&
		hasCoverageRoleEvidence(record, hasIncomingReference)
	) {
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "rotation",
				severity: "warning",
				affectsCoverage: true,
				details: {
					angle:
						typeof raw["angle"] === "number" && Number.isFinite(raw["angle"])
							? raw["angle"]
							: stableDescription(raw["angle"]),
				},
				message: `Element ${record.id ?? record.sourceIndex} is rotated.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	}
	const rawType = raw["type"];
	const canonicalType = typeof rawType === "string" && rawType.length > 0;
	if (
		(!canonicalType || !KNOWN_ELEMENT_TYPES.has(typeof rawType === "string" ? rawType : "")) &&
		hasCoverageRoleEvidence(record, hasIncomingReference)
	) {
		const rawTypeDescription = typeof rawType === "string" ? rawType : stableDescription(rawType);
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "unsupported-type",
				severity: "warning",
				affectsCoverage: true,
				details: { rawType: rawTypeDescription },
				message: `Element ${record.id ?? record.sourceIndex} has unsupported type ${rawTypeDescription}.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	}
	return findings;
}

function incomingReferenceIds(records: readonly DecodedRecord[]): ReadonlySet<string> {
	const ids = new Set<string>();
	const add = (value: unknown) => {
		if (typeof value === "string" && value.length > 0) {
			ids.add(value);
		}
	};
	for (const record of records.filter((candidate) => candidate.live && candidate.raw)) {
		const raw = record.raw!;
		add(raw.containerId);
		for (const end of ["start", "end"] as const) {
			const binding = raw[`${end}Binding`];
			if (binding && typeof binding === "object" && !Array.isArray(binding)) {
				add((binding as RawRecord)["elementId"]);
			}
		}
		if (!Array.isArray(raw.boundElements)) {
			continue;
		}
		for (const entry of raw.boundElements) {
			if (entry && typeof entry === "object" && !Array.isArray(entry)) {
				add((entry as RawRecord)["id"]);
			}
		}
	}
	return ids;
}

function structuralFindings(
	records: readonly DecodedRecord[],
	policy: InspectionPolicy,
	model: InspectionModel,
): {
	findings: InspectionFinding[];
	segments: Segment[];
	pathSegmentChecks: number;
} {
	const findings: InspectionFinding[] = [];
	const segments: Segment[] = [];
	const work = { pathSegmentChecks: 0 };
	const byId = model.byId;
	const incomingReferences = incomingReferenceIds(records);
	for (const record of records.filter((candidate) => candidate.live && candidate.raw)) {
		const raw = record.raw!;
		if (record.type === "arrow" || record.type === "line") {
			findings.push(...connectorGeometryFindings(record, raw, policy, segments, work));
			findings.push(...connectorBindingFindings(record, raw, byId, model.duplicateIds));
			if (record.usableId) {
				findings.push(...persistedEndpointFindings(record, raw));
			}
		}
		findings.push(...boundElementFindings(record, raw, byId, model.duplicateIds));
		findings.push(...containerFindings(record, raw));
		findings.push(...metadataFindings(record, raw));
		if (record.usableId) {
			findings.push(...libraryFindings(record, model));
		}
		findings.push(...fontFindings(record, raw, policy));
		findings.push(
			...unsupportedGeometryFindings(
				record,
				raw,
				record.id !== null && incomingReferences.has(record.id),
			),
		);
	}
	return { findings, segments, pathSegmentChecks: work.pathSegmentChecks };
}

export { structuralFindings };

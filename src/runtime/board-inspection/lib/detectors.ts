import { boundTextDrift, labelAnchorOf, planLabelRepair } from "../../engine/labels.js";
import { measureLinear } from "../../engine/geometry.js";
import type {
	ElementRef,
	InspectionFinding,
	InspectionPolicy,
	NodeRef,
	ObstacleRef,
	ScenePoint,
} from "../schemas.js";
import { InspectionFindingSchema } from "../schemas.js";
import { decodePath, kindOf, stableDescription, type DecodedRecord } from "./decode.js";
import {
	box,
	finite,
	focus,
	intersectSegments,
	overlap,
	point,
	pointBox,
	segmentInsideBox,
	unionBoxes,
	type ExactBox,
	type ExactPoint,
	type Segment,
} from "./geometry.js";
import {
	archboardMetadata,
	buildInspectionModel,
	classifyBindingTarget,
	classifyBoundElements,
	groupIds,
	libraryAttribution,
	semanticParents,
	type BlockingBindingIssue,
	type InspectionModel,
} from "./model.js";

export const BROAD_PHASE_COMPARISON_LIMIT = 2_000_000 as const;

interface DetectionResult {
	findings: InspectionFinding[];
	broadPhaseComparisons: number;
}
type FindingInput = InspectionFinding extends infer Finding
	? Finding extends InspectionFinding
		? Omit<
				Finding,
				"elements" | "nodes" | "obstacles" | "points" | "affectedBBox" | "focusBBox"
			> & {
				elements?: readonly ElementRef[];
				nodes?: readonly NodeRef[];
				obstacles?: readonly ObstacleRef[];
				points?: readonly ExactPoint[];
				affected?: ExactBox | null;
			}
		: never
	: never;

const CODE_ORDER = [
	"INVALID_RENDER_GEOMETRY",
	"STALE_LINEAR_DIMENSIONS",
	"BROKEN_REFERENCE",
	"LABEL_CORRUPTION",
	"FONT_POLICY_VIOLATION",
	"UNSUPPORTED_GEOMETRY",
	"AMBIGUOUS_GEOMETRY",
	"INSPECTION_LIMIT_EXCEEDED",
	"CONNECTOR_PENETRATES_NODE",
	"CONNECTOR_PENETRATES_OBSTACLE",
	"CONNECTOR_INTERSECTION_UNMARKED",
	"NODE_OVERLAP",
	"LABEL_OVERLAP",
];

const REASON_ORDER = [
	"invalid-render-fields",
	"unlocatable-record",
	"width",
	"height",
	"width-and-height",
	"invalid-element-identity",
	"duplicate-element-id",
	"missing-binding-target",
	"invalid-binding-target-type",
	"missing-binding-reciprocal",
	"malformed-start-binding",
	"malformed-end-binding",
	"malformed-bound-elements",
	"malformed-container-id",
	"dangling-bound-text",
	"dangling-bound-arrow",
	"bound-element-target-type-mismatch",
	"conflicting-bound-label-owner",
	"persisted-agent-endpoint",
	"invalid-node-metadata",
	"invalid-code-binding",
	"derived-link-persisted",
	"invalid-library-attribution",
	"orphan",
	"duplicate",
	"missing-reciprocal",
	"conflicting-owner",
	"drift",
	"persisted-seed",
	"missing-font-family",
	"disallowed-font-family",
	"invalid-font-family",
	"unsupported-type",
	"rotation",
	"curve",
	"rounded-or-elbowed",
	"points-missing",
	"points-not-array",
	"points-empty",
	"points-one-point",
	"malformed-point",
	"absolute-point-overflow",
	"zero-length",
	"collinear-overlap",
	"broad-phase-comparison-ceiling",
	"leaf-footprint-interior",
	"obstacle-footprint-interior",
	"proper-interior-crossing",
	"leaf-footprint-overlap",
	"label-node-overlap",
	"label-label-overlap",
] as const;

function make(input: FindingInput): InspectionFinding {
	const affectedBBox =
		input.affected === null
			? null
			: box(input.affected ?? pointBox(input.points ?? []) ?? { x: 0, y: 0, width: 0, height: 0 });
	return InspectionFindingSchema.parse({
		code: input.code,
		reason: input.reason,
		severity: input.severity,
		affectsCoverage: input.affectsCoverage,
		message: input.message,
		elements: [...(input.elements ?? [])].toSorted(refOrder),
		nodes: [...(input.nodes ?? [])].toSorted((a, b) => a.id.localeCompare(b.id)),
		obstacles: [...(input.obstacles ?? [])].toSorted((a, b) => a.id.localeCompare(b.id)),
		points: [...(input.points ?? [])].map(point).toSorted(pointOrder),
		affectedBBox,
		focusBBox: focus(affectedBBox),
		details: input.details,
	});
}

const refOrder = (a: ElementRef, b: ElementRef) =>
	(a.id ?? "").localeCompare(b.id ?? "") || a.sourceIndex - b.sourceIndex;
const pointOrder = (a: ScenePoint, b: ScenePoint) => a.x - b.x || a.y - b.y;
const numberListOrder = (a: readonly number[], b: readonly number[]): number => {
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		const difference = a[index]! - b[index]!;
		if (difference) return difference;
	}
	return a.length - b.length;
};
const uniqueRefs = (records: readonly DecodedRecord[]) => [
	...new Map(records.map((record) => [`${record.sourceIndex}`, record.ref])).values(),
];
const boxesOf = (records: readonly DecodedRecord[]): ExactBox[] =>
	records.flatMap((r) => (r.box ? [r.box] : []));
const affectedOf = (records: readonly DecodedRecord[]): ExactBox | null =>
	unionBoxes(boxesOf(records));

type IntendedRole = Extract<
	InspectionFinding,
	{ code: "BROKEN_REFERENCE"; reason: "invalid-element-identity" }
>["details"]["intendedRoles"][number];

function identityRoles(record: DecodedRecord): IntendedRole[] {
	const roles = new Set<IntendedRole>();
	const type = record.type;
	const metadata = archboardMetadata(record);
	if (type === "arrow" || type === "line") roles.add("connector");
	if (metadata && "node" in metadata) roles.add("semantic-node-member");
	if (type === "rectangle" || type === "ellipse" || type === "diamond") {
		if (libraryAttribution(record)?.valid) roles.add("valid-library-body");
		if (groupIds(record).length > 0) roles.add("qualifying-group-body");
		roles.add("node-overlap-body");
	}
	if (type === "text") {
		roles.add("font-policy-text");
		roles.add("label-overlap-body");
	}
	if (type === "text" && record.raw?.containerId !== undefined) roles.add("bound-label");
	if (record.raw?.boundElements !== undefined) roles.add("label-container");
	if (["rectangle", "ellipse", "diamond", "frame"].includes(type ?? ""))
		roles.add("closed-boundary");
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
				affected:
					record.box ??
					(record.raw && finite(record.raw.x) && finite(record.raw.y)
						? { x: record.raw.x, y: record.raw.y, width: 0, height: 0 }
						: null),
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
	for (const [id, matches] of duplicate)
		if (matches.length > 1)
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
	return findings;
}

function renderFindings(records: readonly DecodedRecord[]): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const record of records.filter((candidate) => candidate.live)) {
		const raw = record.raw;
		const fields = (["x", "y", "width", "height"] as const).filter(
			(field) => typeof raw?.[field] !== "number" || !Number.isFinite(raw[field]),
		);
		if (finite(raw?.x) && finite(raw?.width) && !finite(raw.x + Math.max(0, raw.width)))
			fields.push("width");
		if (finite(raw?.y) && finite(raw?.height) && !finite(raw.y + Math.max(0, raw.height)))
			fields.push("height");
		if (fields.length === 0) continue;
		const locatable =
			typeof raw?.x === "number" &&
			Number.isFinite(raw.x) &&
			typeof raw?.y === "number" &&
			Number.isFinite(raw.y);
		if (!locatable)
			findings.push(
				make({
					code: "INVALID_RENDER_GEOMETRY",
					reason: "unlocatable-record",
					severity: "error",
					affectsCoverage: true,
					details: {
						recordKind: record.type ?? kindOf(record.raw),
						invalidFields: fields.filter((f) => f === "x" || f === "y"),
						sourceIndex: record.sourceIndex,
					},
					message: `Element at source index ${record.sourceIndex} cannot be located.`,
					elements: [record.ref],
					affected: null,
				}),
			);
		else
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
					points: [{ x: raw.x as number, y: raw.y as number }],
					affected: { x: raw.x as number, y: raw.y as number, width: 0, height: 0 },
				}),
			);
	}
	return findings;
}

type RecordMap = ReadonlyMap<string, DecodedRecord>;
type RawRecord = Readonly<Record<string, unknown>>;

const locatableOrigin = (raw: RawRecord): raw is RawRecord & { x: number; y: number } =>
	typeof raw.x === "number" &&
	Number.isFinite(raw.x) &&
	typeof raw.y === "number" &&
	Number.isFinite(raw.y);

const storedExtent = (record: DecodedRecord, raw: RawRecord): ExactBox | null =>
	record.box ?? (locatableOrigin(raw) ? { x: raw.x, y: raw.y, width: 0, height: 0 } : null);

function decodedPathEvidence(
	record: DecodedRecord,
	raw: RawRecord,
	scenePoints: readonly ExactPoint[] | null | undefined,
): { points: readonly ExactPoint[]; affected: ExactBox | null } {
	if (scenePoints === null || (scenePoints === undefined && !locatableOrigin(raw)))
		return { points: [], affected: null };
	const points = scenePoints ?? [];
	const pathBox = points.length > 0 ? pointBox(points) : null;
	return {
		points,
		affected: pathBox ?? storedExtent(record, raw),
	};
}

function unusablePathFinding(record: DecodedRecord, raw: RawRecord): InspectionFinding {
	const decoded = decodePath(record);
	if (decoded.ok) throw new Error("usable connector path passed to unusablePathFinding");
	if (decoded.issue === "absolute-point-overflow") {
		const evidence = decodedPathEvidence(record, raw, decoded.scenePoints);
		return make({
			code: "AMBIGUOUS_GEOMETRY",
			reason: "absolute-point-overflow",
			severity: "warning",
			affectsCoverage: true,
			details: {
				connectorId: record.id,
				sourceIndex: record.sourceIndex,
				pointIndex: decoded.pointIndex,
				issue: "absolute path coordinate or segment arithmetic exceeded finite inspection range",
			},
			message: `Connector ${record.id ?? record.sourceIndex} overflows absolute path coordinates.`,
			elements: [record.ref],
			...evidence,
		});
	}
	if (decoded.issue === "malformed-point") {
		const evidence = decodedPathEvidence(record, raw, decoded.scenePoints);
		return make({
			code: "AMBIGUOUS_GEOMETRY",
			reason: "malformed-point",
			severity: "warning",
			affectsCoverage: true,
			details: {
				connectorId: record.id,
				sourceIndex: record.sourceIndex,
				pointIndex: decoded.pointIndex,
				issue: "point must contain two finite numbers",
			},
			message: `Connector ${record.id ?? record.sourceIndex} has a malformed point.`,
			elements: [record.ref],
			...evidence,
		});
	}
	const evidence = decodedPathEvidence(record, raw, decoded.scenePoints);
	const shared = {
		code: "AMBIGUOUS_GEOMETRY" as const,
		severity: "warning" as const,
		affectsCoverage: true as const,
		message: `Connector ${record.id ?? record.sourceIndex} has no usable path.`,
		elements: [record.ref],
		...evidence,
	};
	switch (decoded.issue) {
		case "missing":
			return make({
				...shared,
				reason: "points-missing",
				details: {
					connectorId: record.id,
					sourceIndex: record.sourceIndex,
					rawPointsKind: "missing",
					rawPointsDescription: "missing",
					pointCount: null,
					minimumRequired: 2,
					issue: "missing",
				},
			});
		case "non-array":
			return make({
				...shared,
				reason: "points-not-array",
				details: {
					connectorId: record.id,
					sourceIndex: record.sourceIndex,
					rawPointsKind: kindOf(raw.points),
					rawPointsDescription: stableDescription(raw.points),
					pointCount: null,
					minimumRequired: 2,
					issue: "non-array",
				},
			});
		case "empty":
			return make({
				...shared,
				reason: "points-empty",
				details: {
					connectorId: record.id,
					sourceIndex: record.sourceIndex,
					rawPointsKind: "array",
					rawPointsDescription: "array",
					pointCount: 0,
					minimumRequired: 2,
					issue: "empty",
				},
			});
		case "one-point":
			return make({
				...shared,
				reason: "points-one-point",
				details: {
					connectorId: record.id,
					sourceIndex: record.sourceIndex,
					rawPointsKind: "array",
					rawPointsDescription: "array",
					pointCount: 1,
					minimumRequired: 2,
					issue: "insufficient-cardinality",
				},
			});
	}
}

function connectorGeometryFindings(
	record: DecodedRecord,
	raw: RawRecord,
	policy: InspectionPolicy,
	segments: Segment[],
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	const refs = [record.ref];
	const decoded = decodePath(record);
	const pathEvidence = decodedPathEvidence(record, raw, decoded.scenePoints);
	const angle = raw.angle;
	const unsupportedRotation = angle !== undefined && angle !== 0;
	if (unsupportedRotation)
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "rotation",
				severity: "warning",
				affectsCoverage: true,
				details: {
					angle:
						typeof angle === "number" && Number.isFinite(angle) ? angle : stableDescription(angle),
				},
				message: `Connector ${record.id ?? record.sourceIndex} is rotated.`,
				elements: refs,
				...pathEvidence,
			}),
		);
	const unsupportedCurve = raw.curve !== undefined || raw.curveKind !== undefined;
	if (unsupportedCurve)
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "curve",
				severity: "warning",
				affectsCoverage: true,
				details: { curveKind: stableDescription(raw.curveKind ?? raw.curve) },
				message: `Connector ${record.id ?? record.sourceIndex} is curved.`,
				elements: refs,
				...pathEvidence,
			}),
		);
	const unsupportedRounded =
		raw.roundness != null ||
		(raw.elbowed !== undefined && raw.elbowed !== null && raw.elbowed !== false) ||
		raw.fixedSegments != null;
	if (unsupportedRounded)
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "rounded-or-elbowed",
				severity: "warning",
				affectsCoverage: true,
				details: {
					roundness: raw.roundness == null ? null : stableDescription(raw.roundness),
					elbowed: raw.elbowed === true,
					fixedSegments: raw.fixedSegments != null,
				},
				message: `Connector ${record.id ?? record.sourceIndex} uses rounded or elbowed geometry.`,
				elements: refs,
				...pathEvidence,
			}),
		);
	if (!decoded.ok) return [...findings, unusablePathFinding(record, raw)];
	for (const segmentIndex of decoded.zeroSegments)
		findings.push(
			make({
				code: "AMBIGUOUS_GEOMETRY",
				reason: "zero-length",
				severity: "warning",
				affectsCoverage: true,
				details: { connectorId: record.id, sourceIndex: record.sourceIndex, segmentIndex },
				message: `Connector ${record.id ?? record.sourceIndex} has a zero-length segment.`,
				elements: refs,
				points: decoded.scenePoints ? [decoded.scenePoints[segmentIndex]!] : [],
				affected: decoded.scenePoints ? pointBox([decoded.scenePoints[segmentIndex]!]) : null,
			}),
		);
	const unsupported = unsupportedRotation || unsupportedCurve || unsupportedRounded;
	if (unsupported || !record.id || !decoded.scenePoints) return findings;
	for (let index = 0; index < decoded.scenePoints.length - 1; index += 1) {
		if (decoded.zeroSegments.includes(index)) continue;
		segments.push({
			connectorId: record.id,
			sourceIndex: record.sourceIndex,
			index,
			a: decoded.scenePoints[index]!,
			b: decoded.scenePoints[index + 1]!,
		});
	}
	const measured = measureLinear(raw.points);
	if (
		!measured ||
		typeof raw.width !== "number" ||
		!Number.isFinite(raw.width) ||
		typeof raw.height !== "number" ||
		!Number.isFinite(raw.height)
	)
		return findings;
	const widthDelta = Math.abs(raw.width - measured.width),
		heightDelta = Math.abs(raw.height - measured.height);
	const staleWidth = widthDelta >= policy.dimensionTolerance,
		staleHeight = heightDelta >= policy.dimensionTolerance;
	if (staleWidth || staleHeight)
		findings.push(
			make({
				code: "STALE_LINEAR_DIMENSIONS",
				reason: staleWidth && staleHeight ? "width-and-height" : staleWidth ? "width" : "height",
				severity: "error",
				affectsCoverage: false,
				details: {
					storedWidth: raw.width,
					storedHeight: raw.height,
					measuredWidth: measured.width,
					measuredHeight: measured.height,
					widthDelta,
					heightDelta,
				},
				message: `Connector ${record.id ?? record.sourceIndex} has stale stored dimensions.`,
				elements: refs,
				points: decoded.scenePoints,
				affected: pointBox(decoded.scenePoints),
			}),
		);
	return findings;
}

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

function bindingIssue(value: unknown): BindingInspection {
	const binding =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	const target = classifyBindingTarget(value);
	if (target.blockingIssue)
		return {
			binding,
			issue: target.blockingIssue,
			readableTargetId: null,
			classificationBlocked: true,
		};
	let issue: Exclude<BindingIssue, BlockingBindingIssue> | null = null;
	if (binding) {
		if (!("focus" in binding)) issue = "missing-focus";
		else if (typeof binding.focus !== "number" || !Number.isFinite(binding.focus))
			issue = "nonfinite-focus";
		else if (!("gap" in binding)) issue = "missing-gap";
		else if (typeof binding.gap !== "number" || !Number.isFinite(binding.gap))
			issue = "nonfinite-gap";
		else if (
			binding.fixedPoint != null &&
			(!Array.isArray(binding.fixedPoint) ||
				binding.fixedPoint.length !== 2 ||
				binding.fixedPoint.some((n) => typeof n !== "number" || !Number.isFinite(n)))
		)
			issue = "invalid-fixed-point";
	}
	return {
		binding: binding!,
		issue,
		readableTargetId: target.readableTargetId!,
		classificationBlocked: false,
	};
}

function connectorBindingFindings(
	record: DecodedRecord,
	raw: RawRecord,
	byId: RecordMap,
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const end of ["start", "end"] as const) {
		const value = raw[`${end}Binding`];
		if (value == null) continue;
		const { issue, readableTargetId, classificationBlocked } = bindingIssue(value);
		if (issue) {
			const shared = {
				code: "BROKEN_REFERENCE",
				reason: `malformed-${end}-binding` as const,
				severity: "error",
				message: `Connector ${record.id ?? record.sourceIndex} has a malformed ${end} binding.`,
				elements: [record.ref],
				affected: record.box,
			} as const;
			if (classificationBlocked)
				findings.push(
					make({
						...shared,
						affectsCoverage: true,
						details: {
							connectorId: record.id,
							sourceIndex: record.sourceIndex,
							rawKind: kindOf(value),
							issue,
							readableTargetId,
							classificationBlocked: true,
						},
					}),
				);
			else
				findings.push(
					make({
						...shared,
						affectsCoverage: false,
						details: {
							connectorId: record.id,
							sourceIndex: record.sourceIndex,
							rawKind: kindOf(value),
							issue,
							readableTargetId,
							classificationBlocked: false,
						},
					}),
				);
		}
		if (!readableTargetId || !record.id) continue;
		const target = byId.get(readableTargetId);
		if (!target)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "missing-binding-target",
					severity: "error",
					affectsCoverage: true,
					details: { connectorId: record.id!, end, targetId: readableTargetId },
					message: `Connector ${record.id} names missing target ${readableTargetId}.`,
					elements: [record.ref],
					affected: record.box,
				}),
			);
		else if (target.type === "arrow" || target.type === "line")
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "invalid-binding-target-type",
					severity: "error",
					affectsCoverage: true,
					details: {
						connectorId: record.id!,
						end,
						targetId: readableTargetId,
						targetType: target.type ?? "unknown",
					},
					message: `Connector ${record.id} binds to another connector.`,
					elements: [record.ref, target.ref],
					affected: affectedOf([record, target]),
				}),
			);
		else if (
			!Array.isArray(target.raw?.boundElements) ||
			!target.raw.boundElements.some(
				(entry) =>
					entry &&
					typeof entry === "object" &&
					!Array.isArray(entry) &&
					(entry as Record<string, unknown>).id === record.id &&
					(entry as Record<string, unknown>).type === "arrow",
			)
		)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "missing-binding-reciprocal",
					severity: "error",
					affectsCoverage: false,
					details: { connectorId: record.id!, end, targetId: readableTargetId },
					message: `Target ${readableTargetId} does not name connector ${record.id}.`,
					elements: [record.ref, target.ref],
					affected: affectedOf([record, target]),
				}),
			);
	}
	return findings;
}

function persistedEndpointFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	if (!record.id) return [];
	const findings: InspectionFinding[] = [];
	for (const end of ["start", "end"] as const) {
		const input = raw[end];
		if (!input || typeof input !== "object" || Array.isArray(input)) continue;
		const inputId = (input as Record<string, unknown>).id;
		if (typeof inputId !== "string" || !inputId) continue;
		const binding = raw[`${end}Binding`];
		const bindingId =
			binding && typeof binding === "object" && !Array.isArray(binding)
				? (binding as Record<string, unknown>).elementId
				: null;
		if (bindingId !== inputId)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "persisted-agent-endpoint",
					severity: "error",
					affectsCoverage: true,
					details: {
						connectorId: record.id!,
						end,
						inputTargetId: inputId,
						bindingTargetId: typeof bindingId === "string" ? bindingId : null,
					},
					message: `Connector ${record.id} persists an input-only ${end} endpoint.`,
					elements: [record.ref],
					affected: record.box,
				}),
			);
	}
	return findings;
}

function boundElementFindings(
	record: DecodedRecord,
	raw: RawRecord,
	byId: RecordMap,
): InspectionFinding[] {
	const bounds = raw.boundElements;
	if (bounds == null) return [];
	const findings: InspectionFinding[] = [];
	const { readableEntries, problems } = classifyBoundElements(bounds);
	for (const problem of problems)
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
				affected: record.box,
			}),
		);
	if (!record.id) return findings;
	for (const entry of readableEntries) {
		const target = byId.get(entry.id);
		if (!target)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: entry.type === "text" ? "dangling-bound-text" : "dangling-bound-arrow",
					severity: "error",
					affectsCoverage: false,
					details: { ownerId: record.id!, targetId: entry.id },
					message: `Element ${record.id} names missing bound ${entry.type} ${entry.id}.`,
					elements: [record.ref],
					affected: record.box,
				}),
			);
		else if (
			target.type !== null &&
			KNOWN_ELEMENT_TYPES.has(target.type) &&
			target.type !== entry.type
		)
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
	return findings;
}

function metadataFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	const metadata = archboardMetadata(record);
	if (
		metadata &&
		"node" in metadata &&
		(typeof metadata.node !== "string" || metadata.node.length === 0) &&
		record.id
	)
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "invalid-node-metadata",
				severity: "error",
				affectsCoverage: true,
				details: { elementId: record.id, valueKind: kindOf(metadata.node) },
				message: `Element ${record.id} has invalid node metadata.`,
				elements: [record.ref],
				affected: record.box,
			}),
		);
	const binding = metadata?.binding;
	if (binding === undefined || !record.id) return findings;
	const object =
		binding && typeof binding === "object" && !Array.isArray(binding)
			? (binding as Record<string, unknown>)
			: null;
	const issues: string[] = [];
	if (!object) issues.push("binding must be an object");
	else {
		if (typeof object.path !== "string" || !object.path)
			issues.push("path must be a nonempty string");
		if (
			typeof object.path === "string" &&
			(object.path.startsWith("/") || object.path.split("/").includes(".."))
		)
			issues.push("path must be repository-relative and usable");
		if (object.repo !== undefined && typeof object.repo !== "string")
			issues.push("repo must be a string");
	}
	if (issues.length)
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "invalid-code-binding",
				severity: "error",
				affectsCoverage: false,
				details: { elementId: record.id, issues },
				message: `Element ${record.id} has an invalid code binding.`,
				elements: [record.ref],
				affected: record.box,
			}),
		);
	if (typeof raw.link === "string" && raw.link)
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "derived-link-persisted",
				severity: "error",
				affectsCoverage: false,
				details: { elementId: record.id, link: raw.link },
				message: `Element ${record.id} persists a derived binding link.`,
				elements: [record.ref],
				affected: record.box,
			}),
		);
	return findings;
}

function fontFindings(
	record: DecodedRecord,
	raw: RawRecord,
	policy: InspectionPolicy,
): InspectionFinding[] {
	if (record.type !== "text") return [];
	const allowed = policy.allowedFontFamilies;
	const points = record.box
		? [
				{
					x: record.box.x + record.box.width / 2,
					y: record.box.y + record.box.height / 2,
				},
			]
		: [];
	if (!("fontFamily" in raw) || raw.fontFamily === undefined)
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
						affected: record.box,
					}),
				]
			: [];
	if (
		typeof raw.fontFamily !== "number" ||
		!Number.isInteger(raw.fontFamily) ||
		![1, 2, 3, 5, 6, 7, 8].includes(raw.fontFamily)
	)
		return [
			make({
				code: "FONT_POLICY_VIOLATION",
				reason: "invalid-font-family",
				severity: "warning",
				affectsCoverage: false,
				details: {
					rawType: kindOf(raw.fontFamily),
					rawDescription: stableDescription(raw.fontFamily),
					allowedFamilies: allowed,
				},
				message: `Text ${record.id ?? record.sourceIndex} has invalid persisted fontFamily.`,
				elements: [record.ref],
				points,
				affected: record.box,
			}),
		];
	return allowed !== "any" && !allowed.includes(raw.fontFamily as 1 | 2 | 3 | 5 | 6 | 7 | 8)
		? [
				make({
					code: "FONT_POLICY_VIOLATION",
					reason: "disallowed-font-family",
					severity: "warning",
					affectsCoverage: false,
					details: {
						rawFamily: raw.fontFamily,
						effectiveFamily: raw.fontFamily,
						allowedFamilies: allowed,
					},
					message: `Text ${record.id ?? record.sourceIndex} uses disallowed font family ${raw.fontFamily}.`,
					elements: [record.ref],
					points,
					affected: record.box,
				}),
			]
		: [];
}

function containerFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	if (
		record.type !== "text" ||
		raw.containerId == null ||
		(typeof raw.containerId === "string" && raw.containerId.length > 0)
	)
		return [];
	return [
		make({
			code: "BROKEN_REFERENCE",
			reason: "malformed-container-id",
			severity: "error",
			affectsCoverage: true,
			details: {
				textId: record.id,
				sourceIndex: record.sourceIndex,
				rawKind: kindOf(raw.containerId),
				rawDescription: stableDescription(raw.containerId),
				issue: raw.containerId === "" ? "empty-container-id" : "non-string-container-id",
				ownerClassificationBlocked: true,
			},
			message: `Text ${record.id ?? record.sourceIndex} has a malformed containerId.`,
			elements: [record.ref],
			affected: record.box,
		}),
	];
}

function libraryFindings(record: DecodedRecord, model: InspectionModel): InspectionFinding[] {
	const library = libraryAttribution(record);
	if (!library || library.valid || !record.id) return [];
	const rescuedByGroup = model.qualifyingGroupedObstacleElementIds.has(record.id);
	const shared = {
		code: "BROKEN_REFERENCE",
		reason: "invalid-library-attribution",
		severity: "error",
		message: `Element ${record.id} has invalid library attribution.`,
		elements: [record.ref],
		affected: record.box,
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
	return (
		hasIncomingReference ||
		identityRoles(record).length > 0 ||
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
		raw.angle !== undefined &&
		raw.angle !== 0 &&
		hasCoverageRoleEvidence(record, hasIncomingReference)
	)
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "rotation",
				severity: "warning",
				affectsCoverage: true,
				details: {
					angle:
						typeof raw.angle === "number" && Number.isFinite(raw.angle)
							? raw.angle
							: stableDescription(raw.angle),
				},
				message: `Element ${record.id ?? record.sourceIndex} is rotated.`,
				elements: [record.ref],
				affected: record.box,
			}),
		);
	const rawType = raw.type;
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
				affected: record.box,
			}),
		);
	}
	return findings;
}

function incomingReferenceIds(records: readonly DecodedRecord[]): ReadonlySet<string> {
	const ids = new Set<string>();
	const add = (value: unknown) => {
		if (typeof value === "string" && value.length > 0) ids.add(value);
	};
	for (const record of records.filter((candidate) => candidate.live && candidate.raw)) {
		const raw = record.raw!;
		add(raw.containerId);
		for (const end of ["start", "end"] as const) {
			const binding = raw[`${end}Binding`];
			if (binding && typeof binding === "object" && !Array.isArray(binding))
				add((binding as RawRecord).elementId);
		}
		if (!Array.isArray(raw.boundElements)) continue;
		for (const entry of raw.boundElements)
			if (entry && typeof entry === "object" && !Array.isArray(entry)) add((entry as RawRecord).id);
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
} {
	const findings: InspectionFinding[] = [];
	const segments: Segment[] = [];
	const byId = model.byId;
	const incomingReferences = incomingReferenceIds(records);
	for (const record of records.filter((candidate) => candidate.live && candidate.raw)) {
		const raw = record.raw!;
		if (record.type === "arrow" || record.type === "line") {
			findings.push(...connectorGeometryFindings(record, raw, policy, segments));
			findings.push(...connectorBindingFindings(record, raw, byId));
			findings.push(...persistedEndpointFindings(record, raw));
		}
		findings.push(...boundElementFindings(record, raw, byId));
		findings.push(...containerFindings(record, raw));
		findings.push(...metadataFindings(record, raw));
		findings.push(...libraryFindings(record, model));
		findings.push(...fontFindings(record, raw, policy));
		findings.push(
			...unsupportedGeometryFindings(
				record,
				raw,
				record.id !== null && incomingReferences.has(record.id),
			),
		);
	}
	return { findings, segments };
}

function labelFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
): InspectionFinding[] {
	const valid = records
		.filter((r) => r.live && r.raw && r.id && r.type)
		.map((r) => r.raw!) as unknown as Array<Record<string, unknown>>;
	const findings: InspectionFinding[] = [];
	const byId = model.byId;
	const plan = planLabelRepair(valid as never);
	for (const duplicate of plan.duplicates) {
		const involved = [
			byId.get(duplicate.containerId),
			byId.get(duplicate.keep),
			...duplicate.remove.map((id) => byId.get(id)),
		].filter((r): r is DecodedRecord => !!r);
		findings.push(
			make({
				code: "LABEL_CORRUPTION",
				reason: "duplicate",
				severity: "error",
				affectsCoverage: false,
				details: {
					containerId: duplicate.containerId,
					keeperId: duplicate.keep,
					duplicateIds: duplicate.remove.toSorted(),
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
		if (text)
			findings.push(
				make({
					code: "LABEL_CORRUPTION",
					reason: "orphan",
					severity: "error",
					affectsCoverage: true,
					details: { textId, containerId },
					message: `Label ${textId} names missing container ${containerId}.`,
					elements: [text.ref],
					affected: text.box,
				}),
			);
	}
	for (const drift of boundTextDrift(valid as never)) {
		const text = byId.get(drift.textId),
			container = byId.get(drift.containerId);
		if (!text || !container) continue;
		const anchor = labelAnchorOf(container.raw as never);
		const centre = text.box
			? { x: text.box.x + text.box.width / 2, y: text.box.y + text.box.height / 2 }
			: null;
		findings.push(
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
		if (record.type !== "text" && record.raw?.label && typeof record.raw.label === "object")
			findings.push(
				make({
					code: "LABEL_CORRUPTION",
					reason: "persisted-seed",
					severity: "error",
					affectsCoverage: false,
					details: { elementId: record.id!, seedField: "label" },
					message: `Element ${record.id} persists an input-only label seed.`,
					elements: [record.ref],
					affected: record.box,
				}),
			);
		if (record.type !== "text" && typeof record.raw?.text === "string")
			findings.push(
				make({
					code: "LABEL_CORRUPTION",
					reason: "persisted-seed",
					severity: "error",
					affectsCoverage: false,
					details: { elementId: record.id!, seedField: "text" },
					message: `Element ${record.id} persists an input-only text seed.`,
					elements: [record.ref],
					affected: record.box,
				}),
			);
	}
	for (const ownership of model.labelOwnership.values()) {
		const textId = ownership.labelId;
		const text = byId.get(textId);
		if (text?.type !== "text") continue;
		if (ownership.state === "forward-only" && ownership.forwardOwnerId) {
			const owner = byId.get(ownership.forwardOwnerId);
			if (owner)
				findings.push(
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
		if (
			ownership.state === "reverse-only" ||
			(!ownership.forwardOwnerId && ownership.state === "conflicting")
		)
			for (const ownerId of ownership.reverseOwnerIds) {
				const owner = byId.get(ownerId);
				if (!owner) continue;
				findings.push(
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
		if (ownership.state !== "conflicting") continue;
		const primaryOwnerId = ownership.forwardOwnerId ?? ownership.reverseOwnerIds[0];
		if (!primaryOwnerId) continue;
		const other = ownership.candidateOwnerIds.filter((owner) => owner !== primaryOwnerId);
		const involved = [text, ...ownership.candidateOwnerIds.map((id) => byId.get(id))].filter(
			(record): record is DecodedRecord => !!record,
		);
		if (ownership.forwardOwnerId)
			findings.push(
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
		findings.push(
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

interface PairItem<T> {
	id: string;
	box: ExactBox;
	value: T;
}

function pairSweep<A, B>(
	left: readonly PairItem<A>[],
	right: readonly PairItem<B>[],
	sameSet: boolean,
	eligible: (a: A, b: B) => boolean,
	visit: (a: A, b: B) => void,
	counter: { value: number; limited: boolean; pass: string },
	pass: string,
): void {
	const aSorted = left.toSorted(
		(a, b) =>
			a.box.x - b.box.x ||
			a.box.x + a.box.width - (b.box.x + b.box.width) ||
			a.id.localeCompare(b.id),
	);
	const bSorted = sameSet
		? (aSorted as unknown as PairItem<B>[])
		: right.toSorted(
				(a, b) =>
					a.box.x - b.box.x ||
					a.box.x + a.box.width - (b.box.x + b.box.width) ||
					a.id.localeCompare(b.id),
			);
	for (let i = 0; i < aSorted.length && !counter.limited; i += 1) {
		const a = aSorted[i]!;
		for (let j = sameSet ? i + 1 : 0; j < bSorted.length; j += 1) {
			const b = bSorted[j]!;
			if (b.box.x > a.box.x + a.box.width) break;
			if (b.box.x + b.box.width < a.box.x || !eligible(a.value, b.value)) continue;
			counter.value += 1;
			if (counter.value > BROAD_PHASE_COMPARISON_LIMIT) {
				counter.limited = true;
				counter.pass = pass;
				break;
			}
			if (b.box.y > a.box.y + a.box.height || b.box.y + b.box.height < a.box.y) continue;
			visit(a.value, b.value);
		}
	}
}

function collisionFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
	segments: readonly Segment[],
	policy: InspectionPolicy,
): DetectionResult {
	const findings: InspectionFinding[] = [];
	const counter = { value: 0, limited: false, pass: "" };
	const byId = model.byId;
	const segmentItems = segments.map((segment) => ({
		id: `${segment.connectorId}:${segment.index}`,
		box: pointBox([segment.a, segment.b])!,
		value: segment,
	}));
	const leaves = [...model.nodes.values()].filter((node) => node.children.length === 0);
	const leafNodeItems = leaves.map((node) => ({ id: node.id, box: node.body, value: node }));
	const allNodeItems = [...model.nodes.values()].map((node) => ({
		id: node.id,
		box: node.body,
		value: node,
	}));
	const obstacleItems = model.obstacles.map((obstacle) => ({
		id: obstacle.id,
		box: obstacle.box,
		value: obstacle,
	}));
	const labelNodeRecords = records.filter((record) => {
		if (!record.live || !record.id || record.type !== "text" || !record.box) return false;
		const state = model.labelOwnership.get(record.id)?.state;
		return state !== undefined && state !== "none" && state !== "blocked";
	});
	const labelNodeItems = labelNodeRecords.map((label) => ({
		id: label.id!,
		box: label.box!,
		value: label,
	}));
	const labelLabelItems = labelNodeItems.filter((item) => model.confirmedLabels.has(item.id));
	const connectorEnds = (segment: Segment) => {
		return (
			model.connectorEndpoints.get(segment.connectorId) ?? {
				nodeAnalysisEligible: false,
				startNode: undefined,
				endNode: undefined,
			}
		);
	};
	pairSweep(
		segmentItems,
		leafNodeItems,
		false,
		(segment, node) => {
			const ends = connectorEnds(segment);
			if (!ends.nodeAnalysisEligible) return false;
			const excluded = new Set([
				ends.startNode,
				ends.endNode,
				...semanticParents(model, ends.startNode),
				...semanticParents(model, ends.endNode),
			]);
			return !excluded.has(node.id);
		},
		(segment, node) => {
			const hit = segmentInsideBox(segment.a, segment.b, node.body, policy.overlapTolerance);
			if (!hit) return;
			findings.push(
				make({
					code: "CONNECTOR_PENETRATES_NODE",
					reason: "leaf-footprint-interior",
					severity: "error",
					affectsCoverage: false,
					details: {
						connectorId: segment.connectorId,
						segmentIndex: segment.index,
						nodeId: node.id,
						entry: point(hit.entry),
						exit: point(hit.exit),
					},
					message: `Connector ${segment.connectorId} passes through node ${node.id}.`,
					elements: uniqueRefs([byId.get(segment.connectorId)!].filter(Boolean)),
					nodes: [node.ref],
					points: [hit.entry, hit.exit],
					affected: pointBox([hit.entry, hit.exit]),
				}),
			);
		},
		counter,
		"connector-node",
	);
	if (!counter.limited)
		pairSweep(
			segmentItems,
			obstacleItems,
			false,
			() => true,
			(segment, obstacle) => {
				const hit = segmentInsideBox(segment.a, segment.b, obstacle.box, policy.overlapTolerance);
				if (!hit) return;
				findings.push(
					make({
						code: "CONNECTOR_PENETRATES_OBSTACLE",
						reason: "obstacle-footprint-interior",
						severity: "error",
						affectsCoverage: false,
						details: {
							connectorId: segment.connectorId,
							segmentIndex: segment.index,
							obstacleId: obstacle.id,
							entry: point(hit.entry),
							exit: point(hit.exit),
						},
						message: `Connector ${segment.connectorId} passes through obstacle ${obstacle.id}.`,
						elements: uniqueRefs(
							[byId.get(segment.connectorId)!, ...obstacle.members].filter(Boolean),
						),
						obstacles: [obstacle.ref],
						points: [hit.entry, hit.exit],
						affected: pointBox([hit.entry, hit.exit]),
					}),
				);
			},
			counter,
			"connector-obstacle",
		);
	if (!counter.limited)
		pairSweep(
			segmentItems,
			segmentItems,
			true,
			(a, b) => a.connectorId !== b.connectorId,
			(a, b) => {
				const hit = intersectSegments(a.a, a.b, b.a, b.b, policy.intersectionTolerance);
				if (hit.kind === "proper")
					findings.push(
						make({
							code: "CONNECTOR_INTERSECTION_UNMARKED",
							reason: "proper-interior-crossing",
							severity: "error",
							affectsCoverage: false,
							details: {
								firstConnectorId: a.connectorId,
								firstSegmentIndex: a.index,
								secondConnectorId: b.connectorId,
								secondSegmentIndex: b.index,
								point: point(hit.point),
							},
							message: `Connectors ${a.connectorId} and ${b.connectorId} cross.`,
							elements: uniqueRefs(
								[byId.get(a.connectorId)!, byId.get(b.connectorId)!].filter(Boolean),
							),
							points: [hit.point],
							affected: pointBox([hit.point]),
						}),
					);
				else if (hit.kind === "collinear")
					findings.push(
						make({
							code: "AMBIGUOUS_GEOMETRY",
							reason: "collinear-overlap",
							severity: "warning",
							affectsCoverage: true,
							details: {
								firstConnectorId: a.connectorId,
								firstSegmentIndex: a.index,
								secondConnectorId: b.connectorId,
								secondSegmentIndex: b.index,
							},
							message: `Connectors ${a.connectorId} and ${b.connectorId} overlap collinearly.`,
							elements: uniqueRefs(
								[byId.get(a.connectorId)!, byId.get(b.connectorId)!].filter(Boolean),
							),
							points: hit.points,
							affected: pointBox(hit.points),
						}),
					);
			},
			counter,
			"connector-intersection",
		);
	if (!counter.limited)
		pairSweep(
			leafNodeItems,
			leafNodeItems,
			true,
			(a, b) => a.parentId !== b.id && b.parentId !== a.id,
			(a, b) => {
				const hit = overlap(a.body, b.body);
				if (!hit || hit.width <= policy.overlapTolerance || hit.height <= policy.overlapTolerance)
					return;
				findings.push(
					make({
						code: "NODE_OVERLAP",
						reason: "leaf-footprint-overlap",
						severity: "error",
						affectsCoverage: false,
						details: {
							firstNodeId: a.id,
							secondNodeId: b.id,
							overlapWidth: hit.width,
							overlapHeight: hit.height,
						},
						message: `Nodes ${a.id} and ${b.id} overlap.`,
						nodes: [a.ref, b.ref],
						elements: uniqueRefs([...a.bodies, ...b.bodies]),
						affected: hit,
					}),
				);
			},
			counter,
			"node-overlap",
		);
	if (!counter.limited)
		pairSweep(
			labelNodeItems,
			allNodeItems,
			false,
			(label, node) => {
				const ownership = model.labelOwnership.get(label.id!);
				if (!ownership) return false;
				const candidateNodes = ownership.candidateOwnerIds
					.map((owner) => model.nodeOfElement.get(owner))
					.filter((owner): owner is string => owner !== undefined);
				const excluded = new Set(candidateNodes);
				for (const owner of candidateNodes)
					for (const ancestor of semanticParents(model, owner)) excluded.add(ancestor);
				return !excluded.has(node.id);
			},
			(label, node) => {
				const hit = overlap(label.box!, node.body);
				if (!hit || hit.width <= policy.overlapTolerance || hit.height <= policy.overlapTolerance)
					return;
				findings.push(
					make({
						code: "LABEL_OVERLAP",
						reason: "label-node-overlap",
						severity: "error",
						affectsCoverage: false,
						details: {
							labelId: label.id!,
							nodeId: node.id,
							overlapWidth: hit.width,
							overlapHeight: hit.height,
						},
						message: `Label ${label.id} overlaps node ${node.id}.`,
						elements: [label.ref],
						nodes: [node.ref],
						affected: hit,
					}),
				);
			},
			counter,
			"label-node-overlap",
		);
	if (!counter.limited)
		pairSweep(
			labelLabelItems,
			labelLabelItems,
			true,
			(a, b) => model.confirmedLabels.get(a.id!) !== model.confirmedLabels.get(b.id!),
			(a, b) => {
				const hit = overlap(a.box!, b.box!);
				if (!hit || hit.width <= policy.overlapTolerance || hit.height <= policy.overlapTolerance)
					return;
				findings.push(
					make({
						code: "LABEL_OVERLAP",
						reason: "label-label-overlap",
						severity: "error",
						affectsCoverage: false,
						details: {
							firstLabelId: a.id!,
							secondLabelId: b.id!,
							overlapWidth: hit.width,
							overlapHeight: hit.height,
						},
						message: `Labels ${a.id} and ${b.id} overlap.`,
						elements: [a.ref, b.ref],
						affected: hit,
					}),
				);
			},
			counter,
			"label-label-overlap",
		);
	if (counter.limited) {
		const allBoxes = [...segmentItems, ...allNodeItems, ...obstacleItems, ...labelNodeItems].map(
			(item) => item.box,
		);
		findings.push(
			make({
				code: "INSPECTION_LIMIT_EXCEEDED",
				reason: "broad-phase-comparison-ceiling",
				severity: "warning",
				affectsCoverage: true,
				details: {
					limit: BROAD_PHASE_COMPARISON_LIMIT,
					attempted: counter.value,
					pass: counter.pass,
					segmentCount: segments.length,
					nodeCount: leaves.length,
					obstacleCount: model.obstacles.length,
					labelCount: labelNodeRecords.length,
				},
				message: `Inspection stopped pair analysis at comparison ${counter.value}.`,
				affected: unionBoxes(allBoxes),
			}),
		);
	}
	return { findings, broadPhaseComparisons: counter.value };
}

function sortFindings(findings: readonly InspectionFinding[]): InspectionFinding[] {
	return findings.toSorted((a, b) => {
		const severity = (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1);
		if (severity) return severity;
		const code = CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code);
		if (code) return code;
		const reason = REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason);
		if (reason) return reason;
		const nodes = a.nodes
			.map((node) => node.id)
			.join("\0")
			.localeCompare(b.nodes.map((node) => node.id).join("\0"));
		if (nodes) return nodes;
		const obstacles = a.obstacles
			.map((obstacle) => obstacle.id)
			.join("\0")
			.localeCompare(b.obstacles.map((obstacle) => obstacle.id).join("\0"));
		if (obstacles) return obstacles;
		const elements = a.elements
			.map((element) => element.id ?? "")
			.join("\0")
			.localeCompare(b.elements.map((element) => element.id ?? "").join("\0"));
		if (elements) return elements;
		const sources = numberListOrder(
			a.elements.map((element) => element.sourceIndex),
			b.elements.map((element) => element.sourceIndex),
		);
		if (sources) return sources;
		const boxA = a.affectedBBox;
		const boxB = b.affectedBBox;
		return (
			(a.points[0]?.x ?? Infinity) - (b.points[0]?.x ?? Infinity) ||
			(a.points[0]?.y ?? Infinity) - (b.points[0]?.y ?? Infinity) ||
			(boxA?.x ?? Infinity) - (boxB?.x ?? Infinity) ||
			(boxA?.y ?? Infinity) - (boxB?.y ?? Infinity) ||
			(boxA?.width ?? Infinity) - (boxB?.width ?? Infinity) ||
			(boxA?.height ?? Infinity) - (boxB?.height ?? Infinity) ||
			a.message.localeCompare(b.message)
		);
	});
}

export function detectBoard(
	records: readonly DecodedRecord[],
	policy: InspectionPolicy,
): DetectionResult {
	const findings = [...renderFindings(records), ...identityFindings(records)];
	const model = buildInspectionModel(records);
	const structural = structuralFindings(records, policy, model);
	findings.push(...structural.findings);
	findings.push(...labelFindings(records, model));
	const collisions = collisionFindings(records, model, structural.segments, policy);
	findings.push(...collisions.findings);
	return {
		findings: sortFindings(findings),
		broadPhaseComparisons: collisions.broadPhaseComparisons,
	};
}

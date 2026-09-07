import { measureLinear } from "@/runtime/engine/geometry";
import type { InspectionFinding, InspectionPolicy } from "@/runtime/board-inspection/schemas";
import {
	decodePath,
	kindOf,
	persistedConnectorPointChainEligibility,
	stableDescription,
	type DecodedRecord,
} from "@/runtime/board-inspection/lib/decode";
import {
	pointBox,
	type ExactBox,
	type ExactPoint,
	type Segment,
} from "@/runtime/board-inspection/lib/geometry";
import {
	classifyBindingTarget,
	type BlockingBindingIssue,
} from "@/runtime/board-inspection/lib/model";
import { affectedOf, make } from "@/runtime/board-inspection/lib/finding-builder";

type RecordMap = ReadonlyMap<string, DecodedRecord>;
type RawRecord = Readonly<Record<string, unknown>>;

const locatableOrigin = (raw: RawRecord): raw is RawRecord & { x: number; y: number } =>
	typeof raw["x"] === "number" &&
	Number.isFinite(raw["x"]) &&
	typeof raw["y"] === "number" &&
	Number.isFinite(raw["y"]);

const storedExtent = (record: DecodedRecord, raw: RawRecord): ExactBox | null =>
	record.evidenceBox ?? (locatableOrigin(raw) ? { x: raw.x, y: raw.y, width: 0, height: 0 } : null);

function decodedPathEvidence(
	record: DecodedRecord,
	raw: RawRecord,
	scenePoints: readonly ExactPoint[] | null | undefined,
): { points: readonly ExactPoint[]; affected: ExactBox | null } {
	if (scenePoints === null || (scenePoints === undefined && !locatableOrigin(raw))) {
		return { points: [], affected: null };
	}
	const points = scenePoints ?? [];
	const pathBox = points.length > 0 ? pointBox(points) : null;
	return {
		points,
		affected: pathBox ?? storedExtent(record, raw),
	};
}

function unusablePathFinding(record: DecodedRecord, raw: RawRecord): InspectionFinding {
	const decoded = decodePath(record);
	if (decoded.ok) {
		throw new Error("usable connector path passed to unusablePathFinding");
	}
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
					rawPointsKind: kindOf(raw["points"]),
					rawPointsDescription: stableDescription(raw["points"]),
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
	work: { pathSegmentChecks: number },
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	const refs = [record.ref];
	const decoded = decodePath(record);
	const pathEvidence = decodedPathEvidence(record, raw, decoded.scenePoints);
	const angle = raw["angle"];
	const unsupportedRotation = angle !== undefined && angle !== 0;
	if (unsupportedRotation) {
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
	}
	const unsupportedCurve = raw["curve"] !== undefined || raw["curveKind"] !== undefined;
	if (unsupportedCurve) {
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "curve",
				severity: "warning",
				affectsCoverage: true,
				details: { curveKind: stableDescription(raw["curveKind"] ?? raw["curve"]) },
				message: `Connector ${record.id ?? record.sourceIndex} is curved.`,
				elements: refs,
				...pathEvidence,
			}),
		);
	}
	const eligibility = decoded.ok ? persistedConnectorPointChainEligibility(record, decoded) : null;
	if (eligibility && !eligibility.eligible) {
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "rounded-or-elbowed",
				severity: "warning",
				affectsCoverage: true,
				details: {
					roundness: raw["roundness"] == null ? null : stableDescription(raw["roundness"]),
					elbowed: raw["elbowed"] === true,
					fixedSegments: raw["fixedSegments"] != null,
				},
				message:
					eligibility.issue === "elbow-coordinate-limit"
						? `Connector ${record.id ?? record.sourceIndex} has elbow point ${eligibility.pointIndex} ${eligibility.axis} coordinate ${eligibility.coordinate} exceeding ±1,000,000.`
						: eligibility.issue === "malformed-elbowed"
							? `Connector ${record.id ?? record.sourceIndex} has malformed elbowed metadata.`
							: `Connector ${record.id ?? record.sourceIndex} has fixedSegments metadata without elbowed geometry.`,
				elements: refs,
				...pathEvidence,
			}),
		);
	}
	if (!decoded.ok) {
		return [...findings, unusablePathFinding(record, raw)];
	}
	for (const segmentIndex of decoded.zeroSegments) {
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
	}
	const unsupported = unsupportedRotation || unsupportedCurve || eligibility?.eligible === false;
	if (unsupported || !record.usableId || !record.id || !decoded.scenePoints) {
		return findings;
	}
	const zeroSegments = new Set(decoded.zeroSegments);
	for (let index = 0; index < decoded.scenePoints.length - 1; index += 1) {
		work.pathSegmentChecks += 1;
		if (zeroSegments.has(index)) {
			continue;
		}
		segments.push({
			connectorId: record.id,
			sourceIndex: record.sourceIndex,
			index,
			a: decoded.scenePoints[index]!,
			b: decoded.scenePoints[index + 1]!,
		});
	}
	const measured = measureLinear(raw["points"]);
	if (
		!measured ||
		typeof raw["width"] !== "number" ||
		!Number.isFinite(raw["width"]) ||
		typeof raw["height"] !== "number" ||
		!Number.isFinite(raw["height"])
	) {
		return findings;
	}
	const widthDelta = Math.abs(raw["width"] - measured.width),
		heightDelta = Math.abs(raw["height"] - measured.height);
	const staleWidth = widthDelta >= policy.dimensionTolerance,
		staleHeight = heightDelta >= policy.dimensionTolerance;
	if (staleWidth || staleHeight) {
		findings.push(
			make({
				code: "STALE_LINEAR_DIMENSIONS",
				reason: staleWidth && staleHeight ? "width-and-height" : staleWidth ? "width" : "height",
				severity: "error",
				affectsCoverage: false,
				details: {
					storedWidth: raw["width"],
					storedHeight: raw["height"],
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
	}
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
	if (target.blockingIssue) {
		return {
			binding,
			issue: target.blockingIssue,
			readableTargetId: null,
			classificationBlocked: true,
		};
	}
	let issue: Exclude<BindingIssue, BlockingBindingIssue> | null = null;
	if (binding) {
		if (!("focus" in binding)) {
			issue = "missing-focus";
		} else if (typeof binding["focus"] !== "number" || !Number.isFinite(binding["focus"])) {
			issue = "nonfinite-focus";
		} else if (!("gap" in binding)) {
			issue = "missing-gap";
		} else if (typeof binding["gap"] !== "number" || !Number.isFinite(binding["gap"])) {
			issue = "nonfinite-gap";
		} else if (
			binding["fixedPoint"] != null &&
			(!Array.isArray(binding["fixedPoint"]) ||
				binding["fixedPoint"].length !== 2 ||
				binding["fixedPoint"].some((n) => typeof n !== "number" || !Number.isFinite(n)))
		) {
			issue = "invalid-fixed-point";
		}
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
	duplicateIds: ReadonlySet<string>,
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const end of ["start", "end"] as const) {
		const value = raw[`${end}Binding`];
		if (value == null) {
			continue;
		}
		const { issue, readableTargetId, classificationBlocked } = bindingIssue(value);
		if (issue) {
			const shared = {
				code: "BROKEN_REFERENCE",
				reason: `malformed-${end}-binding` as const,
				severity: "error",
				message: `Connector ${record.id ?? record.sourceIndex} has a malformed ${end} binding.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			} as const;
			if (classificationBlocked) {
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
			} else {
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
		}
		if (!readableTargetId || !record.usableId || !record.id || duplicateIds.has(readableTargetId)) {
			continue;
		}
		const target = byId.get(readableTargetId);
		if (!target) {
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "missing-binding-target",
					severity: "error",
					affectsCoverage: true,
					details: { connectorId: record.id, end, targetId: readableTargetId },
					message: `Connector ${record.id} names missing target ${readableTargetId}.`,
					elements: [record.ref],
					affected: record.evidenceBox,
				}),
			);
		} else if (target.type === "arrow" || target.type === "line") {
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "invalid-binding-target-type",
					severity: "error",
					affectsCoverage: true,
					details: {
						connectorId: record.id,
						end,
						targetId: readableTargetId,
						targetType: target.type ?? "unknown",
					},
					message: `Connector ${record.id} binds to another connector.`,
					elements: [record.ref, target.ref],
					affected: affectedOf([record, target]),
				}),
			);
		} else {
			const targetBounds = target.raw?.boundElements;
			if (
				!Array.isArray(targetBounds) ||
				!targetBounds.some(
					(entry) =>
						entry &&
						typeof entry === "object" &&
						!Array.isArray(entry) &&
						(entry as Record<string, unknown>)["id"] === record.id &&
						(entry as Record<string, unknown>)["type"] === "arrow",
				)
			) {
				findings.push(
					make({
						code: "BROKEN_REFERENCE",
						reason: "missing-binding-reciprocal",
						severity: "error",
						affectsCoverage: false,
						details: { connectorId: record.id, end, targetId: readableTargetId },
						message: `Target ${readableTargetId} does not name connector ${record.id}.`,
						elements: [record.ref, target.ref],
						affected: affectedOf([record, target]),
					}),
				);
			}
		}
	}
	return findings;
}

function persistedEndpointFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	if (!record.id) {
		return [];
	}
	const findings: InspectionFinding[] = [];
	for (const end of ["start", "end"] as const) {
		const input = raw[end];
		if (!input || typeof input !== "object" || Array.isArray(input)) {
			continue;
		}
		const inputId = (input as Record<string, unknown>)["id"];
		if (typeof inputId !== "string" || !inputId) {
			continue;
		}
		const binding = raw[`${end}Binding`];
		const bindingId =
			binding && typeof binding === "object" && !Array.isArray(binding)
				? (binding as Record<string, unknown>)["elementId"]
				: null;
		if (bindingId !== inputId) {
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "persisted-agent-endpoint",
					severity: "error",
					affectsCoverage: true,
					details: {
						connectorId: record.id,
						end,
						inputTargetId: inputId,
						bindingTargetId: typeof bindingId === "string" ? bindingId : null,
					},
					message: `Connector ${record.id} persists an input-only ${end} endpoint.`,
					elements: [record.ref],
					affected: record.evidenceBox,
				}),
			);
		}
	}
	return findings;
}

export {
	type RawRecord,
	type RecordMap,
	connectorBindingFindings,
	connectorGeometryFindings,
	persistedEndpointFindings,
	storedExtent,
};

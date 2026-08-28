import { describe, expect, test } from "bun:test";
import {
	BROAD_PHASE_COMPARISON_LIMIT,
	CheckResultSchema,
	DEFAULT_INSPECTION_POLICY,
	INSPECTION_INPUT_COMPLEXITY_LIMIT,
	InspectionFindingSchema,
	InspectionPolicyInputSchema,
	InspectionReportSchema,
	formatInspectionText,
	inspectBoard,
} from "../index.js";
import { inspectBoardDiagnostics } from "../diagnostics.js";

type FindingCase = readonly [
	code: string,
	reason: string,
	severity: "error" | "warning",
	affectsCoverage: boolean,
	details: unknown,
];

// Kept local to this owner. One line per formatter branch makes omissions obvious.
const findingCases = () =>
	JSON.parse(
		[
			'["INVALID_RENDER_GEOMETRY","non-data-input","error",true,{"sourceIndex":0,"path":["customData"],"issue":"accessor"}]',
			'["INVALID_RENDER_GEOMETRY","invalid-render-fields","error",true,{"invalidFields":["width"],"valueKinds":{"width":"null"}}]',
			'["INVALID_RENDER_GEOMETRY","unlocatable-record","error",true,{"recordKind":"object","invalidFields":["x"],"sourceIndex":0}]',
			'["STALE_LINEAR_DIMENSIONS","width","error",false,{"storedWidth":10,"storedHeight":10,"measuredWidth":11,"measuredHeight":11,"widthDelta":1,"heightDelta":1}]',
			'["STALE_LINEAR_DIMENSIONS","height","error",false,{"storedWidth":10,"storedHeight":10,"measuredWidth":11,"measuredHeight":11,"widthDelta":1,"heightDelta":1}]',
			'["STALE_LINEAR_DIMENSIONS","width-and-height","error",false,{"storedWidth":10,"storedHeight":10,"measuredWidth":11,"measuredHeight":11,"widthDelta":1,"heightDelta":1}]',
			'["BROKEN_REFERENCE","invalid-element-identity","error",true,{"identityIssue":"missing-id","rawIdType":"missing","rawIdDescription":"missing","sourceIndex":0,"intendedRoles":["connector"],"availableElementType":"arrow"}]',
			'["BROKEN_REFERENCE","duplicate-element-id","error",true,{"duplicateId":"dup","sourceIndexes":[0,1]}]',
			'["BROKEN_REFERENCE","missing-binding-target","error",true,{"connectorId":"edge","end":"start","targetId":"gone"}]',
			'["BROKEN_REFERENCE","invalid-binding-target-type","error",true,{"connectorId":"edge","end":"start","targetId":"other","targetType":"arrow"}]',
			'["BROKEN_REFERENCE","missing-binding-reciprocal","error",false,{"connectorId":"edge","end":"start","targetId":"node"}]',
			'["BROKEN_REFERENCE","malformed-start-binding","error",true,{"connectorId":"edge","sourceIndex":0,"rawKind":"object","issue":"missing-element-id","readableTargetId":null,"classificationBlocked":true}]',
			'["BROKEN_REFERENCE","malformed-end-binding","error",true,{"connectorId":"edge","sourceIndex":0,"rawKind":"object","issue":"missing-element-id","readableTargetId":null,"classificationBlocked":true}]',
			'["BROKEN_REFERENCE","malformed-bound-elements","error",true,{"ownerId":"node","sourceIndex":0,"rawKind":"array","entryIndex":0,"issue":"entry-not-object","readableEntries":[],"classificationBlocked":true}]',
			'["BROKEN_REFERENCE","malformed-container-id","error",true,{"textId":"label","sourceIndex":0,"rawKind":"string","rawDescription":"\\"\\"","issue":"empty-container-id","ownerClassificationBlocked":true}]',
			'["BROKEN_REFERENCE","dangling-bound-text","error",false,{"ownerId":"node","targetId":"gone"}]',
			'["BROKEN_REFERENCE","dangling-bound-arrow","error",false,{"ownerId":"node","targetId":"gone"}]',
			'["BROKEN_REFERENCE","bound-element-target-type-mismatch","error",true,{"ownerId":"node","targetId":"label","declaredType":"text","actualType":"rectangle"}]',
			'["BROKEN_REFERENCE","conflicting-bound-label-owner","error",true,{"textId":"label","forwardContainerId":"a","reverseContainerIds":["a","b"]}]',
			'["BROKEN_REFERENCE","persisted-agent-endpoint","error",true,{"connectorId":"edge","end":"start","inputTargetId":"node","bindingTargetId":null}]',
			'["BROKEN_REFERENCE","invalid-node-metadata","error",true,{"elementId":"node","valueKind":"number"}]',
			'["BROKEN_REFERENCE","invalid-code-binding","error",false,{"elementId":"node","issues":["path must be a nonempty string"]}]',
			'["BROKEN_REFERENCE","derived-link-persisted","error",false,{"elementId":"node","link":"file:///tmp/node.ts"}]',
			'["BROKEN_REFERENCE","invalid-library-attribution","error",true,{"elementId":"body","issues":["itemId or item must be a nonempty string"],"rescuedByGroup":false}]',
			'["LABEL_CORRUPTION","orphan","error",true,{"textId":"label","containerId":"gone"}]',
			'["LABEL_CORRUPTION","duplicate","error",false,{"containerId":"node","keeperId":"a","duplicateIds":["b"]}]',
			'["LABEL_CORRUPTION","missing-reciprocal","error",false,{"textId":"label","containerId":"node","missingSide":"container"}]',
			'["LABEL_CORRUPTION","conflicting-owner","error",true,{"textId":"label","containerId":"a","otherContainerIds":["b"]}]',
			'["LABEL_CORRUPTION","drift","error",false,{"textId":"label","containerId":"node","distance":20,"allowed":5}]',
			'["LABEL_CORRUPTION","persisted-seed","error",false,{"elementId":"node","seedField":"label"}]',
			'["FONT_POLICY_VIOLATION","missing-font-family","warning",false,{"effectiveFamily":1,"allowedFamilies":[5]}]',
			'["FONT_POLICY_VIOLATION","disallowed-font-family","warning",false,{"rawFamily":1,"effectiveFamily":1,"allowedFamilies":[5]}]',
			'["FONT_POLICY_VIOLATION","invalid-font-family","warning",false,{"rawType":"string","rawDescription":"\\"5\\"","allowedFamilies":[5]}]',
			'["UNSUPPORTED_GEOMETRY","unsupported-type","warning",true,{"rawType":"\\"selection\\""}]',
			'["UNSUPPORTED_GEOMETRY","rotation","warning",true,{"angle":1}]',
			'["UNSUPPORTED_GEOMETRY","curve","warning",true,{"curveKind":"bezier"}]',
			'["UNSUPPORTED_GEOMETRY","rounded-or-elbowed","warning",true,{"roundness":"object","elbowed":false,"fixedSegments":false}]',
			'["AMBIGUOUS_GEOMETRY","points-missing","warning",true,{"connectorId":"edge","sourceIndex":0,"rawPointsKind":"missing","rawPointsDescription":"missing","pointCount":null,"minimumRequired":2,"issue":"missing"}]',
			'["AMBIGUOUS_GEOMETRY","points-not-array","warning",true,{"connectorId":"edge","sourceIndex":0,"rawPointsKind":"null","rawPointsDescription":"null","pointCount":null,"minimumRequired":2,"issue":"non-array"}]',
			'["AMBIGUOUS_GEOMETRY","points-empty","warning",true,{"connectorId":"edge","sourceIndex":0,"rawPointsKind":"array","rawPointsDescription":"array","pointCount":0,"minimumRequired":2,"issue":"empty"}]',
			'["AMBIGUOUS_GEOMETRY","points-one-point","warning",true,{"connectorId":"edge","sourceIndex":0,"rawPointsKind":"array","rawPointsDescription":"array","pointCount":1,"minimumRequired":2,"issue":"insufficient-cardinality"}]',
			'["AMBIGUOUS_GEOMETRY","malformed-point","warning",true,{"connectorId":"edge","sourceIndex":0,"pointIndex":1,"issue":"point must contain two finite numbers"}]',
			'["AMBIGUOUS_GEOMETRY","absolute-point-overflow","warning",true,{"connectorId":"edge","sourceIndex":0,"pointIndex":1,"issue":"overflow"}]',
			'["AMBIGUOUS_GEOMETRY","unrepresentable-coordinate-span","warning",true,{"scope":"semantic-node-body","subjectId":"node","sourceIndexes":[0,1],"issue":"finite-constituents-have-no-finite-union"}]',
			'["AMBIGUOUS_GEOMETRY","unrepresentable-focus-padding","warning",true,{"padding":16,"failedDeltas":["x-minus-16"],"issue":"exact-16px-padding-is-not-finite-and-representable"}]',
			'["AMBIGUOUS_GEOMETRY","zero-length","warning",true,{"connectorId":"edge","sourceIndex":0,"segmentIndex":0}]',
			'["AMBIGUOUS_GEOMETRY","collinear-overlap","warning",true,{"firstConnectorId":"a","firstSegmentIndex":0,"secondConnectorId":"b","secondSegmentIndex":0}]',
			'["INSPECTION_LIMIT_EXCEEDED","broad-phase-comparison-ceiling","warning",true,{"limit":2000000,"attempted":2000001,"pass":"node-overlap","segmentCount":0,"nodeCount":2001,"obstacleCount":0,"labelCount":0}]',
			'["INSPECTION_LIMIT_EXCEEDED","input-complexity-ceiling","warning",true,{"limit":1000000,"attempted":1000001,"pass":"input-scan","phase":"snapshot-input","completedRecordCount":0,"sourceIndex":0,"path":["id"],"unitKind":"string-code-unit"}]',
			'["CONNECTOR_PENETRATES_NODE","leaf-footprint-interior","error",false,{"connectorId":"edge","segmentIndex":0,"nodeId":"node","entry":{"x":0,"y":0},"exit":{"x":1,"y":0}}]',
			'["CONNECTOR_PENETRATES_OBSTACLE","obstacle-footprint-interior","error",false,{"connectorId":"edge","segmentIndex":0,"obstacleId":"obstacle:body","entry":{"x":0,"y":0},"exit":{"x":1,"y":0}}]',
			'["CONNECTOR_INTERSECTION_UNMARKED","proper-interior-crossing","error",false,{"firstConnectorId":"a","firstSegmentIndex":0,"secondConnectorId":"b","secondSegmentIndex":0,"point":{"x":0,"y":0}}]',
			'["NODE_OVERLAP","leaf-footprint-overlap","error",false,{"firstNodeId":"a","secondNodeId":"b","overlapWidth":1,"overlapHeight":1}]',
			'["LABEL_OVERLAP","label-node-overlap","error",false,{"labelId":"label","nodeId":"node","overlapWidth":1,"overlapHeight":1}]',
			'["LABEL_OVERLAP","label-label-overlap","error",false,{"firstLabelId":"a","secondLabelId":"b","overlapWidth":1,"overlapHeight":1}]',
			'["BRIDGE_PROVENANCE_INVALID","incomplete-decoration","error",false,{"bridgeId":null,"issue":"missing-mask"}]',
			'["BRIDGE_PROVENANCE_INVALID","stale-decoration","error",false,{"bridgeId":"bridge","issue":"geometry-mismatch"}]',
		]
			.map((entry) => entry)
			.join(",")
			.replace(/^/, "[")
			.concat("]"),
	) as FindingCase[];

const cleanReport = () => inspectBoard(Object.freeze([]));

describe("board inspection public schema", () => {
	test("publishes schema v2 and only the two public ceilings", () => {
		const clean = cleanReport();
		expect(clean).toMatchObject({
			schemaVersion: 2,
			clean: true,
			coverage: "complete",
			limits: {
				inputComplexityUnits: 1_000_000,
				broadPhaseComparisons: 2_000_000,
			},
		});
		expect(INSPECTION_INPUT_COMPLEXITY_LIMIT).toBe(1_000_000);
		expect(BROAD_PHASE_COMPARISON_LIMIT).toBe(2_000_000);
		expect(InspectionReportSchema.safeParse(clean).success).toBe(true);
		expect(CheckResultSchema.safeParse({ board: "clean", ...clean }).success).toBe(true);
		expect(InspectionReportSchema.safeParse({ ...clean, preprocessingWork: {} }).success).toBe(
			false,
		);
		expect(JSON.stringify(clean)).not.toContain("analysisWork");
	});

	test("creates independent clean reports for each test", () => {
		const first = cleanReport();
		const second = cleanReport();
		expect(first).not.toBe(second);
		expect(first.policy).not.toBe(second.policy);
		expect(first.findings).not.toBe(second.findings);
	});

	test("diagnostics preserve the public report JSON bytes", () => {
		const input = Object.freeze([
			Object.freeze({
				id: "diagnostic-edge",
				type: "arrow",
				x: 0,
				y: 0,
				width: 11,
				height: 0,
				angle: 0,
				points: Object.freeze([Object.freeze([0, 0]), Object.freeze([10, 0])]),
			}),
		]);
		expect(JSON.stringify(inspectBoardDiagnostics(input).report)).toBe(
			JSON.stringify(inspectBoard(input)),
		);
	});

	test("normalizes policy and rejects invalid values", () => {
		expect(inspectBoard([], { allowedFontFamilies: [8, 5, 8] }).policy.allowedFontFamilies).toEqual(
			[5, 8],
		);
		expect(inspectBoard([], { allowedFontFamilies: "any" }).policy.allowedFontFamilies).toBe("any");
		expect(DEFAULT_INSPECTION_POLICY).toEqual({
			allowedFontFamilies: [5],
			dimensionTolerance: 0.5,
			intersectionTolerance: 0.5,
			overlapTolerance: 0.5,
		});
		for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY])
			expect(InspectionPolicyInputSchema.safeParse({ overlapTolerance: value }).success).toBe(
				false,
			);
	});

	test("fixes reason severity and coverage combinations", () => {
		const findings = inspectBoard([
			{ type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
			{
				id: "font",
				type: "text",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				fontFamily: 1,
			},
		]).findings;
		expect(findings.length).toBeGreaterThan(1);
		for (const finding of findings) {
			expect(InspectionFindingSchema.safeParse(finding).success).toBe(true);
			expect(
				InspectionFindingSchema.safeParse({
					...finding,
					severity: finding.severity === "error" ? "warning" : "error",
				}).success,
			).toBe(false);
			expect(
				InspectionFindingSchema.safeParse({
					...finding,
					affectsCoverage: !finding.affectsCoverage,
				}).success,
			).toBe(false);
		}
	});

	test("formats the exhaustive closed code and reason matrix", () => {
		const clean = cleanReport();
		const schemaFindings = findingCases().map(
			([code, reason, severity, affectsCoverage, details], sourceIndex) =>
				InspectionFindingSchema.parse({
					code,
					reason,
					severity,
					affectsCoverage,
					details,
					message: code + "/" + reason,
					elements: [{ id: "e" + sourceIndex, type: "rectangle", sourceIndex }],
					nodes: [],
					obstacles: [],
					points: [],
					affectedBBox: { x: 0, y: 0, width: 0, height: 0 },
					focusBBox: { x: -16, y: -16, width: 32, height: 32 },
				}),
		);
		for (const finding of schemaFindings) {
			expect(
				InspectionFindingSchema.safeParse({
					...finding,
					severity: finding.severity === "error" ? "warning" : "error",
				}).success,
			).toBe(false);
			expect(
				InspectionFindingSchema.safeParse({
					...finding,
					affectsCoverage: !finding.affectsCoverage,
				}).success,
			).toBe(false);
		}
		const text = formatInspectionText({
			board: "matrix",
			...clean,
			coverage: "indeterminate",
			clean: false,
			maxSeverity: "error",
			findings: schemaFindings,
		});
		for (const finding of schemaFindings)
			expect(text).toContain(finding.code + "/" + finding.reason);
		expect(text).not.toContain("broadPhaseEvents");
	});
});

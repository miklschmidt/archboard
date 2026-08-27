#!/usr/bin/env bun
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => path.join(root, "src", file);
const fixture = (file) =>
	JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures/board-inspection", file), "utf8"));
const {
	inspectBoard,
	BROAD_PHASE_PREPROCESSING_LIMIT,
	InspectionFindingSchema,
	InspectionReportSchema,
	CheckResultSchema,
	ObstacleRefSchema,
	formatInspectionText,
} = await import(src("runtime/board-inspection/index.ts"));
const {
	inspectBoardDiagnostics,
	diagnoseMutableProfileSnapshots,
	diagnoseObstacleIdentityEncoding,
	diagnosePreprocessingPrimitives,
	diagnoseStablePreprocessingSort,
	diagnoseSweepCompatibility,
} = await import(src("runtime/board-inspection/diagnostics.ts"));
const { compareBoards } = await import(src("runtime/engine/compare.ts"));
const { renderBoardNote } = await import(src("runtime/engine/board.ts"));
const { ingestScene } = await import(src("runtime/engine/board-io.ts"));
const { collectInvalidRenderGeometry } = await import(src("runtime/engine/geometry.ts"));
let failures = 0,
	checks = 0;
const check = (label, condition, detail = "") => {
	checks += 1;
	if (!condition) {
		failures += 1;
		console.error(`FAIL - ${label}${detail ? ` (${detail})` : ""}`);
	}
};

const preprocessingSourceViolations = (sourceText) => {
	const audited = sourceText.replaceAll(
		/\b(?:[A-Za-z]+Operations|operations|prepare|hierarchy|hierarchyWork|query|lifecycle|order)\.(?:array|arrayFilled|arrayWithLength|copy|read|write|push|pop|spliceOne|map|mapHas|mapGet|mapSet|mapDelete|mapEntries|forEachMap|set|setHas|setAdd|setDelete|setValues|forEachSet|identityCodeUnit|stableComparison)\b/gu,
		"chargedOperation",
	);
	const forbidden = [
		[/\bnew\s+Map\s*[<(]/u, "raw Map construction"],
		[/\bnew\s+Set\s*[<(]/u, "raw Set construction"],
		[/\bnew\s+Array\s*[<(]|\bArray\.from\s*\(/u, "raw array construction"],
		[/\.(?:filter|map|flatMap)\s*\(/u, "raw collection combinator"],
		[/\.(?:sort|toSorted)\s*\(/u, "raw ordering"],
		[/\.(?:push|splice)\s*\(/u, "raw list mutation"],
		[/\.(?:has|get|set|add|delete)\s*\(/u, "raw Map/Set operation"],
		[/\.(?:entries|keys|values)\s*\(/u, "raw Map/Set iteration"],
		[/\[\s*\.\.\./u, "raw spread materialization"],
		[
			/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?\[(?:[A-Za-z_$]|\d)/u,
			"raw indexed collection access",
		],
	];
	return forbidden.flatMap(([pattern, label]) => (pattern.test(audited) ? [label] : []));
};
const functionSource = (sourceText, name) => {
	const declaration = new RegExp(`(?:function\\s+${name}\\b|const\\s+${name}\\s*=)`, "u").exec(
		sourceText,
	);
	if (!declaration) throw new Error(`Missing preprocessing audit owner ${name}`);
	const start = sourceText.indexOf("{", declaration.index);
	let depth = 0;
	for (let index = start; index < sourceText.length; index += 1) {
		if (sourceText[index] === "{") depth += 1;
		else if (sourceText[index] === "}") {
			depth -= 1;
			if (depth === 0) return sourceText.slice(declaration.index, index + 1);
		}
	}
	throw new Error(`Unclosed preprocessing audit owner ${name}`);
};
const bracedSource = (sourceText, declarationIndex, label) => {
	const start = sourceText.indexOf("{", declarationIndex);
	let depth = 0;
	for (let index = start; index < sourceText.length; index += 1) {
		if (sourceText[index] === "{") depth += 1;
		else if (sourceText[index] === "}") {
			depth -= 1;
			if (depth === 0) return sourceText.slice(declarationIndex, index + 1);
		}
	}
	throw new Error(`Unclosed preprocessing audit owner ${label}`);
};
const classSource = (sourceText, name) => {
	const declaration = new RegExp(`class\\s+${name}\\b`, "u").exec(sourceText);
	if (!declaration) throw new Error(`Missing preprocessing audit class ${name}`);
	return bracedSource(sourceText, declaration.index, name);
};
const methodSource = (sourceText, name) => {
	const declaration = new RegExp(`(?:private\\s+)?${name}\\s*\\(`, "u").exec(sourceText);
	if (!declaration) throw new Error(`Missing preprocessing audit method ${name}`);
	return bracedSource(sourceText, declaration.index, name);
};
for (const [fixtureLabel, fixtureText] of [
	["Map construction", "new Map()"],
	["Set construction", "new Set()"],
	["array construction", "Array.from(values)"],
	["filter", "values.filter(Boolean)"],
	["map", "values.map(String)"],
	["flatMap", "values.flatMap(String)"],
	["ordering", "values.toSorted()"],
	["push", "values.push(value)"],
	["splice", "values.splice(0, 1)"],
	["Map/Set lookup", "values.get(key)"],
	["Map/Set iteration", "values.entries()"],
	["spread", "[...values]"],
	["indexed read", "values[index]"],
])
	check(
		`preprocessing source audit rejects ${fixtureLabel}`,
		preprocessingSourceViolations(fixtureText).length === 1,
	);
const budgetedSourceOwners = {
	"src/runtime/board-inspection/lib/model.ts": [
		"collected",
		"filteredValues",
		"budgetedGroupIds",
		"buildLabelClassifications",
		"buildNodes",
		"assignNodeHierarchy",
		"buildConnectorEndpoints",
		"findContainerOnlyIds",
		"buildObstacles",
		"buildInspectionModel",
	],
	"src/runtime/board-inspection/lib/interval-sweep.ts": [
		"stableSorted",
		"buildSweepHierarchy",
		"identityIntersection",
		"includesIdentity",
		"mergedRanges",
		"heapPush",
		"heapPop",
		"indexRefDelta",
		"activateList",
		"retireEmptyList",
		"remove",
		"bucketFor",
		"canonicalProfile",
		"hierarchyEventExcludesAll",
		"hierarchyCandidates",
		"sweepIntervalPairs",
	],
	"src/runtime/board-inspection/lib/detectors.ts": ["partitioned", "pairSweep"],
};
for (const [relativePath, owners] of Object.entries(budgetedSourceOwners)) {
	const sourceText = fs.readFileSync(path.join(root, relativePath), "utf8");
	for (const owner of owners) {
		const violations = preprocessingSourceViolations(functionSource(sourceText, owner));
		check(
			`preprocessing owner ${owner} uses only charged collection operations`,
			violations.length === 0,
			violations.join(", "),
		);
	}
}
const intervalSweepSource = fs.readFileSync(
	path.join(root, "src/runtime/board-inspection/lib/interval-sweep.ts"),
	"utf8",
);
for (const { className, methods } of [
	{
		className: "ExactCompatibilityIndex",
		methods: ["constructor", "reducedCoverage", "intersectCoverage", "updateRank", "query"],
	},
	{ className: "RangeCount", methods: ["constructor", "adjust", "range", "positive"] },
	{ className: "RangeMaximum", methods: ["constructor", "adjust", "max"] },
]) {
	const owner = classSource(intervalSweepSource, className);
	for (const method of methods) {
		const violations = preprocessingSourceViolations(methodSource(owner, method));
		check(
			`preprocessing owner ${className}.${method} uses only charged collection operations`,
			violations.length === 0,
			violations.join(", "),
		);
	}
}

const frozen = Object.freeze([]);
const clean = inspectBoard(frozen);
check("empty board is clean", clean.clean && clean.coverage === "complete");
check(
	"schema-v1 publishes the separate preprocessing ceiling",
	BROAD_PHASE_PREPROCESSING_LIMIT === 25_000_000 &&
		clean.limits.broadPhasePreprocessingSteps === 25_000_000,
);
check("report parses through the public schema", InspectionReportSchema.safeParse(clean).success);
check(
	"schema-v1 report omits private preprocessing mechanics",
	!("preprocessingWork" in clean) &&
		!InspectionReportSchema.safeParse({ ...clean, preprocessingWork: {} }).success,
);
check(
	"repeated inspection is byte deterministic",
	JSON.stringify(clean) === JSON.stringify(inspectBoard(frozen)),
);
check(
	"development diagnostics run the exact production report pipeline",
	JSON.stringify(inspectBoardDiagnostics(frozen).report) === JSON.stringify(clean),
);
for (const [label, input, ordered, preprocessingSteps] of [
	["empty", [], [], 1],
	["singleton", ["a"], ["a"], 3],
	["even tail", ["b", "a"], ["a", "b"], 16],
	["odd uneven tails", ["c", "a", "b"], ["a", "b", "c"], 35],
	["even merge levels", ["d", "b", "a", "c"], ["a", "b", "c", "d"], 50],
	["control prefixes", ["a\\,", "a,", "a\\", "a\0"], ["a\0", "a,", "a\\", "a\\,"], 60],
]) {
	const diagnosed = diagnoseStablePreprocessingSort(input);
	check(
		`counted stable ordering owns ${String(label)} storage and comparison work`,
		JSON.stringify(diagnosed.ordered) === JSON.stringify(ordered) &&
			diagnosed.preprocessingSteps === preprocessingSteps &&
			diagnosed.preprocessingSteps ===
				diagnosed.storageAndStableComparisonSteps + diagnosed.identityCodeUnitSteps,
		JSON.stringify(diagnosed),
	);
}
const primitiveArithmetic = diagnosePreprocessingPrimitives();
check(
	"preprocessing primitive owners charge every small collection operation exactly",
	JSON.stringify(primitiveArithmetic) ===
		JSON.stringify({
			arrayAllocation: 1,
			arrayRead: 1,
			arrayWrite: 1,
			arrayPush: 1,
			arraySplice: 6,
			arrayCopy: 5,
			mapConstruct: 1,
			mapMisses: 2,
			mapMutation: 2,
			mapEntries: 7,
			mapIteration: 4,
			setConstruct: 1,
			setMiss: 1,
			setMutation: 2,
			setValues: 7,
			setIteration: 4,
		}),
	JSON.stringify(primitiveArithmetic),
);
for (const [label, input, id, preprocessingSteps] of [
	["empty", [], "obstacle:", 9],
	["single", ["a"], "obstacle:a", 12],
	["join", ["a", "b"], "obstacle:a,b", 16],
	["comma and slash", ["a,b", "c\\d"], "obstacle:a\\,b,c\\\\d", 26],
	[
		"controls",
		["\0", ",", "\\", "x\\,y"],
		["obstacle:\0,", "\\,,", "\\".repeat(2), ",x", "\\".repeat(3), ",y"].join(""),
		34,
	],
]) {
	const diagnosed = diagnoseObstacleIdentityEncoding(input);
	check(
		`counted obstacle identity owns ${String(label)} reads and emitted code units`,
		diagnosed.id === id && diagnosed.preprocessingSteps === preprocessingSteps,
		JSON.stringify(diagnosed),
	);
}
const mutableProfileSnapshots = diagnoseMutableProfileSnapshots();
check(
	"mutable ReadonlySet reuse snapshots exact content without stale eligibility",
	mutableProfileSnapshots.excludedPairCount === 0 &&
		mutableProfileSnapshots.includedPairCount === 1 &&
		mutableProfileSnapshots.restoredPairCount === 0 &&
		JSON.stringify(mutableProfileSnapshots.profileSnapshotEntries) === JSON.stringify([1, 0, 1]),
	JSON.stringify(mutableProfileSnapshots),
);
const malformed = Object.freeze([
	Object.freeze({ type: "arrow", x: 0, y: 0, width: null, height: 0, points: null }),
]);
const malformedBytes = JSON.stringify(malformed);
const malformedReport = inspectBoard(malformed);
check(
	"malformed record is not clean",
	!malformedReport.clean && malformedReport.coverage === "indeterminate",
);
check("inspection does not mutate frozen raw input", JSON.stringify(malformed) === malformedBytes);

for (const type of ["rectangle", "ellipse", "diamond"]) {
	const decoration = inspectBoard([
		{ id: `decoration-${type}`, type, x: 0, y: 0, width: 20, height: 20, angle: 0.5 },
	]);
	check(
		`plain rotated ${type} remains known decoration`,
		decoration.clean &&
			!decoration.findings.some(
				(finding) => finding.code === "UNSUPPORTED_GEOMETRY" && finding.reason === "rotation",
			),
	);
}
check(
	"invalid identity remains null and source-indexed",
	malformedReport.findings.some(
		(finding) =>
			finding.code === "BROKEN_REFERENCE" &&
			finding.reason === "invalid-element-identity" &&
			finding.elements[0]?.id === null &&
			finding.elements[0]?.sourceIndex === 0,
	),
);
for (const finding of malformedReport.findings)
	if (finding.affectedBBox)
		check(
			"focus box expands by 16px",
			finding.focusBBox?.x === finding.affectedBBox.x - 16 &&
				finding.focusBBox?.y === finding.affectedBBox.y - 16 &&
				finding.focusBBox.width === finding.affectedBBox.width + 32 &&
				finding.focusBBox.height === finding.affectedBBox.height + 32,
		);

for (const [label, x, y, width, failedDelta] of [
	["positive extreme", Number.MAX_VALUE, 0, 0, "x-minus-16"],
	["negative extreme", -Number.MAX_VALUE, 0, 0, "x-minus-16"],
	["huge width", 0, 0, Number.MAX_VALUE, "width-plus-32"],
]) {
	const report = inspectBoard([
		{
			id: `focus-${String(label)}`,
			type: "text",
			x,
			y,
			width,
			height: 0,
			fontFamily: 1,
			text: "focus",
		},
	]);
	const font = report.findings.find((finding) => finding.code === "FONT_POLICY_VIOLATION");
	const padding = report.findings.find(
		(finding) =>
			finding.code === "AMBIGUOUS_GEOMETRY" && finding.reason === "unrepresentable-focus-padding",
	);
	check(
		`${String(label)} keeps affected evidence and closes unrepresentable focus padding`,
		font?.affectedBBox !== null &&
			font?.focusBBox === null &&
			padding?.affectedBBox !== null &&
			padding?.focusBBox === null &&
			padding?.details.failedDeltas.includes(failedDelta) &&
			report.coverage === "indeterminate" &&
			InspectionReportSchema.safeParse(report).success,
	);
}
const ordinaryFocus = inspectBoard([
	{ id: "focus-normal", type: "text", x: 10, y: 20, width: 30, height: 40, fontFamily: 1 },
]).findings.find((finding) => finding.code === "FONT_POLICY_VIOLATION");
check(
	"ordinary focus padding retains exact 16px deltas",
	ordinaryFocus?.affectedBBox?.x === 10 &&
		ordinaryFocus.focusBBox?.x === -6 &&
		ordinaryFocus.focusBBox?.y === 4 &&
		ordinaryFocus.focusBBox?.width === 62 &&
		ordinaryFocus.focusBBox?.height === 72,
);

const renderPrerequisiteCases = [
	["finite", { x: 1, y: 2, width: 3, height: 4 }],
	["missing", {}],
	["nonfinite", { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: 3, height: 4 }],
	["negative", { x: -10, y: -20, width: -3, height: -4 }],
	["zero", { x: 0, y: 0, width: 0, height: 0 }],
	["extreme", { x: Number.MAX_VALUE, y: -Number.MAX_VALUE, width: 0, height: 0 }],
	["derived-overflow", { x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 1 }],
];
for (const [label, fields] of renderPrerequisiteCases) {
	const raw = { id: `render-${String(label)}`, type: "rectangle", ...fields };
	const strictFields = collectInvalidRenderGeometry([raw])[0]?.fields ?? [];
	const report = inspectBoard([raw]);
	const inspectionFields =
		report.findings.find((finding) => finding.code === "INVALID_RENDER_GEOMETRY")?.details
			.invalidFields ?? [];
	check(
		`strict ingest and inspection share ${String(label)} per-record render prerequisites`,
		JSON.stringify(inspectionFields) === JSON.stringify(strictFields),
		`${JSON.stringify(inspectionFields)} != ${JSON.stringify(strictFields)}`,
	);
	if (label === "derived-overflow")
		check(
			"derived extent overflow is inspection-only aggregate evidence",
			strictFields.length === 0 &&
				report.findings.some(
					(finding) =>
						finding.reason === "unrepresentable-coordinate-span" &&
						finding.details.scope === "record-extent",
				),
		);
}

const findingCases = [
	[
		"INVALID_RENDER_GEOMETRY",
		"invalid-render-fields",
		"error",
		true,
		{ invalidFields: ["width"], valueKinds: { width: "null" } },
	],
	[
		"INVALID_RENDER_GEOMETRY",
		"unlocatable-record",
		"error",
		true,
		{ recordKind: "object", invalidFields: ["x"], sourceIndex: 0 },
	],
	...["width", "height", "width-and-height"].map((reason) => [
		"STALE_LINEAR_DIMENSIONS",
		reason,
		"error",
		false,
		{
			storedWidth: 10,
			storedHeight: 10,
			measuredWidth: 11,
			measuredHeight: 11,
			widthDelta: 1,
			heightDelta: 1,
		},
	]),
	[
		"BROKEN_REFERENCE",
		"invalid-element-identity",
		"error",
		true,
		{
			identityIssue: "missing-id",
			rawIdType: "missing",
			rawIdDescription: "missing",
			sourceIndex: 0,
			intendedRoles: ["connector"],
			availableElementType: "arrow",
		},
	],
	[
		"BROKEN_REFERENCE",
		"duplicate-element-id",
		"error",
		true,
		{ duplicateId: "dup", sourceIndexes: [0, 1] },
	],
	[
		"BROKEN_REFERENCE",
		"missing-binding-target",
		"error",
		true,
		{ connectorId: "edge", end: "start", targetId: "gone" },
	],
	[
		"BROKEN_REFERENCE",
		"invalid-binding-target-type",
		"error",
		true,
		{ connectorId: "edge", end: "start", targetId: "other", targetType: "arrow" },
	],
	[
		"BROKEN_REFERENCE",
		"missing-binding-reciprocal",
		"error",
		false,
		{ connectorId: "edge", end: "start", targetId: "node" },
	],
	...["malformed-start-binding", "malformed-end-binding"].map((reason) => [
		"BROKEN_REFERENCE",
		reason,
		"error",
		true,
		{
			connectorId: "edge",
			sourceIndex: 0,
			rawKind: "object",
			issue: "missing-element-id",
			readableTargetId: null,
			classificationBlocked: true,
		},
	]),
	[
		"BROKEN_REFERENCE",
		"malformed-bound-elements",
		"error",
		true,
		{
			ownerId: "node",
			sourceIndex: 0,
			rawKind: "array",
			entryIndex: 0,
			issue: "entry-not-object",
			readableEntries: [],
			classificationBlocked: true,
		},
	],
	[
		"BROKEN_REFERENCE",
		"malformed-container-id",
		"error",
		true,
		{
			textId: "label",
			sourceIndex: 0,
			rawKind: "string",
			rawDescription: '""',
			issue: "empty-container-id",
			ownerClassificationBlocked: true,
		},
	],
	...["dangling-bound-text", "dangling-bound-arrow"].map((reason) => [
		"BROKEN_REFERENCE",
		reason,
		"error",
		false,
		{ ownerId: "node", targetId: "gone" },
	]),
	[
		"BROKEN_REFERENCE",
		"bound-element-target-type-mismatch",
		"error",
		true,
		{ ownerId: "node", targetId: "label", declaredType: "text", actualType: "rectangle" },
	],
	[
		"BROKEN_REFERENCE",
		"conflicting-bound-label-owner",
		"error",
		true,
		{ textId: "label", forwardContainerId: "a", reverseContainerIds: ["a", "b"] },
	],
	[
		"BROKEN_REFERENCE",
		"persisted-agent-endpoint",
		"error",
		true,
		{ connectorId: "edge", end: "start", inputTargetId: "node", bindingTargetId: null },
	],
	[
		"BROKEN_REFERENCE",
		"invalid-node-metadata",
		"error",
		true,
		{ elementId: "node", valueKind: "number" },
	],
	[
		"BROKEN_REFERENCE",
		"invalid-code-binding",
		"error",
		false,
		{ elementId: "node", issues: ["path must be a nonempty string"] },
	],
	[
		"BROKEN_REFERENCE",
		"derived-link-persisted",
		"error",
		false,
		{ elementId: "node", link: "file:///tmp/node.ts" },
	],
	[
		"BROKEN_REFERENCE",
		"invalid-library-attribution",
		"error",
		true,
		{
			elementId: "body",
			issues: ["itemId or item must be a nonempty string"],
			rescuedByGroup: false,
		},
	],
	["LABEL_CORRUPTION", "orphan", "error", true, { textId: "label", containerId: "gone" }],
	[
		"LABEL_CORRUPTION",
		"duplicate",
		"error",
		false,
		{ containerId: "node", keeperId: "a", duplicateIds: ["b"] },
	],
	[
		"LABEL_CORRUPTION",
		"missing-reciprocal",
		"error",
		false,
		{ textId: "label", containerId: "node", missingSide: "container" },
	],
	[
		"LABEL_CORRUPTION",
		"conflicting-owner",
		"error",
		true,
		{ textId: "label", containerId: "a", otherContainerIds: ["b"] },
	],
	[
		"LABEL_CORRUPTION",
		"drift",
		"error",
		false,
		{ textId: "label", containerId: "node", distance: 20, allowed: 5 },
	],
	["LABEL_CORRUPTION", "persisted-seed", "error", false, { elementId: "node", seedField: "label" }],
	[
		"FONT_POLICY_VIOLATION",
		"missing-font-family",
		"warning",
		false,
		{ effectiveFamily: 1, allowedFamilies: [5] },
	],
	[
		"FONT_POLICY_VIOLATION",
		"disallowed-font-family",
		"warning",
		false,
		{ rawFamily: 1, effectiveFamily: 1, allowedFamilies: [5] },
	],
	[
		"FONT_POLICY_VIOLATION",
		"invalid-font-family",
		"warning",
		false,
		{ rawType: "string", rawDescription: '"5"', allowedFamilies: [5] },
	],
	["UNSUPPORTED_GEOMETRY", "unsupported-type", "warning", true, { rawType: '"selection"' }],
	["UNSUPPORTED_GEOMETRY", "rotation", "warning", true, { angle: 1 }],
	["UNSUPPORTED_GEOMETRY", "curve", "warning", true, { curveKind: "bezier" }],
	[
		"UNSUPPORTED_GEOMETRY",
		"rounded-or-elbowed",
		"warning",
		true,
		{ roundness: "object", elbowed: false, fixedSegments: false },
	],
	[
		"AMBIGUOUS_GEOMETRY",
		"points-missing",
		"warning",
		true,
		{
			connectorId: "edge",
			sourceIndex: 0,
			rawPointsKind: "missing",
			rawPointsDescription: "missing",
			pointCount: null,
			minimumRequired: 2,
			issue: "missing",
		},
	],
	[
		"AMBIGUOUS_GEOMETRY",
		"points-not-array",
		"warning",
		true,
		{
			connectorId: "edge",
			sourceIndex: 0,
			rawPointsKind: "null",
			rawPointsDescription: "null",
			pointCount: null,
			minimumRequired: 2,
			issue: "non-array",
		},
	],
	[
		"AMBIGUOUS_GEOMETRY",
		"points-empty",
		"warning",
		true,
		{
			connectorId: "edge",
			sourceIndex: 0,
			rawPointsKind: "array",
			rawPointsDescription: "array",
			pointCount: 0,
			minimumRequired: 2,
			issue: "empty",
		},
	],
	[
		"AMBIGUOUS_GEOMETRY",
		"points-one-point",
		"warning",
		true,
		{
			connectorId: "edge",
			sourceIndex: 0,
			rawPointsKind: "array",
			rawPointsDescription: "array",
			pointCount: 1,
			minimumRequired: 2,
			issue: "insufficient-cardinality",
		},
	],
	[
		"AMBIGUOUS_GEOMETRY",
		"malformed-point",
		"warning",
		true,
		{
			connectorId: "edge",
			sourceIndex: 0,
			pointIndex: 1,
			issue: "point must contain two finite numbers",
		},
	],
	[
		"AMBIGUOUS_GEOMETRY",
		"absolute-point-overflow",
		"warning",
		true,
		{ connectorId: "edge", sourceIndex: 0, pointIndex: 1, issue: "overflow" },
	],
	[
		"AMBIGUOUS_GEOMETRY",
		"unrepresentable-coordinate-span",
		"warning",
		true,
		{
			scope: "semantic-node-body",
			subjectId: "node",
			sourceIndexes: [0, 1],
			issue: "finite-constituents-have-no-finite-union",
		},
	],
	[
		"AMBIGUOUS_GEOMETRY",
		"unrepresentable-focus-padding",
		"warning",
		true,
		{
			padding: 16,
			failedDeltas: ["x-minus-16"],
			issue: "exact-16px-padding-is-not-finite-and-representable",
		},
	],
	[
		"AMBIGUOUS_GEOMETRY",
		"zero-length",
		"warning",
		true,
		{ connectorId: "edge", sourceIndex: 0, segmentIndex: 0 },
	],
	[
		"AMBIGUOUS_GEOMETRY",
		"collinear-overlap",
		"warning",
		true,
		{ firstConnectorId: "a", firstSegmentIndex: 0, secondConnectorId: "b", secondSegmentIndex: 0 },
	],
	[
		"INSPECTION_LIMIT_EXCEEDED",
		"broad-phase-comparison-ceiling",
		"warning",
		true,
		{
			limit: 2000000,
			attempted: 2000001,
			pass: "node-overlap",
			segmentCount: 0,
			nodeCount: 2001,
			obstacleCount: 0,
			labelCount: 0,
		},
	],
	[
		"INSPECTION_LIMIT_EXCEEDED",
		"broad-phase-preprocessing-ceiling",
		"warning",
		true,
		{
			limit: 25_000_000,
			attempted: 25_000_001,
			pass: "connector-node",
			phase: "compatibility-query",
			completedBroadPhaseComparisons: 17,
			segmentCount: 2,
			nodeCount: 3,
			obstacleCount: 1,
			labelCount: 4,
		},
	],
	[
		"CONNECTOR_PENETRATES_NODE",
		"leaf-footprint-interior",
		"error",
		false,
		{
			connectorId: "edge",
			segmentIndex: 0,
			nodeId: "node",
			entry: { x: 0, y: 0 },
			exit: { x: 1, y: 0 },
		},
	],
	[
		"CONNECTOR_PENETRATES_OBSTACLE",
		"obstacle-footprint-interior",
		"error",
		false,
		{
			connectorId: "edge",
			segmentIndex: 0,
			obstacleId: "obstacle:body",
			entry: { x: 0, y: 0 },
			exit: { x: 1, y: 0 },
		},
	],
	[
		"CONNECTOR_INTERSECTION_UNMARKED",
		"proper-interior-crossing",
		"error",
		false,
		{
			firstConnectorId: "a",
			firstSegmentIndex: 0,
			secondConnectorId: "b",
			secondSegmentIndex: 0,
			point: { x: 0, y: 0 },
		},
	],
	[
		"NODE_OVERLAP",
		"leaf-footprint-overlap",
		"error",
		false,
		{ firstNodeId: "a", secondNodeId: "b", overlapWidth: 1, overlapHeight: 1 },
	],
	[
		"LABEL_OVERLAP",
		"label-node-overlap",
		"error",
		false,
		{ labelId: "label", nodeId: "node", overlapWidth: 1, overlapHeight: 1 },
	],
	[
		"LABEL_OVERLAP",
		"label-label-overlap",
		"error",
		false,
		{ firstLabelId: "a", secondLabelId: "b", overlapWidth: 1, overlapHeight: 1 },
	],
];
const schemaFindings = findingCases.map(
	([code, reason, severity, affectsCoverage, details], sourceIndex) => ({
		code,
		reason,
		severity,
		affectsCoverage,
		details,
		message: `${String(code)}/${String(reason)}`,
		elements: [{ id: `e${sourceIndex}`, type: "rectangle", sourceIndex }],
		nodes: [],
		obstacles: [],
		points: [],
		affectedBBox: { x: 0, y: 0, width: 0, height: 0 },
		focusBBox: { x: -16, y: -16, width: 32, height: 32 },
	}),
);
for (const finding of schemaFindings) {
	check(
		`schema accepts ${String(finding.code)}/${String(finding.reason)}`,
		InspectionFindingSchema.safeParse(finding).success,
	);
	check(
		`schema fixes severity for ${String(finding.code)}/${String(finding.reason)}`,
		!InspectionFindingSchema.safeParse({
			...finding,
			severity: finding.severity === "error" ? "warning" : "error",
		}).success,
	);
	check(
		`schema fixes coverage for ${String(finding.code)}/${String(finding.reason)}`,
		!InspectionFindingSchema.safeParse({ ...finding, affectsCoverage: !finding.affectsCoverage })
			.success,
	);
}
check(
	"schema rejects an unknown code/reason combination",
	!InspectionFindingSchema.safeParse({ ...schemaFindings[0], reason: "unknown" }).success,
);
const preprocessingSchemaFinding = schemaFindings.find(
	(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
);
check(
	"preprocessing limit schema closes pass, phase, limit, and attempted values",
	!!preprocessingSchemaFinding &&
		!InspectionFindingSchema.safeParse({
			...preprocessingSchemaFinding,
			details: { ...preprocessingSchemaFinding.details, pass: "unknown-pass" },
		}).success &&
		!InspectionFindingSchema.safeParse({
			...preprocessingSchemaFinding,
			details: { ...preprocessingSchemaFinding.details, phase: "unknown-phase" },
		}).success &&
		!InspectionFindingSchema.safeParse({
			...preprocessingSchemaFinding,
			details: { ...preprocessingSchemaFinding.details, attempted: 25_000_002 },
		}).success,
);
const formatterMatrix = formatInspectionText({
	board: "schema-matrix",
	schemaVersion: 1,
	success: true,
	policy: clean.policy,
	limits: clean.limits,
	totalElementCount: 0,
	liveElementCount: 0,
	locatableElementCount: 0,
	broadPhaseComparisons: 0,
	coverage: "indeterminate",
	clean: false,
	maxSeverity: "error",
	counts: clean.counts,
	coverageReasons: [],
	findings: schemaFindings.map((finding) => InspectionFindingSchema.parse(finding)),
});
check(
	"formatter visits every closed code/reason",
	findingCases.every(([code, reason]) =>
		formatterMatrix.includes(`${String(code)}/${String(reason)}`),
	),
);

const semanticNode = (id, overrides = {}) => ({
	id,
	type: "rectangle",
	x: 0,
	y: 0,
	width: 10,
	height: 10,
	angle: 0,
	customData: { archboard: { node: id } },
	...overrides,
});
const penetrating = (depth) =>
	inspectBoard(
		[
			semanticNode("node"),
			{
				id: "edge",
				type: "arrow",
				x: -1,
				y: 5,
				width: 1 + depth,
				height: 0,
				angle: 0,
				points: [
					[0, 0],
					[1 + depth, 0],
				],
			},
		],
		{ overlapTolerance: 0.5 },
	).findings.some((finding) => finding.code === "CONNECTOR_PENETRATES_NODE");
check("penetration exactly at tolerance is excluded", !penetrating(0.5));
check("penetration just inside tolerance is detected", penetrating(0.501));
check("penetration just outside tolerance is excluded", !penetrating(0.499));

for (const malformedAngle of ["bad", null, false]) {
	const report = inspectBoard([semanticNode("node", { angle: malformedAngle })]);
	check(
		`malformed node angle ${JSON.stringify(malformedAngle)} blocks coverage`,
		report.coverage === "indeterminate" &&
			report.findings.some(
				(finding) => finding.code === "UNSUPPORTED_GEOMETRY" && finding.reason === "rotation",
			),
	);
}
const invalidLibrary = (id, groupIds = [], extra = {}) => ({
	id,
	type: "rectangle",
	x: 0,
	y: 0,
	width: 10,
	height: 10,
	angle: 0,
	groupIds,
	customData: { library: {} },
	...extra,
});
const libraryFinding = (elements) =>
	inspectBoard(elements).findings.find(
		(finding) =>
			finding.code === "BROKEN_REFERENCE" && finding.reason === "invalid-library-attribution",
	);
const singletonLibrary = libraryFinding([invalidLibrary("body", ["g"])]);
check(
	"singleton group does not rescue invalid library attribution",
	singletonLibrary?.affectsCoverage === true && singletonLibrary.details.rescuedByGroup === false,
);
const sharedLibrary = libraryFinding([
	invalidLibrary("body", ["g"]),
	{ ...invalidLibrary("peer", ["g"]), customData: undefined, x: 20 },
]);
check(
	"qualifying shared body group rescues invalid library attribution",
	sharedLibrary?.affectsCoverage === false && sharedLibrary.details.rescuedByGroup === true,
);
const decorationLibrary = libraryFinding([
	invalidLibrary("body", ["g"]),
	{
		id: "decoration",
		type: "text",
		x: 20,
		y: 0,
		width: 10,
		height: 10,
		angle: 0,
		groupIds: ["g"],
		fontFamily: 5,
		text: "note",
	},
]);
check(
	"decoration group does not rescue invalid library attribution",
	decorationLibrary?.affectsCoverage === true && decorationLibrary.details.rescuedByGroup === false,
);

const ordered = inspectBoard([
	{
		type: "arrow",
		x: 0,
		y: 0,
		width: 10,
		height: 0,
		points: [
			[0, 0],
			[10, 0],
		],
	},
	{ id: "dup", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
	{ id: "dup", type: "rectangle", x: 20, y: 0, width: 10, height: 10 },
]);
check(
	"broken-reference findings use declared reason order",
	ordered.findings
		.filter((finding) => finding.code === "BROKEN_REFERENCE")
		.slice(0, 2)
		.map((finding) => finding.reason)
		.join(",") === "invalid-element-identity,duplicate-element-id",
);
const rotatedNegativePath = inspectBoard([
	{
		id: "rotated",
		type: "arrow",
		x: 100,
		y: 100,
		width: 20,
		height: 10,
		angle: 1,
		points: [
			[0, 0],
			[-20, -10],
		],
	},
]).findings.find(
	(finding) => finding.code === "UNSUPPORTED_GEOMETRY" && finding.reason === "rotation",
);
check(
	"unsupported connector exposes decoded negative-relative path extent",
	JSON.stringify(rotatedNegativePath?.points) ===
		JSON.stringify([
			{ x: 80, y: 90 },
			{ x: 100, y: 100 },
		]) &&
		JSON.stringify(rotatedNegativePath?.affectedBBox) ===
			JSON.stringify({ x: 80, y: 90, width: 20, height: 10 }),
);
if (rotatedNegativePath) {
	check(
		"finding schema rejects an impossible severity",
		!InspectionFindingSchema.safeParse({ ...rotatedNegativePath, severity: "error" }).success,
	);
	check(
		"finding schema rejects an impossible coverage flag",
		!InspectionFindingSchema.safeParse({ ...rotatedNegativePath, affectsCoverage: false }).success,
	);
}

const identityRoleCases = [
	[
		"connector",
		{
			type: "arrow",
			x: 0,
			y: 0,
			width: 10,
			height: 0,
			points: [
				[0, 0],
				[10, 0],
			],
		},
	],
	[
		"semantic-node-member",
		{
			type: "rectangle",
			x: 0,
			y: 0,
			width: 10,
			height: 10,
			customData: { archboard: { node: "node" } },
		},
	],
	[
		"valid-library-body",
		{
			type: "rectangle",
			x: 0,
			y: 0,
			width: 10,
			height: 10,
			customData: { library: { itemId: "item" } },
		},
	],
	[
		"qualifying-group-body",
		{ type: "rectangle", x: 0, y: 0, width: 10, height: 10, groupIds: ["group"] },
	],
	[
		"bound-label",
		{
			type: "text",
			x: 0,
			y: 0,
			width: 10,
			height: 10,
			fontFamily: 5,
			containerId: "node",
			text: "label",
		},
	],
	["label-container", { type: "rectangle", x: 0, y: 0, width: 10, height: 10, boundElements: [] }],
	["closed-boundary", { type: "frame", x: 0, y: 0, width: 10, height: 10 }],
	[
		"font-policy-text",
		{ type: "text", x: 0, y: 0, width: 10, height: 10, fontFamily: 5, text: "label" },
	],
	["node-overlap-body", { type: "ellipse", x: 0, y: 0, width: 10, height: 10 }],
	[
		"label-overlap-body",
		{ type: "text", x: 0, y: 0, width: 10, height: 10, fontFamily: 5, text: "label" },
	],
];
for (const [role, base] of identityRoleCases)
	for (const [identity, rawId] of [
		["missing", undefined],
		["empty", ""],
		["non-string", 42],
	]) {
		const element = { ...base };
		if (identity !== "missing") element.id = rawId;
		const report = inspectBoard([element]);
		const finding = report.findings.find(
			(candidate) =>
				candidate.code === "BROKEN_REFERENCE" && candidate.reason === "invalid-element-identity",
		);
		check(
			`${String(identity)} identity closes ${String(role)}`,
			finding?.elements[0]?.id === null &&
				finding.elements[0].sourceIndex === 0 &&
				finding.details.intendedRoles.includes(role) &&
				report.coverage === "indeterminate",
		);
	}

const connector = (overrides = {}) => ({
	id: "edge",
	type: "arrow",
	x: 10,
	y: 20,
	width: 30,
	height: 40,
	angle: 0,
	...overrides,
});
const pathCases = [
	["absent", {}, "points-missing", []],
	["undefined", { points: undefined }, "points-missing", []],
	["null", { points: null }, "points-not-array", []],
	["object", { points: {} }, "points-not-array", []],
	["string", { points: "bad" }, "points-not-array", []],
	["empty", { points: [] }, "points-empty", []],
	["one-valid", { points: [[-2, -3]] }, "points-one-point", [{ x: 8, y: 17 }]],
	["one-malformed", { points: [[0]] }, "malformed-point", []],
	[
		"longer-malformed",
		{
			points: [
				[0, 0],
				[-5, -6],
				["bad", 1],
			],
		},
		"malformed-point",
		[
			{ x: 5, y: 14 },
			{ x: 10, y: 20 },
		],
	],
	[
		"duplicate-consecutive",
		{
			points: [
				[0, 0],
				[0, 0],
				[10, 0],
			],
		},
		"zero-length",
		[{ x: 10, y: 20 }],
	],
];
for (const [label, overrides, reason, expectedPoints] of pathCases) {
	const report = inspectBoard([connector(overrides)]);
	const finding = report.findings.find(
		(candidate) => candidate.code === "AMBIGUOUS_GEOMETRY" && candidate.reason === reason,
	);
	check(
		`path ${String(label)} is closed and source-indexed`,
		finding?.elements[0]?.sourceIndex === 0 &&
			finding.affectsCoverage === true &&
			report.coverage === "indeterminate" &&
			JSON.stringify(finding.points) === JSON.stringify(expectedPoints),
	);
}
const locatableWithoutSize = inspectBoard([
	{ id: "edge", type: "arrow", x: 10, y: 20, width: null, height: 0 },
]);
check(
	"locatable malformed path keeps a zero-area source extent",
	locatableWithoutSize.findings.every(
		(finding) =>
			finding.affectedBBox !== null &&
			finding.affectedBBox.x === 10 &&
			finding.affectedBBox.y === 20,
	),
);
const unlocatableUnsupported = inspectBoard([
	{
		id: "edge",
		type: "arrow",
		x: null,
		y: 20,
		width: 10,
		height: 0,
		angle: 1,
		points: [
			[0, 0],
			[10, 0],
		],
	},
]);
check(
	"unlocatable unsupported path does not invent absolute points or boxes",
	unlocatableUnsupported.findings.every(
		(finding) => finding.affectedBBox === null && finding.focusBBox === null,
	) &&
		unlocatableUnsupported.findings
			.filter((finding) => finding.code === "UNSUPPORTED_GEOMETRY")
			.every((finding) => finding.points.length === 0),
);

for (const [identity, rawId] of [
	["missing", undefined],
	["empty", ""],
	["non-string", 42],
])
	for (const [coordinate, value] of [
		["NaN", Number.NaN],
		["positive infinity", Number.POSITIVE_INFINITY],
		["negative infinity", Number.NEGATIVE_INFINITY],
	])
		for (const axis of ["x", "y"]) {
			const element = {
				type: "arrow",
				x: axis === "x" ? value : 5,
				y: axis === "y" ? value : 5,
				width: 10,
				height: 0,
				angle: 0,
				points: [
					[0, 0],
					[10, 0],
				],
			};
			if (identity !== "missing") element.id = rawId;
			let report;
			let failure;
			try {
				report = inspectBoard([element]);
			} catch (error) {
				failure = error;
			}
			check(
				`${identity} identity with ${coordinate} ${axis} origin stays schema-total and unlocatable`,
				!failure &&
					InspectionReportSchema.safeParse(report).success &&
					report.coverage === "indeterminate" &&
					report.findings.every(
						(finding) => finding.affectedBBox === null && finding.focusBBox === null,
					),
				failure instanceof Error ? failure.message : "",
			);
		}

const overflowPath = inspectBoard([
	connector({
		id: "overflow-path",
		x: Number.MAX_VALUE,
		y: 0,
		width: 10,
		height: 0,
		points: [
			[0, 0],
			[Number.MAX_VALUE, 0],
		],
	}),
]);
check(
	"finite path operands that overflow absolute coordinates stay schema-total",
	InspectionReportSchema.safeParse(overflowPath).success &&
		overflowPath.coverage === "indeterminate" &&
		overflowPath.findings.some(
			(finding) =>
				finding.code === "AMBIGUOUS_GEOMETRY" &&
				finding.reason === "absolute-point-overflow" &&
				finding.points.every(
					(pathPoint) => Number.isFinite(pathPoint.x) && Number.isFinite(pathPoint.y),
				),
		),
);
check(
	"extreme point evidence keeps its box and closes focus padding",
	overflowPath.findings.some(
		(finding) =>
			finding.reason === "absolute-point-overflow" &&
			finding.affectedBBox?.x === Number.MAX_VALUE &&
			finding.focusBBox === null,
	) &&
		overflowPath.findings.some(
			(finding) =>
				finding.reason === "unrepresentable-focus-padding" &&
				finding.elements.some((element) => element.id === "overflow-path"),
		),
);

const unrepresentableSemanticNode = inspectBoard([
	semanticNode("aggregate-node", {
		id: "aggregate-positive",
		x: Number.MAX_VALUE,
		y: 0,
		width: 0,
		height: 10,
	}),
	semanticNode("aggregate-node", {
		id: "aggregate-negative",
		x: -Number.MAX_VALUE,
		y: 0,
		width: 0,
		height: 10,
	}),
]);
check(
	"a semantic node with an unrepresentable finite span is explicit and schema-total",
	unrepresentableSemanticNode.coverage === "indeterminate" &&
		unrepresentableSemanticNode.findings.some(
			(finding) =>
				finding.code === "AMBIGUOUS_GEOMETRY" &&
				finding.reason === "unrepresentable-coordinate-span" &&
				finding.details.scope === "semantic-node-body" &&
				finding.affectedBBox !== null,
		),
);
check(
	"an aggregate representative keeps affected evidence when its focus padding is unrepresentable",
	unrepresentableSemanticNode.findings.some(
		(finding) =>
			finding.reason === "unrepresentable-coordinate-span" &&
			finding.affectedBBox !== null &&
			finding.focusBBox === null,
	) &&
		unrepresentableSemanticNode.findings.some(
			(finding) => finding.reason === "unrepresentable-focus-padding",
		),
);

for (const [kind, firstExtra] of [
	["grouped", { groupIds: ["aggregate-group"] }],
	[
		"library",
		{
			groupIds: ["aggregate-library-group"],
			customData: { library: { itemId: "aggregate-library" } },
		},
	],
]) {
	const first = {
		id: `${String(kind)}-positive`,
		type: "rectangle",
		x: Number.MAX_VALUE,
		y: 0,
		width: 1,
		height: 10,
		...firstExtra,
	};
	const second = {
		id: `${String(kind)}-negative`,
		type: "rectangle",
		x: -Number.MAX_VALUE,
		y: 0,
		width: 1,
		height: 10,
		groupIds: first.groupIds,
	};
	const report = inspectBoard([first, second]);
	check(
		`${String(kind)} obstacle aggregate overflow is explicit and excludes the obstacle`,
		report.coverage === "indeterminate" &&
			report.findings.some(
				(finding) =>
					finding.reason === "unrepresentable-coordinate-span" &&
					finding.details.scope === "obstacle-component" &&
					finding.affectedBBox !== null,
			) &&
			!report.findings.some((finding) => finding.code === "CONNECTOR_PENETRATES_OBSTACLE"),
	);
}

const duplicateAffectedOverflow = inspectBoard([
	semanticNode("duplicate-positive", { id: "aggregate-duplicate", x: Number.MAX_VALUE, width: 0 }),
	semanticNode("duplicate-negative", { id: "aggregate-duplicate", x: -Number.MAX_VALUE, width: 0 }),
]);
check(
	"duplicate-id affected unions retain a finite local box and explicit span failure",
	duplicateAffectedOverflow.findings.some(
		(finding) => finding.reason === "duplicate-element-id" && finding.affectedBBox !== null,
	) &&
		duplicateAffectedOverflow.findings.some(
			(finding) =>
				finding.reason === "unrepresentable-coordinate-span" &&
				finding.details.scope === "finding-affected-union" &&
				finding.elements.length === 2,
		),
);

const overflowAdjacentFindings = inspectBoard([
	{
		id: "overflow-adjacent",
		type: "text",
		x: Number.MAX_VALUE,
		y: 25,
		width: Number.MAX_VALUE,
		height: 10,
		fontFamily: 1,
		containerId: false,
		customData: {
			archboard: { node: false, binding: { path: "/absolute" } },
			library: {},
		},
		boundElements: false,
	},
]);
for (const reason of [
	"disallowed-font-family",
	"malformed-container-id",
	"malformed-bound-elements",
	"invalid-node-metadata",
	"invalid-code-binding",
	"invalid-library-attribution",
])
	check(
		`derived extent overflow retains local evidence for ${reason}`,
		overflowAdjacentFindings.findings.some(
			(finding) =>
				finding.reason === reason &&
				finding.affectedBBox?.x === Number.MAX_VALUE &&
				finding.affectedBBox.y === 25,
		),
	);
const overflowEvidenceRoles = [
	{
		label: "invalid identity",
		reason: "invalid-element-identity",
		records: [
			{
				type: "text",
				x: Number.MAX_VALUE,
				y: 40,
				width: Number.MAX_VALUE,
				height: 10,
				fontFamily: 5,
			},
		],
	},
	{
		label: "duplicate identity",
		reason: "duplicate-element-id",
		records: [
			semanticNode("dup-overflow", {
				id: "dup-overflow",
				x: Number.MAX_VALUE,
				y: 50,
				width: Number.MAX_VALUE,
			}),
			semanticNode("dup-local", { id: "dup-overflow", x: 0, y: 50 }),
		],
	},
	{
		label: "connector binding",
		reason: "malformed-start-binding",
		records: [
			connector({
				id: "bind-overflow",
				x: Number.MAX_VALUE,
				y: 60,
				width: Number.MAX_VALUE,
				startBinding: false,
			}),
		],
	},
	{
		label: "unsupported geometry",
		reason: "rotation",
		records: [
			{
				id: "unsupported-overflow",
				type: "rectangle",
				x: Number.MAX_VALUE,
				y: 70,
				width: Number.MAX_VALUE,
				height: 10,
				angle: 1,
				customData: { archboard: { node: "unsupported-overflow" } },
			},
		],
	},
	{
		label: "persisted label seed",
		reason: "persisted-seed",
		records: [
			{
				id: "seed-overflow",
				type: "rectangle",
				x: Number.MAX_VALUE,
				y: 80,
				width: Number.MAX_VALUE,
				height: 10,
				label: { text: "seed" },
			},
		],
	},
];
for (const { label, reason, records } of overflowEvidenceRoles) {
	const report = inspectBoard(records);
	check(
		`derived extent overflow retains local evidence for ${label}`,
		report.findings.some(
			(finding) =>
				finding.reason === reason &&
				finding.affectedBBox !== null &&
				(label === "duplicate identity" || finding.affectedBBox.x === Number.MAX_VALUE),
		),
	);
}

const aggregatePairSuppression = inspectBoard([
	semanticNode("unrepresentable-pair-node", {
		id: "pair-positive",
		x: Number.MAX_VALUE,
		y: 0,
		width: 0,
		height: 10,
	}),
	semanticNode("unrepresentable-pair-node", {
		id: "pair-negative",
		x: -Number.MAX_VALUE,
		y: 0,
		width: 0,
		height: 10,
	}),
	connector({ id: "pair-edge", x: -10, y: 5, width: 20, height: 0 }),
]);
check(
	"pair consumers omit only a node whose aggregate body is unrepresentable",
	aggregatePairSuppression.coverage === "indeterminate" &&
		!aggregatePairSuppression.findings.some(
			(finding) => finding.code === "CONNECTOR_PENETRATES_NODE" || finding.code === "NODE_OVERLAP",
		),
);

const maxHierarchy = inspectBoard([
	semanticNode("max-zone", { id: "max-zone-body", x: 0, y: 0, width: Number.MAX_VALUE, height: 2 }),
	semanticNode("max-child", {
		id: "max-child-body",
		x: 0,
		y: 0,
		width: Number.MAX_VALUE / 2,
		height: 1,
	}),
]);
check(
	"MAX_VALUE hierarchy area comparison keeps the containing zone out of leaf overlap",
	!maxHierarchy.findings.some(
		(finding) =>
			finding.code === "NODE_OVERLAP" &&
			[finding.details.firstNodeId, finding.details.secondNodeId].includes("max-zone"),
	),
);

const maxMantissaHierarchy = inspectBoard([
	semanticNode("wide-owner", {
		id: "z-wide-owner",
		x: -1,
		y: 0.1,
		width: Number.MAX_VALUE,
		height: 1.5,
	}),
	semanticNode("narrow-owner", {
		id: "a-narrow-owner",
		x: 0,
		y: 0,
		width: Number.MAX_VALUE,
		height: 1.25,
	}),
	semanticNode("max-mantissa-child", {
		id: "max-mantissa-child-body",
		x: 10,
		y: 0.2,
		width: 10,
		height: 0.75,
		boundElements: [{ id: "max-mantissa-label", type: "text" }],
	}),
	{
		id: "max-mantissa-label",
		type: "text",
		x: 10,
		y: 0.2,
		width: 10,
		height: 0.75,
		angle: 0,
		fontFamily: 5,
		text: "child",
		containerId: "max-mantissa-child-body",
	},
]);
check(
	"MAX_VALUE mantissas choose the smallest strictly larger containing owner",
	!maxMantissaHierarchy.findings.some(
		(finding) => finding.code === "LABEL_OVERLAP" && finding.details.nodeId === "narrow-owner",
	) &&
		maxMantissaHierarchy.findings.some(
			(finding) => finding.code === "LABEL_OVERLAP" && finding.details.nodeId === "wide-owner",
		),
	JSON.stringify(
		maxMantissaHierarchy.findings.map((finding) => [finding.code, finding.reason, finding.details]),
	),
);

const equalExtremeHierarchyElements = [
	semanticNode("equal-extreme-a", {
		id: "a-equal",
		x: 0,
		y: 0,
		width: Number.MAX_VALUE / 2,
		height: 2,
	}),
	semanticNode("equal-extreme-z", {
		id: "z-equal",
		x: -1,
		y: 0.5,
		width: Number.MAX_VALUE,
		height: 1,
	}),
	semanticNode("equal-extreme-child", {
		id: "eq-child",
		x: 10,
		y: 0.6,
		width: 10,
		height: 0.6,
		boundElements: [{ id: "eq-label", type: "text" }],
	}),
	{
		id: "eq-label",
		type: "text",
		x: 10,
		y: 0.6,
		width: 10,
		height: 0.6,
		angle: 0,
		fontFamily: 5,
		text: "equal",
		containerId: "eq-child",
	},
];
for (const [order, elements] of [
	["forward", equalExtremeHierarchyElements],
	["reverse", equalExtremeHierarchyElements.toReversed()],
]) {
	const report = inspectBoard(elements);
	check(
		`equal extreme products use the stable boundary id in ${order} input order`,
		!report.findings.some(
			(finding) => finding.code === "LABEL_OVERLAP" && finding.details.nodeId === "equal-extreme-a",
		) &&
			report.findings.some(
				(finding) =>
					finding.code === "LABEL_OVERLAP" && finding.details.nodeId === "equal-extreme-z",
			),
	);
}

const subnormalHierarchy = inspectBoard([
	semanticNode("subnormal-owner", {
		id: "sub-owner",
		x: 0,
		y: 0,
		width: Number.MIN_VALUE * 4,
		height: Number.MAX_VALUE,
	}),
	semanticNode("subnormal-child", {
		id: "sub-child",
		x: 0,
		y: 0,
		width: Number.MIN_VALUE * 2,
		height: Number.MAX_VALUE / 2,
	}),
]);
check(
	"subnormal hierarchy factors remain schema-total",
	InspectionReportSchema.safeParse(subnormalHierarchy).success,
);

const equalAreaHierarchy = inspectBoard([
	semanticNode("stable-zone-a", { id: "a-boundary", x: 0, y: 0, width: 100, height: 100 }),
	semanticNode("stable-zone-b", { id: "b-boundary", x: 0, y: 0, width: 100, height: 100 }),
	semanticNode("stable-child", { id: "stable-child-body", x: 10, y: 10, width: 10, height: 10 }),
]);
check(
	"equal-area hierarchy competitors use the stable boundary id tie-break",
	!equalAreaHierarchy.findings.some(
		(finding) =>
			finding.code === "NODE_OVERLAP" &&
			[finding.details.firstNodeId, finding.details.secondNodeId].includes("stable-zone-a") &&
			[finding.details.firstNodeId, finding.details.secondNodeId].includes("stable-child"),
	) &&
		equalAreaHierarchy.findings.some(
			(finding) =>
				finding.code === "NODE_OVERLAP" &&
				[finding.details.firstNodeId, finding.details.secondNodeId].includes("stable-zone-b") &&
				[finding.details.firstNodeId, finding.details.secondNodeId].includes("stable-child"),
		),
);

const aspectHierarchy = inspectBoard([
	semanticNode("aspect-zone", {
		id: "aspect-zone-body",
		x: 0,
		y: 0,
		width: Number.MAX_VALUE,
		height: Number.MIN_VALUE * 4,
	}),
	semanticNode("aspect-child", {
		id: "aspect-child-body",
		x: 0,
		y: 0,
		width: Number.MAX_VALUE / 2,
		height: Number.MIN_VALUE * 2,
	}),
]);
check(
	"tiny-by-huge hierarchy arithmetic preserves strict containment",
	!aspectHierarchy.findings.some((finding) => finding.code === "NODE_OVERLAP"),
);

const nestedHierarchy = inspectBoard([
	semanticNode("outer-zone", { id: "outer-body", x: 0, y: 0, width: 300, height: 300 }),
	semanticNode("inner-zone", { id: "inner-body", x: 20, y: 20, width: 220, height: 220 }),
	semanticNode("nested-leaf", {
		id: "nested-leaf-body",
		x: 40,
		y: 60,
		width: 50,
		height: 50,
		boundElements: [{ id: "nested-edge", type: "arrow" }],
	}),
	semanticNode("nested-peer", { id: "nested-peer-body", x: 80, y: 60, width: 50, height: 50 }),
	connector({
		id: "nested-edge",
		x: 40,
		y: 85,
		width: 120,
		height: 0,
		points: [
			[0, 0],
			[120, 0],
		],
		startBinding: { elementId: "nested-leaf-body", focus: 0, gap: 0 },
	}),
]);
check(
	"nested hierarchy keeps leaf scope, endpoint ancestors, and unrelated overlap distinct",
	nestedHierarchy.findings.some(
		(finding) =>
			finding.code === "NODE_OVERLAP" &&
			[finding.details.firstNodeId, finding.details.secondNodeId].includes("nested-leaf") &&
			[finding.details.firstNodeId, finding.details.secondNodeId].includes("nested-peer"),
	) &&
		nestedHierarchy.findings.some(
			(finding) =>
				finding.code === "CONNECTOR_PENETRATES_NODE" && finding.details.nodeId === "nested-peer",
		) &&
		!nestedHierarchy.findings.some(
			(finding) =>
				(finding.code === "NODE_OVERLAP" || finding.code === "CONNECTOR_PENETRATES_NODE") &&
				["outer-zone", "inner-zone"].includes(
					"nodeId" in finding.details ? finding.details.nodeId : finding.details.firstNodeId,
				),
		),
);

const aggregateMatrixRoles = ["semantic-node", "grouped-obstacle", "duplicate-id"];
const aggregateMatrixSpans = [
	["local", 0, 10, 1, false],
	["opposite-extremes", -Number.MAX_VALUE, Number.MAX_VALUE, 1, true],
	["derived-extent", Number.MAX_VALUE, 0, Number.MAX_VALUE, true],
];
let aggregateMatrixCount = 0;
for (const role of aggregateMatrixRoles)
	for (const [span, firstX, secondX, firstWidth, indeterminate] of aggregateMatrixSpans) {
		const shared = role === "grouped-obstacle" ? { groupIds: [`matrix-${span}`] } : {};
		const first = semanticNode("matrix-node", {
			id: role === "duplicate-id" ? "matrix-duplicate" : `matrix-a-${aggregateMatrixCount}`,
			x: firstX,
			y: 700,
			width: firstWidth,
			height: 10,
			...shared,
			...(role === "grouped-obstacle" ? { customData: undefined } : {}),
		});
		const second = semanticNode("matrix-node", {
			id: role === "duplicate-id" ? "matrix-duplicate" : `matrix-b-${aggregateMatrixCount}`,
			x: secondX,
			y: 700,
			width: 1,
			height: 10,
			...shared,
			...(role === "grouped-obstacle" ? { customData: undefined } : {}),
		});
		const elements = [first, second];
		let report;
		let failure;
		try {
			report = inspectBoard(elements);
		} catch (error) {
			failure = error;
		}
		const dependentFinding = report?.findings.some((finding) =>
			["CONNECTOR_PENETRATES_NODE", "CONNECTOR_PENETRATES_OBSTACLE", "NODE_OVERLAP"].includes(
				finding.code,
			),
		);
		check(
			`aggregate matrix ${role}/${span} is total and prerequisite-gated`,
			!failure &&
				InspectionReportSchema.safeParse(report).success &&
				(!indeterminate || report.coverage === "indeterminate") &&
				(!indeterminate || !dependentFinding),
			failure instanceof Error ? failure.message : "",
		);
		aggregateMatrixCount += 1;
	}
check("aggregate cross-product stays deliberately bounded", aggregateMatrixCount === 9);

const supportedConnectorResultCodes = new Set([
	"STALE_LINEAR_DIMENSIONS",
	"CONNECTOR_PENETRATES_NODE",
	"CONNECTOR_PENETRATES_OBSTACLE",
	"CONNECTOR_INTERSECTION_UNMARKED",
]);
const findingUsesConnector = (finding, connectorId) =>
	finding.elements.some((element) => element.id === connectorId) ||
	("connectorId" in finding.details && finding.details.connectorId === connectorId) ||
	("firstConnectorId" in finding.details && finding.details.firstConnectorId === connectorId) ||
	("secondConnectorId" in finding.details && finding.details.secondConnectorId === connectorId);
const interactionElements = (identityLabel, rawId, y = 0) => {
	const targetId = `target-${identityLabel}`;
	const invalidConnector = {
		type: "arrow",
		x: 0,
		y: y + 5,
		width: 101,
		height: 0,
		angle: 0,
		points: [
			[0, 0],
			[100, 0],
		],
		startBinding: { elementId: targetId, focus: 0, gap: 0 },
		start: { id: `input-${identityLabel}` },
		boundElements: [{ id: `gone-${identityLabel}`, type: "text" }],
	};
	if (identityLabel !== "missing") invalidConnector.id = rawId;
	return [
		invalidConnector,
		semanticNode(targetId, { x: 200, y }),
		semanticNode(`node-${identityLabel}`, { x: 40, y, width: 10, height: 10 }),
		{
			id: `obstacle-${identityLabel}`,
			type: "rectangle",
			x: 60,
			y,
			width: 10,
			height: 10,
			angle: 0,
			customData: { library: { itemId: `item-${identityLabel}` } },
		},
		connector({
			id: `other-${identityLabel}`,
			x: 80,
			y,
			width: 0,
			height: 10,
			points: [
				[0, 0],
				[0, 10],
			],
		}),
	];
};

const unlocatableCollisionTrap = inspectBoard([
	{
		id: "unlocatable",
		type: "arrow",
		x: null,
		y: 5,
		width: 100,
		height: 0,
		angle: 0,
		points: [
			[0, 0],
			[100, 0],
		],
	},
	semanticNode("fabricated-node", { x: 40, y: 0 }),
	{
		id: "fabricated-obstacle",
		type: "rectangle",
		x: 60,
		y: 0,
		width: 10,
		height: 10,
		angle: 0,
		customData: { library: { itemId: "fabricated-obstacle" } },
	},
	connector({
		id: "fabricated-crossing",
		x: 80,
		y: 0,
		width: 0,
		height: 10,
		points: [
			[0, 0],
			[0, 10],
		],
	}),
]);
check(
	"unlocatable connector origin cannot feed node, obstacle, or connector pair analysis",
	unlocatableCollisionTrap.coverage === "indeterminate" &&
		unlocatableCollisionTrap.findings.some(
			(finding) =>
				finding.code === "INVALID_RENDER_GEOMETRY" &&
				finding.reason === "unlocatable-record" &&
				finding.elements[0]?.id === "unlocatable",
		) &&
		!unlocatableCollisionTrap.findings.some(
			(finding) =>
				supportedConnectorResultCodes.has(finding.code) &&
				findingUsesConnector(finding, "unlocatable"),
		),
);

for (const [identityLabel, rawId] of [
	["missing", undefined],
	["empty", ""],
	["non-string", 42],
]) {
	let report;
	let failure;
	try {
		report = inspectBoard(interactionElements(identityLabel, rawId));
	} catch (error) {
		failure = error;
	}
	check(
		`${identityLabel} connector identity remains schema-total across downstream interactions`,
		!failure &&
			InspectionReportSchema.safeParse(report).success &&
			report.coverage === "indeterminate" &&
			report.findings.some(
				(finding) =>
					finding.code === "BROKEN_REFERENCE" &&
					finding.reason === "invalid-element-identity" &&
					finding.elements[0]?.sourceIndex === 0,
			) &&
			!report.findings.some(
				(finding) =>
					supportedConnectorResultCodes.has(finding.code) ||
					[
						"missing-binding-target",
						"invalid-binding-target-type",
						"missing-binding-reciprocal",
						"persisted-agent-endpoint",
						"dangling-bound-text",
						"dangling-bound-arrow",
					].includes(finding.reason),
			),
		failure instanceof Error ? failure.message : "",
	);
}

const incomingReferenceElements = (label, rawType, y = 0) => {
	const target = { id: `incoming-${label}`, x: 200, y, width: 10, height: 10, angle: 0 };
	if (label !== "missing") target.type = rawType;
	return [
		connector({
			id: `incoming-edge-${label}`,
			x: 0,
			y,
			width: 10,
			height: 0,
			points: [
				[0, 0],
				[10, 0],
			],
			startBinding: { elementId: target.id, focus: 0, gap: 0 },
		}),
		target,
	];
};
for (const [label, rawType] of [
	["missing", undefined],
	["null", null],
	["boolean", false],
	["unknown", "future-target"],
]) {
	const report = inspectBoard(incomingReferenceElements(label, rawType));
	check(
		`forward-only incoming reference makes ${label} target type coverage-applicable`,
		report.coverage === "indeterminate" &&
			report.findings.some(
				(finding) =>
					finding.code === "UNSUPPORTED_GEOMETRY" &&
					finding.reason === "unsupported-type" &&
					finding.elements[0]?.id === `incoming-${label}`,
			),
	);
}

const unsupportedConnectorCases = /** @type {const} */ ([
	["rotation", { angle: 1 }, "rotation"],
	["malformed-angle", { angle: "bad" }, "rotation"],
	["curve", { curve: false }, "curve"],
	["curve-kind", { curveKind: "bezier" }, "curve"],
	["roundness", { roundness: { type: 2 } }, "rounded-or-elbowed"],
	["elbowed", { elbowed: true }, "rounded-or-elbowed"],
	["malformed-elbowed", { elbowed: "bad" }, "rounded-or-elbowed"],
	["fixed-segments", { fixedSegments: [] }, "rounded-or-elbowed"],
]);
for (const [label, discriminator, reason] of unsupportedConnectorCases) {
	const connectorId = `unsupported-${label}`;
	const report = inspectBoard([
		connector({
			id: connectorId,
			x: 0,
			y: 5,
			width: 101,
			height: 0,
			points: [
				[0, 0],
				[100, 0],
			],
			...discriminator,
		}),
		semanticNode(`unsupported-node-${label}`, { x: 40, y: 0 }),
		{
			id: `unsupported-obstacle-${label}`,
			type: "rectangle",
			x: 60,
			y: 0,
			width: 10,
			height: 10,
			angle: 0,
			customData: { library: { itemId: `unsupported-item-${label}` } },
		},
		connector({
			id: `supported-crossing-${label}`,
			x: 80,
			y: 0,
			width: 0,
			height: 10,
			points: [
				[0, 0],
				[0, 10],
			],
		}),
	]);
	check(
		`${label} connector exposes evidence but no supported geometry result`,
		report.findings.some(
			(finding) =>
				finding.code === "UNSUPPORTED_GEOMETRY" &&
				finding.reason === reason &&
				finding.elements[0]?.id === connectorId &&
				finding.points.length === 2,
		) &&
			!report.findings.some(
				(finding) =>
					supportedConnectorResultCodes.has(finding.code) &&
					findingUsesConnector(finding, connectorId),
			),
	);
}

const completeBinding = { elementId: "node", focus: 0, gap: 0 };
const bindingCases = [
	["not-object", "bad", true],
	["array", [], true],
	["missing-element-id", { focus: 0, gap: 0 }, true],
	["empty-element-id", { elementId: "", focus: 0, gap: 0 }, true],
	["non-string-element-id", { elementId: 1, focus: 0, gap: 0 }, true],
	["missing-focus", { elementId: "node", gap: 0 }, false],
	["nonfinite-focus", { elementId: "node", focus: "bad", gap: 0 }, false],
	["missing-gap", { elementId: "node", focus: 0 }, false],
	["nonfinite-gap", { elementId: "node", focus: 0, gap: null }, false],
	["invalid-fixed-point", { ...completeBinding, fixedPoint: [0] }, false],
];
for (const end of ["start", "end"])
	for (const [issue, value, blocked] of bindingCases) {
		const report = inspectBoard([
			connector({
				points: [
					[0, 0],
					[10, 0],
				],
				[`${end}Binding`]: value,
			}),
		]);
		const finding = report.findings.find(
			(candidate) =>
				candidate.code === "BROKEN_REFERENCE" && candidate.reason === `malformed-${end}-binding`,
		);
		check(
			`${end} binding ${String(issue)} retains classification semantics`,
			finding?.details.issue === issue &&
				finding.details.classificationBlocked === blocked &&
				finding.affectsCoverage === blocked,
		);
	}
for (const canonicalBinding of [undefined, null]) {
	const report = inspectBoard([
		connector({
			points: [
				[0, 0],
				[10, 0],
			],
			startBinding: canonicalBinding,
		}),
	]);
	check(
		"absent or null binding remains canonical",
		!report.findings.some((finding) => finding.reason === "malformed-start-binding"),
	);
}

/** @type {Array<[string, unknown]>} */
const blockingEndpointBindings = [
	["not-object", "bad"],
	["array", []],
	["missing-element-id", { focus: 0, gap: 0 }],
	["empty-element-id", { elementId: "", focus: 0, gap: 0 }],
	["non-string-element-id", { elementId: 1, focus: 0, gap: 0 }],
];
/** @type {Array<Array<"start" | "end">>} */
const blockingEndpointCombinations = [["start"], ["end"], ["start", "end"]];
for (const [label, value] of blockingEndpointBindings)
	for (const ends of blockingEndpointCombinations) {
		const bindings = Object.fromEntries(ends.map((end) => [`${end}Binding`, value]));
		const report = inspectBoard([
			semanticNode(`candidate-${label}-${ends.join("-")}`, { x: 40, y: 0 }),
			connector({
				id: `blocked-${label}-${ends.join("-")}`,
				x: 0,
				y: 5,
				width: 100,
				height: 0,
				points: [
					[0, 0],
					[100, 0],
				],
				...bindings,
			}),
		]);
		check(
			`${label} ${ends.join("+")} endpoint classification suppresses node penetration`,
			report.coverage === "indeterminate" &&
				report.findings.some(
					(finding) =>
						finding.code === "BROKEN_REFERENCE" &&
						finding.reason === `malformed-${ends[0]}-binding` &&
						finding.affectsCoverage,
				) &&
				!report.findings.some(
					(finding) =>
						finding.code === "CONNECTOR_PENETRATES_NODE" &&
						finding.details.connectorId === `blocked-${label}-${ends.join("-")}`,
				),
		);
	}

const boundElementCases = [
	["not-array", "bad", "not-array"],
	["entry-not-object", [null], "entry-not-object"],
	["missing-id", [{ type: "text" }], "missing-id"],
	["empty-id", [{ id: "", type: "text" }], "empty-id"],
	["non-string-id", [{ id: 1, type: "text" }], "non-string-id"],
	["missing-type", [{ id: "label" }], "missing-type"],
	["invalid-type", [{ id: "label", type: "image" }], "invalid-type"],
];
for (const [label, boundElements, issue] of boundElementCases) {
	const report = inspectBoard([semanticNode("node", { boundElements })]);
	const finding = report.findings.find(
		(candidate) =>
			candidate.code === "BROKEN_REFERENCE" && candidate.reason === "malformed-bound-elements",
	);
	check(
		`boundElements ${String(label)} blocks classification`,
		finding?.details.issue === issue &&
			finding.details.classificationBlocked === true &&
			finding.affectsCoverage === true,
	);
}

const boundTargetTypeCases = [
	["text-to-text", "text", "text", false],
	["text-to-arrow", "text", "arrow", true],
	["text-to-line", "text", "line", true],
	["text-to-rectangle", "text", "rectangle", true],
	["arrow-to-text", "arrow", "text", true],
	["arrow-to-arrow", "arrow", "arrow", false],
	["arrow-to-line", "arrow", "line", false],
	["arrow-to-rectangle", "arrow", "rectangle", true],
];
for (const [label, declaredType, actualType, mismatch] of boundTargetTypeCases) {
	const target =
		actualType === "text"
			? {
					id: `target-${label}`,
					type: "text",
					x: 40,
					y: 0,
					width: 10,
					height: 10,
					fontFamily: 5,
					text: "target",
				}
			: actualType === "arrow" || actualType === "line"
				? connector({
						id: `target-${label}`,
						type: actualType,
						x: 40,
						y: 0,
						width: 10,
						height: 0,
						points: [
							[0, 0],
							[10, 0],
						],
						...(label === "arrow-to-line"
							? { startBinding: { elementId: `owner-${label}`, focus: 0, gap: 0 } }
							: {}),
					})
				: { id: `target-${label}`, type: "rectangle", x: 40, y: 0, width: 10, height: 10 };
	const report = inspectBoard([
		semanticNode(`owner-${label}`, {
			boundElements: [{ id: target.id, type: declaredType }],
		}),
		target,
	]);
	const finding = report.findings.find(
		(candidate) =>
			candidate.code === "BROKEN_REFERENCE" &&
			candidate.reason === "bound-element-target-type-mismatch",
	);
	check(
		`boundElements ${label} validates declared and actual target types`,
		mismatch
			? finding?.affectsCoverage === true &&
					finding.details.declaredType === declaredType &&
					finding.details.actualType === actualType &&
					!report.clean
			: !finding &&
					(label !== "arrow-to-line" ||
						!report.findings.some(
							(candidate) => candidate.reason === "missing-binding-reciprocal",
						)),
	);
}
for (const [label, rawType] of [
	["missing", undefined],
	["null", null],
	["boolean", false],
	["unknown", "future-target"],
]) {
	const target = { id: `unknown-bound-${label}`, x: 40, y: 0, width: 10, height: 10 };
	if (label !== "missing") target.type = rawType;
	const report = inspectBoard([
		semanticNode(`unknown-owner-${label}`, {
			boundElements: [{ id: target.id, type: "text" }],
		}),
		target,
	]);
	check(
		`boundElements target with ${label} type stays indeterminate without a false mismatch`,
		report.coverage === "indeterminate" &&
			report.findings.some(
				(finding) =>
					finding.code === "UNSUPPORTED_GEOMETRY" && finding.reason === "unsupported-type",
			) &&
			!report.findings.some((finding) => finding.reason === "bound-element-target-type-mismatch"),
	);
}

const duplicateIdentityCases = [
	[
		"binding target",
		[
			semanticNode("duplicate-target-a", { id: "dup-target", x: 40, y: 0 }),
			semanticNode("duplicate-target-b", { id: "dup-target", x: 70, y: 0 }),
			connector({
				id: "target-edge",
				x: 0,
				y: 5,
				width: 100,
				height: 0,
				points: [
					[0, 0],
					[100, 0],
				],
				startBinding: { elementId: "dup-target", focus: 0, gap: 0 },
			}),
		],
		["missing-binding-target", "invalid-binding-target-type", "leaf-footprint-interior"],
	],
	[
		"connector",
		[
			semanticNode("connector-candidate", { x: 40, y: 20 }),
			connector({ id: "dup-edge", x: 0, y: 25, width: 100, height: 0 }),
			connector({ id: "dup-edge", x: 0, y: 25, width: 100, height: 0 }),
		],
		["leaf-footprint-interior", "proper-interior-crossing", "collinear-overlap"],
	],
	[
		"semantic node member",
		[
			semanticNode("duplicate-node-a", { id: "dup-node", x: 0, y: 0, width: 100, height: 100 }),
			semanticNode("duplicate-node-b", { id: "dup-node", x: 20, y: 20, width: 100, height: 100 }),
			semanticNode("other-node", { x: 40, y: 40, width: 20, height: 20 }),
		],
		["leaf-footprint-overlap"],
	],
	[
		"label and container ownership",
		[
			semanticNode("owner-a", {
				id: "dup-owner",
				boundElements: [{ id: "dup-label", type: "text" }],
			}),
			semanticNode("owner-b", {
				id: "dup-owner",
				x: 100,
				boundElements: [{ id: "dup-label", type: "text" }],
			}),
			{
				id: "dup-label",
				type: "text",
				x: 35,
				y: 20,
				width: 30,
				height: 20,
				fontFamily: 5,
				text: "duplicate",
				containerId: "dup-owner",
			},
			{
				id: "dup-label",
				type: "text",
				x: 105,
				y: 20,
				width: 30,
				height: 20,
				fontFamily: 5,
				text: "duplicate",
				containerId: "dup-owner",
			},
			semanticNode("duplicate-unrelated", { x: 50, y: 0, width: 100, height: 100 }),
		],
		["label-node-overlap", "label-label-overlap", "missing-reciprocal", "conflicting-owner"],
	],
	[
		"obstacle member",
		[
			{
				id: "dup-obstacle",
				type: "rectangle",
				x: 40,
				y: 0,
				width: 30,
				height: 30,
				groupIds: ["g"],
			},
			{
				id: "dup-obstacle",
				type: "rectangle",
				x: 40,
				y: 0,
				width: 30,
				height: 30,
				groupIds: ["g"],
			},
			{
				id: "other-obstacle",
				type: "rectangle",
				x: 70,
				y: 0,
				width: 30,
				height: 30,
				groupIds: ["g"],
			},
			connector({ id: "obstacle-edge", x: 0, y: 15, width: 120, height: 0 }),
		],
		["obstacle-footprint-interior"],
	],
	[
		"bound reference target",
		[
			semanticNode("reference-owner", {
				boundElements: [{ id: "dup-reference", type: "arrow" }],
			}),
			connector({ id: "dup-reference", x: 100, y: 0 }),
			{ id: "dup-reference", type: "rectangle", x: 120, y: 0, width: 10, height: 10 },
		],
		["dangling-bound-arrow", "bound-element-target-type-mismatch"],
	],
];
for (const [label, elements, forbiddenReasons] of duplicateIdentityCases) {
	const report = inspectBoard(elements);
	check(
		`duplicate ${String(label)} stays indeterminate without identity-dependent facts`,
		report.coverage === "indeterminate" &&
			report.findings.some((finding) => finding.reason === "duplicate-element-id") &&
			!report.findings.some((finding) => forbiddenReasons.includes(finding.reason)),
		report.findings.map((finding) => finding.reason).join(","),
	);
}
const duplicateStructuralEvidence = inspectBoard([
	connector({
		id: "duplicate-structure",
		points: [
			[0, 0],
			["bad", 0],
		],
	}),
	connector({
		id: "duplicate-structure",
		x: 20,
		points: [
			[0, 0],
			[false, 0],
		],
	}),
]);
check(
	"duplicate records retain source-indexed per-record structural findings",
	duplicateStructuralEvidence.findings.filter((finding) => finding.reason === "malformed-point")
		.length === 2 &&
		JSON.stringify(
			duplicateStructuralEvidence.findings
				.filter((finding) => finding.reason === "malformed-point")
				.map((finding) => finding.details.sourceIndex)
				.toSorted((a, b) => a - b),
		) === JSON.stringify([0, 1]),
);
for (const containerId of ["", 42, false]) {
	const finding = inspectBoard([
		{
			id: "label",
			type: "text",
			x: 0,
			y: 0,
			width: 10,
			height: 10,
			fontFamily: 5,
			text: "label",
			containerId,
		},
	]).findings.find((candidate) => candidate.reason === "malformed-container-id");
	check(
		`containerId ${JSON.stringify(containerId)} blocks owner classification`,
		finding?.affectsCoverage === true && finding.details.ownerClassificationBlocked === true,
	);
}

const malformedRoleCases = [
	["library obstacle", invalidLibrary("body", [], { customData: { library: { itemId: "item" } } })],
	["group obstacle", { ...invalidLibrary("body", ["g"]), customData: undefined }],
	["closed boundary", { id: "frame", type: "frame", x: 0, y: 0, width: 20, height: 20 }],
];
for (const [role, base] of malformedRoleCases)
	for (const angle of ["bad", null, false]) {
		const report = inspectBoard([{ ...base, angle }]);
		check(
			`malformed ${String(role)} angle ${JSON.stringify(angle)} cannot go false-clean`,
			report.coverage === "indeterminate" &&
				report.findings.some(
					(finding) => finding.code === "UNSUPPORTED_GEOMETRY" && finding.reason === "rotation",
				),
		);
	}
for (const rawType of [undefined, null, false, "unknown-applicable"]) {
	const element = {
		id: "body",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		angle: 0,
		customData: { library: { itemId: "item" } },
	};
	if (rawType !== undefined) element.type = rawType;
	const report = inspectBoard([element]);
	check(
		`malformed applicable type ${JSON.stringify(rawType)} cannot go false-clean`,
		report.coverage === "indeterminate" &&
			report.findings.some(
				(finding) =>
					finding.code === "UNSUPPORTED_GEOMETRY" && finding.reason === "unsupported-type",
			),
	);
}

const referenceCases = [
	[
		"missing-binding-target",
		[
			connector({
				points: [
					[0, 0],
					[10, 0],
				],
				startBinding: completeBinding,
			}),
		],
	],
	[
		"invalid-binding-target-type",
		[
			connector({
				points: [
					[0, 0],
					[10, 0],
				],
				startBinding: { elementId: "other", focus: 0, gap: 0 },
			}),
			{
				...connector({
					id: "other",
					y: 100,
					points: [
						[0, 0],
						[10, 0],
					],
				}),
			},
		],
	],
	[
		"missing-binding-reciprocal",
		[
			connector({
				points: [
					[0, 0],
					[10, 0],
				],
				startBinding: completeBinding,
			}),
			semanticNode("node"),
		],
	],
	[
		"dangling-bound-text",
		[semanticNode("node", { boundElements: [{ id: "gone", type: "text" }] })],
	],
	[
		"dangling-bound-arrow",
		[semanticNode("node", { boundElements: [{ id: "gone", type: "arrow" }] })],
	],
	[
		"persisted-agent-endpoint",
		[
			connector({
				points: [
					[0, 0],
					[10, 0],
				],
				start: { id: "node" },
			}),
		],
	],
	["invalid-node-metadata", [semanticNode("node", { customData: { archboard: { node: 7 } } })]],
	[
		"invalid-code-binding",
		[
			semanticNode("node", {
				customData: { archboard: { node: "node", binding: { path: "../bad" } } },
			}),
		],
	],
	[
		"derived-link-persisted",
		[
			semanticNode("node", {
				customData: { archboard: { node: "node", binding: { path: "src/a.ts" } } },
				link: "file:///tmp/a.ts",
			}),
		],
	],
];
for (const [reason, elements] of referenceCases)
	check(
		`direct inspector emits ${String(reason)}`,
		inspectBoard(elements).findings.some(
			(finding) => finding.code === "BROKEN_REFERENCE" && finding.reason === reason,
		),
	);

const fontElement = (fontFamily) => ({
	id: "label",
	type: "text",
	x: 10,
	y: 20,
	width: 30,
	height: 10,
	text: "label",
	...(fontFamily === undefined ? {} : { fontFamily }),
});
for (const [label, family, expectedReason] of [
	["absent", undefined, "missing-font-family"],
	["legacy one", 1, "disallowed-font-family"],
	["current five", 5, null],
	...[2, 3, 6, 7, 8].map((validFamily) => [
		`valid ${validFamily}`,
		validFamily,
		"disallowed-font-family",
	]),
	["string five", "5", "invalid-font-family"],
	["zero", 0, "invalid-font-family"],
	["four", 4, "invalid-font-family"],
	["fractional", 5.5, "invalid-font-family"],
	["NaN", Number.NaN, "invalid-font-family"],
	["infinity", Number.POSITIVE_INFINITY, "invalid-font-family"],
]) {
	const report = inspectBoard([fontElement(family)]);
	const fontFinding = report.findings.find((finding) => finding.code === "FONT_POLICY_VIOLATION");
	check(
		`persisted font ${String(label)} uses exact semantics`,
		expectedReason === null
			? fontFinding === undefined
			: fontFinding?.reason === expectedReason &&
					JSON.stringify(fontFinding.points) === JSON.stringify([{ x: 25, y: 25 }]),
	);
}
check(
	"font policy any accepts a missing legacy family",
	!inspectBoard([fontElement(undefined)], { allowedFontFamilies: "any" }).findings.some(
		(finding) => finding.code === "FONT_POLICY_VIOLATION",
	),
);

const staleAt = (delta) =>
	inspectBoard([
		connector({
			x: 0,
			y: 0,
			width: 10 + delta,
			height: 0,
			points: [
				[0, 0],
				[10, 0],
			],
		}),
	]).findings.some((finding) => finding.code === "STALE_LINEAR_DIMENSIONS");
check("dimension tolerance exact boundary is stale", staleAt(0.5));
check("dimension tolerance just inside is not stale", !staleAt(0.499));
check("dimension tolerance just outside is stale", staleAt(0.501));
const crossingAt = (x) =>
	inspectBoard([
		connector({
			id: "horizontal",
			x: 0,
			y: 0,
			width: 10,
			height: 0,
			points: [
				[0, 0],
				[10, 0],
			],
		}),
		connector({
			id: "vertical",
			x,
			y: -5,
			width: 0,
			height: 10,
			points: [
				[0, 0],
				[0, 10],
			],
		}),
	]).findings.some((finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED");
check("intersection exact endpoint tolerance is contact", !crossingAt(9.5));
check("intersection just inside endpoint tolerance is contact", !crossingAt(9.501));
check("intersection just outside endpoint tolerance is proper", crossingAt(9.499));
const nodesOverlapAt = (overlapWidth) =>
	inspectBoard([semanticNode("a"), semanticNode("b", { x: 10 - overlapWidth })]).findings.some(
		(finding) => finding.code === "NODE_OVERLAP",
	);
check("node overlap exact tolerance is excluded", !nodesOverlapAt(0.5));
check("node overlap just inside tolerance is excluded", !nodesOverlapAt(0.499));
check("node overlap just outside tolerance is detected", nodesOverlapAt(0.501));

const labelContainer = (overrides = {}) => ({
	id: "svc",
	type: "rectangle",
	x: 0,
	y: 0,
	width: 200,
	height: 80,
	angle: 0,
	boundElements: [{ id: "svc-label", type: "text" }],
	...overrides,
});
const placedLabel = (overrides = {}) => ({
	id: "svc-label",
	type: "text",
	containerId: "svc",
	x: 50,
	y: 27,
	width: 100,
	height: 26,
	fontFamily: 5,
	text: "AuthService",
	...overrides,
});
for (const [alignment, overrides] of [
	["centred", {}],
	["top", { y: 5 }],
	["left", { x: 0 }],
])
	check(
		`${String(alignment)} bound label is not generic placement drift`,
		!inspectBoard([labelContainer(), placedLabel(overrides)]).findings.some(
			(finding) => finding.code === "LABEL_CORRUPTION" && finding.reason === "drift",
		),
	);
check(
	"boundTextDrift alone reports an abandoned label",
	inspectBoard([labelContainer({ y: 900 }), placedLabel()]).findings.some(
		(finding) => finding.code === "LABEL_CORRUPTION" && finding.reason === "drift",
	),
);
check(
	"orphan label is coverage-affecting",
	inspectBoard([placedLabel({ containerId: "gone" })]).findings.some(
		(finding) =>
			finding.code === "LABEL_CORRUPTION" && finding.reason === "orphan" && finding.affectsCoverage,
	),
);
check(
	"duplicate labels are reported without changing coverage",
	inspectBoard([
		labelContainer({
			boundElements: [
				{ id: "a", type: "text" },
				{ id: "b", type: "text" },
			],
		}),
		placedLabel({ id: "a" }),
		placedLabel({ id: "b", x: 60 }),
	]).findings.some(
		(finding) =>
			finding.code === "LABEL_CORRUPTION" &&
			finding.reason === "duplicate" &&
			!finding.affectsCoverage,
	),
);
check(
	"missing label reciprocal is distinct",
	inspectBoard([labelContainer({ boundElements: [] }), placedLabel()]).findings.some(
		(finding) => finding.code === "LABEL_CORRUPTION" && finding.reason === "missing-reciprocal",
	),
);
const conflictingLabels = inspectBoard([
	labelContainer(),
	labelContainer({ id: "other", x: 300, boundElements: [{ id: "svc-label", type: "text" }] }),
	placedLabel(),
]);
check(
	"conflicting owners emit both structural and label findings",
	conflictingLabels.findings.some(
		(finding) => finding.reason === "conflicting-bound-label-owner",
	) &&
		conflictingLabels.findings.some(
			(finding) => finding.code === "LABEL_CORRUPTION" && finding.reason === "conflicting-owner",
		),
);

const ownershipNode = (id, x) =>
	semanticNode(id, {
		id: `${id}-body`,
		x,
		y: 0,
		width: 100,
		height: 100,
	});
const ownershipLabel = (overrides = {}) => ({
	id: "ownership-label",
	type: "text",
	x: 35,
	y: 20,
	width: 30,
	height: 20,
	fontFamily: 5,
	text: "ownership",
	...overrides,
});
const ownershipOwner = (id, boundElements) =>
	semanticNode(id, { id: `${id}-body`, x: 0, y: 0, width: 100, height: 100, boundElements });
/** @type {Array<[string, object[], string | null, boolean]>} */
const labelOwnershipCases = [
	[
		"forward-only",
		[ownershipOwner("owner", []), ownershipLabel({ containerId: "owner-body" })],
		"owner",
		false,
	],
	[
		"reverse-only",
		[ownershipOwner("owner", [{ id: "ownership-label", type: "text" }]), ownershipLabel()],
		"owner",
		false,
	],
	[
		"matching",
		[
			ownershipOwner("owner", [{ id: "ownership-label", type: "text" }]),
			ownershipLabel({ containerId: "owner-body" }),
		],
		"owner",
		false,
	],
	[
		"conflicting",
		[
			ownershipOwner("owner", [{ id: "ownership-label", type: "text" }]),
			ownershipOwner("other-owner", [{ id: "ownership-label", type: "text" }]),
			ownershipLabel({ containerId: "owner-body" }),
		],
		null,
		true,
	],
];
for (const [label, ownershipElements, resolvedOwner, indeterminate] of labelOwnershipCases) {
	const report = inspectBoard([...ownershipElements, ownershipNode("unrelated", 50)]);
	check(
		`${label} label ownership drives the same overlap exclusions and diagnostics`,
		(indeterminate ? report.coverage === "indeterminate" : true) &&
			!report.findings.some(
				(finding) =>
					finding.code === "LABEL_OVERLAP" &&
					["owner", "other-owner"].includes(finding.details.nodeId),
			) &&
			report.findings.some(
				(finding) =>
					finding.code === "LABEL_OVERLAP" &&
					finding.details.nodeId === "unrelated" &&
					finding.details.labelId === "ownership-label",
			) &&
			(resolvedOwner === null ||
				report.findings.some(
					(finding) => finding.reason === "missing-reciprocal" || label === "matching",
				)),
	);
}

const reverseOnlyAncestor = inspectBoard([
	semanticNode("zone", { id: "zone-body", x: 0, y: 0, width: 200, height: 200 }),
	semanticNode("owner", {
		id: "owner-body",
		x: 20,
		y: 20,
		width: 80,
		height: 80,
		boundElements: [{ id: "ancestor-label", type: "text" }],
	}),
	{
		id: "ancestor-label",
		type: "text",
		x: 90,
		y: 40,
		width: 30,
		height: 20,
		fontFamily: 5,
		text: "reverse",
	},
]);
check(
	"reverse-only ownership excludes its owner and transitive zone ancestors",
	!reverseOnlyAncestor.findings.some(
		(finding) =>
			finding.code === "LABEL_OVERLAP" && ["owner", "zone"].includes(finding.details.nodeId),
	),
);

const blockedReverseOwnership = inspectBoard([
	ownershipOwner("owner", [{ id: "blocked-reverse-label", type: "text" }, { id: "broken-entry" }]),
	ownershipLabel({ id: "blocked-reverse-label" }),
	ownershipNode("unrelated", 50),
]);
check(
	"partially malformed reverse references block the shared label ownership classifier",
	blockedReverseOwnership.coverage === "indeterminate" &&
		blockedReverseOwnership.findings.some(
			(finding) => finding.reason === "malformed-bound-elements" && finding.affectsCoverage,
		) &&
		!blockedReverseOwnership.findings.some(
			(finding) =>
				finding.code === "LABEL_OVERLAP" && finding.details.labelId === "blocked-reverse-label",
		),
);

const totalityIdentityStates = [
	["valid", "valid"],
	["missing", undefined],
	["empty", ""],
	["non-string", 42],
];
const totalityCoordinateStates = [
	["finite", { x: 0, y: 5, width: 100, height: 0 }, false, true],
	["nan-x", { x: Number.NaN, y: 5, width: 100, height: 0 }, true, false],
	[
		"positive-infinity-x",
		{ x: Number.POSITIVE_INFINITY, y: 5, width: 100, height: 0 },
		true,
		false,
	],
	[
		"negative-infinity-y",
		{ x: 0, y: Number.NEGATIVE_INFINITY, width: 100, height: 0 },
		true,
		false,
	],
	[
		"overflowed-stored-extent",
		{ x: Number.MAX_VALUE, y: 5, width: Number.MAX_VALUE, height: 0 },
		true,
		true,
	],
];
const totalityPathStates = [
	[
		"valid",
		[
			[0, 0],
			[100, 0],
		],
		false,
	],
	["missing", undefined, true],
	[
		"malformed",
		[
			[0, 0],
			["bad", 0],
		],
		true,
	],
	[
		"overflow",
		[
			[0, 0],
			[Number.MAX_VALUE, 0],
		],
		true,
	],
];
const totalityEndpointStates = [
	["absent", undefined, false],
	["readable", { elementId: "candidate", focus: 0, gap: 0 }, false],
	["not-object", "bad", true],
	["empty-id", { elementId: "", focus: 0, gap: 0 }, true],
];
const totalityOwnershipStates = [
	"matching",
	"forward-only",
	"reverse-only",
	"conflicting",
	"malformed",
];
const totalityTargetStates = ["matching", "mismatch", "missing", "unknown"];
let totalityCaseIndex = 0;
for (const [identityLabel, rawId] of totalityIdentityStates)
	for (const [
		coordinateLabel,
		coordinates,
		coordinateIndeterminate,
		locatableOrigin,
	] of totalityCoordinateStates)
		for (const [pathLabel, rawPoints, pathIndeterminate] of totalityPathStates) {
			const caseId = `totality-${totalityCaseIndex}`;
			const [endpointLabel, endpointBinding, endpointBlocked] =
				totalityEndpointStates[totalityCaseIndex % totalityEndpointStates.length];
			const ownershipState =
				totalityOwnershipStates[
					Math.floor(totalityCaseIndex / totalityEndpointStates.length) %
						totalityOwnershipStates.length
				];
			const targetState =
				totalityTargetStates[
					Math.floor(
						totalityCaseIndex / (totalityEndpointStates.length * totalityOwnershipStates.length),
					) % totalityTargetStates.length
				];
			const connectorId = `${caseId}-edge`;
			const candidateId = `${caseId}-candidate`;
			const edge = {
				type: "arrow",
				...coordinates,
				angle: 0,
				...(rawPoints === undefined ? {} : { points: rawPoints }),
				...(endpointBinding === undefined ? {} : { startBinding: endpointBinding }),
			};
			if (identityLabel === "valid") edge.id = connectorId;
			else if (identityLabel !== "missing") edge.id = rawId;
			if (endpointLabel === "readable")
				edge.startBinding = { ...endpointBinding, elementId: candidateId };

			const labelId = `${caseId}-label`;
			const ownerAId = `${caseId}-owner-a`;
			const ownerBId = `${caseId}-owner-b`;
			const ownerARefs =
				ownershipState === "matching" ||
				ownershipState === "reverse-only" ||
				ownershipState === "conflicting" ||
				ownershipState === "malformed"
					? [{ id: labelId, type: "text" }]
					: [];
			const ownerBRefs = ownershipState === "conflicting" ? [{ id: labelId, type: "text" }] : [];
			const labelContainerId =
				ownershipState === "matching" ||
				ownershipState === "forward-only" ||
				ownershipState === "conflicting"
					? `${ownerAId}-body`
					: ownershipState === "malformed"
						? false
						: undefined;

			const targetId = `${caseId}-bound-target`;
			const referenceOwner = semanticNode(`${caseId}-reference-owner`, {
				id: `${caseId}-reference-owner-body`,
				x: 400,
				y: 200,
				boundElements: [{ id: targetId, type: "text" }],
			});
			const boundTarget =
				targetState === "missing"
					? []
					: [
							targetState === "matching"
								? {
										id: targetId,
										type: "text",
										x: 410,
										y: 210,
										width: 20,
										height: 10,
										fontFamily: 5,
										text: "target",
									}
								: targetState === "mismatch"
									? { id: targetId, type: "rectangle", x: 410, y: 210, width: 20, height: 10 }
									: { id: targetId, type: "future-target", x: 410, y: 210, width: 20, height: 10 },
						];
			const elements = [
				edge,
				semanticNode(candidateId, { x: 40, y: 0 }),
				ownershipOwner(ownerAId, ownerARefs),
				ownershipOwner(ownerBId, ownerBRefs),
				ownershipLabel({
					id: labelId,
					...(labelContainerId === undefined ? {} : { containerId: labelContainerId }),
				}),
				ownershipNode(`${caseId}-unrelated`, 50),
				referenceOwner,
				...boundTarget,
			];
			let report;
			let failure;
			try {
				report = inspectBoard(elements);
			} catch (error) {
				failure = error;
			}
			const identityInvalid = identityLabel !== "valid";
			const ownershipIndeterminate =
				ownershipState === "conflicting" || ownershipState === "malformed";
			const targetIndeterminate = targetState === "mismatch" || targetState === "unknown";
			const prerequisiteSkipped =
				identityInvalid ||
				coordinateIndeterminate ||
				pathIndeterminate ||
				endpointBlocked ||
				ownershipIndeterminate ||
				targetIndeterminate;
			const connectorGeometryEligible = !identityInvalid && locatableOrigin && !pathIndeterminate;
			check(
				`totality matrix ${totalityCaseIndex}: ${String(identityLabel)}/${String(coordinateLabel)}/${String(pathLabel)}/${String(endpointLabel)}/${ownershipState}/${targetState}`,
				!failure &&
					InspectionReportSchema.safeParse(report).success &&
					(!prerequisiteSkipped || report.coverage === "indeterminate") &&
					(connectorGeometryEligible ||
						!report.findings.some(
							(finding) =>
								supportedConnectorResultCodes.has(finding.code) &&
								findingUsesConnector(finding, connectorId),
						)) &&
					(!endpointBlocked ||
						!report.findings.some(
							(finding) =>
								finding.code === "CONNECTOR_PENETRATES_NODE" &&
								finding.details.connectorId === connectorId,
						)) &&
					(ownershipState !== "malformed" ||
						!report.findings.some(
							(finding) => finding.code === "LABEL_OVERLAP" && finding.details.labelId === labelId,
						)) &&
					(ownershipState !== "conflicting" ||
						!report.findings.some(
							(finding) =>
								finding.code === "LABEL_OVERLAP" &&
								finding.details.labelId === labelId &&
								[ownerAId, ownerBId].includes(finding.details.nodeId),
						)),
				failure instanceof Error ? failure.message : "",
			);
			totalityCaseIndex += 1;
		}
check("totality matrix stays deliberately bounded", totalityCaseIndex === 80);

const nonLeafZoneLabelOverlap = inspectBoard([
	semanticNode("zone", { id: "zone-body", x: 0, y: 0, width: 200, height: 200 }),
	semanticNode("zone-child", { id: "zone-child-body", x: 20, y: 20, width: 30, height: 30 }),
	semanticNode("label-owner", {
		id: "label-owner-body",
		x: 220,
		y: 40,
		width: 100,
		height: 60,
		boundElements: [{ id: "zone-overlap-label", type: "text" }],
	}),
	{
		id: "zone-overlap-label",
		type: "text",
		containerId: "label-owner-body",
		x: 180,
		y: 55,
		width: 50,
		height: 20,
		fontFamily: 5,
		text: "other label",
	},
]);
check(
	"an unrelated label overlapping only a non-leaf zone is reported",
	nonLeafZoneLabelOverlap.findings.some(
		(finding) =>
			finding.code === "LABEL_OVERLAP" &&
			finding.reason === "label-node-overlap" &&
			finding.details.labelId === "zone-overlap-label" &&
			finding.details.nodeId === "zone",
	),
);

const validLibraryBody = (id, x = 0, groupIds = []) => ({
	id,
	type: "rectangle",
	x,
	y: 0,
	width: 10,
	height: 10,
	angle: 0,
	groupIds,
	customData: { library: { itemId: `item-${id}`, source: "catalogue" } },
});
const through = connector({
	id: "through",
	x: -10,
	y: 5,
	width: 60,
	height: 0,
	points: [
		[0, 0],
		[60, 0],
	],
});
const obstaclePenetrations = (elements) =>
	inspectBoard([through, ...elements]).findings.filter(
		(finding) => finding.code === "CONNECTOR_PENETRATES_OBSTACLE",
	);
const singletonObstacle = obstaclePenetrations([validLibraryBody("body")]);
check(
	"library-attributed singleton is a closed obstacle",
	singletonObstacle[0]?.obstacles[0]?.kind === "library-component" &&
		JSON.stringify(singletonObstacle[0].obstacles[0].elementIds) === JSON.stringify(["body"]),
);
const groupedObstacle = obstaclePenetrations([
	{ ...validLibraryBody("b", 20, ["g"]), customData: undefined },
	{ ...validLibraryBody("a", 0, ["g"]), customData: undefined },
]);
check(
	"qualifying multi-body group is one stable obstacle",
	groupedObstacle.length === 1 &&
		groupedObstacle[0].obstacles[0]?.kind === "grouped-component" &&
		groupedObstacle[0].obstacles[0]?.id === "obstacle:a,b" &&
		JSON.stringify(groupedObstacle[0].obstacles[0]?.elementIds) === JSON.stringify(["a", "b"]),
);
/** @type {Array<[string, string[], string]>} */
const obstacleIdentityCases = [
	["comma", ["id,part", "plain"], "obstacle:id\\,part,plain"],
	["backslash", ["id\\part", "plain"], "obstacle:id\\\\part,plain"],
	["combined", ["id\\,part", "plain"], "obstacle:id\\\\\\,part,plain"],
	["control", ["id\0part", "plain"], "obstacle:id\0part,plain"],
	["other-control", ["id\u001fpart", "plain"], "obstacle:id\u001fpart,plain"],
	["lone-surrogate", ["\ud800", "plain"], "obstacle:plain,\ud800"],
	["empty-looking-prefix", [",", "\\"], "obstacle:\\,,\\\\"],
];
for (const [label, ids, expected] of obstacleIdentityCases) {
	const forward = obstaclePenetrations(
		ids.map((id, index) =>
			Object.assign(validLibraryBody(id, index * 20, ["identity-group"]), {
				customData: undefined,
			}),
		),
	)[0]?.obstacles[0];
	const reversed = obstaclePenetrations(
		ids.toReversed().map((id, index) =>
			Object.assign(validLibraryBody(id, index * 20, ["identity-group"]), {
				customData: undefined,
			}),
		),
	)[0]?.obstacles[0];
	check(
		`obstacle identity ${label} obeys the schema-v1 escaping grammar`,
		forward?.id === expected &&
			reversed?.id === expected &&
			ObstacleRefSchema.safeParse(forward).success,
		`${forward?.id} versus ${expected}`,
	);
}
const formerlyCollidingObstacleA = obstaclePenetrations([
	{ ...validLibraryBody("a,b", 0, ["collision-a"]), customData: undefined },
	{ ...validLibraryBody("c", 20, ["collision-a"]), customData: undefined },
])[0]?.obstacles[0];
const formerlyCollidingObstacleB = obstaclePenetrations([
	{ ...validLibraryBody("a", 0, ["collision-b"]), customData: undefined },
	{ ...validLibraryBody("b,c", 20, ["collision-b"]), customData: undefined },
])[0]?.obstacles[0];
check(
	"escaped obstacle identity distinguishes formerly colliding comma joins",
	formerlyCollidingObstacleA?.id === "obstacle:a\\,b,c" &&
		formerlyCollidingObstacleB?.id === "obstacle:a,b\\,c" &&
		formerlyCollidingObstacleA.id !== formerlyCollidingObstacleB.id,
);
check(
	"obstacle schema rejects a prefix-only or mismatched identity",
	!ObstacleRefSchema.safeParse({ ...groupedObstacle[0].obstacles[0], id: "obstacle:a,b,c" })
		.success,
);
const canonicalObstacleRef = groupedObstacle[0].obstacles[0];
check(
	"obstacle schema requires canonical element, group, and library arrays",
	ObstacleRefSchema.safeParse(canonicalObstacleRef).success &&
		!ObstacleRefSchema.safeParse({
			...canonicalObstacleRef,
			elementIds: canonicalObstacleRef.elementIds.toReversed(),
		}).success &&
		!ObstacleRefSchema.safeParse({
			...canonicalObstacleRef,
			elementIds: [canonicalObstacleRef.elementIds[0], canonicalObstacleRef.elementIds[0]],
		}).success &&
		!ObstacleRefSchema.safeParse({ ...canonicalObstacleRef, groupIds: ["z", "a"] }).success &&
		!ObstacleRefSchema.safeParse({ ...canonicalObstacleRef, groupIds: ["g", "g"] }).success &&
		!ObstacleRefSchema.safeParse({
			...canonicalObstacleRef,
			library: [
				{ elementId: "z", item: "one" },
				{ elementId: "a", item: "two" },
			],
		}).success &&
		!ObstacleRefSchema.safeParse({
			...canonicalObstacleRef,
			library: [
				{ elementId: "a", item: "one" },
				{ elementId: "a", item: "two" },
			],
		}).success,
);
const canonicalLibraryObstacleRef = singletonObstacle[0].obstacles[0];
check(
	"obstacle schema enforces attribution membership and kind coherence",
	ObstacleRefSchema.safeParse(canonicalLibraryObstacleRef).success &&
		!ObstacleRefSchema.safeParse({
			...canonicalLibraryObstacleRef,
			library: [{ elementId: "not-a-member", item: "library-item" }],
		}).success &&
		!ObstacleRefSchema.safeParse({ ...canonicalLibraryObstacleRef, library: [] }).success &&
		!ObstacleRefSchema.safeParse({
			...canonicalObstacleRef,
			library: [{ elementId: canonicalObstacleRef.elementIds[0], item: "library-item" }],
		}).success &&
		!ObstacleRefSchema.safeParse({
			...canonicalObstacleRef,
			elementIds: [canonicalObstacleRef.elementIds[0]],
			id: `obstacle:${canonicalObstacleRef.elementIds[0]}`,
		}).success &&
		!ObstacleRefSchema.safeParse({ ...canonicalObstacleRef, groupIds: [] }).success,
);
check(
	"obstacle schema requires group evidence for every multi-element component and nonempty source",
	!ObstacleRefSchema.safeParse({
		...canonicalObstacleRef,
		kind: "library-component",
		groupIds: [],
		library: canonicalObstacleRef.elementIds.map((elementId) => ({
			elementId,
			item: `item-${elementId}`,
		})),
	}).success &&
		!ObstacleRefSchema.safeParse({
			...canonicalLibraryObstacleRef,
			library: [{ ...canonicalLibraryObstacleRef.library[0], source: "" }],
		}).success,
);
const transitiveGroupedObstacle = obstaclePenetrations([
	{ ...validLibraryBody("transitive-a"), customData: undefined, groupIds: ["group-a"] },
	{
		...validLibraryBody("transitive-b"),
		customData: undefined,
		x: 20,
		groupIds: ["group-a", "group-b"],
	},
	{
		...validLibraryBody("transitive-c"),
		customData: undefined,
		x: 40,
		groupIds: ["group-b"],
	},
	connector({ id: "transitive-edge", x: -10, y: 5, width: 80, height: 0 }),
]);
check(
	"multi-group transitivity produces one deterministic obstacle component",
	transitiveGroupedObstacle.some(
		(finding) =>
			finding.obstacles[0]?.id === "obstacle:transitive-a,transitive-b,transitive-c" &&
			JSON.stringify(finding.obstacles[0].groupIds) === JSON.stringify(["group-a", "group-b"]),
	),
);
for (const [label, elements] of [
	["plain shape", [{ ...validLibraryBody("plain"), customData: undefined, groupIds: [] }]],
	["group singleton", [{ ...validLibraryBody("single"), customData: undefined, groupIds: ["g"] }]],
	[
		"heading decoration group",
		[
			{
				id: "heading",
				type: "text",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				fontFamily: 5,
				text: "heading",
				groupIds: ["g"],
			},
			{
				id: "callout",
				type: "text",
				x: 20,
				y: 0,
				width: 10,
				height: 10,
				fontFamily: 5,
				text: "callout",
				groupIds: ["g"],
			},
		],
	],
	[
		"image",
		[
			{
				id: "image",
				type: "image",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				groupIds: ["g"],
				customData: { library: { itemId: "image" } },
			},
		],
	],
	[
		"freedraw",
		[
			{
				id: "free",
				type: "freedraw",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				groupIds: ["g"],
				customData: { library: { itemId: "free" } },
			},
		],
	],
	[
		"all-line stencil",
		[
			{
				id: "l1",
				type: "line",
				x: 0,
				y: 0,
				width: 10,
				height: 0,
				points: [
					[0, 0],
					[10, 0],
				],
				groupIds: ["g"],
			},
			{
				id: "l2",
				type: "line",
				x: 20,
				y: 0,
				width: 10,
				height: 0,
				points: [
					[0, 0],
					[10, 0],
				],
				groupIds: ["g"],
			},
		],
	],
	[
		"decoration-assisted body",
		[
			{ ...validLibraryBody("body", 0, ["g"]), customData: undefined },
			{
				id: "caption",
				type: "text",
				x: 20,
				y: 0,
				width: 10,
				height: 10,
				fontFamily: 5,
				text: "caption",
				groupIds: ["g"],
			},
		],
	],
])
	check(`${String(label)} is not a routing obstacle`, obstaclePenetrations(elements).length === 0);
const promotedGroup = obstaclePenetrations([
	semanticNode("a", { x: 0, groupIds: ["g"] }),
	semanticNode("b", { x: 20, groupIds: ["g"] }),
]);
check("a group containing promoted nodes does not become an obstacle", promotedGroup.length === 0);

const endpointNode = semanticNode("endpoint", {
	boundElements: [{ id: "bound-edge", type: "arrow" }],
});
const endpointEdge = connector({
	id: "bound-edge",
	x: -10,
	y: 5,
	width: 30,
	height: 0,
	points: [
		[0, 0],
		[30, 0],
	],
	startBinding: { elementId: "endpoint", focus: 0, gap: 0 },
});
check(
	"connector excludes its own endpoint node",
	!inspectBoard([endpointNode, endpointEdge]).findings.some(
		(finding) => finding.code === "CONNECTOR_PENETRATES_NODE",
	),
);
const nestedEndpoint = inspectBoard([
	semanticNode("outer", { x: 0, y: 0, width: 100, height: 100 }),
	semanticNode("middle", { x: 10, y: 10, width: 70, height: 70 }),
	semanticNode("endpoint", {
		x: 20,
		y: 20,
		width: 10,
		height: 10,
		boundElements: [{ id: "nested-edge", type: "arrow" }],
	}),
	connector({
		id: "nested-edge",
		x: -10,
		y: 25,
		width: 120,
		height: 0,
		points: [
			[0, 0],
			[120, 0],
		],
		startBinding: { elementId: "endpoint", focus: 0, gap: 0 },
	}),
]);
check(
	"nested endpoint excludes transitive containing zones",
	!nestedEndpoint.findings.some((finding) => finding.code === "CONNECTOR_PENETRATES_NODE"),
);
check(
	"equal-area semantic shapes do not invent a zone parent",
	inspectBoard([semanticNode("a"), semanticNode("b")]).findings.some(
		(finding) => finding.code === "NODE_OVERLAP",
	),
);
check(
	"multi-element union does not become a false zone boundary",
	inspectBoard([
		semanticNode("union", { id: "left", x: 0, width: 10 }),
		semanticNode("union", { id: "right", x: 30, width: 10 }),
		semanticNode("inside-gap", { x: 15, width: 10 }),
	]).findings.some((finding) => finding.code === "NODE_OVERLAP"),
);
check(
	"container-only boundary is not a routing obstacle",
	!inspectBoard([
		{ id: "frame", type: "frame", x: 0, y: 0, width: 100, height: 100, angle: 0 },
		semanticNode("inside", { x: 10, y: 10 }),
		connector({
			id: "frame-edge",
			x: -10,
			y: 90,
			width: 120,
			height: 0,
			points: [
				[0, 0],
				[120, 0],
			],
		}),
	]).findings.some((finding) => finding.code.includes("PENETRATES")),
);
const outsideLabelZone = inspectBoard([
	semanticNode("zone", {
		id: "zone-body",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		boundElements: [{ id: "zone-label", type: "text" }],
	}),
	{
		id: "zone-label",
		type: "text",
		containerId: "zone-body",
		x: 150,
		y: 40,
		width: 20,
		height: 10,
		fontFamily: 5,
		text: "zone",
	},
	semanticNode("outside-child", { x: 150, y: 40 }),
	connector({
		id: "zone-crossing",
		x: -10,
		y: 50,
		width: 120,
		height: 0,
		points: [
			[0, 0],
			[120, 0],
		],
	}),
]);
check(
	"a bound label outside a shape does not create a false zone boundary",
	outsideLabelZone.findings.some(
		(finding) => finding.code === "CONNECTOR_PENETRATES_NODE" && finding.details.nodeId === "zone",
	),
);
const promotedMultiMember = inspectBoard([
	semanticNode("multi", { id: "right", x: 20 }),
	semanticNode("multi", { id: "left", x: 0 }),
	connector({
		id: "multi-crossing",
		x: -10,
		y: 5,
		width: 50,
		height: 0,
		points: [
			[0, 0],
			[50, 0],
		],
	}),
]).findings.find(
	(finding) => finding.code === "CONNECTOR_PENETRATES_NODE" && finding.details.nodeId === "multi",
);
check(
	"promoted multi-element node exposes one sorted semantic identity",
	JSON.stringify(promotedMultiMember?.nodes[0]?.elementIds) === JSON.stringify(["left", "right"]),
);

const directReasonCases = [
	[
		"invalid-render-fields",
		() => inspectBoard([{ id: "bad", type: "rectangle", x: 0, y: 0, width: null, height: 10 }]),
	],
	[
		"unlocatable-record",
		() => inspectBoard([{ id: "bad", type: "rectangle", x: null, y: 0, width: 10, height: 10 }]),
	],
	[
		"width",
		() =>
			inspectBoard([
				connector({
					x: 0,
					y: 0,
					width: 10.6,
					height: 5,
					points: [
						[0, 0],
						[10, 5],
					],
				}),
			]),
	],
	[
		"height",
		() =>
			inspectBoard([
				connector({
					x: 0,
					y: 0,
					width: 10,
					height: 5.6,
					points: [
						[0, 0],
						[10, 5],
					],
				}),
			]),
	],
	[
		"width-and-height",
		() =>
			inspectBoard([
				connector({
					x: 0,
					y: 0,
					width: 10.6,
					height: 5.6,
					points: [
						[0, 0],
						[10, 5],
					],
				}),
			]),
	],
	["persisted-seed", () => inspectBoard([semanticNode("node", { label: { text: "spent" } })])],
	[
		"curve",
		() =>
			inspectBoard([
				connector({
					points: [
						[0, 0],
						[10, 0],
					],
					curveKind: "bezier",
				}),
			]),
	],
	[
		"rounded-or-elbowed",
		() =>
			inspectBoard([
				connector({
					points: [
						[0, 0],
						[10, 0],
					],
					roundness: { type: 2 },
				}),
			]),
	],
	[
		"collinear-overlap",
		() =>
			inspectBoard([
				connector({
					id: "a",
					x: 0,
					y: 0,
					width: 20,
					height: 0,
					points: [
						[0, 0],
						[20, 0],
					],
				}),
				connector({
					id: "b",
					x: 10,
					y: 0,
					width: 20,
					height: 0,
					points: [
						[0, 0],
						[20, 0],
					],
				}),
			]),
	],
	[
		"label-node-overlap",
		() =>
			inspectBoard([
				semanticNode("owner", {
					id: "owner",
					x: 0,
					y: 0,
					width: 10,
					height: 10,
					boundElements: [{ id: "owner-label", type: "text" }],
				}),
				{
					id: "owner-label",
					type: "text",
					containerId: "owner",
					x: 20,
					y: 0,
					width: 10,
					height: 10,
					fontFamily: 5,
					text: "owner",
				},
				semanticNode("other", { id: "other", x: 20, y: 0, width: 10, height: 10 }),
			]),
	],
	[
		"label-label-overlap",
		() =>
			inspectBoard([
				semanticNode("a", {
					id: "a",
					x: 0,
					y: 0,
					width: 10,
					height: 10,
					boundElements: [{ id: "la", type: "text" }],
				}),
				{
					id: "la",
					type: "text",
					containerId: "a",
					x: 20,
					y: 0,
					width: 10,
					height: 10,
					fontFamily: 5,
					text: "a",
				},
				semanticNode("b", {
					id: "b",
					x: 40,
					y: 0,
					width: 10,
					height: 10,
					boundElements: [{ id: "lb", type: "text" }],
				}),
				{
					id: "lb",
					type: "text",
					containerId: "b",
					x: 20,
					y: 0,
					width: 10,
					height: 10,
					fontFamily: 5,
					text: "b",
				},
			]),
	],
];
for (const [reason, produce] of directReasonCases) {
	const report = produce();
	check(
		`direct inspectBoard produces ${String(reason)}`,
		report.findings.some((finding) => finding.reason === reason) &&
			InspectionReportSchema.safeParse(report).success,
	);
}
const normalizedPolicyReport = inspectBoard([], { allowedFontFamilies: [8, 5, 8, 2] });
check(
	"policy normalization sorts and deduplicates persisted font families",
	JSON.stringify(normalizedPolicyReport.policy.allowedFontFamilies) === JSON.stringify([2, 5, 8]),
);
for (const invalidPolicy of [
	{ overlapTolerance: -1 },
	{ dimensionTolerance: Number.NaN },
	{ intersectionTolerance: Number.POSITIVE_INFINITY },
]) {
	let rejected = false;
	try {
		inspectBoard([], invalidPolicy);
	} catch {
		rejected = true;
	}
	check("pure inspector rejects an invalid policy before decoding", rejected);
}
const hostileInput = structuredClone(fixture("dense-after.excalidraw.json"));
const deepFreeze = (value) => {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const child of Object.values(value)) deepFreeze(child);
	return Object.freeze(value);
};
deepFreeze(hostileInput);
const hostileBytes = JSON.stringify(hostileInput);
const hostileFirst = inspectBoard(hostileInput);
check("deep-frozen dense input is not mutated", JSON.stringify(hostileInput) === hostileBytes);
const firstFindingMessage = hostileFirst.findings[0]?.message;
if (hostileFirst.findings[0]) hostileFirst.findings[0].message = "caller mutation";
check(
	"caller mutation of one report cannot affect the next report",
	inspectBoard(hostileInput).findings[0]?.message === firstFindingMessage,
);

const before = fixture("dense-before.excalidraw.json"),
	after = fixture("dense-after.excalidraw.json");
const beforeReport = inspectBoard(before),
	afterReport = inspectBoard(after);
const crossing = (report) =>
	report.findings.find(
		(finding) =>
			finding.code === "CONNECTOR_INTERSECTION_UNMARKED" &&
			new Set([finding.details.firstConnectorId, finding.details.secondConnectorId]).has("h") &&
			new Set([finding.details.firstConnectorId, finding.details.secondConnectorId]).has("v"),
	);
const first = crossing(beforeReport),
	second = crossing(afterReport);
check(
	"dense before fixture finds whole-board crossing",
	first?.points[0]?.x === 100 && first.points[0].y === 150,
);
check(
	"whole-board recheck finds moved crossing",
	second?.points[0]?.x === 300 && second.points[0].y === 150,
);
check(
	"new crossing is outside old focus box",
	!!first?.focusBBox &&
		!!second?.points[0] &&
		second.points[0].x > first.focusBBox.x + first.focusBBox.width,
);
const compareInput = (elements) => ({
	key: "dense",
	identity: { board: "dense", variant: "current" },
	elements,
	source: "vault",
});
const semantic = compareBoards(compareInput(before), compareInput(after));
check("route-only fixture edit is semantically identical", semantic.summary.identical === true);
check(
	"dense compare JSON is byte-pinned",
	JSON.stringify(semantic, null, 2) + "\n" ===
		fs.readFileSync(
			path.join(root, "scripts/fixtures/board-inspection/dense-compare.json"),
			"utf8",
		),
);

function performanceBoard(nodeCount, connectorCount, labelCount) {
	const nodes = Array.from({ length: nodeCount }, (_, index) => ({
		id: `n${index}`,
		type: "rectangle",
		x: 0,
		y: index * 20,
		width: 100,
		height: 10,
		angle: 0,
		customData: { archboard: { node: `node-${index}` } },
		boundElements: [],
	}));
	const labels = Array.from({ length: labelCount }, (_, index) => ({
		id: `t${index}`,
		type: "text",
		x: 20,
		y: index * 20,
		width: 10,
		height: 5,
		angle: 0,
		fontFamily: 5,
		text: `n${index}`,
		containerId: `n${index}`,
	}));
	const connectors = Array.from({ length: connectorCount }, (_, index) => {
		const start = index % nodeCount,
			end = (index + 1) % nodeCount;
		const edge = {
			id: `e${index}`,
			type: "arrow",
			x: 0,
			y: nodeCount * 30 + index,
			width: 100,
			height: 0,
			angle: 0,
			points: [
				[0, 0],
				[100, 0],
			],
			startBinding: { elementId: `n${start}`, focus: 0, gap: 0 },
			endBinding: { elementId: `n${end}`, focus: 0, gap: 0 },
		};
		nodes[start].boundElements.push({ id: edge.id, type: "arrow" });
		nodes[end].boundElements.push({ id: edge.id, type: "arrow" });
		return edge;
	});
	for (let index = 0; index < labelCount; index += 1)
		nodes[index].boundElements.push({ id: `t${index}`, type: "text" });
	return [...nodes, ...connectors, ...labels];
}
const below = inspectBoard(performanceBoard(400, 1200, 400));
check(
	"below-limit comparison count is exact",
	below.broadPhaseComparisons === 1_516_200,
	String(below.broadPhaseComparisons),
);
check(
	"below-limit coverage completes pair analysis",
	!below.findings.some((finding) => finding.code === "INSPECTION_LIMIT_EXCEEDED"),
);
const limited = inspectBoard(performanceBoard(500, 1500, 500));
check(
	"limit attempts comparison 2,000,001",
	limited.broadPhaseComparisons === 2_000_001,
	String(limited.broadPhaseComparisons),
);
check(
	"limit makes coverage indeterminate",
	limited.findings.some((finding) => finding.code === "INSPECTION_LIMIT_EXCEEDED") &&
		limited.coverage === "indeterminate",
);
const limitedWithUnrelatedExtremes = inspectBoard([
	...performanceBoard(500, 1500, 500),
	{
		id: "unrelated-negative-image",
		type: "image",
		x: -Number.MAX_VALUE,
		y: 0,
		width: 0,
		height: 0,
		angle: 0,
	},
	{
		id: "unrelated-positive-plain",
		type: "freedraw",
		x: Number.MAX_VALUE,
		y: 0,
		width: 0,
		height: 0,
		angle: 0,
	},
]);
const unrelatedLimit = limitedWithUnrelatedExtremes.findings.find(
	(finding) => finding.code === "INSPECTION_LIMIT_EXCEEDED",
);
check(
	"limit evidence contains only records participating in pair passes",
	!!unrelatedLimit &&
		!unrelatedLimit.elements.some(
			(element) =>
				element.id === "unrelated-negative-image" || element.id === "unrelated-positive-plain",
		) &&
		!limitedWithUnrelatedExtremes.findings.some(
			(finding) =>
				finding.reason === "unrepresentable-coordinate-span" &&
				finding.details.scope === "finding-affected-union" &&
				finding.elements.some((element) => element.id?.startsWith("unrelated-")),
		),
);
const limitWithExtremeSpan = performanceBoard(500, 1500, 500);
limitWithExtremeSpan[0].x = -Number.MAX_VALUE;
limitWithExtremeSpan[0].width = 0;
limitWithExtremeSpan[1].x = Number.MAX_VALUE;
limitWithExtremeSpan[1].width = 0;
const limitedExtreme = inspectBoard(limitWithExtremeSpan);
check(
	"the 2,000,001 limit retains refs and reports its unrepresentable input span",
	limitedExtreme.broadPhaseComparisons === 2_000_001 &&
		limitedExtreme.findings.some(
			(finding) =>
				finding.code === "INSPECTION_LIMIT_EXCEEDED" &&
				finding.elements.length === limitWithExtremeSpan.length &&
				finding.affectedBBox !== null &&
				finding.focusBBox === null,
		) &&
		limitedExtreme.findings.some(
			(finding) =>
				finding.reason === "unrepresentable-coordinate-span" &&
				finding.details.scope === "finding-affected-union",
		) &&
		limitedExtreme.findings.some(
			(finding) =>
				finding.reason === "unrepresentable-focus-padding" &&
				finding.elements.length === limitWithExtremeSpan.length,
		),
);

const preprocessingLimitId = `preprocessing-${"x".repeat(6_300_000)}`;
const preprocessingLimitBoard = [
	connector({
		id: preprocessingLimitId,
		angle: 0,
		width: 1,
		height: 0,
		points: [
			[0, 0],
			[1, 0],
		],
	}),
];
const preprocessingLimited = inspectBoard(preprocessingLimitBoard);
const preprocessingLimitFinding = preprocessingLimited.findings.find(
	(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
);
check(
	"direct inspection stops preprocessing at the exact ceiling without executing pair work",
	InspectionReportSchema.safeParse(preprocessingLimited).success &&
		preprocessingLimited.broadPhaseComparisons === 0 &&
		preprocessingLimited.limits.broadPhasePreprocessingSteps === 25_000_000 &&
		preprocessingLimitFinding?.details.limit === 25_000_000 &&
		preprocessingLimitFinding?.details.attempted === 25_000_001 &&
		preprocessingLimitFinding?.details.completedBroadPhaseComparisons === 0 &&
		preprocessingLimitFinding?.elements[0]?.id === preprocessingLimitId &&
		preprocessingLimitFinding.points.length === 0 &&
		preprocessingLimited.coverage === "indeterminate",
	preprocessingLimitFinding
		? JSON.stringify({ details: preprocessingLimitFinding.details })
		: "missing limit finding",
);
check(
	"preprocessing-limit reports are byte deterministic and expose no private step count",
	JSON.stringify(preprocessingLimited) === JSON.stringify(inspectBoard(preprocessingLimitBoard)) &&
		!("broadPhasePreprocessingSteps" in preprocessingLimited) &&
		!("preprocessingWork" in preprocessingLimited),
);

const lateCollisionLimitBoard = (count) => [
	semanticNode("late-limit-node", {
		id: "late-limit-node-body",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
	}),
	...Array.from({ length: count }, (_, index) =>
		connector({
			id: `late-limit-${String(index).padStart(5, "0")}`,
			x: index === 0 ? -5 : 100 + index * 21,
			y: 5,
			width: 20,
			height: 0,
			angle: 0,
			points: [
				[0, 0],
				[20, 0],
			],
		}),
	),
];
const assertLateCollisionLimit = (label, count, phase) => {
	const board = lateCollisionLimitBoard(count);
	const report = inspectBoard(board);
	const diagnostics = inspectBoardDiagnostics(board);
	const penetration = report.findings.find(
		(finding) => finding.reason === "leaf-footprint-interior",
	);
	const limit = report.findings.find(
		(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
	);
	check(
		`${label} preserves completed collision findings, comparisons, and diagnostics`,
		InspectionReportSchema.safeParse(report).success &&
			report.coverage === "indeterminate" &&
			report.broadPhaseComparisons === 1 &&
			penetration?.details.connectorId === "late-limit-00000" &&
			limit?.details.pass === "connector-intersection" &&
			limit?.details.phase === phase &&
			limit?.details.completedBroadPhaseComparisons === 1 &&
			limit.elements.length === count + 1 &&
			limit.elements.some((element) => element.id === "late-limit-node-body") &&
			limit.elements.some(
				(element) => element.id === `late-limit-${String(count - 1).padStart(5, "0")}`,
			) &&
			JSON.stringify(report.findings.map((finding) => finding.reason)) ===
				JSON.stringify(["leaf-footprint-interior", "broad-phase-preprocessing-ceiling"]) &&
			diagnostics.work.preprocessingSteps === 25_000_000 &&
			diagnostics.work.broadPhaseEvents > 0 &&
			diagnostics.work.broadPhaseCompatibleVisits === 1 &&
			JSON.stringify(diagnostics.report) === JSON.stringify(report),
		JSON.stringify({
			comparisons: report.broadPhaseComparisons,
			reasons: report.findings.map((finding) => finding.reason),
			limit: limit?.details,
			work: diagnostics.work,
		}),
	);
	return { board, report };
};
const lateCollisionActivation = assertLateCollisionLimit(
	"late activate-or-expire ceiling",
	36_000,
	"activate-or-expire",
);
const lateCollisionPrepare = assertLateCollisionLimit(
	"late prepare-events ceiling",
	44_000,
	"prepare-events",
);

const longLibraryIdentity = "library-" + "x".repeat(6_300_000);
const longLibraryBoard = [
	{
		id: longLibraryIdentity,
		type: "rectangle",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		angle: 0,
		customData: { library: { itemId: "long-identity" } },
	},
];
const longLibraryReport = inspectBoard(longLibraryBoard);
const longLibraryLimit = longLibraryReport.findings.find(
	(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
);
check(
	"long library identity stops before unbudgeted encoding work could execute",
	InspectionReportSchema.safeParse(longLibraryReport).success &&
		longLibraryReport.coverage === "indeterminate" &&
		longLibraryLimit?.details.attempted === 25_000_001 &&
		longLibraryLimit?.details.pass === "container-boundary" &&
		longLibraryLimit?.details.phase === "prepare-events" &&
		longLibraryLimit.elements[0]?.id === longLibraryIdentity,
);

const manyPathPoints = Array.from({ length: 750_000 }, (_, index) => [index, index % 2]);
let largeCardinalityReport;
let largeCardinalityFailure;
try {
	largeCardinalityReport = inspectBoard([
		connector({
			id: "large-cardinality-path",
			angle: 0,
			width: 1,
			height: 0,
			points: manyPathPoints,
		}),
	]);
} catch (error) {
	largeCardinalityFailure = error;
}
check(
	"large-cardinality supported path reaches iterative stale-dimension measurement",
	!largeCardinalityFailure &&
		InspectionReportSchema.safeParse(largeCardinalityReport).success &&
		largeCardinalityReport.findings.some(
			(finding) =>
				finding.code === "STALE_LINEAR_DIMENSIONS" &&
				finding.details.measuredWidth === 749_999 &&
				finding.details.measuredHeight === 1,
		),
	largeCardinalityFailure instanceof Error ? largeCardinalityFailure.message : "",
);

const repeatedPathPoints = Array.from({ length: 4_097 }, (_, index) => [Math.floor(index / 2), 0]);
const repeatedPathDiagnostics = inspectBoardDiagnostics([
	connector({
		id: "large-repeated-path",
		angle: 0,
		width: 2_048,
		height: 0,
		points: repeatedPathPoints,
	}),
]);
const repeatedPathReport = repeatedPathDiagnostics.report;
check(
	"zero-segment filtering performs one membership check per supported segment",
	repeatedPathDiagnostics.work.pathSegmentChecks === repeatedPathPoints.length - 1 &&
		repeatedPathReport.findings.filter(
			(finding) => finding.code === "AMBIGUOUS_GEOMETRY" && finding.reason === "zero-length",
		).length === 2_048 &&
		InspectionReportSchema.safeParse(repeatedPathReport).success,
);

function sparseSweepBoard(count) {
	return [
		...Array.from({ length: count }, (_, index) => ({
			id: `sparse-node-${index}`,
			type: "rectangle",
			x: index * 4,
			y: 0,
			width: 1,
			height: 1,
			angle: 0,
			customData: { archboard: { node: `sparse-node-${index}` } },
		})),
		...Array.from({ length: count }, (_, index) =>
			connector({
				id: `sparse-connector-${index}`,
				x: 1_000_000 + index * 4,
				y: 10,
				width: 1,
				height: 0,
				angle: 0,
				points: [
					[0, 0],
					[1, 0],
				],
			}),
		),
	];
}
const sparseSweepResults = [1_000, 2_000, 4_000, 8_000].map((count) => ({
	count,
	diagnostics: inspectBoardDiagnostics(sparseSweepBoard(count)),
}));
check(
	"sparse distinct partitions remove expired buckets and keep every indexed operation bounded",
	sparseSweepResults.every(({ count, diagnostics }) => {
		const preprocessingStopped = diagnostics.report.findings.some(
			(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
		);
		return (
			diagnostics.work.broadPhaseCompatibleVisits === 0 &&
			diagnostics.work.broadPhaseBucketScans === 0 &&
			diagnostics.work.broadPhaseBucketLookups === count * 34 - 11 &&
			diagnostics.work.broadPhaseBucketUpdates === count * 26 &&
			diagnostics.work.broadPhaseBucketDeletes === count * 26 - 21 &&
			diagnostics.work.broadPhaseCompatibilityIndexUpdates === count * 10 - 3 &&
			diagnostics.work.broadPhaseBucketIndexOperations === count * 86 - 32 &&
			diagnostics.work.broadPhaseExactQuerySteps === 0 &&
			diagnostics.work.broadPhasePeakRetainedTotalStateRefs <= count * 65 &&
			diagnostics.work.broadPhaseCompatibilityTests === 0 &&
			diagnostics.work.broadPhaseProfileTerminalLookups === diagnostics.work.broadPhaseEvents &&
			diagnostics.work.broadPhaseProfileCreations ===
				diagnostics.work.broadPhaseCompatibilityProfiles &&
			diagnostics.work.broadPhasePeakRetainedBuckets <= 1 &&
			diagnostics.work.broadPhasePeakRetainedProfiles <= 1 &&
			diagnostics.work.broadPhasePeakRetainedIndexRefs <= 5 &&
			diagnostics.work.broadPhaseEvents === count * 6 &&
			diagnostics.work.hierarchyEvents === count * 2 &&
			diagnostics.work.hierarchyCandidateVisits === 0 &&
			diagnostics.work.hierarchyBucketScans === 0 &&
			diagnostics.work.hierarchyBucketIndexOperations === count * 36 - 16 &&
			diagnostics.work.hierarchyExpiryPops <= count * 2 &&
			diagnostics.work.containerBoundaryCandidateVisits === 0 &&
			diagnostics.work.containerBoundaryBucketScans === 0 &&
			diagnostics.work.containerBoundaryPeakRetainedBuckets <= 1 &&
			!preprocessingStopped
		);
	}),
	JSON.stringify(sparseSweepResults.map(({ count, diagnostics }) => [count, diagnostics.work])),
);

const overlappingSingleConnector = (segmentCount) => [
	connector({
		id: `one-connector-${segmentCount}`,
		x: 0,
		y: 0,
		width: 1,
		height: segmentCount,
		angle: 0,
		points: Array.from({ length: segmentCount + 1 }, (_, index) => [index % 2, index]),
	}),
];
const singleConnectorDiagnostics = [1_000, 2_000, 4_000, 8_000].map((segmentCount) => ({
	segmentCount,
	diagnostics: inspectBoardDiagnostics(overlappingSingleConnector(segmentCount)),
}));
check(
	"one connector with densely overlapping x intervals never visits same-connector pairs",
	singleConnectorDiagnostics.every(
		({ segmentCount, diagnostics }) =>
			diagnostics.report.broadPhaseComparisons === 0 &&
			diagnostics.work.broadPhaseCompatibleVisits === 0 &&
			diagnostics.work.broadPhaseBucketScans <= segmentCount * 2 &&
			diagnostics.work.broadPhaseCompatibilityProfiles <= 3 &&
			diagnostics.work.pathSegmentChecks === segmentCount &&
			!diagnostics.report.findings.some(
				(finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED",
			),
	),
);
const denseDistinctConnectorCount = 1_000;
const denseDistinctConnectors = Array.from({ length: denseDistinctConnectorCount }, (_, index) =>
	connector({
		id: `dense-distinct-${index}`,
		x: 0,
		y: index * 2,
		width: 100,
		height: 0,
		points: [
			[0, 0],
			[100, 0],
		],
	}),
);
const denseDistinctDiagnostics = inspectBoardDiagnostics(denseDistinctConnectors);
check(
	"dense same-set distinct profiles enumerate each eligible pair once with linear retained state",
	denseDistinctDiagnostics.report.broadPhaseComparisons ===
		(denseDistinctConnectorCount * (denseDistinctConnectorCount - 1)) / 2 &&
		denseDistinctDiagnostics.work.broadPhaseCompatibleVisits ===
			(denseDistinctConnectorCount * (denseDistinctConnectorCount - 1)) / 2 &&
		denseDistinctDiagnostics.work.broadPhasePeakRetainedExclusionRefs <=
			denseDistinctConnectorCount &&
		denseDistinctDiagnostics.work.broadPhasePeakRetainedIndexRefs <=
			denseDistinctConnectorCount * 5 &&
		denseDistinctDiagnostics.report.clean,
	JSON.stringify(denseDistinctDiagnostics.work),
);

const endpointOnlyDiagnostics = inspectBoardDiagnostics([
	semanticNode("endpoint-left", {
		id: "endpoint-left-body",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		boundElements: [{ id: "endpoint-only-connector", type: "arrow" }],
	}),
	semanticNode("endpoint-right", {
		id: "endpoint-right-body",
		x: 90,
		y: 0,
		width: 10,
		height: 10,
		boundElements: [{ id: "endpoint-only-connector", type: "arrow" }],
	}),
	connector({
		id: "endpoint-only-connector",
		x: 0,
		y: 5,
		width: 100,
		height: 2_000,
		angle: 0,
		points: Array.from({ length: 2_001 }, (_, index) => [index % 2 ? 100 : 0, index]),
		startBinding: { elementId: "endpoint-left-body", focus: 0, gap: 0 },
		endBinding: { elementId: "endpoint-right-body", focus: 0, gap: 0 },
	}),
]);
check(
	"endpoint-only node candidates are excluded before pair visitation",
	endpointOnlyDiagnostics.report.broadPhaseComparisons === 0 &&
		endpointOnlyDiagnostics.work.broadPhaseCompatibleVisits === 0 &&
		!endpointOnlyDiagnostics.report.findings.some(
			(finding) => finding.code === "CONNECTOR_PENETRATES_NODE",
		),
);

const sameOwnerLabels = Array.from({ length: 256 }, (_, index) => ({
	id: `same-owner-label-${index}`,
	type: "text",
	x: 10,
	y: 10,
	width: 20,
	height: 10,
	angle: 0,
	fontFamily: 5,
	text: `${index}`,
	containerId: "same-owner-body",
}));
const sameOwnerDiagnostics = inspectBoardDiagnostics([
	semanticNode("same-owner-zone", {
		id: "same-owner-zone-body",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
	}),
	semanticNode("same-owner", {
		id: "same-owner-body",
		x: 5,
		y: 5,
		width: 50,
		height: 50,
		boundElements: sameOwnerLabels.map((label) => ({ id: label.id, type: "text" })),
	}),
	...sameOwnerLabels,
]);
check(
	"same-owner labels and their own or ancestor nodes are excluded before pair visitation",
	sameOwnerDiagnostics.report.broadPhaseComparisons === 0 &&
		sameOwnerDiagnostics.work.broadPhaseCompatibleVisits === 0 &&
		!sameOwnerDiagnostics.report.findings.some((finding) => finding.code === "LABEL_OVERLAP"),
);

function nestedOwnerLabelBoard(height, labelCount) {
	const labels = Array.from({ length: labelCount }, (_, index) => ({
		id: `deep-label-${height}-${index}`,
		type: "text",
		x: height * 2 + 1,
		y: height * 2 + 1,
		width: 2,
		height: 1,
		angle: 0,
		fontFamily: 5,
		text: `${index}`,
		containerId: `deep-owner-${height - 1}`,
	}));
	return [
		...Array.from({ length: height }, (_, index) =>
			semanticNode(`deep-owner-${index}`, {
				x: index * 2,
				y: index * 2,
				width: (height - index) * 10,
				height: (height - index) * 10,
				...(index === height - 1
					? { boundElements: labels.map((label) => ({ id: label.id, type: "text" })) }
					: {}),
			}),
		),
		...labels,
	];
}
const nestedOwnerLabelDiagnostics = [
	[8, 1_000],
	[16, 2_000],
	[32, 4_000],
	[64, 8_000],
].map(([height, labelCount]) => ({
	height,
	labelCount,
	diagnostics: inspectBoardDiagnostics(nestedOwnerLabelBoard(height, labelCount)),
}));
check(
	"own-plus-ancestor label exclusions reuse one compatibility profile with bounded A=0 work",
	nestedOwnerLabelDiagnostics.every(
		({ height, labelCount, diagnostics }) =>
			diagnostics.report.broadPhaseComparisons === 0 &&
			diagnostics.work.broadPhaseCompatibleVisits === 0 &&
			diagnostics.work.broadPhaseBucketScans <= (height + labelCount) * 3 &&
			diagnostics.work.broadPhaseBucketIndexOperations <= (height + labelCount) * 20 &&
			diagnostics.work.broadPhaseCompatibilityProfiles <= 5 &&
			!diagnostics.report.findings.some((finding) => finding.code === "LABEL_OVERLAP"),
	),
	JSON.stringify(
		nestedOwnerLabelDiagnostics.map(({ height, labelCount, diagnostics }) => [
			height,
			labelCount,
			diagnostics.work,
		]),
	),
);

function partialComplementLabelBoard(count) {
	const labels = Array.from({ length: count }, (_, index) => ({
		id: `partial-label-${count}-${index}`,
		type: "text",
		x: count + 1,
		y: count + 1 + index * 2,
		width: 1,
		height: 1,
		angle: 0,
		fontFamily: 5,
		text: `${index}`,
		containerId: `partial-owner-${count - 1}`,
	}));
	return [
		...Array.from({ length: count }, (_, index) =>
			semanticNode(`partial-owner-${index}`, {
				x: index,
				y: index,
				width: (count - index) * 4,
				height: (count - index) * 4,
				...(index === count - 1
					? { boundElements: labels.map((label) => ({ id: label.id, type: "text" })) }
					: {}),
			}),
		),
		semanticNode(`partial-unrelated-${count}`, {
			x: count,
			y: count * 10,
			width: count * 2,
			height: 1,
		}),
		...labels,
	];
}
const partialComplementDiagnostics = [32, 64, 128, 256].map((count) => ({
	count,
	diagnostics: inspectBoardDiagnostics(partialComplementLabelBoard(count)),
}));
check(
	"two-sided hierarchy exclusions enumerate only the partial complement",
	partialComplementDiagnostics.every(
		({ count, diagnostics }) =>
			diagnostics.report.broadPhaseComparisons <= count + 1 &&
			diagnostics.work.broadPhaseBucketScans <= count * 4 &&
			diagnostics.work.broadPhaseCompatibilityTests <= count * 4,
	),
	JSON.stringify(
		partialComplementDiagnostics.map(({ count, diagnostics }) => [count, diagnostics.work]),
	),
);

function partialComplementSweep(count, reverse) {
	const parents = new Map();
	for (let index = 0; index < count; index += 1)
		parents.set(`chain-${index}`, index === 0 ? null : `chain-${index - 1}`);
	parents.set("unrelated", null);
	const labels = Array.from({ length: count }, (_, index) => ({
		id: `label-${index}`,
		min: reverse ? 0 : 1,
		max: 3,
		partition: `label-${index}`,
		ancestorTargets: [`chain-${count - 1}`],
	}));
	const nodes = [
		...Array.from({ length: count }, (_, index) => ({
			id: `node-${index}`,
			min: reverse ? 1 : 0,
			max: 3,
			partition: `chain-${index}`,
		})),
		{
			id: "node-unrelated",
			min: reverse ? 1 : 0,
			max: 3,
			partition: "unrelated",
		},
	];
	return diagnoseSweepCompatibility({
		left: labels,
		right: nodes,
		sameSet: false,
		hierarchyParents: parents,
	});
}
const partialComplementScaling = [1_000, 2_000, 4_000, 8_000].flatMap((count) =>
	[false, true].map((reverse) => ({
		count,
		reverse,
		diagnostics: partialComplementSweep(count, reverse),
	})),
);
check(
	"partial-complement hierarchy queries stay bounded in both event orientations",
	partialComplementScaling.every(
		({ count, diagnostics }) =>
			diagnostics.pairs.length === count &&
			diagnostics.work.activeVisits === count &&
			diagnostics.work.bucketScans === count &&
			diagnostics.work.compatibilityTests === count &&
			diagnostics.work.compatibilityQuerySteps <= count * 3 &&
			diagnostics.work.hierarchyMembershipTests <= count * 2 &&
			diagnostics.work.hierarchySubtreeSteps <= count * 50 &&
			diagnostics.work.peakRetainedBuckets === count * 2 + 1 &&
			diagnostics.work.peakRetainedProfiles <= count + 1 &&
			diagnostics.work.peakRetainedExclusionRefs <= count &&
			diagnostics.work.peakRetainedIndexRefs === count * 8 + 4 &&
			diagnostics.work.peakRetainedTotalStateRefs <= count * 82,
	),
	JSON.stringify(
		partialComplementScaling.map(({ count, reverse, diagnostics }) => [
			count,
			reverse,
			diagnostics.pairs.length,
			diagnostics.work,
		]),
	),
);

function distinctConflictingLabelBoard(height, labelCount) {
	const labels = Array.from({ length: labelCount }, (_, index) => ({
		id: `profile-label-${height}-${index}`,
		type: "text",
		x: height * 2 + 1,
		y: height * 2 + 1,
		width: 2,
		height: 1,
		angle: 0,
		fontFamily: 5,
		text: `${index}`,
		containerId: `a-common-owner-${height - 1}`,
	}));
	return [
		...Array.from({ length: height }, (_, index) =>
			semanticNode(`a-common-node-${index}`, {
				id: `a-common-owner-${index}`,
				x: index * 2,
				y: index * 2,
				width: (height - index) * 10,
				height: (height - index) * 10,
				...(index === height - 1
					? { boundElements: labels.map((label) => ({ id: label.id, type: "text" })) }
					: {}),
			}),
		),
		...labels.map((label, index) =>
			semanticNode(`z-reverse-node-${index}`, {
				id: `z-reverse-owner-${index}`,
				x: 1_000_000 + index * 4,
				y: 0,
				width: 1,
				height: 1,
				boundElements: [{ id: label.id, type: "text" }],
			}),
		),
		...labels,
	];
}
const distinctConflictingDiagnostics = [
	[8, 1_000],
	[16, 2_000],
	[32, 4_000],
	[64, 8_000],
].map(([height, labelCount]) => ({
	height,
	labelCount,
	diagnostics: inspectBoardDiagnostics(distinctConflictingLabelBoard(height, labelCount)),
}));
check(
	"distinct conflicting label profiles keep shared-ancestor A=0 work and state linear",
	distinctConflictingDiagnostics
		.slice(0, 3)
		.every(
			({ height, labelCount, diagnostics }) =>
				diagnostics.report.broadPhaseComparisons === 0 &&
				diagnostics.work.broadPhaseCompatibleVisits === 0 &&
				diagnostics.work.broadPhaseBucketScans === 0 &&
				diagnostics.work.broadPhaseCompatibilityTests === 0 &&
				diagnostics.work.broadPhaseProfileSnapshotEntries === labelCount * 2 + 1 &&
				diagnostics.work.broadPhaseProfileTrieSteps === labelCount * 2 + 1 &&
				diagnostics.work.broadPhaseProfileSortComparisons === labelCount &&
				diagnostics.work.broadPhaseProfileTerminalLookups === diagnostics.work.broadPhaseEvents &&
				diagnostics.work.broadPhaseProfileCreations ===
					diagnostics.work.broadPhaseCompatibilityProfiles &&
				diagnostics.work.broadPhaseHierarchyPathQueries === labelCount &&
				diagnostics.work.broadPhaseHierarchyPathSteps <=
					labelCount * (Math.ceil(Math.log2(height + labelCount)) + 1) &&
				diagnostics.work.broadPhaseHierarchySubtreeQueries === 0 &&
				diagnostics.work.broadPhaseHierarchySubtreeSteps === 0 &&
				diagnostics.work.broadPhasePeakRetainedBuckets === labelCount + height &&
				diagnostics.work.broadPhasePeakRetainedProfiles === labelCount + 1 &&
				diagnostics.work.broadPhasePeakRetainedProfileTrieNodes <= labelCount * 3 + height * 4 &&
				diagnostics.work.broadPhasePeakRetainedHierarchyIndexCells <=
					(labelCount + height) * 25 + 2 &&
				diagnostics.work.broadPhasePeakRetainedExclusionRefs === labelCount * 2 &&
				diagnostics.work.broadPhasePeakRetainedIndexRefs === labelCount * 5 + height * 4 &&
				diagnostics.work.broadPhasePeakRetainedTotalStateRefs <= (labelCount + height) * 82 &&
				!diagnostics.report.findings.some((finding) => finding.code === "LABEL_OVERLAP"),
		) &&
		distinctConflictingDiagnostics[3].diagnostics.report.findings.some(
			(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
		) &&
		distinctConflictingDiagnostics[3].diagnostics.work.preprocessingSteps === 25_000_000 &&
		distinctConflictingDiagnostics[3].diagnostics.work.broadPhaseCompatibleVisits === 0 &&
		distinctConflictingDiagnostics[3].diagnostics.work.broadPhaseBucketScans === 0 &&
		distinctConflictingDiagnostics[3].diagnostics.work.broadPhasePeakRetainedTotalStateRefs <=
			(8_000 + 64) * 82,
	JSON.stringify(
		distinctConflictingDiagnostics.map(({ height, labelCount, diagnostics }) => [
			height,
			labelCount,
			diagnostics.work,
		]),
	),
);

function sparseContainerBoundaryBoard(count) {
	return [
		...Array.from({ length: count }, (_, index) =>
			semanticNode(`sparse-container-node-${index}`, {
				x: index * 4,
				y: 20_000,
				width: 1,
				height: 1,
			}),
		),
		...Array.from({ length: count }, (_, index) => ({
			id: `sparse-container-boundary-${index}`,
			type: "rectangle",
			x: 1_000_000 + index * 4,
			y: 20_000,
			width: 1,
			height: 1,
			angle: 0,
		})),
	];
}
const sparseContainerDiagnostics = [1_000, 2_000, 4_000].map((count) => ({
	count,
	diagnostics: inspectBoardDiagnostics(sparseContainerBoundaryBoard(count)),
}));
check(
	"unpromoted boundary classification uses a bounded spatial sweep",
	sparseContainerDiagnostics.every(
		({ count, diagnostics }) =>
			diagnostics.work.containerBoundaryEvents === count * 2 &&
			diagnostics.work.containerBoundaryCandidateVisits === 0 &&
			diagnostics.work.containerBoundaryBucketScans === 0 &&
			diagnostics.work.containerBoundaryPeakRetainedBuckets <= 1 &&
			diagnostics.work.containerBoundaryPeakRetainedIndexRefs <= 4,
	),
	JSON.stringify(
		sparseContainerDiagnostics.map(({ count, diagnostics }) => [count, diagnostics.work]),
	),
);
const denseHierarchyCount = 256;
const denseHierarchyBoard = Array.from({ length: denseHierarchyCount }, (_, index) =>
	semanticNode(`dense-hierarchy-${index}`, {
		x: index,
		y: index,
		width: (denseHierarchyCount - index) * 4,
		height: (denseHierarchyCount - index) * 4,
	}),
);
const denseHierarchyDiagnostics = inspectBoardDiagnostics(denseHierarchyBoard);
check(
	"dense hierarchy retains only one exact best parent per child",
	denseHierarchyDiagnostics.work.hierarchyCandidateVisits ===
		denseHierarchyCount * (denseHierarchyCount - 1) &&
		denseHierarchyDiagnostics.work.hierarchyPeakRetainedSelections === denseHierarchyCount - 1 &&
		denseHierarchyDiagnostics.work.hierarchyPeakRetainedSelections <= denseHierarchyCount,
	JSON.stringify(denseHierarchyDiagnostics.work),
);

const controlPartitionElements = [
	semanticNode("cn-b\0cn-c", {
		id: "cn-target-body",
		x: 40,
		y: 0,
		width: 20,
		height: 40,
		boundElements: [{ id: "cn-a", type: "arrow" }],
	}),
	semanticNode("cn-c", {
		id: "cn-end-body",
		x: -30,
		y: 60,
		boundElements: [
			{ id: "cn-a\0cn-b", type: "arrow" },
			{ id: "cn-renamed-control", type: "arrow" },
		],
	}),
	connector({
		id: "cn-a",
		x: 0,
		y: 10,
		width: 100,
		height: 0,
		points: [
			[0, 0],
			[100, 0],
		],
		startBinding: { elementId: "cn-target-body", focus: 0, gap: 0 },
	}),
	connector({
		id: "cn-a\0cn-b",
		x: 1,
		y: 20,
		width: 99,
		height: 0,
		points: [
			[0, 0],
			[99, 0],
		],
		startBinding: { elementId: "cn-end-body", focus: 0, gap: 0 },
	}),
	connector({
		id: "cn-renamed-control",
		x: 2,
		y: 30,
		width: 98,
		height: 0,
		points: [
			[0, 0],
			[98, 0],
		],
		startBinding: { elementId: "cn-end-body", focus: 0, gap: 0 },
	}),
	semanticNode("ln-b\0ln-c", {
		id: "ln-target-body",
		x: 40,
		y: 150,
		width: 40,
		height: 40,
		boundElements: [{ id: "ln-a", type: "text" }],
	}),
	semanticNode("ln-c", {
		id: "ln-owner-body",
		x: -30,
		y: 220,
		boundElements: [{ id: "ln-a\0ln-b", type: "text" }],
	}),
	{
		id: "ln-a",
		type: "text",
		x: 0,
		y: 160,
		width: 70,
		height: 10,
		angle: 0,
		fontFamily: 5,
		text: "excluded",
		containerId: "ln-target-body",
	},
	{
		id: "ln-a\0ln-b",
		type: "text",
		x: 1,
		y: 170,
		width: 70,
		height: 10,
		angle: 0,
		fontFamily: 5,
		text: "eligible",
		containerId: "ln-owner-body",
	},
	semanticNode("ll-owner\0control", {
		id: "ll-owner-body",
		x: 200,
		y: 150,
		width: 100,
		height: 80,
		boundElements: [
			{ id: "ll-same-a\0control", type: "text" },
			{ id: "ll-same-b\0control", type: "text" },
		],
	}),
	...[
		["ll-same-a\0control", 190],
		["ll-same-b\0control", 191],
	].map(([id, x]) => ({
		id,
		type: "text",
		x,
		y: 170,
		width: 40,
		height: 10,
		angle: 0,
		fontFamily: 5,
		text: id,
		containerId: "ll-owner-body",
	})),
	semanticNode("ll-left\0control", {
		id: "ll-left-body",
		x: 180,
		y: 300,
		boundElements: [{ id: "ll-eligible-a\0control", type: "text" }],
	}),
	semanticNode("ll-right\0control", {
		id: "ll-right-body",
		x: 320,
		y: 300,
		boundElements: [{ id: "ll-eligible-b\0control", type: "text" }],
	}),
	...[
		["ll-eligible-a\0control", "ll-left-body"],
		["ll-eligible-b\0control", "ll-right-body"],
	].map(([id, containerId], index) => ({
		id,
		type: "text",
		x: 240 + index,
		y: 260,
		width: 40,
		height: 10,
		angle: 0,
		fontFamily: 5,
		text: id,
		containerId,
	})),
	connector({
		id: "ss-self\0control",
		x: 0,
		y: 400,
		width: 20,
		height: 20,
		points: [
			[0, 0],
			[20, 20],
			[0, 20],
			[20, 0],
		],
	}),
	connector({
		id: "ss-eligible-a\0control",
		x: 100,
		y: 400,
		width: 20,
		height: 20,
		points: [
			[0, 0],
			[20, 20],
		],
	}),
	connector({
		id: "ss-eligible-b\0control",
		x: 100,
		y: 400,
		width: 20,
		height: 20,
		points: [
			[0, 20],
			[20, 0],
		],
	}),
	semanticNode("node-a\0control", { x: 200, y: 400, width: 40, height: 40 }),
	semanticNode("node-b\0control", { x: 220, y: 420, width: 40, height: 40 }),
	semanticNode("node-zone\0control", { x: 320, y: 400, width: 100, height: 100 }),
	semanticNode("node-child\0control", { x: 340, y: 420, width: 20, height: 20 }),
];
const controlPartitionEvidence = (report) => {
	const hasConnectorNode = (connectorId, nodeId) =>
		report.findings.some(
			(finding) =>
				finding.code === "CONNECTOR_PENETRATES_NODE" &&
				finding.details.connectorId === connectorId &&
				finding.details.nodeId === nodeId,
		);
	const hasLabelNode = (labelId, nodeId) =>
		report.findings.some(
			(finding) =>
				finding.code === "LABEL_OVERLAP" &&
				finding.reason === "label-node-overlap" &&
				finding.details.labelId === labelId &&
				finding.details.nodeId === nodeId,
		);
	const hasIntersection = (firstId, secondId) =>
		report.findings.some(
			(finding) =>
				finding.code === "CONNECTOR_INTERSECTION_UNMARKED" &&
				new Set([finding.details.firstConnectorId, finding.details.secondConnectorId]).has(
					firstId,
				) &&
				new Set([finding.details.firstConnectorId, finding.details.secondConnectorId]).has(
					secondId,
				),
		);
	const hasLabelPair = (firstId, secondId) =>
		report.findings.some(
			(finding) =>
				finding.code === "LABEL_OVERLAP" &&
				finding.reason === "label-label-overlap" &&
				new Set([finding.details.firstLabelId, finding.details.secondLabelId]).has(firstId) &&
				new Set([finding.details.firstLabelId, finding.details.secondLabelId]).has(secondId),
		);
	const hasNodePair = (firstId, secondId) =>
		report.findings.some(
			(finding) =>
				finding.code === "NODE_OVERLAP" &&
				new Set([finding.details.firstNodeId, finding.details.secondNodeId]).has(firstId) &&
				new Set([finding.details.firstNodeId, finding.details.secondNodeId]).has(secondId),
		);
	return (
		hasConnectorNode("cn-a\0cn-b", "cn-b\0cn-c") &&
		hasConnectorNode("cn-renamed-control", "cn-b\0cn-c") &&
		!hasConnectorNode("cn-a", "cn-b\0cn-c") &&
		hasLabelNode("ln-a\0ln-b", "ln-b\0ln-c") &&
		!hasLabelNode("ln-a", "ln-b\0ln-c") &&
		hasIntersection("ss-eligible-a\0control", "ss-eligible-b\0control") &&
		!report.findings.some(
			(finding) =>
				finding.code === "CONNECTOR_INTERSECTION_UNMARKED" &&
				(finding.details.firstConnectorId === "ss-self\0control" ||
					finding.details.secondConnectorId === "ss-self\0control"),
		) &&
		hasLabelPair("ll-eligible-a\0control", "ll-eligible-b\0control") &&
		!hasLabelPair("ll-same-a\0control", "ll-same-b\0control") &&
		hasNodePair("node-a\0control", "node-b\0control") &&
		!hasNodePair("node-zone\0control", "node-child\0control")
	);
};
const controlPartitionReport = inspectBoard(controlPartitionElements);
check(
	"control-character partition identities preserve every eligible pair and semantic exclusion",
	InspectionReportSchema.safeParse(controlPartitionReport).success &&
		controlPartitionEvidence(controlPartitionReport),
);

const exactOrderIds = ["order-\ud800", "order-a", "order-\u0001", "order-\0"];
const exactOrderElements = exactOrderIds.map((id, index) => ({
	id,
	type: "text",
	x: index * 100,
	y: 520,
	width: 20,
	height: 10,
	angle: 0,
	fontFamily: 1,
	text: id,
}));
const exactOrderEvidence = (report) =>
	report.findings
		.filter(
			(finding) =>
				finding.code === "FONT_POLICY_VIOLATION" && finding.reason === "disallowed-font-family",
		)
		.map((finding) => finding.elements[0]?.id)
		.join("|") === ["order-\0", "order-\u0001", "order-a", "order-\ud800"].join("|");
const exactOrderForward = inspectBoard(exactOrderElements);
const exactOrderReverse = inspectBoard(exactOrderElements.toReversed());
check(
	"exact UTF-16 identity ordering is input-order independent for controls, prefixes, and lone surrogates",
	exactOrderEvidence(exactOrderForward) &&
		exactOrderEvidence(exactOrderReverse) &&
		JSON.stringify(inspectBoard(exactOrderElements)) === JSON.stringify(exactOrderForward),
);
const exactHierarchyElements = [
	semanticNode("hier-owner-\ud800", {
		id: "hier-body-\ud800",
		x: 600,
		y: 400,
		width: 100,
		height: 100,
	}),
	semanticNode("hier-owner-a", {
		id: "hier-body-a",
		x: 600,
		y: 400,
		width: 100,
		height: 100,
	}),
	semanticNode("hier-owner-\u0001", {
		id: "hier-body-\u0001",
		x: 600,
		y: 400,
		width: 100,
		height: 100,
	}),
	semanticNode("hier-owner-\0", {
		id: "hier-body-\0",
		x: 600,
		y: 400,
		width: 100,
		height: 100,
	}),
	semanticNode("hier-child", {
		id: "hier-child-body",
		x: 630,
		y: 430,
		width: 10,
		height: 10,
		boundElements: [{ id: "hier-edge", type: "arrow" }],
	}),
	connector({
		id: "hier-edge",
		x: 620,
		y: 435,
		width: 70,
		height: 0,
		points: [
			[0, 0],
			[70, 0],
		],
		startBinding: { elementId: "hier-child-body", focus: 0, gap: 0 },
	}),
];
const exactHierarchyEvidence = (report) => {
	const penetrated = new Set(
		report.findings
			.filter((finding) => finding.code === "CONNECTOR_PENETRATES_NODE")
			.map((finding) => finding.details.nodeId),
	);
	return (
		!penetrated.has("hier-owner-\0") &&
		penetrated.has("hier-owner-\u0001") &&
		penetrated.has("hier-owner-a") &&
		penetrated.has("hier-owner-\ud800")
	);
};
check(
	"equal-area hierarchy ties and ancestor exclusions use exact UTF-16 identity order",
	exactHierarchyEvidence(inspectBoard(exactHierarchyElements)) &&
		exactHierarchyEvidence(inspectBoard(exactHierarchyElements.toReversed())),
);

let sweepSeed = 0x119;
const randomUnit = () => (sweepSeed = (sweepSeed * 1_664_525 + 1_013_904_223) >>> 0) / 2 ** 32;
for (let sample = 0; sample < 8; sample += 1) {
	const intervals = Array.from({ length: 24 }, (_, index) => {
		const x = Math.floor(randomUnit() * 200) - 100;
		const delta = Math.floor(randomUnit() * 40) + 1;
		return { id: `oracle-${sample}-${index}`, x, min: x, max: x + delta, delta };
	});
	const report = inspectBoard(
		intervals.map((item) =>
			connector({
				id: item.id,
				x: item.x,
				y: Number(item.id.split("-").at(-1)) * 100,
				width: item.delta,
				height: 1,
				angle: 0,
				points: [
					[0, 0],
					[item.delta, 1],
				],
			}),
		),
	);
	let expected = 0;
	for (let left = 0; left < intervals.length; left += 1)
		for (let right = left + 1; right < intervals.length; right += 1)
			if (
				intervals[left].min <= intervals[right].max &&
				intervals[right].min <= intervals[left].max
			)
				expected += 1;
	check(
		`semantic sweep matches brute-force eligible x-overlap oracle ${sample}`,
		report.broadPhaseComparisons === expected,
		`${report.broadPhaseComparisons} versus ${expected}`,
	);
}

const exactUnionControl = diagnoseSweepCompatibility({
	left: [
		{
			id: "event\0control",
			min: 1,
			max: 2,
			partition: "event\0control",
			excludedPartitions: ["active,a", "active\\b"],
		},
	],
	right: [
		{ id: "blocked-comma", min: 0, max: 3, partition: "active,a" },
		{ id: "blocked-slash", min: 0, max: 3, partition: "active\\b" },
		{
			id: "blocked-reciprocal",
			min: 0,
			max: 3,
			partition: "active\u001fcontrol",
			excludedPartitions: ["event\0control"],
		},
		{ id: "eligible-control", min: 0, max: 3, partition: "eligible\ud800" },
	],
	sameSet: false,
});
function compactExactUnionSweep(count) {
	return diagnoseSweepCompatibility({
		left: Array.from({ length: count }, (_, index) => ({
			id: `compact-left-${index}`,
			min: 1,
			max: 3,
			partition: "compact-left",
			excludedPartitions: ["compact-right-block"],
		})),
		right: Array.from({ length: count }, (_, index) =>
			index < count / 2
				? {
						id: `compact-right-event-${index}`,
						min: 0,
						max: 3,
						partition: "compact-right-block",
						excludedPartitions: [`irrelevant-${index}`],
					}
				: {
						id: `compact-right-active-${index}`,
						min: 0,
						max: 3,
						partition: `compact-right-${index}`,
						excludedPartitions: ["compact-left"],
					},
		),
		sameSet: false,
	});
}
const compactExactUnionRed = compactExactUnionSweep(64);
check(
	"compact two-sided exact exclusions enumerate an empty complement without bucket scans",
	compactExactUnionRed.pairs.length === 0 &&
		compactExactUnionRed.work.bucketScans === 0 &&
		compactExactUnionRed.work.compatibilityTests === 0 &&
		compactExactUnionRed.work.compatibilityQuerySteps <= 256,
	JSON.stringify(compactExactUnionRed.work),
);
const compactExactUnionScaling = [1_000, 2_000, 4_000, 8_000].map((count) => ({
	count,
	diagnostics: compactExactUnionSweep(count),
}));
check(
	"compact arbitrary two-sided exact exclusions have output-sensitive work",
	compactExactUnionScaling.every(
		({ count, diagnostics }) =>
			diagnostics.pairs.length === 0 &&
			diagnostics.work.activeVisits === 0 &&
			diagnostics.work.bucketScans === 0 &&
			diagnostics.work.compatibilityTests === 0 &&
			diagnostics.work.exactQuerySteps <= count * (Math.ceil(Math.log2(count * 2)) + 15) &&
			diagnostics.work.exactMembershipTests <= count * (Math.ceil(Math.log2(count * 2)) + 4) &&
			diagnostics.work.peakRetainedBuckets === count + 1 &&
			diagnostics.work.peakRetainedProfiles <= count + 2 &&
			diagnostics.work.peakRetainedExactIndexNodes <= count * 9 &&
			diagnostics.work.peakRetainedExactSummaryRefs <= count * 8 &&
			diagnostics.work.peakRetainedTotalStateRefs <= count * 45,
	),
	JSON.stringify(
		compactExactUnionScaling.map(({ count, diagnostics }) => [count, diagnostics.work]),
	),
);

function alternatingExactBudgetSweep(count, reverse = false, enforcePreprocessingLimit = false) {
	const shared = Array.from({ length: count }, (_, index) => ({
		id: `shared-${String(index).padStart(5, "0")}`,
		min: 1,
		max: 3,
		partition: "L",
		excludedPartitions: ["R1"],
	}));
	const alternating = Array.from({ length: count }, (_, index) =>
		index % 2 === 0
			? {
					id: `active-${String(index).padStart(5, "0")}`,
					min: 0,
					max: 3,
					partition: "R1",
					excludedPartitions: [`x${index}`],
				}
			: {
					id: `active-${String(index).padStart(5, "0")}`,
					min: 0,
					max: 3,
					partition: `R${index}`,
					excludedPartitions: ["L"],
				},
	);
	return diagnoseSweepCompatibility({
		left: reverse ? alternating : shared,
		right: reverse ? shared : alternating,
		sameSet: false,
		enforcePreprocessingLimit,
	});
}
const alternatingExactArithmetic = [64, 128, 256, 512].flatMap((count) =>
	[false, true].map((reverse) => ({
		count,
		reverse,
		diagnostics: alternatingExactBudgetSweep(count, reverse),
	})),
);
check(
	"alternating exact-union work has pinned production arithmetic in both cross orientations",
	alternatingExactArithmetic.every(
		({ count, diagnostics }) =>
			diagnostics.pairs.length === 0 &&
			diagnostics.work.activeVisits === 0 &&
			diagnostics.work.bucketScans === 0 &&
			diagnostics.work.exactQuerySteps === 2 * count * count + count &&
			diagnostics.work.exactMembershipTests === (3 * count * count) / 2,
	),
	JSON.stringify(
		alternatingExactArithmetic.map(({ count, reverse, diagnostics }) => [
			count,
			reverse,
			diagnostics.work.exactQuerySteps,
			diagnostics.work.exactMembershipTests,
		]),
	),
);
const alternatingBelowBudget = alternatingExactBudgetSweep(2_048, false, true);
const alternatingAtBudget = alternatingExactBudgetSweep(3_072, false, true);
check(
	"the production preprocessing budget completes 2,048 and stops 3,072 at the exact attempted unit",
	alternatingBelowBudget.preprocessingLimit === null &&
		alternatingBelowBudget.preprocessingSteps < BROAD_PHASE_PREPROCESSING_LIMIT &&
		alternatingBelowBudget.pairs.length === 0 &&
		alternatingAtBudget.preprocessingSteps === BROAD_PHASE_PREPROCESSING_LIMIT &&
		alternatingAtBudget.preprocessingLimit?.attempted === 25_000_001 &&
		alternatingAtBudget.preprocessingLimit?.phase === "compatibility-query" &&
		alternatingAtBudget.pairs.length === 0,
	JSON.stringify({
		below: {
			steps: alternatingBelowBudget.preprocessingSteps,
			limit: alternatingBelowBudget.preprocessingLimit,
		},
		at: {
			steps: alternatingAtBudget.preprocessingSteps,
			limit: alternatingAtBudget.preprocessingLimit,
		},
	}),
);
for (const [label, field] of [
	["many-exclusion", "excludedPartitions"],
	["many-ancestor", "ancestorTargets"],
]) {
	const count = 256,
		entriesPerProfile = 32;
	const parents = new Map(
		Array.from({ length: entriesPerProfile }, (_, index) => [`ancestor-${index}`, null]),
	);
	const left = Array.from({ length: count }, (_record, index) => ({
		id: `${label}-${index}`,
		min: index * 4,
		max: index * 4 + 1,
		partition: `${label}-partition-${index}`,
		[field]: Array.from({ length: entriesPerProfile }, (_excluded, entry) =>
			field === "excludedPartitions" ? `${label}-excluded-${index}-${entry}` : `ancestor-${entry}`,
		),
	}));
	const diagnostics = diagnoseSweepCompatibility({
		left,
		right: [],
		sameSet: true,
		...(field === "ancestorTargets" ? { hierarchyParents: parents } : {}),
	});
	const intervalCount = count,
		exactExclusionEntries = field === "excludedPartitions" ? count * entriesPerProfile : 0,
		ancestorTargetEntries = field === "ancestorTargets" ? count * entriesPerProfile : 0,
		semanticInput = intervalCount + exactExclusionEntries + ancestorTargetEntries;
	check(
		`${label} retained state is linear in I + E + H`,
		diagnostics.work.profileSnapshotEntries === exactExclusionEntries + ancestorTargetEntries &&
			diagnostics.work.peakRetainedTotalStateRefs <= semanticInput * 20,
		JSON.stringify({ semanticInput, work: diagnostics.work }),
	);
}
function reciprocalMultiTargetSweep(count, reverse) {
	const parents = new Map([
		["reciprocal-root", null],
		["reciprocal-outside", null],
	]);
	for (let index = 0; index < count; index += 1)
		parents.set(`reciprocal-child-${index}`, "reciprocal-root");
	const event = {
		id: "reciprocal-event",
		min: reverse ? 0 : 1,
		max: 3,
		partition: "reciprocal-root",
	};
	const targeted = Array.from({ length: count }, (_, index) => ({
		id: `reciprocal-active-${index}`,
		min: reverse ? 1 : 0,
		max: 3,
		partition: `reciprocal-profile-${index}`,
		ancestorTargets: [`reciprocal-child-${index}`, "reciprocal-outside"],
	}));
	return diagnoseSweepCompatibility({
		left: [event],
		right: targeted,
		sameSet: false,
		hierarchyParents: parents,
	});
}
const reciprocalMultiTargetScaling = [1_000, 2_000, 4_000, 8_000].flatMap((count) =>
	[false, true].map((reverse) => ({
		count,
		reverse,
		diagnostics: reciprocalMultiTargetSweep(count, reverse),
	})),
);
const exactComplementControls = diagnoseSweepCompatibility({
	left: [
		{ id: "active-blocked", min: 0, max: 4, partition: "blocked", excludedPartitions: [] },
		{
			id: "active-reciprocal",
			min: 0,
			max: 4,
			partition: "reciprocal",
			excludedPartitions: ["event"],
		},
		{ id: "active-one", min: 0, max: 4, partition: "one", excludedPartitions: [] },
		{
			id: "event-control",
			min: 1,
			max: 4,
			partition: "event",
			excludedPartitions: ["blocked"],
		},
	],
	right: [],
	sameSet: true,
});
check(
	"same-set exact union returns the unique eligible complement once",
	exactComplementControls.pairs.filter((pair) => pair.includes("event-control")).length === 1 &&
		exactComplementControls.pairs.some(
			(pair) => pair[0] === "event-control" && pair[1] === "active-one",
		),
	JSON.stringify(exactComplementControls.pairs),
);
const retainedPeakInput = {
	left: [
		{
			id: "retained-event",
			min: 1,
			max: 3,
			partition: "retained-event",
			excludedPartitions: ["absent"],
		},
	],
	right: Array.from({ length: 3 }, (_, index) => ({
		id: `retained-active-${index}`,
		min: 0,
		max: 3,
		partition: `retained-partition-${index}`,
	})),
	sameSet: false,
};
const retainedPeakComplete = diagnoseSweepCompatibility(retainedPeakInput);
const retainedPeakEarly = diagnoseSweepCompatibility({ ...retainedPeakInput, stopAfterPairs: 1 });
check(
	"retained-state peaks sample query and post-insert phases without combining them",
	retainedPeakComplete.work.peakRetainedBuckets === 4 &&
		retainedPeakComplete.work.peakRetainedQueryRefs === 0 &&
		retainedPeakComplete.work.peakRetainedTotalStateRefs === 115 &&
		retainedPeakEarly.pairs.length === 1 &&
		retainedPeakEarly.work.peakRetainedBuckets === 3 &&
		retainedPeakEarly.work.peakRetainedQueryRefs === 0 &&
		retainedPeakEarly.work.peakRetainedTotalStateRefs === 100,
	JSON.stringify({ complete: retainedPeakComplete.work, early: retainedPeakEarly.work }),
);
const exactReinsertion = diagnoseSweepCompatibility({
	left: [
		{
			id: "first-excluded",
			min: 0,
			max: 1,
			partition: "reinsertion-left",
			excludedPartitions: ["reinsertion-right"],
		},
		{
			id: "second-excluded",
			min: 4,
			max: 6,
			partition: "reinsertion-left",
			excludedPartitions: ["reinsertion-right"],
		},
	],
	right: [
		{ id: "between", min: 2, max: 3, partition: "reinsertion-right" },
		{ id: "overlap-after-reinsert", min: 5, max: 7, partition: "eligible-after-expiry" },
	],
	sameSet: false,
});
check(
	"exact compatibility index remains coherent through expiry and reinsertion",
	JSON.stringify(exactReinsertion.pairs) ===
		JSON.stringify([["second-excluded", "overlap-after-reinsert"]]) &&
		exactReinsertion.work.expiryPops === 2 &&
		exactReinsertion.work.bucketDeletes > 0,
	JSON.stringify(exactReinsertion),
);
check(
	"reciprocal hierarchy queries require every target to lie outside the event subtree",
	reciprocalMultiTargetScaling.every(
		({ count, diagnostics }) =>
			diagnostics.pairs.length === 0 &&
			diagnostics.work.activeVisits === 0 &&
			diagnostics.work.bucketScans === 0 &&
			diagnostics.work.compatibilityTests === 0 &&
			diagnostics.work.exactQuerySteps <= count * 2 + 2 &&
			diagnostics.work.hierarchyMembershipTests <= count * (Math.ceil(Math.log2(count)) + 3) &&
			diagnostics.work.hierarchySummarySteps <= count * (Math.ceil(Math.log2(count)) * 3 + 4) &&
			diagnostics.work.peakRetainedBuckets === count + 1 &&
			diagnostics.work.peakRetainedExactSummaryRefs <= count * 8 &&
			diagnostics.work.peakRetainedTotalStateRefs <= count * 60,
	),
	JSON.stringify(
		reciprocalMultiTargetScaling.map(({ count, reverse, diagnostics }) => [
			count,
			reverse,
			diagnostics.work,
		]),
	),
);
const exactUnionReverse = diagnoseSweepCompatibility({
	left: [
		{
			id: "active-reciprocal",
			min: 0,
			max: 3,
			partition: "active",
			excludedPartitions: ["event"],
		},
		{ id: "active-eligible", min: 0, max: 3, partition: "eligible" },
	],
	right: [{ id: "event", min: 1, max: 2, partition: "event" }],
	sameSet: false,
});
const exactUnionSameSet = diagnoseSweepCompatibility({
	left: [
		{ id: "same-a", min: 0, max: 4, partition: "same", excludedPartitions: ["same"] },
		{ id: "same-b", min: 1, max: 3, partition: "same", excludedPartitions: ["same"] },
		{ id: "other", min: 2, max: 5, partition: "other", excludedPartitions: ["other"] },
	],
	right: [],
	sameSet: true,
});
check(
	"exact two-sided exclusions preserve controls, orientations, and same-set uniqueness",
	JSON.stringify(exactUnionControl.pairs) ===
		JSON.stringify([["event\0control", "eligible-control"]]) &&
		JSON.stringify(exactUnionReverse.pairs) === JSON.stringify([["active-eligible", "event"]]) &&
		JSON.stringify(exactUnionSameSet.pairs) ===
			JSON.stringify([
				["other", "same-a"],
				["other", "same-b"],
			]),
);

let semanticSweepSeed = 0x5119;
const semanticRandom = () =>
	(semanticSweepSeed = (semanticSweepSeed * 1_103_515_245 + 12_345) >>> 0) / 2 ** 32;
for (let sample = 0; sample < 8; sample += 1) {
	const makeSide = (side) =>
		Array.from({ length: 18 }, (unused, index) => {
			const min = Math.floor(semanticRandom() * 30);
			const partition = `${side}-partition-${index % 7}`;
			const excludedPartitions = Array.from({ length: 7 }, (entry, candidate) => candidate)
				.filter(() => semanticRandom() < 0.18)
				.map((candidate) => `${side === "left" ? "right" : "left"}-partition-${candidate}`);
			return {
				id: `${side}-${sample}-${index}`,
				min,
				max: min + 1 + Math.floor(semanticRandom() * 8),
				partition,
				excludedPartitions,
			};
		});
	const left = makeSide("left"),
		right = makeSide("right");
	const actual = diagnoseSweepCompatibility({ left, right, sameSet: false }).pairs;
	const expected = [];
	for (const a of left)
		for (const b of right)
			if (
				a.min <= b.max &&
				b.min <= a.max &&
				!a.excludedPartitions.includes(b.partition) &&
				!b.excludedPartitions.includes(a.partition)
			)
				expected.push([a.id, b.id]);
	const actualSet = new Set(actual.map((pair) => JSON.stringify(pair)));
	const expectedSet = new Set(expected.map((pair) => JSON.stringify(pair)));
	const reversed = diagnoseSweepCompatibility({
		left: left.toReversed(),
		right: right.toReversed(),
		sameSet: false,
	}).pairs;
	check(
		`two-sided semantic sweep matches brute force and stable order ${sample}`,
		actual.length === expected.length &&
			actualSet.size === actual.length &&
			[...expectedSet].every((pair) => actualSet.has(pair)) &&
			JSON.stringify(reversed) === JSON.stringify(actual),
	);
}

let ungroupedGroupReads = 0;
const largeUngrouped = Array.from({ length: 2_000 }, (_, index) => {
	const record = {
		id: `ungrouped-${index}`,
		type: "rectangle",
		x: index * 3,
		y: 50_000,
		width: 2,
		height: 2,
		angle: 0,
		customData: { library: { itemId: `library-${index}` } },
	};
	Object.defineProperty(record, "groupIds", {
		enumerable: true,
		get() {
			ungroupedGroupReads += 1;
			return [];
		},
	});
	return record;
});
const largeUngroupedReport = inspectBoard(largeUngrouped);
check(
	"large ungrouped obstacle preprocessing reads group membership linearly",
	largeUngroupedReport.clean && ungroupedGroupReads === largeUngrouped.length,
	`${ungroupedGroupReads} reads for ${largeUngrouped.length} records`,
);

const groupMeteringBody = (groupIds, id = "group-metering") => ({
	id,
	type: "rectangle",
	x: 0,
	y: 60_000,
	width: 10,
	height: 10,
	angle: 0,
	groupIds,
	customData: { library: { itemId: "group-metering", source: "catalogue" } },
});
const emptyGroupWork = inspectBoardDiagnostics([groupMeteringBody([])]).work.preprocessingSteps;
for (const count of [1, 7, 1_000_000]) {
	const diagnosed = inspectBoardDiagnostics([groupMeteringBody(Array(count).fill(null))]);
	check(
		`every one of ${count} rejected group entries is metered before inspection continues`,
		diagnosed.report.clean &&
			diagnosed.report.coverage === "complete" &&
			diagnosed.work.preprocessingSteps - emptyGroupWork === count,
		`${diagnosed.work.preprocessingSteps} against ${emptyGroupWork}`,
	);
}
{
	const exactBoundaryId = "x".repeat(4_999_891);
	const diagnosed = inspectBoardDiagnostics([groupMeteringBody([], exactBoundaryId)]);
	const limit = diagnosed.report.findings.find(
		(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
	);
	check(
		"collection work after exact-boundary obstacle identity cannot escape the ceiling",
		diagnosed.report.coverage === "indeterminate" &&
			diagnosed.work.preprocessingSteps === 25_000_000 &&
			limit?.details.attempted === 25_000_001 &&
			limit?.details.pass === "connector-intersection" &&
			limit?.details.phase === "prepare-events",
		JSON.stringify(limit?.details),
	);
}
{
	const rejectedGroups = Array(1_000_000).fill(null);
	const diagnosed = inspectBoardDiagnostics([
		groupMeteringBody(rejectedGroups, "x".repeat(4_800_000)),
	]);
	const limit = diagnosed.report.findings.find(
		(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
	);
	check(
		"rejected group entry reads stop at the first refused preprocessing unit",
		diagnosed.report.coverage === "indeterminate" &&
			diagnosed.work.preprocessingSteps === 25_000_000 &&
			limit?.details.attempted === 25_000_001 &&
			limit?.details.pass === "container-boundary" &&
			limit?.details.phase === "prepare-events",
		JSON.stringify(limit?.details),
	);
}

const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-inspection-"));
const noteFor = (board, elements) =>
	fs.writeFileSync(
		path.join(vault, `${board}.excalidraw.md`),
		renderBoardNote(
			{ type: "excalidraw", version: 2, source: "archboard", elements, appState: {}, files: {} },
			null,
			{ board, variant: "current" },
		),
	);
noteFor("rejected-group-limit", [
	groupMeteringBody(Array(1_000_000).fill(null), "x".repeat(4_800_000)),
]);
const noteForEscapedControls = (board, elements) => {
	const controls = new Set();
	JSON.stringify(elements, (_key, value) => {
		if (typeof value === "string")
			for (let index = 0; index < value.length; index += 1) {
				const codeUnit = value.charCodeAt(index);
				if (codeUnit <= 0x1f || (codeUnit >= 0xd800 && codeUnit <= 0xdfff)) {
					controls.add(value);
					break;
				}
			}
		return value;
	});
	const placeholders = new Map(
		[...controls]
			.toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
			.map((value, index) => [value, `z${index.toString(36).padStart(7, "0")}`]),
	);
	const placeholderElements = JSON.parse(
		JSON.stringify(elements, (_key, value) => placeholders.get(value) ?? value),
	);
	let note = renderBoardNote(
		{
			type: "excalidraw",
			version: 2,
			source: "archboard",
			elements: placeholderElements,
			appState: {},
			files: {},
		},
		null,
		{ board, variant: "current" },
	);
	for (const [control, placeholder] of placeholders)
		note = note.replaceAll(JSON.stringify(placeholder), JSON.stringify(control));
	check(
		`${board} persists control ids as escaped JSON`,
		[...controls].every((control) => note.includes(JSON.stringify(control).slice(1, -1))),
	);
	fs.writeFileSync(path.join(vault, `${board}.excalidraw.md`), note);
};
for (const [label, ids] of obstacleIdentityCases) {
	const writeObstacleNote =
		label === "control" || label === "other-control" || label === "lone-surrogate"
			? noteForEscapedControls
			: noteFor;
	/** @param {string[]} orderedIds */
	const bodies = (orderedIds) =>
		orderedIds.map((id, index) =>
			Object.assign(validLibraryBody(id, index * 20, [`persisted-${label}`]), {
				customData: undefined,
			}),
		);
	writeObstacleNote(
		`obstacle-identity-${label}`,
		[
			connector({
				id: `persisted-through-${label}`,
				x: -10,
				y: 5,
				width: 60,
				height: 0,
				points: [
					[0, 0],
					[60, 0],
				],
			}),
		].concat(bodies(ids)),
	);
	writeObstacleNote(
		`obstacle-identity-${label}-reversed`,
		[
			connector({
				id: `persisted-through-${label}-reversed`,
				x: -10,
				y: 5,
				width: 60,
				height: 0,
				points: [
					[0, 0],
					[60, 0],
				],
			}),
		].concat(bodies(ids.toReversed())),
	);
}
noteFor("clean", []);
noteFor("late-collision-activation", lateCollisionActivation.board);
noteFor("late-collision-prepare", lateCollisionPrepare.board);
noteFor("long-library-identity", longLibraryBoard);
noteFor(
	"rotated-decoration",
	["rectangle", "ellipse", "diamond"].map((type, index) => ({
		id: `persisted-decoration-${type}`,
		type,
		x: index * 30,
		y: 0,
		width: 20,
		height: 20,
		angle: 0.5,
	})),
);
noteFor("warning", [
	{ id: "txt", type: "text", x: 0, y: 0, width: 30, height: 10, fontFamily: 1, text: "legacy" },
]);
noteFor("focus-extreme", [
	{
		id: "fextreme",
		type: "text",
		x: Number.MAX_VALUE,
		y: 0,
		width: 0,
		height: 0,
		fontFamily: 1,
		text: "focus",
	},
]);
noteFor("error", [
	{
		id: "a",
		type: "rectangle",
		x: 0,
		y: 0,
		width: 30,
		height: 30,
		customData: { archboard: { node: "a" } },
	},
	{
		id: "b",
		type: "rectangle",
		x: 10,
		y: 10,
		width: 30,
		height: 30,
		customData: { archboard: { node: "b" } },
	},
]);
noteForEscapedControls("control-partitions", controlPartitionElements);
noteForEscapedControls("exact-order-controls", [...exactOrderElements, ...exactHierarchyElements]);
noteFor("limit-extreme", limitWithExtremeSpan);
noteFor("preprocessing-limit", preprocessingLimitBoard);
noteFor("unknown", [{ id: "edge", type: "arrow", x: 0, y: 0, width: 10, height: 0 }]);
noteFor("malformed", [
	{ type: "arrow", x: 0, y: 0, width: null, height: 0, points: null, startBinding: "bad" },
	{
		id: "",
		type: "text",
		x: 0,
		y: 20,
		width: 10,
		height: 10,
		fontFamily: 5,
		text: "empty id",
		containerId: 42,
	},
	{
		id: 42,
		type: "rectangle",
		x: 0,
		y: 40,
		width: 10,
		height: 10,
		customData: { library: { itemId: "item" } },
	},
	{ id: "empty-path", type: "arrow", x: 0, y: 60, width: 10, height: 0, points: [] },
	{ id: "one-path", type: "arrow", x: 0, y: 80, width: 10, height: 0, points: [[-2, -3]] },
	{
		id: "tuple-path",
		type: "arrow",
		x: 0,
		y: 100,
		width: 10,
		height: 0,
		points: [
			[0, 0],
			["bad", 0],
		],
	},
	{
		id: "zero-path",
		type: "arrow",
		x: 0,
		y: 120,
		width: 10,
		height: 0,
		points: [
			[0, 0],
			[0, 0],
			[10, 0],
		],
	},
	{
		id: "bad-end",
		type: "arrow",
		x: 0,
		y: 140,
		width: 10,
		height: 0,
		points: [
			[0, 0],
			[10, 0],
		],
		endBinding: { elementId: "node", gap: 0 },
	},
	{
		id: "rotated-path",
		type: "arrow",
		x: 100,
		y: 100,
		width: 20,
		height: 10,
		angle: 1,
		points: [
			[0, 0],
			[-20, -10],
		],
	},
	{
		id: "curved-path",
		type: "arrow",
		x: 0,
		y: 160,
		width: 10,
		height: 0,
		points: [
			[0, 0],
			[10, 0],
		],
		curveKind: "bezier",
	},
	{
		id: "rounded-path",
		type: "arrow",
		x: 0,
		y: 180,
		width: 10,
		height: 0,
		points: [
			[0, 0],
			[10, 0],
		],
		roundness: { type: 2 },
	},
	{
		id: "node",
		type: "rectangle",
		x: 20,
		y: 0,
		width: 10,
		height: 10,
		boundElements: [{ id: "gone", type: "arrow" }, null],
		customData: { archboard: { node: "node", binding: { path: "../bad" } } },
	},
	{
		id: "unknown",
		type: "future-shape",
		x: 40,
		y: 0,
		width: 10,
		height: 10,
		customData: { archboard: { node: "future" } },
	},
	{
		id: "invalid-library",
		type: "rectangle",
		x: 60,
		y: 0,
		width: 10,
		height: 10,
		customData: { library: {} },
	},
]);
noteFor(
	"identity-interactions",
	[
		["missing", undefined, 0],
		["empty", "", 30],
		["non-string", 42, 60],
	].flatMap(([label, rawId, y]) => interactionElements(label, rawId, y)),
);
noteFor(
	"incoming-types",
	[
		["missing", undefined, 0],
		["null", null, 20],
		["boolean", false, 40],
		["unknown", "future-target", 60],
	].flatMap(([label, rawType, y]) => incomingReferenceElements(label, rawType, y)),
);
const prerequisiteTotalityElements = [
	connector({
		id: "jover",
		x: 0,
		y: 300,
		width: 10,
		height: 0,
		points: [
			[0, 0],
			["INSPECTION_OVERFLOW_NUMBER", 0],
		],
	}),
	semanticNode("blocked-endpoint-node", { id: "bnnode", x: 40, y: 0 }),
	connector({
		id: "bedge",
		x: 0,
		y: 5,
		width: 100,
		height: 0,
		points: [
			[0, 0],
			[100, 0],
		],
		startBinding: { elementId: "", focus: 0, gap: 0 },
	}),
	semanticNode("reverse-owner", {
		id: "rowner",
		x: 0,
		y: 100,
		width: 100,
		height: 100,
		boundElements: [{ id: "rlbl", type: "text" }],
	}),
	{
		id: "rlbl",
		type: "text",
		x: 80,
		y: 120,
		width: 40,
		height: 20,
		fontFamily: 5,
		text: "reverse",
	},
	semanticNode("reverse-unrelated", { id: "runrel", x: 100, y: 100, width: 50, height: 50 }),
	semanticNode("mismatch-owner", {
		x: 200,
		y: 100,
		id: "mowner",
		boundElements: [{ id: "mtarget", type: "text" }],
	}),
	{ id: "mtarget", type: "rectangle", x: 220, y: 100, width: 10, height: 10 },
	semanticNode("unknown-target-owner", {
		x: 260,
		y: 100,
		id: "uowner",
		boundElements: [{ id: "utarget", type: "arrow" }],
	}),
	{ id: "utarget", type: "future-target", x: 280, y: 100, width: 10, height: 10 },
	...[
		["b1", "text", "rectangle"],
		["b2", "text", "arrow"],
		["b3", "arrow", "text"],
		["b4", "arrow", "rectangle"],
		["b5", "text", "text"],
		["b6", "arrow", "arrow"],
		["b7", "text", "line"],
		["b8", "arrow", "line"],
	].flatMap(([prefix, declaredType, actualType], index) => {
		const targetId = `${prefix}t`;
		const target =
			actualType === "text"
				? {
						id: targetId,
						type: "text",
						x: 350 + index * 30,
						y: 100,
						width: 10,
						height: 10,
						fontFamily: 5,
						text: "target",
					}
				: actualType === "arrow" || actualType === "line"
					? connector({
							id: targetId,
							type: actualType,
							x: 350 + index * 30,
							y: 100,
							width: 10,
							height: 0,
							points: [
								[0, 0],
								[10, 0],
							],
							...(prefix === "b8"
								? { startBinding: { elementId: `${prefix}ob`, focus: 0, gap: 0 } }
								: {}),
						})
					: {
							id: targetId,
							type: "rectangle",
							x: 350 + index * 30,
							y: 100,
							width: 10,
							height: 10,
						};
		return [
			semanticNode(`${prefix}o`, {
				id: `${prefix}ob`,
				x: 350 + index * 30,
				y: 150,
				boundElements: [{ id: targetId, type: declaredType }],
			}),
			target,
		];
	}),
	semanticNode("package-aggregate", {
		id: "paggp",
		x: Number.MAX_VALUE,
		y: 300,
		width: 0,
		height: 10,
	}),
	semanticNode("package-aggregate", {
		id: "paggn",
		x: -Number.MAX_VALUE,
		y: 300,
		width: 0,
		height: 10,
	}),
	{
		id: "pobsp",
		type: "rectangle",
		x: Number.MAX_VALUE,
		y: 320,
		width: 1,
		height: 10,
		groupIds: ["pg"],
	},
	{
		id: "pobsn",
		type: "rectangle",
		x: -Number.MAX_VALUE,
		y: 320,
		width: 1,
		height: 10,
		groupIds: ["pg"],
	},
	semanticNode("duplicate-candidate", { id: "dupn", x: 40, y: 480 }),
	connector({ id: "dupcon", x: 0, y: 485, width: 100, height: 0 }),
	connector({ id: "dupcon", x: 0, y: 485, width: 100, height: 0 }),
	semanticNode("package-max-zone", {
		id: "pmzone",
		x: 0,
		y: 600,
		width: Number.MAX_VALUE,
		height: 2,
	}),
	semanticNode("package-max-child", {
		id: "pmchild",
		x: 0,
		y: 600,
		width: Number.MAX_VALUE / 2,
		height: 1,
	}),
	{
		id: "pfocus",
		type: "text",
		x: Number.MAX_VALUE,
		y: 700,
		width: 0,
		height: 0,
		fontFamily: 1,
		text: "focus",
	},
	{
		id: "pevid",
		type: "text",
		x: Number.MAX_VALUE,
		y: 720,
		width: Number.MAX_VALUE,
		height: 10,
		fontFamily: 1,
		containerId: false,
		boundElements: false,
		customData: { archboard: { node: false, binding: { path: "/absolute" } } },
	},
	{
		id: "pgeom",
		type: "rectangle",
		x: Number.MAX_VALUE,
		y: 740,
		width: Number.MAX_VALUE,
		height: 10,
		angle: 1,
		label: { text: "seed" },
		customData: {
			archboard: { node: "pgeom" },
			library: {},
		},
	},
	connector({
		id: "pbind",
		x: Number.MAX_VALUE,
		y: 760,
		width: Number.MAX_VALUE,
		height: 0,
		angle: 1,
		startBinding: false,
	}),
	connector({
		id: "persisted-large-path",
		x: 0,
		y: 800,
		width: 1,
		height: 0,
		angle: 0,
		points: Array.from({ length: 10_000 }, (_, index) => [index, index % 2]),
	}),
];
const prerequisiteTotalityNote = renderBoardNote(
	{
		type: "excalidraw",
		version: 2,
		source: "archboard",
		elements: prerequisiteTotalityElements,
		appState: {},
		files: {},
	},
	null,
	{ board: "prerequisite-totality", variant: "current" },
).replace('"INSPECTION_OVERFLOW_NUMBER"', "1e400");
fs.writeFileSync(path.join(vault, "prerequisite-totality.excalidraw.md"), prerequisiteTotalityNote);
const sentinelLog = path.join(os.tmpdir(), `archboard-inspection-http-${process.pid}.log`);
fs.writeFileSync(sentinelLog, "");
const sentinel = spawn(
	process.execPath,
	[
		"-e",
		"const fs = require('node:fs'); const server = Bun.serve({ port: 0, fetch() { fs.appendFileSync(process.env.SENTINEL_LOG, 'contact\\n'); return new Response('unexpected'); } }); console.log(server.port);",
	],
	{
		env: { ...process.env, SENTINEL_LOG: sentinelLog },
		stdio: ["ignore", "pipe", "inherit"],
	},
);
const sentinelPort = await new Promise((resolve, reject) => {
	let output = "";
	const timeout = setTimeout(() => reject(new Error("HTTP sentinel did not start")), 5000);
	sentinel.once("error", reject);
	sentinel.stdout.on("data", (chunk) => {
		output += chunk;
		const line = output.split("\n")[0];
		if (!/^\d+$/.test(line)) return;
		clearTimeout(timeout);
		resolve(Number(line));
	});
});
const snapshot = () =>
	JSON.stringify(
		fs
			.readdirSync(vault)
			.toSorted()
			.map((file) => {
				const full = path.join(vault, file),
					stat = fs.statSync(full);
				return [file, fs.readFileSync(full, "base64"), stat.mtimeMs];
			}),
	);
const run = (board, args = []) =>
	spawnSync(path.join(root, "bin/canvas"), ["check", "--board", board, ...args], {
		cwd: root,
		env: {
			...process.env,
			ARCHBOARD_VAULT: vault,
			EXCALIDRAW_NO_AUTOSTART: "1",
			EXPRESS_SERVER_URL: `http://127.0.0.1:${sentinelPort}`,
		},
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
const beforeVault = snapshot();
const jsonRun = run("clean");
const cleanPackageResult = JSON.parse(jsonRun.stdout);
check("package CLI works with no canvas", jsonRun.status === 0 && jsonRun.stderr === "");
check(
	"package JSON parses through exported schema",
	CheckResultSchema.safeParse(cleanPackageResult).success &&
		!("preprocessingWork" in cleanPackageResult),
);
const rejectedGroupNormal = run("rejected-group-limit");
const rejectedGroupStrict = run("rejected-group-limit", ["--strict"]);
const rejectedGroupPackage = rejectedGroupNormal.stdout
	? JSON.parse(rejectedGroupNormal.stdout)
	: null;
const rejectedGroupLimit = rejectedGroupPackage?.findings.find(
	(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
);
check(
	"parseable-note package inspection meters rejected group entries to the exact ceiling",
	rejectedGroupNormal.status === 0 &&
		rejectedGroupStrict.status === 8 &&
		rejectedGroupNormal.stderr === "" &&
		rejectedGroupStrict.stderr === "" &&
		rejectedGroupNormal.stdout === rejectedGroupStrict.stdout &&
		CheckResultSchema.safeParse(rejectedGroupPackage).success &&
		rejectedGroupPackage.coverage === "indeterminate" &&
		rejectedGroupLimit?.details.attempted === 25_000_001 &&
		rejectedGroupLimit?.details.pass === "container-boundary" &&
		rejectedGroupLimit?.details.phase === "prepare-events",
	JSON.stringify(rejectedGroupLimit?.details),
);
for (const [board, expectedPhase, expectedElements] of [
	["late-collision-activation", "activate-or-expire", 36_001],
	["late-collision-prepare", "prepare-events", 44_001],
]) {
	const normal = run(board);
	const strict = run(board, ["--strict"]);
	const result = normal.stdout ? JSON.parse(normal.stdout) : null;
	const limit = result?.findings.find(
		(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
	);
	check(
		`${board} package output preserves the completed collision checkpoint`,
		normal.status === 0 &&
			strict.status === 8 &&
			normal.stderr === "" &&
			strict.stderr === "" &&
			normal.stdout === strict.stdout &&
			CheckResultSchema.safeParse(result).success &&
			result.broadPhaseComparisons === 1 &&
			result.coverage === "indeterminate" &&
			JSON.stringify(result.findings.map((finding) => finding.reason)) ===
				JSON.stringify(["leaf-footprint-interior", "broad-phase-preprocessing-ceiling"]) &&
			limit?.details.pass === "connector-intersection" &&
			limit?.details.phase === expectedPhase &&
			limit?.details.completedBroadPhaseComparisons === 1 &&
			limit?.elements.length === expectedElements,
		`statuses=${normal.status}/${strict.status} reasons=${result?.findings
			?.map((finding) => finding.reason)
			.join(",")} limit=${JSON.stringify(limit?.details)}`,
	);
}
const lateCollisionText = run("late-collision-activation", ["--text"]);
const lateCollisionJson = run("late-collision-activation");
check(
	"late collision checkpoint text is the exhaustive rendering of preserved JSON",
	lateCollisionText.status === 0 &&
		lateCollisionText.stderr === "" &&
		lateCollisionText.stdout === formatInspectionText(JSON.parse(lateCollisionJson.stdout)) + "\n",
);
const longLibraryNormal = run("long-library-identity");
const longLibraryStrict = run("long-library-identity", ["--strict"]);
const longLibraryPackage = longLibraryNormal.stdout ? JSON.parse(longLibraryNormal.stdout) : null;
check(
	"persisted long library identity reaches the exact preprocessing ceiling",
	longLibraryNormal.status === 0 &&
		longLibraryStrict.status === 8 &&
		longLibraryNormal.stderr === "" &&
		longLibraryStrict.stderr === "" &&
		longLibraryNormal.stdout === longLibraryStrict.stdout &&
		CheckResultSchema.safeParse(longLibraryPackage).success &&
		longLibraryPackage.coverage === "indeterminate" &&
		longLibraryPackage.findings.some(
			(finding) =>
				finding.reason === "broad-phase-preprocessing-ceiling" &&
				finding.details.attempted === 25_000_001 &&
				finding.details.pass === "container-boundary" &&
				finding.details.phase === "prepare-events",
		),
);
const rotatedDecorationRun = run("rotated-decoration", ["--strict"]);
const rotatedDecorationResult = rotatedDecorationRun.stdout
	? JSON.parse(rotatedDecorationRun.stdout)
	: null;
check(
	"persisted plain rotated decorations remain complete and clean",
	rotatedDecorationRun.status === 0 &&
		rotatedDecorationRun.stderr === "" &&
		CheckResultSchema.safeParse(rotatedDecorationResult).success &&
		rotatedDecorationResult.clean &&
		rotatedDecorationResult.coverage === "complete",
);
const controlPartitionRun = run("control-partitions");
const controlPartitionResult = controlPartitionRun.stdout
	? JSON.parse(controlPartitionRun.stdout)
	: null;
check(
	"persisted escaped control-character partitions preserve eligible pairs and exclusions",
	controlPartitionRun.status === 0 &&
		controlPartitionRun.stderr === "" &&
		CheckResultSchema.safeParse(controlPartitionResult).success &&
		controlPartitionEvidence(controlPartitionResult),
	`status=${controlPartitionRun.status} stderr=${controlPartitionRun.stderr} findings=${controlPartitionResult?.findings
		?.map(
			(finding) =>
				`${finding.reason}:${JSON.stringify(finding.elements.map((element) => element.id))}:${JSON.stringify(finding.details)}`,
		)
		.join("|")}`,
);
for (const [label, , expected] of obstacleIdentityCases) {
	const runs = [run(`obstacle-identity-${label}`), run(`obstacle-identity-${label}-reversed`)];
	const results = runs.map((result) => (result.stdout ? JSON.parse(result.stdout) : null));
	const persistedObstacleIds = results.map(
		(result) =>
			new Set(
				result?.findings.flatMap((finding) => finding.obstacles.map((obstacle) => obstacle.id)) ??
					[],
			),
	);
	check(
		`persisted package output preserves ${label} obstacle identity escaping under reversal`,
		runs.every((result) => result.status === 0 && result.stderr === "") &&
			results.every((result) => CheckResultSchema.safeParse(result).success) &&
			persistedObstacleIds.every((ids) => ids.has(expected)),
		JSON.stringify({
			statuses: runs.map((result) => result.status),
			ids: persistedObstacleIds.map((ids) => Array.from(ids)),
		}),
	);
}
const exactOrderRun = run("exact-order-controls");
const exactOrderResult = exactOrderRun.stdout ? JSON.parse(exactOrderRun.stdout) : null;
check(
	"persisted package ordering is exact for controls, prefixes, and lone surrogates",
	exactOrderRun.status === 0 &&
		exactOrderRun.stderr === "" &&
		CheckResultSchema.safeParse(exactOrderResult).success &&
		exactOrderEvidence(exactOrderResult) &&
		exactHierarchyEvidence(exactOrderResult),
	`status=${exactOrderRun.status} stderr=${exactOrderRun.stderr} findings=${exactOrderResult?.findings
		?.map(
			(finding) =>
				`${finding.reason}:${JSON.stringify(finding.elements.map((element) => element.id))}:${JSON.stringify(finding.details)}`,
		)
		.join("|")}`,
);
const textRun = run("clean", ["--text"]);
check(
	"text mode matches production formatter",
	textRun.stdout === formatInspectionText(cleanPackageResult) + "\n",
);
for (const [board, exit] of [
	["warning", 6],
	["error", 7],
	["unknown", 8],
]) {
	const result = run(board, ["--strict"]);
	check(
		`strict ${board} exits ${exit} on stdout only`,
		result.status === exit && result.stdout !== "" && result.stderr === "",
	);
}
const focusExtremeRun = run("focus-extreme", ["--strict"]);
const focusExtremeResult = focusExtremeRun.stdout ? JSON.parse(focusExtremeRun.stdout) : null;
check(
	"strict package check exits 8 when exact focus padding is unrepresentable",
	focusExtremeRun.status === 8 &&
		focusExtremeRun.stderr === "" &&
		CheckResultSchema.safeParse(focusExtremeResult).success &&
		focusExtremeResult.findings.some(
			(finding) =>
				finding.reason === "disallowed-font-family" &&
				finding.affectedBBox?.x === Number.MAX_VALUE &&
				finding.focusBBox === null,
		) &&
		focusExtremeResult.findings.some(
			(finding) =>
				finding.reason === "unrepresentable-focus-padding" &&
				finding.details.failedDeltas.includes("x-minus-16"),
		),
	focusExtremeRun.stderr,
);
const usage = spawnSync(path.join(root, "bin/canvas"), ["check"], {
	cwd: root,
	env: { ...process.env, ARCHBOARD_VAULT: vault },
	encoding: "utf8",
});
check("usage failure has empty stdout and exit 2", usage.status === 2 && usage.stdout === "");
const missing = run("missing");
check(
	"operational failure has empty stdout and exit 1",
	missing.status === 1 && missing.stdout === "",
);
const invalidPolicyMissing = run("missing", ["--overlap-tolerance", "bad"]);
check(
	"invalid policy wins before missing-note I/O",
	invalidPolicyMissing.status === 2 && invalidPolicyMissing.stdout === "",
);
const malformedRun = run("malformed", ["--strict"]);
const malformedResult = JSON.parse(malformedRun.stdout);
check(
	"persisted malformed note reports through the real package",
	malformedRun.status === 8 &&
		CheckResultSchema.safeParse(malformedResult).success &&
		malformedResult.findings.some(
			(finding) =>
				finding.reason === "invalid-element-identity" && finding.elements[0]?.id === null,
		) &&
		malformedResult.findings.some((finding) => finding.reason === "points-not-array") &&
		malformedResult.findings.some((finding) => finding.reason === "malformed-start-binding") &&
		malformedResult.findings.some((finding) => finding.reason === "malformed-bound-elements") &&
		malformedResult.findings.some((finding) => finding.reason === "malformed-container-id") &&
		malformedResult.findings.some((finding) => finding.reason === "invalid-code-binding") &&
		malformedResult.findings.some((finding) => finding.reason === "invalid-library-attribution") &&
		malformedResult.findings.some((finding) => finding.reason === "points-empty") &&
		malformedResult.findings.some((finding) => finding.reason === "points-one-point") &&
		malformedResult.findings.some((finding) => finding.reason === "malformed-point") &&
		malformedResult.findings.some((finding) => finding.reason === "zero-length") &&
		malformedResult.findings.some((finding) => finding.reason === "rotation") &&
		malformedResult.findings.some((finding) => finding.reason === "curve") &&
		malformedResult.findings.some((finding) => finding.reason === "rounded-or-elbowed") &&
		malformedResult.findings.some((finding) => finding.reason === "unsupported-type"),
	malformedResult.findings.map((finding) => finding.reason).join(","),
);
const identityInteractionRun = run("identity-interactions", ["--strict"]);
const identityInteractionResult = identityInteractionRun.stdout
	? JSON.parse(identityInteractionRun.stdout)
	: null;
check(
	"persisted invalid identities stay schema-total across every downstream interaction",
	identityInteractionRun.status === 8 &&
		identityInteractionRun.stderr === "" &&
		CheckResultSchema.safeParse(identityInteractionResult).success &&
		identityInteractionResult.findings.filter(
			(finding) => finding.reason === "invalid-element-identity",
		).length === 3 &&
		!identityInteractionResult.findings.some(
			(finding) =>
				supportedConnectorResultCodes.has(finding.code) ||
				[
					"missing-binding-target",
					"invalid-binding-target-type",
					"missing-binding-reciprocal",
					"persisted-agent-endpoint",
					"dangling-bound-text",
					"dangling-bound-arrow",
				].includes(finding.reason),
		),
	identityInteractionRun.stderr,
);
const incomingTypesRun = run("incoming-types", ["--strict"]);
const incomingTypesResult = incomingTypesRun.stdout ? JSON.parse(incomingTypesRun.stdout) : null;
check(
	"persisted forward-only malformed target types are indeterminate rather than complete errors",
	incomingTypesRun.status === 8 &&
		incomingTypesRun.stderr === "" &&
		CheckResultSchema.safeParse(incomingTypesResult).success &&
		incomingTypesResult.findings.filter(
			(finding) => finding.code === "UNSUPPORTED_GEOMETRY" && finding.reason === "unsupported-type",
		).length === 4,
	incomingTypesRun.stderr,
);
const prerequisiteTotalityRun = run("prerequisite-totality", ["--strict"]);
const prerequisiteTotalityResult = prerequisiteTotalityRun.stdout
	? JSON.parse(prerequisiteTotalityRun.stdout)
	: null;
check(
	"persisted prerequisite interactions and JSON 1e400 stay schema-total and indeterminate",
	prerequisiteTotalityRun.status === 8 &&
		prerequisiteTotalityRun.stderr === "" &&
		CheckResultSchema.safeParse(prerequisiteTotalityResult).success &&
		prerequisiteTotalityResult.findings.some(
			(finding) =>
				finding.code === "AMBIGUOUS_GEOMETRY" &&
				finding.reason === "malformed-point" &&
				finding.elements[0]?.id === "jover",
		) &&
		["semantic-node-body", "obstacle-component"].every((scope) =>
			prerequisiteTotalityResult.findings.some(
				(finding) =>
					finding.reason === "unrepresentable-coordinate-span" && finding.details.scope === scope,
			),
		) &&
		prerequisiteTotalityResult.findings.some(
			(finding) =>
				finding.reason === "duplicate-element-id" && finding.details.duplicateId === "dupcon",
		) &&
		!prerequisiteTotalityResult.findings.some(
			(finding) =>
				[
					"CONNECTOR_PENETRATES_NODE",
					"CONNECTOR_PENETRATES_OBSTACLE",
					"CONNECTOR_INTERSECTION_UNMARKED",
				].includes(finding.code) && finding.elements.some((element) => element.id === "dupcon"),
		) &&
		prerequisiteTotalityResult.findings.some(
			(finding) => finding.reason === "bound-element-target-type-mismatch",
		) &&
		prerequisiteTotalityResult.findings.filter(
			(finding) => finding.reason === "bound-element-target-type-mismatch",
		).length === 6 &&
		!["b5t", "b6t", "b8t"].some((targetId) =>
			prerequisiteTotalityResult.findings.some(
				(finding) =>
					finding.reason === "bound-element-target-type-mismatch" &&
					finding.details.targetId === targetId,
			),
		) &&
		!prerequisiteTotalityResult.findings.some(
			(finding) =>
				finding.reason === "missing-binding-reciprocal" && finding.details.connectorId === "b8t",
		) &&
		prerequisiteTotalityResult.findings.some(
			(finding) =>
				finding.code === "UNSUPPORTED_GEOMETRY" &&
				finding.reason === "unsupported-type" &&
				finding.elements[0]?.id === "utarget",
		) &&
		prerequisiteTotalityResult.findings.some(
			(finding) =>
				finding.code === "LABEL_OVERLAP" &&
				finding.details.labelId === "rlbl" &&
				finding.details.nodeId === "reverse-unrelated",
		) &&
		prerequisiteTotalityResult.findings.some(
			(finding) =>
				finding.reason === "unrepresentable-focus-padding" &&
				finding.elements.some((element) => element.id === "pfocus"),
		) &&
		[
			"disallowed-font-family",
			"malformed-container-id",
			"malformed-bound-elements",
			"invalid-node-metadata",
			"invalid-code-binding",
		].every((reason) =>
			prerequisiteTotalityResult.findings.some(
				(finding) =>
					finding.reason === reason &&
					finding.elements.some((element) => element.id === "pevid") &&
					finding.affectedBBox?.x === Number.MAX_VALUE,
			),
		) &&
		["rotation", "persisted-seed", "invalid-library-attribution"].every((reason) =>
			prerequisiteTotalityResult.findings.some(
				(finding) =>
					finding.reason === reason &&
					finding.elements.some((element) => element.id === "pgeom") &&
					finding.affectedBBox?.x === Number.MAX_VALUE,
			),
		) &&
		["rotation", "malformed-start-binding"].every((reason) =>
			prerequisiteTotalityResult.findings.some(
				(finding) =>
					finding.reason === reason &&
					finding.elements.some((element) => element.id === "pbind") &&
					finding.affectedBBox?.x === Number.MAX_VALUE,
			),
		) &&
		prerequisiteTotalityResult.findings.some(
			(finding) =>
				finding.code === "STALE_LINEAR_DIMENSIONS" &&
				finding.elements.some((element) => element.id === "persisted-large-path") &&
				finding.details.measuredWidth === 9_999 &&
				finding.details.measuredHeight === 1,
		) &&
		!prerequisiteTotalityResult.findings.some(
			(finding) =>
				(finding.code === "CONNECTOR_PENETRATES_NODE" && finding.details.connectorId === "bedge") ||
				(finding.code === "LABEL_OVERLAP" &&
					finding.details.labelId === "rlbl" &&
					finding.details.nodeId === "reverse-owner"),
		),
	`status=${prerequisiteTotalityRun.status} stderr=${prerequisiteTotalityRun.stderr} findings=${prerequisiteTotalityResult?.findings
		?.map(
			(finding) => `${finding.reason}:${finding.elements.map((element) => element.id).join("+")}`,
		)
		.join(",")}`,
);
const limitExtremeRun = run("limit-extreme", ["--strict"]);
const limitExtremeResult = limitExtremeRun.stdout ? JSON.parse(limitExtremeRun.stdout) : null;
check(
	"persisted 2,000,001 limit input closes its opposite-extreme span through the package",
	limitExtremeRun.status === 8 &&
		limitExtremeRun.stderr === "" &&
		CheckResultSchema.safeParse(limitExtremeResult).success &&
		limitExtremeResult.broadPhaseComparisons === 2_000_001 &&
		limitExtremeResult.findings.some(
			(finding) => finding.code === "INSPECTION_LIMIT_EXCEEDED" && finding.elements.length > 0,
		) &&
		limitExtremeResult.findings.some(
			(finding) =>
				finding.reason === "unrepresentable-coordinate-span" &&
				finding.details.scope === "finding-affected-union",
		),
	`status=${limitExtremeRun.status} stderr=${limitExtremeRun.stderr} comparisons=${limitExtremeResult?.broadPhaseComparisons} findings=${limitExtremeResult?.findings
		?.map((finding) => `${finding.reason}:${finding.elements.length}`)
		.join(",")}`,
);
const preprocessingPackageRun = run("preprocessing-limit");
const preprocessingStrictRun = run("preprocessing-limit", ["--strict"]);
const preprocessingTextRun = run("preprocessing-limit", ["--text"]);
const preprocessingPackageResult = preprocessingPackageRun.stdout
	? JSON.parse(preprocessingPackageRun.stdout)
	: null;
check(
	"persisted preprocessing ceiling preserves validated stdout and strict/non-strict exits",
	preprocessingPackageRun.status === 0 &&
		preprocessingStrictRun.status === 8 &&
		preprocessingPackageRun.stderr === "" &&
		preprocessingStrictRun.stderr === "" &&
		preprocessingPackageRun.stdout === preprocessingStrictRun.stdout &&
		CheckResultSchema.safeParse(preprocessingPackageResult).success &&
		preprocessingPackageResult.findings.filter(
			(finding) => finding.reason === "broad-phase-preprocessing-ceiling",
		).length === 1 &&
		preprocessingPackageResult.broadPhaseComparisons === 0,
	`statuses=${preprocessingPackageRun.status}/${preprocessingStrictRun.status}`,
);
check(
	"persisted preprocessing ceiling text bytes use the exhaustive production formatter",
	preprocessingTextRun.status === 0 &&
		preprocessingTextRun.stderr === "" &&
		preprocessingTextRun.stdout === formatInspectionText(preprocessingPackageResult) + "\n",
);
const impossibleVault = path.join(vault, "not-a-directory");
fs.writeFileSync(impossibleVault, "sentinel");
const invalidBeforeIo = spawnSync(
	path.join(root, "bin/canvas"),
	["check", "--board", "missing", "--overlap-tolerance", "bad"],
	{
		cwd: root,
		env: {
			...process.env,
			ARCHBOARD_VAULT: impossibleVault,
			EXCALIDRAW_NO_AUTOSTART: "1",
			EXPRESS_SERVER_URL: `http://127.0.0.1:${sentinelPort}`,
		},
		encoding: "utf8",
	},
);
check(
	"invalid policy precedes an unreadable vault at the package boundary",
	invalidBeforeIo.status === 2 &&
		invalidBeforeIo.stdout === "" &&
		invalidBeforeIo.stderr.includes("finite nonnegative") &&
		!invalidBeforeIo.stderr.includes("not-a-directory"),
);
fs.rmSync(impossibleVault);
const unchangedVault = snapshot() === beforeVault;
check("CLI leaves vault paths, bytes, and mtimes unchanged", unchangedVault);
check(
	"no write, lock, claim, open, save, repair, rewrite, or id-mint side effect occurs",
	unchangedVault &&
		malformedResult.findings.some(
			(finding) =>
				finding.reason === "invalid-element-identity" && finding.elements[0]?.id === null,
		),
);
check("check makes zero HTTP contacts", fs.readFileSync(sentinelLog, "utf8") === "");
check(
	"normal ingest remains strict",
	(() => {
		try {
			ingestScene([{ id: "bad", type: "rectangle", x: 0, y: 0, width: null, height: 2 }]);
			return false;
		} catch {
			return true;
		}
	})(),
);
fs.rmSync(vault, { recursive: true, force: true });
sentinel.kill();
fs.rmSync(sentinelLog, { force: true });
if (failures) {
	console.error(`board-inspection: ${failures} of ${checks} checks failed`);
	process.exit(1);
}
console.log(`board-inspection: ${checks} checks passed`);

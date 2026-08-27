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
	INSPECTION_INPUT_COMPLEXITY_LIMIT,
	BROAD_PHASE_COMPARISON_LIMIT,
	InspectionFindingSchema,
	InspectionReportSchema,
	CheckResultSchema,
	ObstacleRefSchema,
	formatInspectionText,
} = await import(src("runtime/board-inspection/index.ts"));
const { inspectBoardDiagnostics, diagnoseSweepCompatibility } = await import(
	src("runtime/board-inspection/diagnostics.ts")
);
const { compareBoards } = await import(src("runtime/engine/compare.ts"));
const { renderBoardNote } = await import(src("runtime/engine/board.ts"));
const { ingestScene } = await import(src("runtime/engine/board-io.ts"));
const { collectInvalidRenderGeometry } = await import(src("runtime/engine/geometry.ts"));
const { planLabelRepair } = await import(src("runtime/engine/labels.ts"));
const { applyElementInput } = await import(src("runtime/engine/apply-element-input.ts"));
const { describeScene } = await import(src("runtime/engine/describe.ts"));
const { architectureFacts } = await import(src("runtime/board-inspection/architecture.ts"));
const {
	BridgeMetadataSchema,
	BridgeRefusal,
	planBridgeCreate,
	planBridgeRemoval,
	validateBridgeDecorations,
} = await import(src("runtime/board-inspection/bridge.ts"));
let failures = 0,
	checks = 0;
const check = (label, condition, detail = "") => {
	checks += 1;
	if (!condition) {
		failures += 1;
		console.error(`FAIL - ${label}${detail ? ` (${detail})` : ""}`);
	}
};

const frozen = Object.freeze([]);
const clean = inspectBoard(frozen);
check("empty board is clean", clean.clean && clean.coverage === "complete");
check(
	"schema-v2 publishes only input and comparison ceilings",
	INSPECTION_INPUT_COMPLEXITY_LIMIT === 1_000_000 &&
		BROAD_PHASE_COMPARISON_LIMIT === 2_000_000 &&
		clean.schemaVersion === 2 &&
		JSON.stringify(clean.limits) ===
			JSON.stringify({ inputComplexityUnits: 1_000_000, broadPhaseComparisons: 2_000_000 }),
);
check("report parses through the public schema", InspectionReportSchema.safeParse(clean).success);
check(
	"schema-v2 report omits private analysis mechanics",
	!("preprocessingWork" in clean) &&
		!InspectionReportSchema.safeParse({ ...clean, preprocessingWork: {} }).success,
);

const bridgeOver = {
	id: "bridge-over",
	type: "line",
	x: 0,
	y: 50,
	width: 100,
	height: 0,
	points: [
		[0, 0],
		[100, 0],
	],
	index: "a0",
};
const bridgeUnder = {
	id: "bridge-under",
	type: "arrow",
	x: 50,
	y: 0,
	width: 0,
	height: 100,
	points: [
		[0, 0],
		[0, 100],
	],
	index: "a1",
};
const unmarkedBridgeReport = inspectBoard([bridgeOver, bridgeUnder]);
check(
	"a supported proper crossing is unmarked before bridge creation",
	unmarkedBridgeReport.findings.some(({ code }) => code === "CONNECTOR_INTERSECTION_UNMARKED"),
);
const bridgePlan = planBridgeCreate({
	elements: [bridgeOver, bridgeUnder],
	bridgeId: "Bridge01",
	overConnectorId: bridgeOver.id,
	underConnectorId: bridgeUnder.id,
	background: "#FfFfFf",
});
const bridgedBoard = new Map([
	[bridgeOver.id, bridgeOver],
	[bridgeUnder.id, bridgeUnder],
]);
const bridgeApplied = applyElementInput(bridgedBoard, {
	upserts: [...bridgePlan.inputs],
	origin: "agent",
});
const bridgedElements = [...bridgedBoard.values()];
check(
	"bridge creation names exactly two role-ordered unbound and ungrouped lines",
	bridgeApplied.named.length === 2 &&
		bridgeApplied.named[0].id === "Bridge01" &&
		bridgeApplied.named.every(
			(element) =>
				element.type === "line" &&
				element.groupIds?.length === 0 &&
				element.startBinding === null &&
				element.endBinding === null,
		),
);
check(
	"bridge metadata is strict, normalized, and differs only by role",
	bridgeApplied.named.every((element, index) => {
		const metadata = element.customData?.archboard?.bridge;
		return (
			BridgeMetadataSchema.safeParse(metadata).success &&
			metadata.background === "#ffffff" &&
			metadata.role === (index === 0 ? "mask" : "redraw")
		);
	}),
);
const validatedBridge = validateBridgeDecorations(bridgedElements);
check(
	"the exact persisted pair validates and suppresses only its crossing",
	validatedBridge.valid.length === 1 &&
		validatedBridge.invalid.length === 0 &&
		!inspectBoard(bridgedElements).findings.some(
			({ code }) => code === "CONNECTOR_INTERSECTION_UNMARKED",
		),
);
check(
	"valid bridge parts are absent from architecture and describe entry seams",
	architectureFacts(bridgedElements).elements.length === 2 &&
		describeScene(bridgedElements) === describeScene([bridgeOver, bridgeUnder]),
);
const bridgeCompareInput = (elements) => ({
	key: "bridge-fixture",
	identity: { board: "bridge-fixture", variant: "current" },
	elements,
	source: "memory",
});
check(
	"compare bytes are unchanged by a valid bridge decoration",
	JSON.stringify(compareBoards(bridgeCompareInput([bridgeOver, bridgeUnder]), bridgeCompareInput([bridgeOver, bridgeUnder]))) ===
		JSON.stringify(compareBoards(bridgeCompareInput(bridgedElements), bridgeCompareInput(bridgedElements))),
);
const secondUnder = {
	...bridgeUnder,
	id: "bridge-second-under",
	x: 70,
};
const secondCrossingReport = inspectBoard([...bridgedElements, secondUnder]);
check(
	"a valid bridge suppresses only its recorded crossing",
	secondCrossingReport.findings.filter(
		({ code }) => code === "CONNECTOR_INTERSECTION_UNMARKED",
	).length === 1,
);
const staleBridgeElements = bridgedElements.map((element) =>
	element.id === bridgeUnder.id ? Object.assign({}, element, { x: element.x + 10 }) : element,
);
const staleBridgeReport = inspectBoard(staleBridgeElements);
check(
	"stale provenance suppresses nothing and reports one closed stale finding",
	staleBridgeReport.findings.some(
		({ code, reason }) => code === "BRIDGE_PROVENANCE_INVALID" && reason === "stale-decoration",
	) &&
		staleBridgeReport.findings.some(({ code }) => code === "CONNECTOR_INTERSECTION_UNMARKED"),
);
const staleProvenanceFinding = staleBridgeReport.findings.find(
	({ code }) => code === "BRIDGE_PROVENANCE_INVALID",
);
check(
	"bridge provenance schema fixes severity and coverage literals",
	staleProvenanceFinding &&
		!InspectionFindingSchema.safeParse({ ...staleProvenanceFinding, severity: "warning" }).success &&
		!InspectionFindingSchema.safeParse({ ...staleProvenanceFinding, affectsCoverage: true }).success,
);
const incompleteBridgeReport = inspectBoard([
	bridgeOver,
	bridgeUnder,
	bridgeApplied.named[0],
]);
check(
	"an incomplete candidate reports provenance and suppresses nothing",
	incompleteBridgeReport.findings.some(
		({ code, reason }) =>
			code === "BRIDGE_PROVENANCE_INVALID" && reason === "incomplete-decoration",
	) &&
		incompleteBridgeReport.findings.some(({ code }) => code === "CONNECTOR_INTERSECTION_UNMARKED"),
);
check(
	"removal is provenance-only and remains safe after both sources disappear",
	JSON.stringify(planBridgeRemoval(bridgeApplied.named, "Bridge01")) ===
		JSON.stringify(bridgeApplied.named.map(({ id }) => id)),
);
check(
	"bridge metadata rejects extra fields",
	!BridgeMetadataSchema.safeParse({
		...bridgeApplied.named[0].customData.archboard.bridge,
		extra: true,
	}).success,
);
let identicalRefused = false;
try {
	planBridgeCreate({
		elements: [bridgeOver],
		bridgeId: "Refused1",
		overConnectorId: bridgeOver.id,
		underConnectorId: bridgeOver.id,
		background: "#ffffff",
	});
} catch (error) {
	identicalRefused = error instanceof BridgeRefusal;
}
check("bridge planning gives a bounded refusal for identical sources", identicalRefused);
const multiOver = {
	...bridgeOver,
	id: "multi-over",
	x: 0,
	y: 0,
	width: 100,
	height: 100,
	points: [
		[0, 0],
		[100, 0],
		[100, 100],
		[0, 100],
	],
};
const multiUnder = {
	...bridgeUnder,
	id: "multi-under",
	x: 50,
	y: -10,
	width: 0,
	height: 120,
	points: [
		[0, 0],
		[0, 120],
	],
};
let missingAtRefused = false;
try {
	planBridgeCreate({
		elements: [multiOver, multiUnder],
		bridgeId: "Multi001",
		overConnectorId: multiOver.id,
		underConnectorId: multiUnder.id,
		background: "#ffffff",
	});
} catch (error) {
	missingAtRefused = error instanceof BridgeRefusal;
}
const selectedAtBoundary = planBridgeCreate({
	elements: [multiUnder, multiOver],
	bridgeId: "Multi001",
	overConnectorId: multiOver.id,
	underConnectorId: multiUnder.id,
	background: "#ffffff",
	at: { x: 50, y: 0.5 },
});
check(
	"multiple crossings require --at and inclusive 0.5 selection is deterministic under reversal",
	missingAtRefused &&
		selectedAtBoundary.overSegmentIndex === 0 &&
		selectedAtBoundary.underSegmentIndex === 0 &&
		selectedAtBoundary.crossing.x === 50 &&
		selectedAtBoundary.crossing.y === 0,
);
let outsideAtRefused = false;
try {
	planBridgeCreate({
		elements: [multiOver, multiUnder],
		bridgeId: "Multi002",
		overConnectorId: multiOver.id,
		underConnectorId: multiUnder.id,
		background: "#ffffff",
		at: { x: 50, y: 0.500_001 },
	});
} catch (error) {
	outsideAtRefused = error instanceof BridgeRefusal;
}
check("--at just outside 0.5 is refused", outsideAtRefused);
check(
	"repeated inspection is byte deterministic",
	JSON.stringify(clean) === JSON.stringify(inspectBoard(frozen)),
);
check(
	"development diagnostics preserve exact production report bytes",
	JSON.stringify(inspectBoardDiagnostics(frozen).report) === JSON.stringify(clean),
);

let getterHits = 0;
const getterRecord = { id: "getter", type: "rectangle", y: 0, width: 1, height: 1 };
Object.defineProperty(getterRecord, "x", {
	get() {
		getterHits += 1;
		return 0;
	},
});
const cyclicRecord = { id: "cycle", type: "rectangle", x: 0, y: 0, width: 1, height: 1 };
cyclicRecord.customData = cyclicRecord;
const revokedRoot = Proxy.revocable([], {});
revokedRoot.revoke();
const revokedNested = Proxy.revocable({}, {});
revokedNested.revoke();
const customPrototype = Object.create({ inherited: true });
Object.assign(customPrototype, {
	id: "prototype",
	type: "rectangle",
	x: 0,
	y: 0,
	width: 1,
	height: 1,
});
const unsafeInputs = [
	["root revoked proxy", revokedRoot.proxy],
	[
		"nested revoked proxy",
		[
			{
				id: "proxy",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 1,
				height: 1,
				customData: revokedNested.proxy,
			},
		],
	],
	["accessor", [getterRecord]],
	["cycle", [cyclicRecord]],
	["custom prototype", [customPrototype]],
	[
		"function",
		[{ id: "function", type: "rectangle", x: 0, y: 0, width: 1, height: 1, customData() {} }],
	],
	[
		"symbol",
		[
			{
				id: "symbol",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 1,
				height: 1,
				customData: Symbol("unsafe"),
			},
		],
	],
	[
		"bigint",
		[{ id: "bigint", type: "rectangle", x: 0, y: 0, width: 1, height: 1, customData: 1n }],
	],
];
for (const [label, input] of unsafeInputs) {
	let report;
	let thrown;
	try {
		report = inspectBoard(input);
	} catch (error) {
		thrown = error;
	}
	check(
		`${String(label)} is inert, schema-valid, and indeterminate`,
		!thrown &&
			InspectionReportSchema.safeParse(report).success &&
			report.coverage === "indeterminate" &&
			report.findings.some((finding) => finding.reason === "non-data-input"),
		thrown instanceof Error ? thrown.message : "",
	);
}
check("inspection never invokes an input accessor", getterHits === 0);

const duplicateLabelCreatedAtBoard = (reverse = false) => {
	const labels = [
		{
			id: "newlbl",
			type: "text",
			x: 0,
			y: 0,
			width: 20,
			height: 10,
			fontFamily: 5,
			text: "newer",
			containerId: "owner",
			createdAt: "2026-08-27T02:00:00.000Z",
		},
		{
			id: "oldlbl",
			type: "text",
			x: 0,
			y: 0,
			width: 20,
			height: 10,
			fontFamily: 5,
			text: "older",
			containerId: "owner",
			createdAt: "2026-08-27T01:00:00.000Z",
		},
	];
	return [
		{
			id: "owner",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 40,
			height: 20,
			angle: 0,
		},
		...(reverse ? labels.toReversed() : labels),
	];
};
for (const reverse of [false, true]) {
	const board = duplicateLabelCreatedAtBoard(reverse);
	const report = inspectBoard(board);
	const production = planLabelRepair(board);
	const duplicate = report.findings.find(
		(finding) => finding.code === "LABEL_CORRUPTION" && finding.reason === "duplicate",
	);
	check(
		`duplicate label repair keeps the oldest createdAt in ${reverse ? "reverse" : "forward"} record order`,
		production.duplicates[0]?.keep === "oldlbl" &&
			duplicate?.details.keeperId === production.duplicates[0]?.keep &&
			JSON.stringify(duplicate.details.duplicateIds) === JSON.stringify(["newlbl"]),
		JSON.stringify(duplicate?.details),
	);
}
const holeInput = [];
holeInput.length = 3;
const holeReport = inspectBoard(holeInput);
check(
	"top-level holes consume slots and return a schema-valid report",
	holeReport.totalElementCount === 3 && InspectionReportSchema.safeParse(holeReport).success,
);
const sparseInput = [];
sparseInput.length = 1_000_001;
const sparseInputReport = inspectBoard(sparseInput);
check(
	"huge sparse input stops at the logical slot ceiling",
	sparseInputReport.findings.some(
		(finding) =>
			finding.reason === "input-complexity-ceiling" &&
			finding.details.sourceIndex === 1_000_000 &&
			finding.details.unitKind === "record",
	),
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
		"non-data-input",
		"error",
		true,
		{ sourceIndex: 0, path: ["customData"], issue: "accessor" },
	],
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
		"input-complexity-ceiling",
		"warning",
		true,
		{
			limit: 1_000_000,
			attempted: 1_000_001,
			pass: "input-scan",
			phase: "snapshot-input",
			completedRecordCount: 0,
			sourceIndex: 0,
			path: ["id"],
			unitKind: "string-code-unit",
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
check(
	"schema rejects the removed analysis limit and report limit key",
	!InspectionFindingSchema.safeParse({
		...schemaFindings[0],
		code: "INSPECTION_LIMIT_EXCEEDED",
		reason: ["analysis-work", "ceiling"].join("-"),
	}).success &&
		!InspectionReportSchema.safeParse({
			...clean,
			limits: { ...clean.limits, [["analysis", "WorkItems"].join("")]: 25_000_000 },
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
		`obstacle identity ${label} obeys the schema-v2 escaping grammar`,
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
const comparisonLimitFinding = limited.findings.find(
	(finding) => finding.reason === "broad-phase-comparison-ceiling",
);
for (const [label, details] of [
	["wrong limit", { limit: 2_000_001 }],
	["wrong attempt", { attempted: 2_000_002 }],
	["unknown collision pass", { pass: "record-analysis" }],
])
	check(
		`comparison limit schema rejects ${String(label)}`,
		!!comparisonLimitFinding &&
			!InspectionFindingSchema.safeParse({
				...comparisonLimitFinding,
				details: { ...comparisonLimitFinding.details, ...details },
			}).success,
	);

const terminalComparisonPrecedenceBoard = () => {
	const hierarchyCount = 1_420;
	const hierarchy = Array.from({ length: hierarchyCount }, (_, index) => ({
		id: `terminal-hierarchy-${index}`,
		type: "rectangle",
		x: 10_000 + index,
		y: 10_000 + index,
		width: (hierarchyCount - index) * 2,
		height: (hierarchyCount - index) * 2,
		angle: 0,
		customData: { archboard: { node: `terminal-node-${index}` } },
	}));
	return [
		...performanceBoard(500, 1_500, 500),
		...hierarchy,
		{
			id: "terminal-zero-segments",
			type: "arrow",
			x: 20_000,
			y: 0,
			width: 0,
			height: 0,
			angle: 0,
			points: Array.from({ length: 10_001 }, () => [0, 0]),
		},
	];
};
const terminalComparisonBoard = terminalComparisonPrecedenceBoard();
const terminalComparisonDiagnostics = inspectBoardDiagnostics(terminalComparisonBoard);
const terminalComparisonLimits = terminalComparisonDiagnostics.report.findings.filter(
	(finding) => finding.code === "INSPECTION_LIMIT_EXCEEDED",
);
check(
	"comparison ceiling is the sole terminal limit after earlier completed findings",
	terminalComparisonDiagnostics.report.broadPhaseComparisons === 2_000_001 &&
		terminalComparisonLimits.length === 1 &&
		terminalComparisonLimits[0]?.reason === "broad-phase-comparison-ceiling" &&
		terminalComparisonDiagnostics.report.findings.filter(
			(finding) =>
				finding.reason === "zero-length" &&
				finding.details.connectorId === "terminal-zero-segments" &&
				finding.details.segmentIndex === 0,
		).length === 1,
	JSON.stringify({
		limits: terminalComparisonLimits.map((finding) => finding.reason),
	}),
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

const inputBoundaryRecord = (idLength) => ({
	id: "x".repeat(idLength),
	type: "rectangle",
	x: 0,
	y: 0,
	width: 1,
	height: 1,
});
const inputBoundary = inspectBoardDiagnostics([inputBoundaryRecord(999_984)]);
const inputLimitedBoard = [inputBoundaryRecord(999_985)];
const inputLimited = inspectBoard(inputLimitedBoard);
const inputLimitFinding = inputLimited.findings.find(
	(finding) => finding.reason === "input-complexity-ceiling",
);
check(
	"input snapshot accepts exactly 1,000,000 units and refuses unit 1,000,001",
	inputBoundary.work.inputUnits === 1_000_000 &&
		inputBoundary.report.clean &&
		InspectionReportSchema.safeParse(inputLimited).success &&
		inputLimited.broadPhaseComparisons === 0 &&
		inputLimitFinding?.details.limit === 1_000_000 &&
		inputLimitFinding?.details.attempted === 1_000_001 &&
		inputLimitFinding?.details.unitKind === "string-code-unit" &&
		inputLimitFinding?.elements[0]?.id?.length === 999_985 &&
		inputLimited.coverage === "indeterminate",
	inputLimitFinding
		? JSON.stringify({ details: inputLimitFinding.details })
		: "missing limit finding",
);
check(
	"input-limit reports are byte deterministic and expose no private work count",
	JSON.stringify(inputLimited) === JSON.stringify(inspectBoard(inputLimitedBoard)) &&
		!("inputUnits" in inputLimited) &&
		!("preprocessingWork" in inputLimited),
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
	(finding) => finding.reason === "input-complexity-ceiling",
);
check(
	"long library identity stops during the inert input snapshot",
	InspectionReportSchema.safeParse(longLibraryReport).success &&
		longLibraryReport.coverage === "indeterminate" &&
		longLibraryLimit?.details.attempted === 1_000_001 &&
		longLibraryLimit?.details.pass === "input-scan" &&
		longLibraryLimit?.details.phase === "snapshot-input" &&
		longLibraryLimit.elements[0]?.id === null &&
		longLibraryLimit.elements[0]?.sourceIndex === 0,
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
	"750,000-point input stops at the input ceiling without throwing",
	!largeCardinalityFailure &&
		InspectionReportSchema.safeParse(largeCardinalityReport).success &&
		largeCardinalityReport.findings.some(
			(finding) => finding.reason === "input-complexity-ceiling",
		) &&
		largeCardinalityReport.broadPhaseComparisons === 0,
	largeCardinalityFailure instanceof Error ? largeCardinalityFailure.message : "",
);
const supportedInputControl = inspectBoardDiagnostics([
	connector({
		id: "supported-input-control",
		angle: 0,
		width: 249_999,
		height: 1,
		points: Array.from({ length: 250_000 }, (_, index) => [index, index % 2]),
	}),
]);
check(
	"250,000-point supported path completes the input snapshot below its ceiling",
	supportedInputControl.work.inputUnits < INSPECTION_INPUT_COMPLEXITY_LIMIT &&
		!supportedInputControl.report.findings.some(
			(finding) => finding.reason === "input-complexity-ceiling",
		) &&
		InspectionReportSchema.safeParse(supportedInputControl.report).success,
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
	"sparse distinct partitions preserve coarse zero-visit diagnostics",
	sparseSweepResults.every(({ count, diagnostics }) => {
		return (
			diagnostics.work.broadPhaseCompatibleVisits === 0 &&
			diagnostics.work.broadPhaseBucketScans === 0 &&
			diagnostics.work.broadPhaseExactQuerySteps === 0 &&
			diagnostics.work.broadPhasePeakActiveBuckets <= 1 &&
			diagnostics.work.broadPhasePeakIndexNodes <= 1 &&
			diagnostics.work.broadPhaseEvents === count * 6 &&
			diagnostics.work.hierarchyCandidateVisits === 0 &&
			diagnostics.work.containerBoundaryCandidateVisits === 0 &&
			!diagnostics.report.findings.some((finding) => finding.code === "INSPECTION_LIMIT_EXCEEDED")
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
			diagnostics.work.broadPhaseBucketScans === 0 &&
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
		denseDistinctDiagnostics.work.broadPhasePeakActiveBuckets <= denseDistinctConnectorCount &&
		denseDistinctDiagnostics.work.broadPhasePeakIndexNodes <= denseDistinctConnectorCount &&
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
	[8, 128],
	[16, 256],
	[32, 512],
].map(([height, labelCount]) => ({
	height,
	labelCount,
	diagnostics: inspectBoardDiagnostics(nestedOwnerLabelBoard(height, labelCount)),
}));
check(
	"own-plus-ancestor label exclusions preserve A=0 semantics",
	nestedOwnerLabelDiagnostics.every(
		({ diagnostics }) =>
			diagnostics.report.broadPhaseComparisons === 0 &&
			diagnostics.work.broadPhaseCompatibleVisits === 0 &&
			diagnostics.work.broadPhaseBucketScans === 0 &&
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
			diagnostics.work.broadPhaseBucketScans <= count + 1,
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
const partialComplementScaling = [1_000, 2_000].flatMap((count) =>
	[false, true].map((reverse) => ({
		count,
		reverse,
		diagnostics: partialComplementSweep(count, reverse),
	})),
);
check(
	"partial-complement hierarchy queries preserve the exact eligible pair set",
	partialComplementScaling.every(
		({ count, diagnostics }) =>
			diagnostics.pairs.length === count &&
			diagnostics.work.activeVisits === count &&
			diagnostics.work.bucketScans === count &&
			diagnostics.work.hierarchyNodeVisits === count * (count + 1) &&
			diagnostics.work.peakActiveBuckets === count * 2 + 1 &&
			diagnostics.work.peakActiveProfiles === count * 2 + 1,
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
	[8, 128],
	[16, 256],
].map(([height, labelCount]) => ({
	height,
	labelCount,
	diagnostics: inspectBoardDiagnostics(distinctConflictingLabelBoard(height, labelCount)),
}));
check(
	"distinct conflicting label profiles keep semantic A=0",
	distinctConflictingDiagnostics.every(
		({ height, labelCount, diagnostics }) =>
			diagnostics.report.broadPhaseComparisons === 0 &&
			diagnostics.work.broadPhaseCompatibleVisits === 0 &&
			diagnostics.work.broadPhaseBucketScans === 0 &&
			diagnostics.work.broadPhasePeakActiveBuckets <= labelCount + height &&
			diagnostics.work.broadPhasePeakActiveProfiles <= labelCount * 2 + height &&
			!diagnostics.report.findings.some((finding) => finding.code === "LABEL_OVERLAP"),
	),
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
		({ diagnostics }) => diagnostics.work.containerBoundaryCandidateVisits === 0,
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
		denseHierarchyCount * (denseHierarchyCount - 1),
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
	"compact two-sided exact exclusions enumerate an empty semantic complement",
	compactExactUnionRed.pairs.length === 0 &&
		compactExactUnionRed.work.bucketScans === 0 &&
		compactExactUnionRed.work.activeVisits === 0,
	JSON.stringify(compactExactUnionRed.work),
);
const compactExactUnionScaling = [128, 256, 512].map((count) => ({
	count,
	diagnostics: compactExactUnionSweep(count),
}));
check(
	"compact arbitrary two-sided exact exclusions remain deterministic under logical work accounting",
	compactExactUnionScaling.every(
		({ count, diagnostics }) =>
			diagnostics.pairs.length === 0 &&
			diagnostics.work.activeVisits === 0 &&
			diagnostics.work.bucketScans === 0 &&
			diagnostics.work.exactQuerySteps === count * count * 2 &&
			diagnostics.work.peakActiveBuckets === count * 2 &&
			diagnostics.work.peakActiveProfiles === count * 2,
	),
	JSON.stringify(
		compactExactUnionScaling.map(({ count, diagnostics }) => [count, diagnostics.work]),
	),
);

function alternatingExactSweep(count, reverse = false) {
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
	});
}
const alternatingExactArithmetic = [64, 128, 256, 512].flatMap((count) =>
	[false, true].map((reverse) => ({
		count,
		reverse,
		diagnostics: alternatingExactSweep(count, reverse),
	})),
);
check(
	"alternating exact-union work is deterministic in both cross orientations",
	alternatingExactArithmetic.every(
		({ count, diagnostics }) =>
			diagnostics.pairs.length === 0 &&
			diagnostics.work.activeVisits === 0 &&
			diagnostics.work.bucketScans === 0 &&
			diagnostics.work.exactQuerySteps === 2 * count * count,
	),
	JSON.stringify(
		alternatingExactArithmetic.map(({ count, reverse, diagnostics }) => [
			count,
			reverse,
			diagnostics.work.exactQuerySteps,
		]),
	),
);
const hierarchyFanoutCount = 64;
const hierarchyFanout = diagnoseSweepCompatibility({
	left: [],
	right: [],
	sameSet: false,
	hierarchyParents: new Map([
		["fanout-root", null],
		...Array.from({ length: hierarchyFanoutCount - 1 }, (_, index) => [
			`fanout-child-${index}`,
			"fanout-root",
		]),
	]),
});
check(
	"hierarchy fanout remains deterministic in coarse diagnostics",
	hierarchyFanout.pairs.length === 0 &&
		JSON.stringify(hierarchyFanout) ===
			JSON.stringify(
				diagnoseSweepCompatibility({
					left: [],
					right: [],
					sameSet: false,
					hierarchyParents: new Map([
						["fanout-root", null],
						...Array.from({ length: hierarchyFanoutCount - 1 }, (_, index) => [
							`fanout-child-${index}`,
							"fanout-root",
						]),
					]),
				}),
			),
	JSON.stringify(hierarchyFanout),
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
		diagnostics.work.peakActiveBuckets <= intervalCount &&
			diagnostics.work.peakActiveProfiles <= intervalCount &&
			semanticInput === intervalCount + exactExclusionEntries + ancestorTargetEntries,
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
	"coarse retained-state peaks sample only completed item boundaries",
	retainedPeakComplete.work.peakActiveBuckets === 4 &&
		retainedPeakComplete.work.peakActiveProfiles === 4 &&
		retainedPeakEarly.pairs.length === 1 &&
		retainedPeakEarly.work.peakActiveBuckets === 3 &&
		retainedPeakEarly.work.peakActiveProfiles === 3,
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
		exactReinsertion.work.expiryPops === 2,
	JSON.stringify(exactReinsertion),
);
check(
	"reciprocal hierarchy queries require every target to lie outside the event subtree",
	reciprocalMultiTargetScaling.every(
		({ count, diagnostics }) =>
			diagnostics.pairs.length === 0 &&
			diagnostics.work.activeVisits === 0 &&
			diagnostics.work.bucketScans === 0 &&
			diagnostics.work.exactQuerySteps === count * 2 &&
			diagnostics.work.hierarchyNodeVisits === count &&
			diagnostics.work.peakActiveBuckets === count + 1 &&
			diagnostics.work.peakActiveProfiles === count + 1,
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

const largeUngrouped = Array.from({ length: 2_000 }, (_, index) => {
	return {
		id: `ungrouped-${index}`,
		type: "rectangle",
		x: index * 3,
		y: 50_000,
		width: 2,
		height: 2,
		angle: 0,
		groupIds: [],
		customData: { library: { itemId: `library-${index}` } },
	};
});
const largeUngroupedDiagnostics = inspectBoardDiagnostics(largeUngrouped);
check(
	"large ungrouped obstacle analysis remains semantically clean",
	largeUngroupedDiagnostics.report.clean &&
		largeUngroupedDiagnostics.work.inputUnits < INSPECTION_INPUT_COMPLEXITY_LIMIT,
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
const oversizedBoundElementsRecord = {
	id: "oversized-bound-elements",
	type: "rectangle",
	x: 0,
	y: 0,
	width: 10,
	height: 10,
	boundElements: Array(1_000_000).fill(null),
};
const oversizedBoundElementsReport = inspectBoard([oversizedBoundElementsRecord]);
check(
	"one million null boundElements stop during input scan before classification",
	oversizedBoundElementsReport.broadPhaseComparisons === 0 &&
		oversizedBoundElementsReport.findings.some(
			(finding) =>
				finding.reason === "input-complexity-ceiling" &&
				JSON.stringify(finding.details.path) === JSON.stringify(["boundElements"]),
		),
);
const boundEntryWorkBoard = (count) => [
	{
		id: "bound-entry-owner",
		type: "rectangle",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		angle: 0,
		boundElements: Array.from({ length: count }, () => ({ id: "bound-entry-line", type: "arrow" })),
	},
	{
		id: "bound-entry-line",
		type: "line",
		x: 20,
		y: 20,
		width: 10,
		height: 0,
		angle: 0,
		points: [
			[0, 0],
			[10, 0],
		],
	},
];
const oneBoundEntry = inspectBoardDiagnostics(boundEntryWorkBoard(1));
const thousandBoundEntries = inspectBoardDiagnostics(boundEntryWorkBoard(1_000));
check(
	"boundElements cardinality does not change matching reciprocal semantics",
	oneBoundEntry.report.clean && thousandBoundEntries.report.clean,
);
const duplicateRefOrderBoard = (count) =>
	Array.from({ length: count }, (_, index) => ({
		id: "duplicate-ref-order",
		type: "rectangle",
		x: index * 20,
		y: 0,
		width: 10,
		height: 10,
		angle: 0,
	}));
const duplicateRefOrderLarge = inspectBoardDiagnostics(duplicateRefOrderBoard(32));
const duplicateRefFinding = duplicateRefOrderLarge.report.findings.find(
	(finding) => finding.reason === "duplicate-element-id",
);
check(
	"finding and element-ref ordering preserves stable source order",
	!!duplicateRefFinding &&
		duplicateRefFinding.elements.every((element, index) => element.sourceIndex === index),
	JSON.stringify({
		sources: duplicateRefFinding?.elements.map((element) => element.sourceIndex),
	}),
);
const emptyGroupWork = inspectBoardDiagnostics([groupMeteringBody([])]).work.inputUnits;
for (const count of [1, 7]) {
	const diagnosed = inspectBoardDiagnostics([groupMeteringBody(Array(count).fill(null))]);
	check(
		`every one of ${count} rejected group entries contributes one input unit`,
		diagnosed.report.clean &&
			diagnosed.report.coverage === "complete" &&
			diagnosed.work.inputUnits - emptyGroupWork === count,
		`${diagnosed.work.inputUnits} against ${emptyGroupWork}`,
	);
}
const groupClassificationBoard = (count, mode) => [
	{
		...(mode === "coverage" ? { id: "group-coverage" } : {}),
		type: "rectangle",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		angle: mode === "coverage" ? 0.5 : 0,
		groupIds: Array.from({ length: count }, (_, index) => (index === 0 ? "g" : null)),
	},
];
for (const mode of ["identity", "coverage"]) {
	const one = inspectBoardDiagnostics(groupClassificationBoard(1, mode));
	const thousand = inspectBoardDiagnostics(groupClassificationBoard(1_000, mode));
	check(
		`${mode} group classification preserves semantics with rejected entries`,
		thousand.work.inputUnits - one.work.inputUnits === 999 &&
			(mode === "identity"
				? thousand.report.findings.some(
						(finding) =>
							finding.reason === "invalid-element-identity" &&
							finding.details.intendedRoles.includes("qualifying-group-body"),
					)
				: thousand.report.findings.some(
						(finding) => finding.reason === "rotation" && finding.affectsCoverage,
					)),
		JSON.stringify({ one: one.work.inputUnits, thousand: thousand.work.inputUnits }),
	);
}

const labelMembershipBoard = (missingCount, textCount) => {
	const missing = Array.from({ length: missingCount }, (_, index) => ({
		id: `m${index.toString(36)}`,
		type: "text",
	}));
	return [
		{
			id: "o",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 20,
			height: 20,
			angle: 0,
			groupIds: ["label-membership"],
			boundElements: missing,
		},
		...Array.from({ length: textCount }, (_, index) => ({
			id: `t${index.toString(36)}`,
			type: "text",
			x: 9,
			y: 9,
			width: 2,
			height: 2,
			angle: 0,
			fontFamily: 5,
			text: "x",
			containerId: "o",
		})),
	];
};
const labelMembershipOne = inspectBoardDiagnostics(labelMembershipBoard(1, 1));
const labelMembershipThousand = inspectBoardDiagnostics(labelMembershipBoard(1_000, 1));
check(
	"label planning uses exact indexed membership without changing drift semantics",
	labelMembershipOne.report.findings.some((finding) => finding.reason === "dangling-bound-text") &&
		labelMembershipThousand.report.findings.filter(
			(finding) => finding.reason === "dangling-bound-text",
		).length === 1_000,
	JSON.stringify({
		one: labelMembershipOne.report.findings.length,
		thousand: labelMembershipThousand.report.findings.length,
	}),
);
const labelMembershipControl = inspectBoardDiagnostics(labelMembershipBoard(600, 600));
check(
	"label repair indexed membership preserves the large semantic control",
	labelMembershipControl.report.findings.some((finding) => finding.reason === "duplicate") &&
		labelMembershipControl.report.findings.filter(
			(finding) => finding.reason === "dangling-bound-text",
		).length === 600 &&
		InspectionReportSchema.safeParse(labelMembershipControl.report).success,
	JSON.stringify(labelMembershipControl.work),
);

const labelPairIdentityCases = [
	{
		label: "spaces",
		pairs: [
			["a b", "c"],
			["a", "b c"],
		],
	},
	{
		label: "controls",
		pairs: [
			["control\0owner", "text\u001fleft"],
			["control\u001fowner", "text\0right"],
		],
	},
	{
		label: "shared-prefixes",
		pairs: [
			["prefix", "label"],
			["prefix-long", "label-long"],
		],
	},
];
const labelPairBoard = (pairs, reverse = false) => {
	const records = pairs.flatMap(([containerId, textId], index) => [
		{
			id: containerId,
			type: "rectangle",
			x: index * 100,
			y: 0,
			width: 20,
			height: 20,
			angle: 0,
			boundElements: [{ id: textId, type: "text" }],
		},
		{
			id: textId,
			type: "text",
			x: 500 + index * 100,
			y: 500,
			width: 20,
			height: 10,
			angle: 0,
			fontFamily: 5,
			text: textId,
			containerId,
		},
	]);
	return reverse ? records.toReversed() : records;
};
const driftIdentities = (report) =>
	report.findings
		.filter((finding) => finding.code === "LABEL_CORRUPTION" && finding.reason === "drift")
		.map((finding) => `${finding.details.containerId}\0${finding.details.textId}`)
		.toSorted();
const labelPairDirectEvidence = [];
for (const { label, pairs } of labelPairIdentityCases) {
	const expected = pairs.map(([containerId, textId]) => `${containerId}\0${textId}`).toSorted();
	const forward = inspectBoard(labelPairBoard(pairs));
	const reversed = inspectBoard(labelPairBoard(pairs, true));
	const valid =
		JSON.stringify(driftIdentities(forward)) === JSON.stringify(expected) &&
		JSON.stringify(driftIdentities(reversed)) === JSON.stringify(expected) &&
		!forward.clean &&
		!reversed.clean;
	labelPairDirectEvidence.push(valid);
	check(
		`bound-label pair identity is injective for ${label} under input reversal`,
		valid,
		JSON.stringify({
			expected,
			forward: driftIdentities(forward),
			reversed: driftIdentities(reversed),
		}),
	);
}

const reverseOwnerBoard = (ownerCount) => [
	...Array.from({ length: ownerCount }, (_, index) => ({
		id: `reverse-owner-${index}`,
		type: "rectangle",
		x: index * 30,
		y: 0,
		width: 20,
		height: 20,
		angle: 0,
		boundElements: [{ id: "reverse-owned-label", type: "text" }],
	})),
	{
		id: "reverse-owned-label",
		type: "text",
		x: 5,
		y: 5,
		width: 10,
		height: 10,
		angle: 0,
		fontFamily: 5,
		text: "label",
	},
];
const reverseOwnerOne = inspectBoardDiagnostics(reverseOwnerBoard(1));
const reverseOwnerMany = inspectBoardDiagnostics(reverseOwnerBoard(64));
check(
	"reverse label ownership preserves conflicting-owner semantics",
	reverseOwnerOne.report.findings.every((finding) => finding.reason !== "conflicting-owner") &&
		reverseOwnerMany.report.findings.some(
			(finding) =>
				finding.reason === "conflicting-owner" && finding.details.otherContainerIds.length === 63,
		),
	JSON.stringify({ one: reverseOwnerOne.work, many: reverseOwnerMany.work }),
);

const hierarchyInventoryBoard = (count) =>
	Array.from({ length: count }, (_, index) => ({
		id: `hierarchy-body-${index}`,
		type: "rectangle",
		x: index,
		y: index,
		width: (count - index) * 20,
		height: (count - index) * 20,
		angle: 0,
		customData: { archboard: { node: `hierarchy-node-${index}` } },
	}));
const hierarchyTwo = inspectBoardDiagnostics(hierarchyInventoryBoard(2));
const hierarchyEight = inspectBoardDiagnostics(hierarchyInventoryBoard(8));
check(
	"production hierarchy assignment preserves nested parent and leaf semantics",
	hierarchyTwo.report.findings.every((finding) => finding.code !== "NODE_OVERLAP") &&
		hierarchyEight.report.findings.every((finding) => finding.code !== "NODE_OVERLAP"),
	JSON.stringify({ two: hierarchyTwo.work, eight: hierarchyEight.work }),
);

const failedAggregateBoard = (extraMembers) => [
	semanticNode("inventory-overflow", {
		id: "inventory-positive",
		x: Number.MAX_VALUE,
		width: 0,
	}),
	semanticNode("inventory-overflow", {
		id: "inventory-negative",
		x: -Number.MAX_VALUE,
		width: 0,
	}),
	...Array.from({ length: extraMembers }, (_, index) =>
		semanticNode("inventory-overflow", {
			id: `inventory-local-${index}`,
			x: index,
			width: 1,
			height: 1,
		}),
	),
];
const failedAggregateSmall = inspectBoardDiagnostics(failedAggregateBoard(0));
const failedAggregateLarge = inspectBoardDiagnostics(failedAggregateBoard(64));
check(
	"failed node aggregates remain coverage-affecting across additional members",
	failedAggregateSmall.report.findings.some(
		(finding) => finding.reason === "unrepresentable-coordinate-span",
	) &&
		failedAggregateLarge.report.findings.some(
			(finding) => finding.reason === "unrepresentable-coordinate-span",
		),
	JSON.stringify({ small: failedAggregateSmall.work, large: failedAggregateLarge.work }),
);

const obstacleAttributionBoard = (extraGroupCount) => [
	{
		...validLibraryBody("inventory-obstacle-a", 0, [
			"inventory-shared",
			...Array.from({ length: extraGroupCount }, (_, index) => `inventory-group-${index}`),
		]),
		customData: undefined,
	},
	{
		...validLibraryBody("inventory-obstacle-b", 20, [
			"inventory-shared",
			...Array.from({ length: extraGroupCount }, (_, index) => `inventory-group-${index}`),
		]),
		customData: undefined,
	},
];
const obstacleAttributionSmall = inspectBoardDiagnostics(obstacleAttributionBoard(1));
const obstacleAttributionLarge = inspectBoardDiagnostics(obstacleAttributionBoard(64));
check(
	"obstacle attribution remains deterministic with many canonical group ids",
	obstacleAttributionSmall.report.findings.every(
		(finding) => finding.code !== "INVALID_LIBRARY_ATTRIBUTION",
	) &&
		obstacleAttributionLarge.report.findings.every(
			(finding) => finding.code !== "INVALID_LIBRARY_ATTRIBUTION",
		),
	JSON.stringify({ small: obstacleAttributionSmall.work, large: obstacleAttributionLarge.work }),
);

const pointFindingConnector = (pointCount) => [
	connector({
		id: `point-finding-${pointCount}`,
		x: 0,
		y: 0,
		width: pointCount - 1,
		height: 0,
		curveKind: "bezier",
		points: Array.from({ length: pointCount }, (_, index) => [index, 0]),
	}),
];
const pointFindingOne = inspectBoardDiagnostics(pointFindingConnector(2));
const pointFindingMany = inspectBoardDiagnostics(pointFindingConnector(5));
const crossingFindingWork = inspectBoardDiagnostics([
	connector({
		id: "point-cross-a",
		x: 0,
		y: 5,
		width: 20,
		height: 0,
		points: [
			[0, 0],
			[20, 0],
		],
	}),
	connector({
		id: "point-cross-b",
		x: 10,
		y: 0,
		width: 0,
		height: 20,
		points: [
			[0, 0],
			[0, 20],
		],
	}),
]);
const parallelFindingWork = inspectBoardDiagnostics([
	connector({
		id: "point-parallel-a",
		x: 0,
		y: 5,
		width: 20,
		height: 0,
		points: [
			[0, 0],
			[20, 0],
		],
	}),
	connector({
		id: "point-parallel-b",
		x: 0,
		y: 10,
		width: 20,
		height: 0,
		points: [
			[0, 0],
			[20, 0],
		],
	}),
]);
check(
	"finding finalization retains multi-point and crossing point evidence",
	pointFindingOne.report.findings.some((finding) => finding.points.length >= 2) &&
		pointFindingMany.report.findings.some((finding) => finding.points.length >= 5) &&
		parallelFindingWork.report.findings.every(
			(finding) => finding.reason !== "proper-interior-crossing",
		) &&
		crossingFindingWork.report.findings.some(
			(finding) => finding.reason === "proper-interior-crossing" && finding.points.length === 1,
		),
	JSON.stringify({
		one: pointFindingOne.report.findings.map((finding) => finding.points.length),
		many: pointFindingMany.report.findings.map((finding) => finding.points.length),
	}),
);
{
	const exactBoundaryId = "x".repeat(4_999_891);
	const diagnosed = inspectBoardDiagnostics([groupMeteringBody([], exactBoundaryId)]);
	const limit = diagnosed.report.findings.find(
		(finding) => finding.reason === "input-complexity-ceiling",
	);
	check(
		"multi-million-code-unit obstacle identity stops during input snapshot",
		diagnosed.report.coverage === "indeterminate" &&
			diagnosed.work.inputUnits < INSPECTION_INPUT_COMPLEXITY_LIMIT &&
			limit?.details.attempted === 1_000_001 &&
			limit?.details.pass === "input-scan" &&
			limit?.details.phase === "snapshot-input",
		JSON.stringify(limit?.details),
	);
}
{
	const rejectedGroups = Array(1_000_000).fill(null);
	const diagnosed = inspectBoardDiagnostics([groupMeteringBody(rejectedGroups)]);
	const limit = diagnosed.report.findings.find(
		(finding) => finding.reason === "input-complexity-ceiling",
	);
	check(
		"bulk array claims stop before semantic analysis or proportional copying",
		diagnosed.report.coverage === "indeterminate" &&
			diagnosed.report.broadPhaseComparisons === 0 &&
			limit?.details.attempted === 1_000_001 &&
			limit?.details.pass === "input-scan" &&
			limit?.details.phase === "snapshot-input",
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
noteFor("rejected-group-limit", [oversizedBoundElementsRecord]);
noteFor("group-classification-identity", groupClassificationBoard(1_000, "identity"));
noteFor("group-classification-coverage", groupClassificationBoard(1_000, "coverage"));
noteFor("label-membership-control", labelMembershipBoard(600, 600));
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
const noteForExactLabelPairs = (board, pairs, reverse = false) => {
	const placeholders = new Map(
		pairs.flat().map((value, index) => [value, `q${index.toString(36).padStart(7, "0")}`]),
	);
	const placeholderElements = JSON.parse(
		JSON.stringify(
			labelPairBoard(pairs, reverse),
			(_key, value) => placeholders.get(value) ?? value,
		),
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
	for (const [exact, placeholder] of placeholders)
		note = note.replaceAll(JSON.stringify(placeholder), JSON.stringify(exact));
	fs.writeFileSync(path.join(vault, `${board}.excalidraw.md`), note);
};
for (const { label, pairs } of labelPairIdentityCases) {
	noteForExactLabelPairs(`label-pair-${label}`, pairs);
	noteForExactLabelPairs(`label-pair-${label}-reversed`, pairs, true);
}
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
noteFor("bridge-valid", bridgedElements);
noteFor("bridge-stale", staleBridgeElements);
noteFor("bridge-incomplete", [bridgeOver, bridgeUnder, bridgeApplied.named[0]]);
noteFor("label-created-at-forward", duplicateLabelCreatedAtBoard(false));
noteFor("label-created-at-reverse", duplicateLabelCreatedAtBoard(true));
noteFor("terminal-comparison-precedence", terminalComparisonBoard);
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
noteFor("input-limit", inputLimitedBoard);
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
const validBridgePackageRun = run("bridge-valid", ["--strict"]);
const validBridgePackage = JSON.parse(validBridgePackageRun.stdout);
check(
	"persisted valid bridge suppresses its exact crossing through the package",
	validBridgePackageRun.status === 0 &&
		validBridgePackageRun.stderr === "" &&
		CheckResultSchema.safeParse(validBridgePackage).success &&
		validBridgePackage.schemaVersion === 2 &&
		validBridgePackage.clean === true,
);
for (const [board, reason] of [
	["bridge-stale", "stale-decoration"],
	["bridge-incomplete", "incomplete-decoration"],
]) {
	const packageRun = run(board, ["--strict"]);
	const packageReport = JSON.parse(packageRun.stdout);
	check(
		`persisted ${reason} bridge reports and suppresses nothing through the package`,
		packageRun.status === 8 &&
			packageRun.stderr === "" &&
			CheckResultSchema.safeParse(packageReport).success &&
			packageReport.findings.some(
				(finding) =>
					finding.code === "BRIDGE_PROVENANCE_INVALID" && finding.reason === reason,
			) &&
			packageReport.findings.some(
				(finding) => finding.code === "CONNECTOR_INTERSECTION_UNMARKED",
			),
		`status=${packageRun.status} stderr=${packageRun.stderr} findings=${JSON.stringify(packageReport.findings?.map(({ code, reason: foundReason }) => [code, foundReason]))}`,
	);
}
for (const board of ["label-created-at-forward", "label-created-at-reverse"]) {
	const persistedLabelRun = run(board, ["--strict"]);
	const persistedLabelResult = persistedLabelRun.stdout
		? JSON.parse(persistedLabelRun.stdout)
		: null;
	const duplicate = persistedLabelResult?.findings.find(
		(finding) => finding.code === "LABEL_CORRUPTION" && finding.reason === "duplicate",
	);
	check(
		`${board} preserves production createdAt duplicate-label selection through the package`,
		persistedLabelRun.status === 7 &&
			persistedLabelRun.stderr === "" &&
			CheckResultSchema.safeParse(persistedLabelResult).success &&
			duplicate?.details.keeperId === "oldlbl" &&
			JSON.stringify(duplicate.details.duplicateIds) === JSON.stringify(["newlbl"]),
		`status=${persistedLabelRun.status} stderr=${persistedLabelRun.stderr} duplicate=${JSON.stringify(duplicate?.details)}`,
	);
}
for (const { label, pairs } of labelPairIdentityCases) {
	const expected = pairs.map(([containerId, textId]) => `${containerId}\0${textId}`).toSorted();
	const runs = [
		run(`label-pair-${label}`, ["--strict"]),
		run(`label-pair-${label}-reversed`, ["--strict"]),
	];
	const results = runs.map((result) => (result.stdout ? JSON.parse(result.stdout) : null));
	check(
		`persisted ${label} label-pair identities stay injective under reversal`,
		runs.every((result) => result.status === 7 && result.stderr === "") &&
			results.every(
				(result) =>
					CheckResultSchema.safeParse(result).success &&
					JSON.stringify(driftIdentities(result)) === JSON.stringify(expected) &&
					result.clean === false,
			),
		JSON.stringify({
			expected,
			statuses: runs.map((result) => result.status),
			drifts: results.map((result) => driftIdentities(result)),
		}),
	);
}
for (const [board, reason] of [
	["group-classification-identity", "invalid-element-identity"],
	["group-classification-coverage", "rotation"],
]) {
	const result = run(board, ["--strict"]);
	const parsed = result.stdout ? JSON.parse(result.stdout) : null;
	check(
		`${board} preserves budget-aware group applicability through the package`,
		result.status === 8 &&
			result.stderr === "" &&
			CheckResultSchema.safeParse(parsed).success &&
			parsed.findings.some((finding) => finding.reason === reason),
		`status=${result.status} stderr=${result.stderr}`,
	);
}
const labelMembershipControlRun = run("label-membership-control", ["--strict"]);
const labelMembershipControlResult = labelMembershipControlRun.stdout
	? JSON.parse(labelMembershipControlRun.stdout)
	: null;
check(
	"persisted 600-by-600 label membership control preserves drift semantics",
	labelMembershipControlRun.status === 7 &&
		labelMembershipControlRun.stderr === "" &&
		CheckResultSchema.safeParse(labelMembershipControlResult).success &&
		labelMembershipControlResult.findings.some((finding) => finding.reason === "duplicate") &&
		labelMembershipControlResult.findings.filter(
			(finding) => finding.reason === "dangling-bound-text",
		).length === 600,
);
check(
	"package JSON parses through exported schema",
	CheckResultSchema.safeParse(cleanPackageResult).success &&
		!("preprocessingWork" in cleanPackageResult) &&
		!JSON.stringify(cleanPackageResult).includes(["analysis", "WorkItems"].join("")) &&
		!JSON.stringify(cleanPackageResult).includes(["analysis-work", "ceiling"].join("-")),
);
const rejectedGroupNormal = run("rejected-group-limit");
const rejectedGroupStrict = run("rejected-group-limit", ["--strict"]);
const rejectedGroupPackage = rejectedGroupNormal.stdout
	? JSON.parse(rejectedGroupNormal.stdout)
	: null;
const rejectedGroupLimit = rejectedGroupPackage?.findings.find(
	(finding) => finding.reason === "input-complexity-ceiling",
);
check(
	"parseable-note package inspection stops oversized rejected-entry arrays during input scan",
	rejectedGroupNormal.status === 0 &&
		rejectedGroupStrict.status === 8 &&
		rejectedGroupNormal.stderr === "" &&
		rejectedGroupStrict.stderr === "" &&
		rejectedGroupNormal.stdout === rejectedGroupStrict.stdout &&
		CheckResultSchema.safeParse(rejectedGroupPackage).success &&
		rejectedGroupPackage.coverage === "indeterminate" &&
		rejectedGroupLimit?.details.attempted === 1_000_001 &&
		rejectedGroupLimit?.details.pass === "input-scan" &&
		rejectedGroupLimit?.details.phase === "snapshot-input",
	JSON.stringify(rejectedGroupLimit?.details),
);
const terminalComparisonNormal = run("terminal-comparison-precedence");
const terminalComparisonStrict = run("terminal-comparison-precedence", ["--strict"]);
const terminalComparisonPackage = terminalComparisonNormal.stdout
	? JSON.parse(terminalComparisonNormal.stdout)
	: null;
check(
	"persisted comparison ceiling wins before an otherwise exhausting finalization",
	terminalComparisonNormal.status === 0 &&
		terminalComparisonStrict.status === 8 &&
		terminalComparisonNormal.stderr === "" &&
		terminalComparisonStrict.stderr === "" &&
		terminalComparisonNormal.stdout === terminalComparisonStrict.stdout &&
		CheckResultSchema.safeParse(terminalComparisonPackage).success &&
		terminalComparisonPackage.broadPhaseComparisons === 2_000_001 &&
		terminalComparisonPackage.findings.filter(
			(finding) => finding.code === "INSPECTION_LIMIT_EXCEEDED",
		).length === 1 &&
		terminalComparisonPackage.findings.some(
			(finding) => finding.reason === "broad-phase-comparison-ceiling",
		) &&
		terminalComparisonPackage.findings.filter(
			(finding) =>
				finding.reason === "zero-length" &&
				finding.details.connectorId === "terminal-zero-segments" &&
				finding.details.segmentIndex === 0,
		).length === 1,
	`statuses=${terminalComparisonNormal.status}/${terminalComparisonStrict.status} comparisons=${terminalComparisonPackage?.broadPhaseComparisons} limits=${terminalComparisonPackage?.findings
		?.filter((finding) => finding.code === "INSPECTION_LIMIT_EXCEEDED")
		.map((finding) => finding.reason)
		.join(",")}`,
);
const longLibraryNormal = run("long-library-identity");
const longLibraryStrict = run("long-library-identity", ["--strict"]);
const longLibraryPackage = longLibraryNormal.stdout ? JSON.parse(longLibraryNormal.stdout) : null;
check(
	"persisted long library identity reaches the exact input ceiling",
	longLibraryNormal.status === 0 &&
		longLibraryStrict.status === 8 &&
		longLibraryNormal.stderr === "" &&
		longLibraryStrict.stderr === "" &&
		longLibraryNormal.stdout === longLibraryStrict.stdout &&
		CheckResultSchema.safeParse(longLibraryPackage).success &&
		longLibraryPackage.coverage === "indeterminate" &&
		longLibraryPackage.findings.some(
			(finding) =>
				finding.reason === "input-complexity-ceiling" &&
				finding.details.attempted === 1_000_001 &&
				finding.details.pass === "input-scan" &&
				finding.details.phase === "snapshot-input",
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
const inputPackageRun = run("input-limit");
const inputStrictRun = run("input-limit", ["--strict"]);
const inputTextRun = run("input-limit", ["--text"]);
const inputPackageResult = inputPackageRun.stdout ? JSON.parse(inputPackageRun.stdout) : null;
check(
	"persisted input ceiling preserves validated stdout and strict/non-strict exits",
	inputPackageRun.status === 0 &&
		inputStrictRun.status === 8 &&
		inputPackageRun.stderr === "" &&
		inputStrictRun.stderr === "" &&
		inputPackageRun.stdout === inputStrictRun.stdout &&
		CheckResultSchema.safeParse(inputPackageResult).success &&
		inputPackageResult.findings.filter((finding) => finding.reason === "input-complexity-ceiling")
			.length === 1 &&
		inputPackageResult.broadPhaseComparisons === 0,
	`statuses=${inputPackageRun.status}/${inputStrictRun.status}`,
);
check(
	"persisted input ceiling text bytes use the exhaustive production formatter",
	inputTextRun.status === 0 &&
		inputTextRun.stderr === "" &&
		inputTextRun.stdout === formatInspectionText(inputPackageResult) + "\n",
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

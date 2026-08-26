#!/usr/bin/env bun
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => path.join(root, "src", file);
const fixture = (file) =>
	JSON.parse(fs.readFileSync(path.join(root, "scripts/fixtures/board-inspection", file), "utf8"));
const { inspectBoard, InspectionReportSchema, CheckResultSchema, formatInspectionText } =
	await import(src("runtime/board-inspection/index.ts"));
const { compareBoards } = await import(src("runtime/engine/compare.ts"));
const { renderBoardNote } = await import(src("runtime/engine/board.ts"));
const { ingestScene } = await import(src("runtime/engine/board-io.ts"));
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
check("report parses through the public schema", InspectionReportSchema.safeParse(clean).success);
check(
	"repeated inspection is byte deterministic",
	JSON.stringify(clean) === JSON.stringify(inspectBoard(frozen)),
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
		const connector = {
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
		nodes[start].boundElements.push({ id: connector.id, type: "arrow" });
		nodes[end].boundElements.push({ id: connector.id, type: "arrow" });
		return connector;
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
noteFor("clean", []);
noteFor("warning", [
	{ id: "txt", type: "text", x: 0, y: 0, width: 30, height: 10, fontFamily: 1, text: "legacy" },
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
noteFor("unknown", [{ id: "edge", type: "arrow", x: 0, y: 0, width: 10, height: 0 }]);
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
		env: { ...process.env, ARCHBOARD_VAULT: vault, EXCALIDRAW_NO_AUTOSTART: "1" },
		encoding: "utf8",
	});
const beforeVault = snapshot();
const jsonRun = run("clean");
check("package CLI works with no canvas", jsonRun.status === 0 && jsonRun.stderr === "");
check(
	"package JSON parses through exported schema",
	CheckResultSchema.safeParse(JSON.parse(jsonRun.stdout)).success,
);
const textRun = run("clean", ["--text"]);
check(
	"text mode matches production formatter",
	textRun.stdout === formatInspectionText(JSON.parse(jsonRun.stdout)) + "\n",
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
check("CLI leaves vault paths, bytes, and mtimes unchanged", snapshot() === beforeVault);
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
if (failures) {
	console.error(`board-inspection: ${failures} of ${checks} checks failed`);
	process.exit(1);
}
console.log(`board-inspection: ${checks} checks passed`);

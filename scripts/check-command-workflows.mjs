#!/usr/bin/env bun

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { assembleFindingArtifacts } from "../src/cli/finding-rendering/index.ts";
import { cliContractRegistry } from "../src/cli/commands/run.ts";
import { inspectBoard } from "../src/runtime/board-inspection/index.ts";
import { findingRasterDimensions } from "../src/shared/finding-raster/index.ts";
import { CLI_CONTRACT_ARTIFACT_NAMES } from "./lib/cli-contract-artifacts.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const guidePath = join(root, "skills", "archboard", "references", "cli-workflows.md");
const guide = fs.readFileSync(guidePath, "utf8");
const registry = cliContractRegistry();
const contracts = new Map(registry.map((entry) => [entry.name, entry.contract]));

let checks = 0;
let failures = 0;
function check(condition, message, detail = "") {
	checks += 1;
	if (condition) return;
	failures += 1;
	console.error(`FAIL: ${message}${detail ? `: ${detail}` : ""}`);
}

const fingerprint = { elements: 2, note: "a".repeat(64), version: 17 };
const element = (id, type = "rectangle", x = 0, y = 0) => ({ id, type, x, y });
const crossingReport = inspectBoard([
	{
		...element("cross-a", "line"),
		width: 100,
		height: 100,
		angle: 0,
		points: [
			[0, 0],
			[100, 100],
		],
		groupIds: [],
		startBinding: null,
		endBinding: null,
	},
	{
		...element("cross-b", "line", 0, 100),
		width: 100,
		height: 100,
		angle: 0,
		points: [
			[0, 0],
			[100, -100],
		],
		groupIds: [],
		startBinding: null,
		endBinding: null,
	},
]);

const bridgeFacts = {
	bridgeId: "Bridge01",
	overConnectorId: "cross-a",
	underConnectorId: "cross-b",
	overSegmentIndex: 0,
	underSegmentIndex: 0,
	crossing: { x: 50, y: 50 },
};
const bridgePart = (id, role) => ({
	...element(id, "line", 42, 42),
	groupIds: [],
	startBinding: null,
	endBinding: null,
	customData: {
		archboard: {
			bridge: { ...bridgeFacts, role, background: "#ffffff" },
		},
	},
});

function png(width, height) {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
	const view = new DataView(bytes.buffer);
	view.setUint32(8, 13);
	bytes.set([73, 72, 68, 82], 12);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes;
}

const focus = crossingReport.findings[0]?.focusBBox;
if (!focus) throw new Error("Workflow fixture crossing must have a focus box.");
const dimensions = findingRasterDimensions(focus);
const renderedManifest = assembleFindingArtifacts(
	{
		board: "workflow-board",
		sourceFingerprint: createHash("sha256").update("workflow-board").digest("hex"),
		report: crossingReport,
		sourceRenderable: true,
		results: [
			{
				findingIndex: 0,
				data: Buffer.from(png(dimensions.width, dimensions.height)).toString("base64"),
			},
		],
	},
	"/tmp/workflow-findings",
).manifest;

const cases = {
	"add-element-ids": {
		producer: "add",
		consumers: ["promote", "arrange align"],
		fixture: {
			success: true,
			count: 2,
			elements: [element("node-a"), element("node-b", "ellipse", 20, 0)],
			fingerprint,
		},
		jq: ["-c"],
		expected: '["node-a","node-b"]\n',
	},
	"query-element-ids": {
		producer: "query",
		consumers: ["promote", "arrange align"],
		fixture: [element("query-a"), element("query-b", "diamond", 40, 0)],
		jq: ["-c"],
		expected: '["query-a","query-b"]\n',
	},
	"library-element-ids": {
		producer: "library insert",
		consumers: ["promote", "arrange align"],
		fixture: {
			success: true,
			name: "API Gateway",
			source: "architecture",
			id: "library-item",
			at: { x: 100, y: 200 },
			count: 2,
			elements: [
				element("stencil-a", "rectangle", 100, 200),
				element("stencil-b", "text", 120, 220),
			],
		},
		jq: ["-c"],
		expected: '["stencil-a","stencil-b"]\n',
	},
	"promoted-node-ids": {
		producer: "promote",
		consumers: ["promote"],
		fixture: {
			success: true,
			summary: "Promoted 2 elements.",
			nodes: [
				{
					node: "payments-api",
					name: "Payments API",
					elementIds: ["node-a", "node-b"],
					kind: "service",
					variant: "main",
				},
			],
			elementsUpdated: 2,
		},
		jq: ["-c"],
		expected: '["payments-api"]\n',
	},
	"group-id": {
		producer: "arrange group",
		consumers: ["arrange ungroup"],
		fixture: { groupId: "group-1", elementIds: ["node-a", "node-b"], successCount: 2 },
		jq: ["-r"],
		expected: "group-1\n",
	},
	"fingerprint-version": {
		producer: "add",
		consumers: ["update"],
		fixture: { success: true, count: 1, elements: [element("node-a")], fingerprint },
		jq: ["-r"],
		expected: "17\n",
	},
	"crossing-connector-ids": {
		producer: "check",
		consumers: ["bridge"],
		fixture: { board: "workflow-board", ...crossingReport },
		jq: ["-c"],
		expected: '[["cross-b","cross-a"]]\n',
	},
	"bridge-id": {
		producer: "bridge",
		consumers: ["bridge remove"],
		fixture: {
			success: true,
			board: "workflow-board",
			...bridgeFacts,
			elements: [bridgePart("Bridge01", "mask"), bridgePart("Redraw01", "redraw")],
			fingerprint,
		},
		jq: ["-r"],
		expected: "Bridge01\n",
	},
	"rendered-relative-files": {
		producer: "render-findings",
		consumers: [],
		fixture: renderedManifest,
		jq: ["-c"],
		expected: `${JSON.stringify(renderedManifest.entries.map((entry) => (entry.status === "rendered" ? entry.file : null)).filter(Boolean))}\n`,
	},
};

const jqBlocks = new Map();
const jqPattern = /<!-- tested-jq: ([a-z0-9-]+) -->\s*```jq\n([\s\S]*?)\n```/g;
for (const match of guide.matchAll(jqPattern)) jqBlocks.set(match[1], match[2]);
check(
	jqBlocks.size === Object.keys(cases).length,
	"guide has exactly the tested jq examples",
	String(jqBlocks.size),
);

for (const [id, testCase] of Object.entries(cases)) {
	const program = jqBlocks.get(id);
	check(typeof program === "string", `${id} has a marked jq program`);
	const producer = contracts.get(testCase.producer);
	check(Boolean(producer), `${id} producer resolves`, testCase.producer);
	for (const consumer of testCase.consumers)
		check(contracts.has(consumer), `${id} consumer resolves`, consumer);
	if (!producer || typeof program !== "string") continue;
	const parsed = producer.result.safeParse(testCase.fixture);
	check(
		parsed.success,
		`${id} fixture passes ${testCase.producer} ResultSchema`,
		parsed.success ? "" : parsed.error.message,
	);
	if (!parsed.success) continue;
	const result = spawnSync("jq", [...testCase.jq, program], {
		cwd: root,
		encoding: "utf8",
		input: JSON.stringify(parsed.data),
	});
	check(result.status === 0, `${id} jq exits 0`, `${result.status}: ${result.stderr}`);
	check(result.stderr === "", `${id} jq keeps stderr empty`, result.stderr);
	check(
		result.stdout === testCase.expected,
		`${id} jq stdout bytes`,
		JSON.stringify(result.stdout),
	);
}

const shellMatch = guide.match(
	/<!-- tested-shell: strict-check-capture -->\s*```bash\n([\s\S]*?)\n```/,
);
check(Boolean(shellMatch), "strict check capture has one marked shell example");
if (shellMatch) {
	const scratch = fs.mkdtempSync(join(os.tmpdir(), "archboard-workflows-"));
	const fake = join(scratch, "archboard");
	fs.writeFileSync(
		fake,
		'#!/usr/bin/env bash\nprintf \'%s\' "$FAKE_STDOUT"\nprintf \'%s\' "$FAKE_STDERR" >&2\nexit "$FAKE_EXIT"\n',
	);
	fs.chmodSync(fake, 0o755);
	for (const exit of [6, 7, 8]) {
		const stdout = `{"strictExit":${exit}}\n`;
		const result = spawnSync("bash", ["-eu", "-o", "pipefail", "-c", shellMatch[1]], {
			cwd: root,
			encoding: "utf8",
			env: {
				...process.env,
				PATH: `${scratch}:${process.env.PATH}`,
				board: "workflow-board",
				FAKE_EXIT: String(exit),
				FAKE_STDOUT: stdout,
				FAKE_STDERR: "",
			},
		});
		check(
			result.status === 0,
			`strict exit ${exit} capture exits 0`,
			`${result.status}: ${result.stderr}`,
		);
		check(
			result.stdout === stdout,
			`strict exit ${exit} preserves stdout bytes`,
			JSON.stringify(result.stdout),
		);
		check(result.stderr === "", `strict exit ${exit} keeps stderr empty`, result.stderr);
	}
	const failure = spawnSync("bash", ["-eu", "-o", "pipefail", "-c", shellMatch[1]], {
		cwd: root,
		encoding: "utf8",
		env: {
			...process.env,
			PATH: `${scratch}:${process.env.PATH}`,
			board: "workflow-board",
			FAKE_EXIT: "1",
			FAKE_STDOUT: "not published\n",
			FAKE_STDERR: "operational failure\n",
		},
	});
	check(
		failure.status === 1,
		"unexpected strict failure propagates its exit",
		String(failure.status),
	);
	check(
		failure.stdout === "",
		"unexpected strict failure does not publish captured stdout",
		failure.stdout,
	);
	check(
		failure.stderr === "operational failure\n",
		"unexpected strict failure preserves diagnostics",
		failure.stderr,
	);
	fs.rmSync(scratch, { recursive: true, force: true });
}

const sync = spawnSync("bun", [join(root, "scripts", "sync-skills.mjs")], {
	cwd: root,
	encoding: "utf8",
});
check(sync.status === 0, "skill sync succeeds", `${sync.status}: ${sync.stderr}`);
for (const target of [
	join(root, ".agents", "skills", "archboard", "references", "cli-workflows.md"),
	join(root, ".claude", "skills", "archboard", "references", "cli-workflows.md"),
]) {
	check(
		fs.readFileSync(target).equals(fs.readFileSync(guidePath)),
		"skill sync copies the workflow guide byte-for-byte",
		target,
	);
}

check(
	registry.length === 61,
	"workflow check preserves the 61-path registry",
	String(registry.length),
);
check(
	JSON.stringify(CLI_CONTRACT_ARTIFACT_NAMES) ===
		JSON.stringify([
			"cli-command-audit.md",
			"command-contract-proof.json",
			"command-contract-proof.md",
		]),
	"workflow check preserves the three generated artifact names",
);

if (failures > 0) {
	console.error(`command workflows: ${failures}/${checks} checks failed`);
	process.exit(1);
}
console.log(`command workflows: ${checks} checks passed`);

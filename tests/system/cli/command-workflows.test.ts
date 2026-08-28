import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	chmodSync,
	cpSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleFindingArtifacts } from "../../../src/cli/finding-rendering/index.ts";
import { cliContractRegistry } from "../../../src/cli/commands/run.ts";
import { inspectBoard } from "../../../src/runtime/board-inspection/index.ts";
import { findingRasterDimensions } from "../../../src/shared/finding-raster/index.ts";
import { checkoutRoot } from "./support/package-cli.ts";

const guidePath = join(checkoutRoot, "skills/archboard/references/cli-workflows.md");
const guide = readFileSync(guidePath, "utf8");
const contracts = new Map(cliContractRegistry().map((entry) => [entry.name, entry.contract]));
interface WorkflowSpawn {
	command: readonly string[];
	cwd: string;
	status: number;
	signal: string | null;
	stdout: string;
	stderr: string;
}
const workflowFailure = (result: WorkflowSpawn) =>
	[
		`command: ${result.command.join(" ")}`,
		`cwd: ${result.cwd}`,
		`status: ${result.status}`,
		`signal: ${result.signal ?? "null"}`,
		`stdout:\n${result.stdout}`,
		`stderr:\n${result.stderr}`,
	].join("\n");
const runSync = (
	command: readonly string[],
	options: { cwd?: string; stdin?: Uint8Array; env?: NodeJS.ProcessEnv } = {},
): WorkflowSpawn => {
	const result = Bun.spawnSync([...command], options);
	return {
		command,
		cwd: options.cwd ?? process.cwd(),
		status: result.exitCode,
		signal: result.signalCode ?? null,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
};
const element = (id: string, type = "rectangle", x = 0, y = 0) => ({ id, type, x, y });
const fingerprint = { elements: 2, note: "a".repeat(64), version: 17 };
const bridgeFacts = {
	bridgeId: "Bridge01",
	overConnectorId: "cross-a",
	underConnectorId: "cross-b",
	overSegmentIndex: 0,
	underSegmentIndex: 0,
	crossing: { x: 50, y: 50 },
};
const bridgePart = (id: string, role: "mask" | "redraw") => ({
	...element(id, "line", 42, 42),
	groupIds: [],
	startBinding: null,
	endBinding: null,
	customData: { archboard: { bridge: { ...bridgeFacts, role, background: "#ffffff" } } },
});
const report = inspectBoard([
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
const focus = report.findings[0]?.focusBBox;
if (!focus) throw new Error("Workflow crossing fixture has no focus box.");
const dimensions = findingRasterDimensions(focus);
const png = new Uint8Array(24);
png.set([137, 80, 78, 71, 13, 10, 26, 10]);
const pngView = new DataView(png.buffer);
pngView.setUint32(8, 13);
png.set([73, 72, 68, 82], 12);
pngView.setUint32(16, dimensions.width);
pngView.setUint32(20, dimensions.height);
const renderedManifest = assembleFindingArtifacts(
	{
		board: "workflow-board",
		sourceFingerprint: createHash("sha256").update("workflow-board").digest("hex"),
		report,
		sourceRenderable: true,
		results: [{ findingIndex: 0, data: Buffer.from(png).toString("base64") }],
	},
	"/tmp/workflow-findings",
).manifest;

const workflowCases = {
	"add-element-ids": {
		producer: "add",
		consumers: ["promote", "arrange align"],
		fixture: {
			success: true,
			count: 2,
			elements: [element("node-a"), element("node-b", "ellipse", 20)],
			fingerprint,
		},
		jq: ["-c"],
		expected: '["node-a","node-b"]\n',
	},
	"query-element-ids": {
		producer: "query",
		consumers: ["promote", "arrange align"],
		fixture: [element("query-a"), element("query-b", "diamond", 40)],
		jq: ["-c"],
		expected: '["query-a","query-b"]\n',
	},
	"comma-separated-add-element-ids": {
		producer: "add",
		consumers: ["promote", "arrange align"],
		fixture: {
			success: true,
			count: 2,
			elements: [element("node-a"), element("node-b", "ellipse", 20)],
			fingerprint,
		},
		jq: ["-r"],
		expected: "node-a,node-b\n",
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
		fixture: { board: "workflow-board", ...report },
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
} as const;

describe("documented CLI workflows", () => {
	test("runs every marked jq producer through its public result schema", () => {
		const blocks = new Map<string, string>();
		const pattern = /<!-- tested-jq: ([a-z0-9-]+) -->\s*```jq\n([\s\S]*?)\n```/g;
		for (const match of guide.matchAll(pattern)) blocks.set(match[1]!, match[2]!);
		expect(blocks.size).toBe(Object.keys(workflowCases).length);
		expect(/(?:^|[^\w-])jq(?:\s|$)/m.test(guide.replace(pattern, ""))).toBe(false);
		for (const [id, workflow] of Object.entries(workflowCases)) {
			const contract = contracts.get(workflow.producer);
			expect(contract, id).toBeDefined();
			for (const consumer of workflow.consumers) expect(contracts.has(consumer), id).toBe(true);
			const parsed = contract!.result.parse(workflow.fixture);
			const result = runSync(["jq", ...workflow.jq, blocks.get(id)!], {
				stdin: new TextEncoder().encode(JSON.stringify(parsed)),
			});
			const diagnostic = `${id}\n${workflowFailure(result)}`;
			expect(result.status, diagnostic).toBe(0);
			expect(result.signal, diagnostic).toBeNull();
			expect(result.stderr, diagnostic).toBe("");
			expect(result.stdout, diagnostic).toBe(workflow.expected);
		}
	});

	test("captures strict exits 6, 7, and 8 without publishing other failures", () => {
		const match = guide.match(
			/<!-- tested-shell: strict-check-capture -->\s*```bash\n([\s\S]*?)\n```/,
		);
		expect(match).not.toBeNull();
		const scratch = mkdtempSync(join(tmpdir(), "archboard-workflows-"));
		try {
			const fake = join(scratch, "archboard");
			writeFileSync(
				fake,
				'#!/usr/bin/env bash\nprintf \'%s\' "$FAKE_STDOUT"\nprintf \'%s\' "$FAKE_STDERR" >&2\nexit "$FAKE_EXIT"\n',
			);
			chmodSync(fake, 0o755);
			for (const exit of [6, 7, 8]) {
				const stdout = `{"strictExit":${exit}}\n`;
				const result = runSync(["bash", "-eu", "-o", "pipefail", "-c", match![1]!], {
					env: {
						...process.env,
						PATH: `${scratch}:${process.env.PATH}`,
						board: "workflow-board",
						FAKE_EXIT: String(exit),
						FAKE_STDOUT: stdout,
						FAKE_STDERR: "",
					},
				});
				const diagnostic = workflowFailure(result);
				expect(result.status, diagnostic).toBe(0);
				expect(result.signal, diagnostic).toBeNull();
				expect(result.stdout, diagnostic).toBe(stdout);
				expect(result.stderr, diagnostic).toBe("");
			}
			const failure = runSync(["bash", "-eu", "-o", "pipefail", "-c", match![1]!], {
				env: {
					...process.env,
					PATH: `${scratch}:${process.env.PATH}`,
					board: "workflow-board",
					FAKE_EXIT: "1",
					FAKE_STDOUT: "not published\n",
					FAKE_STDERR: "operational failure\n",
				},
			});
			const diagnostic = workflowFailure(failure);
			expect(failure.status, diagnostic).toBe(1);
			expect(failure.signal, diagnostic).toBeNull();
			expect(failure.stdout, diagnostic).toBe("");
			expect(failure.stderr, diagnostic).toBe("operational failure\n");
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});

	test("syncs the authored workflow guide in a disposable repository", () => {
		const scratch = mkdtempSync(join(tmpdir(), "archboard-skill-sync-"));
		try {
			cpSync(join(checkoutRoot, "skills"), join(scratch, "skills"), { recursive: true });
			mkdirSync(join(scratch, "scripts"));
			cpSync(
				join(checkoutRoot, "scripts/sync-skills.mjs"),
				join(scratch, "scripts/sync-skills.mjs"),
			);
			const result = runSync(["bun", "scripts/sync-skills.mjs"], { cwd: scratch });
			expect(result.status, workflowFailure(result)).toBe(0);
			expect(result.signal, workflowFailure(result)).toBeNull();
			for (const target of [
				join(scratch, ".agents/skills/archboard/references/cli-workflows.md"),
				join(scratch, ".claude/skills/archboard/references/cli-workflows.md"),
			])
				expect(readFileSync(target)).toEqual(readFileSync(guidePath));
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});

	test("keeps the released registry and artifact count", () => {
		expect(cliContractRegistry()).toHaveLength(61);
		expect([
			"cli-command-audit.md",
			"command-contract-proof.json",
			"command-contract-proof.md",
		]).toHaveLength(3);
	});
});

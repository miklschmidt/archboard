// The pane-core import that TASK-505 missed, plus a public workspace entry.
// Each real call must clear EXPOSED_UNUSED and produce resolved relationship evidence.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeCheckOutcome } from "#runtime/operations/code-check/check.ts";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const priorRegistry = process.env["ARCHBOARD_REPOS"];
const scratch = mkdtempSync(join(tmpdir(), "archboard-workspace-imports-"));
const checkout = join(scratch, "checkout");
const vault = join(scratch, "vault");
const REPO = "github.com/test/workspaces";
const CORE = "apps/web/src/ui/state/pane-session/pane-core.ts";
const SENDER = "apps/web/src/ui/clients/pane-session/pane-report-sender.ts";
const OPEN = "packages/code-opener/src/ui/clients/code-target/open.ts";
let outcome: CodeCheckOutcome;
let order = 0;

/**
 * A bound part in the workspace fixture.
 * @param id Its id.
 * @param path Its source path.
 * @param parent Its container, if any.
 * @returns The part.
 */
function part(id: string, path: string, parent?: string) {
	return {
		id,
		name: id,
		kind: "module",
		order: (order += 10),
		binding: { repo: REPO, path },
		...(parent === undefined ? {} : { parent }),
	};
}

beforeAll(async () => {
	process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
	write(scratch, { gitconfig: "" });
	write(checkout, {
		"package.json": JSON.stringify({ workspaces: ["packages/*", "apps/*"] }),
		"apps/web/package.json": JSON.stringify({
			name: "@archboard-app/web",
			imports: { "#*": "./src/*", "#tests/*": "./tests/*" },
		}),
		"packages/code-opener/package.json": JSON.stringify({
			name: "@archboard/code-opener",
			imports: { "#*": "./src/*" },
			exports: { "./code-target": "./src/ui/api/code-target.ts" },
		}),
		[CORE]: [
			'import { createPaneReportSender } from "#ui/clients/pane-session/pane-report-sender.ts";',
			'import { activateCodeTarget } from "@archboard/code-opener/code-target";',
			"export function createPaneCore() {",
			"  createPaneReportSender();",
			"  activateCodeTarget();",
			"}",
		].join("\n"),
		[SENDER]: "export function createPaneReportSender() {}\n",
		"packages/code-opener/src/ui/api/code-target.ts":
			'export { activateCodeTarget } from "#ui/clients/code-target/open.ts";\n',
		[OPEN]: "export function activateCodeTarget() {}\n",
	});
	git(scratch, checkout, "init", "-q", "-b", "main");
	git(scratch, checkout, "remote", "add", "origin", `https://${REPO}.git`);
	git(scratch, checkout, "add", "-A");
	git(scratch, checkout, "commit", "-q", "--no-gpg-sign", "-m", "workspace callers");
	register(scratch, { [REPO]: checkout });
	board(vault, "Workspaces", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					part("Core", CORE),
					part("Reports", "apps/web/src/ui/clients/pane-session"),
					part("Sender", SENDER, "Reports"),
					part("Opener", "packages/code-opener"),
					part("Open", OPEN, "Opener"),
				],
				edges: [],
				flows: [],
			},
		},
	]);
	const check = await import("#tests/runtime/support/code-check/pass.ts");
	const read = check.readBoardsToCheck(vault, undefined);
	if (!read.ok) throw new Error("fixture board was not read");
	expect(read.boards).toHaveLength(1);
	expect(read.skipped).toEqual([]);
	outcome = await check.checkCode(vault, read.boards, new AbortController().signal);
});

afterAll(() => {
	if (priorRegistry === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = priorRegistry;
	rmSync(scratch, { recursive: true, force: true });
});

test.each([
	{ id: "Sender", symbol: "createPaneReportSender", line: 4 },
	{ id: "Open", symbol: "activateCodeTarget", line: 5 },
])(
	"$symbol is used through its manifest import and supplies resolved call evidence",
	({ id, symbol, line }) => {
		expect(outcome.findings.filter((finding) => finding.code === "EXPOSED_UNUSED")).toEqual([]);
		const relationship = outcome.findings.find(
			(finding) => finding.code === "RELATIONSHIP_UNDRAWN" && finding.subject?.id === id,
		);
		expect(relationship?.evidence).toEqual([
			{
				kind: "call",
				resolution: "resolved",
				from: "Core",
				to: id,
				repo: REPO,
				path: CORE,
				line,
				symbol,
			},
		]);
	},
);

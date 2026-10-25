import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { board, git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const scratch = mkdtempSync(join(tmpdir(), "archboard-role-child-"));
const checkout = join(scratch, "checkout");
const vault = join(scratch, "vault");
const repo = "github.com/test/roles";
const previous = process.env["ARCHBOARD_REPOS"];
process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");

afterAll(() => {
	if (previous === undefined) delete process.env["ARCHBOARD_REPOS"];
	else process.env["ARCHBOARD_REPOS"] = previous;
	rmSync(scratch, { recursive: true, force: true });
});

test("a relationship can cite an endpoint's bound child in a sibling role folder, but unrelated code still mismatches", async () => {
	mkdirSync(checkout, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, checkout, "init", "-q", "-b", "main");
	git(scratch, checkout, "remote", "add", "origin", `https://${repo}.git`);
	write(checkout, {
		"src/clients/viewer.ts": "export function viewer() {}\n",
		"src/hooks/viewer/use-viewer.ts": "export function useViewer() {}\n",
		"src/application.ts":
			'import { useViewer } from "./hooks/viewer/use-viewer";\nexport function application() { useViewer(); }\n',
		"src/unrelated.ts": "export function unrelated() {}\n",
	});
	git(scratch, checkout, "add", ".");
	git(scratch, checkout, "commit", "-q", "-m", "role implementation");
	register(scratch, { [repo]: checkout });
	board(vault, "Roles", [
		{
			id: "v1",
			name: "Built",
			lifecycle: "current",
			content: {
				nodes: [
					{
						id: "p1",
						order: 1000,
						name: "Viewer",
						kind: "module",
						binding: { repo, path: "src/clients/viewer.ts" },
					},
					{
						id: "p2",
						order: 2000,
						name: "Viewer lifecycle",
						kind: "module",
						parent: "p1",
						binding: { repo, path: "src/hooks/viewer/use-viewer.ts" },
					},
					{
						id: "p3",
						order: 3000,
						name: "Application",
						kind: "module",
						binding: { repo, path: "src/application.ts" },
					},
				],
				edges: [
					{
						id: "e1",
						order: 1000,
						from: "p3",
						to: "p1",
						kind: "call",
						anchor: { repo, path: "src/application.ts", symbol: "useViewer" },
					},
					{
						id: "e2",
						order: 2000,
						from: "p3",
						to: "p1",
						kind: "call",
						anchor: { repo, path: "src/unrelated.ts", symbol: "unrelated" },
					},
				],
			},
		},
	]);
	const { readBoardsToCheck, checkCode } = await import("#tests/runtime/support/code-check/pass.ts");
	const read = readBoardsToCheck(vault, undefined);
	if (!read.ok || read.boards.length !== 1)
		throw new Error(`fixture board did not load: ${JSON.stringify(read)}`);
	const outcome = await checkCode(vault, read.boards, new AbortController().signal, [], () => ({
		status: "missing",
		detail: "turned off",
	}));
	expect(
		outcome.findings
			.filter((finding) => finding.code === "ANCHOR_MISMATCH")
			.map((finding) => finding.subject?.id),
	).toEqual(["e2"]);
});

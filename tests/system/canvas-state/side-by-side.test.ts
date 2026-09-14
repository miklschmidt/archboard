import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester, waitFor } from "./support/http.ts";
import { openPaneSession, type PaneEvent, type PaneSession } from "./support/pane-session.ts";

// A proposal read beside what it proposes to change, driven the way an agent
// drives it: every step a cold CLI invocation against a running canvas, with
// two panes on screen.
//
// What this owns is the pane a person is using. An agent branching a board,
// editing the branch, opening a second pane and pointing it somewhere must
// never move the pane the person is reading — the move is the one thing they
// would notice and the one thing nobody asked for (ADR 0009, ADR 0023).

const repoRoot = resolve(import.meta.dir, "../../..");
const executable = join(repoRoot, "bin/canvas");

interface CliResult<T = unknown> {
	code: number | null;
	stdout: string;
	stderr: string;
	json: T;
}
interface PanesBody {
	paneCount: number;
	sameBoard?: boolean;
	summary?: string;
	panes: Array<{ board: string | null; paneId: string; place: string }>;
}
interface BoardReply {
	board: { version: number; current: string; variants: Array<{ id: string; name: string }> };
}

describe.serial("side-by-side proposal workflow", () => {
	test("keeps the source pane fixed throughout the cold CLI trace", async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-side-by-side-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = join(root, "vault");
		const canvas = await startOwnedCanvas({
			serverPath: join(repoRoot, "src/server.ts"),
			vault,
			env: { LOG_FILE_PATH: join(root, "canvas.log") },
		});
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);
		const panes: PaneSession[] = [];
		resources.defer(async () =>
			Promise.allSettled(panes.map((pane) => pane.close())).then(() => undefined),
		);
		let serial = 0;

		// A write says what it is doing; a read or a pane command reads no such
		// line and refuses one, so it is stated only where it applies.
		const writes = new Set(["new", "edit", "branch", "resolve", "adopt"]);
		const cli = <T = unknown>(args: string[], input = "") =>
			new Promise<CliResult<T>>((resolveCli, rejectCli) => {
				const child = spawn(
					executable,
					args.includes("--doing") || args[0] !== "semantic" || !writes.has(args[1] ?? "")
						? args
						: [...args, "--doing", "checking a proposal beside its source"],
					{
						cwd: repoRoot,
						env: {
							...process.env,
							EXPRESS_SERVER_URL: canvas.base,
							EXCALIDRAW_NO_AUTOSTART: "1",
							ARCHBOARD_VAULT: vault,
							LOG_LEVEL: "error",
						},
					},
				);
				let stdout = "";
				let stderr = "";
				child.stdout.setEncoding("utf8");
				child.stderr.setEncoding("utf8");
				child.stdout.on("data", (chunk: string) => void (stdout += chunk));
				child.stderr.on("data", (chunk: string) => void (stderr += chunk));
				child.on("error", rejectCli);
				child.on("close", (code) => {
					let json = undefined as T;
					try {
						json = JSON.parse(stdout) as T;
					} catch {
						// Text commands and refusals do not promise JSON stdout.
					}
					resolveCli({ code, stdout, stderr, json });
				});
				child.stdin.end(input);
			});

		const openShellPane = async (
			clientId = `proposal-shell-${++serial}`,
			x = panes.length * 640,
			options: { primary?: boolean; focused?: boolean; board?: string } = {},
		): Promise<PaneSession> => {
			const pane = await openPaneSession(canvas.base, request, {
				clientId,
				x,
				...(options.primary === undefined ? {} : { primary: options.primary }),
				...(options.focused === undefined ? {} : { focused: options.focused }),
				...(options.board === undefined ? {} : { board: options.board }),
			});
			panes.push(pane);
			pane.socket.on("message", (data) => {
				const message = JSON.parse(data.toString()) as PaneEvent;
				if (message.type === "pane_open") void openShellPane();
				if (message.type === "pane_close") {
					const index = panes.indexOf(pane);
					if (index >= 0) panes.splice(index, 1);
					void pane.close();
				}
				// A shell follows the board the server names it, the way the real one
				// does: the registration is what makes the move true to the server.
				if (message.type === "pane_board" && typeof message.board === "string") {
					void pane.register(message.board);
				}
			});
			return pane;
		};

		// The architecture as it stands, made by an agent from the command line.
		const made = await cli(
			["semantic", "new", "payments", "--doing", "drawing the payment path"],
			JSON.stringify({
				level: "system",
				nodes: [
					{ name: "API Gateway", kind: "service" },
					{ name: "Orders Service", kind: "service" },
					{ name: "Orders Postgres", kind: "datastore" },
				],
				edges: [
					{ from: "API Gateway", to: "Orders Service", kind: "http" },
					{ from: "Orders Service", to: "Orders Postgres", kind: "data" },
				],
			}),
		);
		expect(made.code, made.stderr).toBe(0);

		const source = await openShellPane("proposal-source", 0, {
			primary: true,
			focused: true,
			board: "payments",
		});
		await waitFor(() => source.board() === "payments", "source pane to show payments");
		const noProposalSwitchesFrom = source.mark();

		// A proposal is a variant of the same board, derived from what is current.
		const branched = await cli<BoardReply>([
			"semantic",
			"branch",
			"payments",
			"--as",
			"Queued ingest",
			"--expect-version",
			"1",
			"--doing",
			"proposing a queue",
		]);
		expect(branched.code, branched.stderr).toBe(0);
		const proposal = branched.json.board.variants.find((one) => one.name === "Queued ingest")!;
		expect(proposal).toBeDefined();
		const proposalKey = `payments@${proposal.id}`;
		// Branching moved nothing on screen: the person is still reading what is
		// current, which is the point of proposing beside it rather than in place.
		expect(source.board()).toBe("payments");

		const beside = await cli<{ paneCount: number; pane: { clientId: string; place: string } }>([
			"browser",
			"open",
		]);
		expect(beside.code, beside.stderr).toBe(0);
		expect(beside.json).toMatchObject({ paneCount: 2, pane: { place: "right" } });
		const branchPane = await waitFor(
			() => panes.find(({ clientId }) => clientId === beside.json.pane.clientId),
			"new proposal pane registration",
		);
		if (!branchPane) throw new Error("The proposal pane registration disappeared.");
		const shown = await cli(["browser", "show", proposalKey, "--pane", "right"]);
		expect(shown.code, shown.stderr).toBe(0);
		await waitFor(() => branchPane.board() === proposalKey, "proposal pane to adopt the branch");

		const sideBySide = await request<PanesBody>("/api/panes");
		// One board, read two ways. They are looking at the same document, so a
		// command that names no board is not ambiguous between them — but the
		// read-out still names each variant, because which one each pane is on is
		// the whole of what the comparison is.
		expect(sideBySide.body.sameBoard).toBeTrue();
		expect(sideBySide.body.panes.map(({ board }) => board)).toEqual(["payments", proposalKey]);
		// These panes are raw sockets rather than the shell, so neither has said
		// what it is reading; the read-out falls back to the address it was given.
		expect(sideBySide.body.summary).toContain(proposalKey);

		// A third pane is refused: the shell is two panes wide by design.
		const third = await cli(["browser", "open"]);
		expect(third.code).not.toBe(0);
		expect([source.board(), branchPane.board()]).toEqual(["payments", proposalKey]);

		// What the proposal proposes, written to the proposal and nowhere else.
		const sourceBeforeEditing = source.mark();
		// The edit names the board and, inside the command, which variant of it:
		// the whole family is one document, so a write addresses the document and
		// says what it is changing in it.
		const edited = await cli(
			["semantic", "edit", "payments", "--expect-version", "2", "--doing", "adding the queue"],
			JSON.stringify({
				variant: proposal.id,
				nodes: [{ name: "Orders Queue", kind: "queue" }],
				edges: [{ from: "API Gateway", to: "Orders Queue", kind: "event" }],
			}),
		);
		expect(edited.code, edited.stderr).toBe(0);

		// The current variant is untouched, and the pane reading it never moved.
		const current = await cli<BoardReply>(["semantic", "show", "payments"]);
		expect(current.code, current.stderr).toBe(0);
		expect(source.board()).toBe("payments");
		expect(
			source.events.slice(sourceBeforeEditing).some(({ type }) => type === "pane_board"),
		).toBeFalse();

		// Across the whole trace, the source pane was never moved by anything an
		// agent did beside it.
		const showing = await request<PanesBody>("/api/panes");
		expect(showing.body.panes.find(({ board }) => board === "payments")).toMatchObject({
			paneId: "proposal-source",
			place: "left",
		});
		expect(
			source.events.slice(noProposalSwitchesFrom).some(({ type }) => type === "pane_board"),
		).toBeFalse();

		// And when the person's own pane is the one asked, it does move.
		await branchPane.close();
		panes.splice(panes.indexOf(branchPane), 1);
		await waitFor(
			async () => (await request<PanesBody>("/api/panes")).body.paneCount === 1,
			"proposal pane to close",
		);
		const overwritten = await cli<{ pane: { place: string } }>([
			"browser",
			"show",
			proposalKey,
			"--pane",
			"primary",
		]);
		expect(overwritten.code, overwritten.stderr).toBe(0);
		expect(overwritten.json.pane.place).toBe("the only pane");
		await waitFor(() => source.board() === proposalKey, "source pane to be repointed");
		// The board it left is still there: a pane moving is not a board closing.
		expect((await cli<BoardReply>(["semantic", "show", "payments"])).code).toBe(0);
	}, 60_000);
});

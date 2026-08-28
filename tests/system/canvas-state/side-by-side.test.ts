import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester, sleep, waitFor } from "./support/http.ts";
import { openPaneSession, type PaneEvent, type PaneSession } from "./support/pane-session.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const executable = join(repoRoot, "bin/canvas");

interface CliResult<T = unknown> {
	code: number | null;
	stdout: string;
	stderr: string;
	json: T;
}
interface ElementsBody {
	count: number;
	elements: Array<{
		id: string;
		customData?: { archboard?: { node?: string; variant?: string } };
	}>;
}
interface PanesBody {
	paneCount: number;
	sameBoard?: boolean;
	panes: Array<{ board: string; paneId: string; place: string }>;
}

describe.serial("side-by-side proposal workflow", () => {
	test("keeps the source pane fixed throughout the cold CLI trace", async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-side-by-side-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = join(root, "vault");
		const shots = join(root, "shots");
		mkdirSync(shots);
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

		const cli = <T = unknown>(args: string[], input = "") =>
			new Promise<CliResult<T>>((resolveCli, rejectCli) => {
				const child = spawn(
					executable,
					args.includes("--doing")
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
						stdio: ["pipe", "pipe", "pipe"],
					},
				);
				let stdout = "";
				let stderr = "";
				child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
				child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
				child.once("error", rejectCli);
				child.once("exit", (code) => {
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
			options: { primary?: boolean; focused?: boolean } = {},
		): Promise<PaneSession> => {
			const pane = await openPaneSession(canvas.base, request, {
				clientId,
				x,
				primary: options.primary,
				focused: options.focused,
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
				if (message.type === "board_switched" && message.board) void pane.register(message.board);
				if (message.type === "set_viewport") {
					void request("/api/viewport/result", {
						method: "POST",
						doing: false,
						body: { requestId: message.requestId, success: true },
					});
				}
				if (message.type === "export_image_request") {
					void request("/api/export/image/result", {
						method: "POST",
						doing: false,
						body: { requestId: message.requestId, format: "png", data: "aGk=" },
					});
				}
			});
			return pane;
		};
		const drawRow = async (board: string, variant: string, boxes: Array<[string, string]>) => {
			const added = await cli<{ elements: Array<{ id: string }> }>(
				["add", "--board", board],
				JSON.stringify(
					boxes.map(([label], index) => ({
						type: "rectangle",
						x: index * 300,
						y: 100,
						width: 200,
						height: 100,
						label: { text: label },
					})),
				),
			);
			expect(added.code, added.stderr).toBe(0);
			const ids = added.json.elements.map(({ id }) => id);
			const arrows = await cli(
				["add", "--board", board],
				JSON.stringify(
					ids.slice(1).map((id, index) => ({
						type: "arrow",
						x: 0,
						y: 0,
						width: 100,
						height: 0,
						start: { id: ids[index] },
						end: { id },
					})),
				),
			);
			expect(arrows.code, arrows.stderr).toBe(0);
			for (const [index, [label, kind]] of boxes.entries()) {
				const promoted = await cli([
					"promote",
					"--board",
					board,
					"--ids",
					ids[index]!,
					"--kind",
					kind,
					"--name",
					label,
					"--variant",
					variant,
				]);
				expect(promoted.code, promoted.stderr).toBe(0);
			}
			return ids;
		};

		const source = await openShellPane("proposal-source", 0, { primary: true, focused: true });
		expect(source.board()).toBe("scratch");
		const made = await cli<{ pane: { place: string } }>([
			"board",
			"new",
			"payments",
			"--level",
			"service",
		]);
		expect(made.code, made.stderr).toBe(0);
		await waitFor(() => source.board() === "payments", "source pane to adopt payments");
		expect(made.json.pane.place).toBe("the only pane");
		const noProposalSwitchesFrom = source.mark();

		const palette = await cli(["library", "list", "--text"]);
		expect(palette.code, palette.stderr).toBe(0);
		expect(palette.stdout).toMatch(/stencil/i);
		await drawRow("payments", "current", [
			["API Gateway", "gateway"],
			["Orders Service", "service"],
			["Orders Postgres", "datastore"],
		]);
		const sourceSave = await cli<{ file: string }>(["board", "save", "--board", "payments"]);
		expect(sourceSave.code, sourceSave.stderr).toBe(0);
		expect(existsSync(sourceSave.json.file)).toBeTrue();
		const sourceState = await request<ElementsBody>("/api/elements?board=payments");
		expect(
			new Set(
				sourceState.body.elements.flatMap(({ customData }) => customData?.archboard?.node ?? []),
			).size,
		).toBe(3);

		const branchStart = source.mark();
		const branched = await cli<{
			board: string;
			saveKind: string;
			panes: { moved: unknown[] };
		}>(["board", "save", "--board", "payments", "--variant", "option-a"]);
		expect(branched.code, branched.stderr).toBe(0);
		expect(branched.json).toMatchObject({
			board: "payments@option-a",
			saveKind: "branch",
			panes: { moved: [] },
		});
		expect(source.board()).toBe("payments");
		expect(
			source.events.slice(branchStart).some(({ type }) => type === "board_switched"),
		).toBeFalse();

		const splitStart = source.mark();
		const beside = await cli<{
			board: { board: string };
			paneCount: number;
			pane: { clientId: string; place: string };
		}>(["pane", "open", "--board", "payments@option-a"]);
		expect(beside.code, beside.stderr).toBe(0);
		expect(beside.json).toMatchObject({
			board: { board: "payments@option-a" },
			paneCount: 2,
			pane: { place: "right" },
		});
		expect(beside.stderr).toMatch(/other pane was not touched/i);
		expect(
			source.events.slice(splitStart).some(({ type }) => type === "board_switched"),
		).toBeFalse();
		const branchPane = await waitFor(
			() => panes.find(({ clientId }) => clientId === beside.json.pane.clientId),
			"new proposal pane registration",
		);
		if (!branchPane) throw new Error("The proposal pane registration disappeared.");
		await waitFor(
			() => branchPane.board() === "payments@option-a",
			"proposal pane to adopt branch",
		);
		const sideBySide = await request<PanesBody>("/api/panes");
		expect(sideBySide.body.sameBoard).toBeFalse();
		expect(sideBySide.body.panes.map(({ board }) => board)).toEqual([
			"payments",
			"payments@option-a",
		]);

		const third = await cli(["pane", "open"]);
		expect(third.code).not.toBe(0);
		expect([source.board(), branchPane.board()]).toEqual(["payments", "payments@option-a"]);

		const sourceBeforeDrawing = source.mark();
		const cacheAdd = await cli<{ elements: Array<{ id: string }> }>(
			["add", "--board", "payments@option-a"],
			JSON.stringify([
				{
					type: "rectangle",
					x: 300,
					y: 320,
					width: 200,
					height: 100,
					label: { text: "Orders Cache" },
				},
			]),
		);
		const cacheId = cacheAdd.json.elements[0]!.id;
		const branchElements = await request<ElementsBody>("/api/elements?board=payments@option-a");
		const serviceId = branchElements.body.elements.find(
			({ customData }) => customData?.archboard?.node === "orders-service",
		)!.id;
		expect(
			(
				await cli([
					"promote",
					"--board",
					"payments@option-a",
					"--ids",
					cacheId,
					"--kind",
					"datastore",
					"--name",
					"Orders Cache",
					"--variant",
					"option-a",
				])
			).code,
		).toBe(0);
		await request("/api/elements?board=payments@option-a", {
			method: "POST",
			body: {
				type: "arrow",
				x: 0,
				y: 0,
				width: 100,
				height: 0,
				start: { id: serviceId },
				end: { id: cacheId },
			},
		});
		const branchSave = await cli<{ file: string }>([
			"board",
			"save",
			"--board",
			"payments@option-a",
		]);
		expect(branchSave.code, branchSave.stderr).toBe(0);
		expect(branchSave.json.file).not.toBe(sourceSave.json.file);
		expect((await request<ElementsBody>("/api/elements?board=payments")).body.count).toBe(
			sourceState.body.count,
		);
		expect(
			source.events.slice(sourceBeforeDrawing).some(({ type }) => type === "board_switched"),
		).toBeFalse();

		const leftPictureStart = source.mark();
		const rightPictureStart = branchPane.mark();
		const shot = join(shots, "proposal.png");
		const picture = await cli(["screenshot", "--pane", "right", "--out", shot]);
		expect(picture.code, picture.stderr).toBe(0);
		expect(existsSync(shot)).toBeTrue();
		expect(
			branchPane.events
				.slice(rightPictureStart)
				.some(({ type }) => type === "export_image_request"),
		).toBeTrue();
		expect(
			source.events.slice(leftPictureStart).some(({ type }) => type === "export_image_request"),
		).toBeFalse();
		const compared = await cli<{
			summary: {
				comparable: boolean;
				sharedNodes: number;
				nodesAdded: number;
				nodesRemoved: number;
			};
			nodes: { added: Array<{ node: string }> };
		}>(["compare", "payments", "payments@option-a"]);
		expect(compared.code, compared.stderr).toBe(0);
		expect(compared.json.summary).toMatchObject({
			comparable: true,
			sharedNodes: 3,
			nodesAdded: 1,
			nodesRemoved: 0,
		});
		expect(compared.json.nodes.added.map(({ node }) => node)).toEqual(["orders-cache"]);

		const showing = await request<PanesBody>("/api/panes");
		expect(showing.body.panes.find(({ board }) => board === "payments")).toMatchObject({
			paneId: "proposal-source",
			place: "left",
		});
		expect(
			source.events.slice(noProposalSwitchesFrom).some(({ type }) => type === "board_switched"),
		).toBeFalse();
		expect(
			(await request<ElementsBody>("/api/elements?board=payments")).body.elements.every(
				({ customData }) => (customData?.archboard?.variant ?? "current") === "current",
			),
		).toBeTrue();

		await branchPane.close();
		panes.splice(panes.indexOf(branchPane), 1);
		await waitFor(
			async () => (await request<PanesBody>("/api/panes")).body.paneCount === 1,
			"proposal pane to close",
		);
		const overwritten = await cli<{ pane: { place: string } }>([
			"board",
			"open",
			"payments@option-a",
		]);
		expect(overwritten.code, overwritten.stderr).toBe(0);
		expect(overwritten.json.pane.place).toBe("the only pane");
		await waitFor(() => source.board() === "payments@option-a", "source pane to be repointed");
		expect(
			(await request<PanesBody>("/api/panes")).body.panes.some(({ board }) => board === "payments"),
		).toBeFalse();
		expect(
			(await request<ElementsBody>("/api/elements?board=payments")).body.count,
		).toBeGreaterThan(0);
		await sleep(20);
	}, 60_000);
});

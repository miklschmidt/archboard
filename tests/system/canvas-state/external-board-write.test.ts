import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SEMANTIC_BOARD_SCHEMA_VERSION } from "@/shared/semantic-board/index";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester, waitFor } from "./support/http.ts";
import { openPaneSession, type PaneEvent } from "./support/pane-session.ts";

// A vault can be open in more than one canvas, and one board file can be
// replaced by something that is not this process (ADR 0015: the file is the
// board). The lease says who may write; it says nothing about who has been
// told. Without this, a pane goes on showing a board that was replaced under it
// and an agent goes on describing an architecture nobody has any more.
//
// What is observed is the directory entry, never the content: the pane holds no
// copy to patch, so the whole of the news is "this board moved", and the pane
// answers by asking for the board again.

const repoRoot = resolve(import.meta.dir, "../../..");

/** One node of a board this test writes by hand. */
const node = (name: string): Record<string, unknown> => ({
	id: name.slice(0, 8).padEnd(8, "x"),
	name,
	kind: "service",
});

/**
 * A whole board document, as the store would have written it.
 * @param nodes What is on its one variant.
 * @returns The document.
 */
function boardDocument(nodes: Array<Record<string, unknown>>): Record<string, unknown> {
	const at = new Date().toISOString();
	return {
		schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
		kind: "semantic-board",
		id: "PreExist",
		name: "payments",
		level: "system",
		version: 1,
		createdAt: at,
		updatedAt: at,
		current: "Vinitial",
		views: [],
		variants: [
			{
				id: "Vinitial",
				name: "Initial",
				lifecycle: "current",
				content: {
					nodes: nodes.map((item, index) => ({ ...item, order: (index + 1) * 1000 })),
					edges: [],
					flows: [],
					walkthroughs: [],
				},
			},
		],
	};
}

/**
 * Replace a board the way an atomic write does: a new inode in place of the
 * old one, with nothing in this process involved.
 * @param file The board file.
 * @param document What to put there.
 */
function replaceBoard(file: string, document: Record<string, unknown>): void {
	const incoming = `${file}.incoming`;
	writeFileSync(incoming, `${JSON.stringify(document, null, "\t")}\n`);
	renameSync(incoming, file);
}

test("a board replaced by another writer reaches the pane showing it", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-external-write-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: { LOG_FILE_PATH: join(root, "canvas.log") },
	});
	resources.defer(() => canvas.dispose());
	const request = createRequester(canvas);

	const created = await request<{ version: number }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "starting the payment path",
		body: {
			board: "payments",
			create: { level: "system", nodes: [{ name: "Gateway", kind: "service" }] },
		},
	});
	expect(created.status).toBe(200);

	const pane = await openPaneSession(canvas.base, request, {
		clientId: "external-write-pane",
		board: "payments",
		primary: true,
		focused: true,
	});
	resources.defer(() => pane.close());
	await waitFor(
		async () => pane.board() === "payments",
		"the pane to settle on the board it is showing",
	);
	const start = pane.mark();

	// Another writer replaces the file, the way an atomic write does: a new
	// inode in place of the old one, with nothing in this process involved.
	const file = join(vault, "payments.semantic.json");
	const board = JSON.parse(readFileSync(file, "utf8")) as {
		version: number;
		variants: Array<{
			content: { nodes: Array<{ id: string; order: number; name: string; kind: string }> };
		}>;
	};
	board.version += 1;
	board.variants[0]!.content.nodes.push({
		id: "Xk3p91aQ",
		order: 2000,
		name: "Ledger",
		kind: "datastore",
	});
	replaceBoard(file, board as unknown as Record<string, unknown>);

	// The pane is told, in the same words a write in this process uses, so it
	// cannot tell which canvas wrote the board and does not need to.
	const told = await waitFor(
		() => pane.events.slice(start).find((event: PaneEvent) => event.type === "board_note"),
		"the pane to hear that its board changed under it",
		{ timeoutMs: 15_000 },
	);
	expect(told).toMatchObject({ type: "board_note", board: "payments" });

	// And what the canvas answers is the board that is on disk now: the picture
	// the pane asks for next is of the replacement, not of what it had.
	const read = await request<{ board: { variants: Array<{ content: { nodes: unknown[] } }> } }>(
		"/api/semantic-boards/board?board=payments",
	);
	expect(read.body.board.variants[0]?.content.nodes).toHaveLength(2);

	await canvas.assertRunning();
}, 40_000);

test("a second pane arriving does not swallow the news for the pane already there", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-arrival-write-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	mkdirSync(vault, { recursive: true });
	const file = join(vault, "payments.semantic.json");
	writeFileSync(file, `${JSON.stringify(boardDocument([node("Gateway")]), null, "\t")}\n`);

	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: { LOG_FILE_PATH: join(root, "canvas.log") },
	});
	resources.defer(() => canvas.dispose());
	const request = createRequester(canvas);
	const first = await openPaneSession(canvas.base, request, {
		clientId: "arrival-first-pane",
		board: "payments",
		primary: true,
		focused: true,
	});
	resources.defer(() => first.close());
	await waitFor(async () => first.board() === "payments", "the first pane to settle on the board");
	const start = first.mark();

	// Somebody else replaces the file, and then a second pane opens the same
	// board before the sweep that would have noticed it. Arriving is a moment to
	// look at a board, not to adopt whatever is there: an arrival that simply
	// recorded what it found would become the baseline, the difference would go
	// with it, and the pane that was already reading the old bytes would never
	// be told — for as long as it stayed open.
	replaceBoard(file, boardDocument([node("Gateway"), node("Ledger")]));
	const second = await openPaneSession(canvas.base, request, {
		clientId: "arrival-second-pane",
		board: "payments",
		x: 960,
	});
	resources.defer(() => second.close());

	const told = await waitFor(
		() => first.events.slice(start).find((event: PaneEvent) => event.type === "board_note"),
		"the pane that was already there to hear that its board changed under it",
		{ timeoutMs: 15_000 },
	);
	expect(told).toMatchObject({ type: "board_note", board: "payments" });
	await canvas.assertRunning();
}, 40_000);

test("a board that was already in the vault is watched from the moment it is shown", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-existing-write-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	mkdirSync(vault, { recursive: true });

	// Written before the canvas starts, the way a vault that has been used
	// before arrives: nothing in this process ever wrote it, so nothing in this
	// process has a fingerprint for it either.
	const file = join(vault, "payments.semantic.json");
	writeFileSync(file, `${JSON.stringify(boardDocument([node("Gateway")]), null, "\t")}\n`);

	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: { LOG_FILE_PATH: join(root, "canvas.log") },
	});
	resources.defer(() => canvas.dispose());
	const request = createRequester(canvas);
	const pane = await openPaneSession(canvas.base, request, {
		clientId: "existing-board-pane",
		board: "payments",
		primary: true,
		focused: true,
	});
	resources.defer(() => pane.close());
	await waitFor(async () => pane.board() === "payments", "the pane to settle on the board");
	const start = pane.mark();

	// Replaced immediately, inside the first sweep's window. A watcher that took
	// its baseline on its first look would adopt this as what it had always seen
	// and never mention it — and the pane would show the version it read for as
	// long as it stayed open.
	replaceBoard(file, boardDocument([node("Gateway"), node("Ledger")]));

	const told = await waitFor(
		() => pane.events.slice(start).find((event: PaneEvent) => event.type === "board_note"),
		"the pane to hear that a board it did not write changed under it",
		{ timeoutMs: 15_000 },
	);
	expect(told).toMatchObject({ type: "board_note", board: "payments" });
	await canvas.assertRunning();
}, 40_000);

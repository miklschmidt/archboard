import { expect, test } from "bun:test";

import {
	runBoardDialogRequest,
	runClear,
	runConflictOutcome,
	runOpen,
	runSave,
	type BoardCommandApi,
	type BoardCommandContext,
} from "@/ui/application/board-commands";
import { BoardConflictError, type OpenBoardRequest, type SaveRequest } from "@/ui/canvas/api";
import type { BoardIdentity, BoardInfo, BoardSaveResult, BoardWriteConflict } from "@/ui/types";

const CONFLICT: BoardWriteConflict = {
	board: "Checkout",
	file: "Checkout.md",
	reason: "changed",
	outcomes: { reload: "reload", overwrite: "overwrite", saveAs: "save-as" },
	message: "The note changed under the board.",
};

/**
 * The info the fake answers with.
 * @param board The board name.
 * @returns The info.
 */
function info(board: string): BoardInfo {
	return { board, identity: { board, variant: "current" }, elementCount: 0, placeholder: false };
}

/**
 * The save result the fake answers with.
 * @param request The save request.
 * @returns A named save when the request names a board, else a same-board save.
 */
function saved(request: SaveRequest): BoardSaveResult {
	return {
		...info(request.name ?? request.board),
		file: "note.md",
		overwrote: false,
		saveKind: request.name === undefined ? "same-board" : "named",
	};
}

/** A fake api that records every call and answers as told. */
class FakeApi implements BoardCommandApi {
	readonly calls: unknown[] = [];
	#saveFailure: Error | null = null;

	/**
	 * Make every save reject.
	 * @param failure What the save throws.
	 * @returns This api.
	 */
	refusingSaves(failure: Error): this {
		this.#saveFailure = failure;
		return this;
	}

	/**
	 * Record an open.
	 * @param request The request.
	 * @returns The opened board.
	 */
	open(request: OpenBoardRequest): Promise<BoardInfo> {
		this.calls.push(["open", request]);
		return Promise.resolve(info(request.board));
	}

	/**
	 * Record a create.
	 * @param address The new board.
	 * @returns The created board.
	 */
	create(address: Partial<BoardIdentity> & { board: string }): Promise<BoardInfo> {
		this.calls.push(["create", address]);
		return Promise.resolve(info(address.board));
	}

	/**
	 * Record a save.
	 * @param request The request.
	 * @returns The save result, or the configured refusal.
	 */
	save(request: SaveRequest): Promise<BoardSaveResult> {
		this.calls.push(["save", request]);
		return this.#saveFailure === null
			? Promise.resolve(saved(request))
			: Promise.reject(this.#saveFailure);
	}

	/**
	 * Record a clear.
	 * @param board The board.
	 * @param clientId The pane.
	 * @param expectVersion The note version the pane last saw.
	 * @returns Four removed elements.
	 */
	clear(board: string, clientId: string, expectVersion: number | null): Promise<{ count: number }> {
		this.calls.push(["clear", board, clientId, expectVersion]);
		return Promise.resolve({ count: 4 });
	}
}

const TWO_PANES: BoardCommandContext = {
	clientId: "A-1",
	expectVersion: 3,
	boardKey: "Checkout",
	board: { board: "Checkout", variant: "current" },
	pane: "A-1",
};

const ONE_PANE: BoardCommandContext = { ...TWO_PANES, pane: undefined };

test("open names the board, its variant and level, and the pane only when two are open", async () => {
	const api = new FakeApi();
	const outcome = await runBoardDialogRequest(
		api,
		{ mode: "open", board: "Runtime", variant: "proposal", level: "L2" },
		TWO_PANES,
	);
	expect(outcome).toEqual({ kind: "done", message: null });
	expect(api.calls).toEqual([
		["open", { board: "Runtime", variant: "proposal", level: "L2", pane: "A-1" }],
	]);
	api.calls.length = 0;
	await runOpen(api, { board: "Runtime", variant: "current" }, ONE_PANE);
	expect(api.calls).toEqual([["open", { board: "Runtime", variant: "current" }]]);
});

test("create writes the board first and then points the pane at it", async () => {
	const api = new FakeApi();
	const outcome = await runBoardDialogRequest(
		api,
		{ mode: "create", board: "Inventory" },
		TWO_PANES,
	);
	expect(outcome).toEqual({ kind: "done", message: "Created Inventory." });
	expect(api.calls).toEqual([
		["create", { board: "Inventory", variant: "current" }],
		["open", { board: "Inventory", variant: "current", pane: "A-1" }],
	]);
});

test("save-as writes the pane's board under the new name with the person's client id", async () => {
	const api = new FakeApi();
	const outcome = await runBoardDialogRequest(
		api,
		{ mode: "save-as", board: "Checkout", variant: "async-payments" },
		TWO_PANES,
	);
	expect(outcome).toEqual({ kind: "done", message: "Saved as Checkout." });
	expect(api.calls).toEqual([
		[
			"save",
			{
				board: "Checkout",
				clientId: "A-1",
				expectVersion: 3,
				name: "Checkout",
				variant: "async-payments",
			},
		],
	]);
	const noBoard = await runBoardDialogRequest(
		api,
		{ mode: "save-as", board: "X" },
		{ ...TWO_PANES, boardKey: null },
	);
	expect(noBoard.kind).toBe("failed");
});

test("a refused save is a conflict outcome, and the two wire outcomes are one call each", async () => {
	const api = new FakeApi().refusingSaves(new BoardConflictError(CONFLICT));
	const refused = await runSave(api, ONE_PANE);
	expect(refused).toEqual({ kind: "conflict", conflict: CONFLICT, hold: null });
	api.calls.length = 0;
	await runConflictOutcome(api, "reload", TWO_PANES);
	expect(api.calls).toEqual([
		["open", { board: "Checkout", variant: "current", pane: "A-1", reload: true }],
	]);
	const saving = new FakeApi();
	await runConflictOutcome(saving, "overwrite", ONE_PANE);
	expect(saving.calls).toEqual([
		["save", { board: "Checkout", clientId: "A-1", expectVersion: 3, force: true }],
	]);
});

test("clear is one call that carries the pane's client id and reports the count", async () => {
	const api = new FakeApi();
	const outcome = await runClear(api, ONE_PANE);
	expect(outcome).toEqual({ kind: "done", message: "Removed 4 element(s)." });
	expect(api.calls).toEqual([["clear", "Checkout", "A-1", 3]]);
	const failed = await runClear(api, { ...ONE_PANE, boardKey: null });
	expect(failed.kind).toBe("failed");
});

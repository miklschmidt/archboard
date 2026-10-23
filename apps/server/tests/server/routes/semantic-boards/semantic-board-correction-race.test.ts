import { afterAll, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { SemanticBoardSchema } from "@archboard/board/document";
import { BoardCreateInputSchema } from "@archboard/board/commands";
import { createBoardTransition } from "@archboard/board/store-write";
import * as code from "@archboard/code-intel/code-check-run";
import { requireVault } from "@archboard/workbench/host";
import { correctionRoute } from "#server/routes/semantic-boards/semantic-board-correction.ts";

// The apply route commits the candidate its code check read and ignores the
// board the lease reads. That is safe only while the lease's expected-version
// check refuses a board that changed during the check.

const scratch = mkdtempSync(join(tmpdir(), "archboard-correction-race-"));
const vault = join(scratch, ".archboard", "vault");
const file = join(vault, "Example.semantic.json");
const at = "2026-10-01T12:00:00.000Z";
const check = spyOn(code, "checkCandidateCode");
let http: Server;
let base: string;

/**
 * A historical state and the current state that superseded it.
 * @param version The board version on disk.
 * @param summary The current state's summary.
 * @returns The board.
 */
function family(version: number, summary: string) {
	const created = createBoardTransition(
		BoardCreateInputSchema.parse({ name: "Example", level: "system" }),
	).apply(null, at);
	if (!created.ok) throw new Error(created.problem);
	const original = created.board.variants[0]!;
	return SemanticBoardSchema.parse({
		...created.board,
		version,
		current: "next",
		variants: [
			{ ...original, lifecycle: "historical" },
			{ ...original, id: "next", name: "Implemented", parent: original.id, summary },
		],
		adoptions: [{ variant: "next", from: original.id, at }],
	});
}

beforeAll(async () => {
	mkdirSync(vault, { recursive: true });
	const app = express();
	app.use(express.json(), requireVault);
	const signal = new AbortController().signal;
	app.post("/apply", (req, res, next) => {
		void correctionRoute(req, res, next, signal).catch((error: unknown) => {
			setImmediate(next, error);
		});
	});
	http = await new Promise<Server>((resolve) => {
		const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
	});
	const address = http.address();
	if (address === null || typeof address === "string") throw new Error("no port");
	base = `http://127.0.0.1:${address.port}`;
});
afterAll(() => {
	check.mockRestore();
	http.close();
	rmSync(scratch, { recursive: true, force: true });
});

test("a write that lands during the code check refuses the checked candidate", async () => {
	writeFileSync(file, JSON.stringify(family(1, "Before")));
	const concurrent = JSON.stringify(family(2, "Written by somebody else"));
	check.mockImplementation(() => {
		writeFileSync(file, concurrent);
		return Promise.resolve({ ok: true, findings: [], skipped: [], timings: [] });
	});
	const query = new URLSearchParams({ vault, expectVersion: "1", doing: "Correcting history" });
	const response = await fetch(`${base}/apply?${query}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			board: "Example",
			correct: {
				variant: "Initial",
				reason: "Repair the recorded fact",
				revisions: [{ repo: "example", commit: "a".repeat(40) }],
				edit: { summary: "Corrected account" },
			},
		}),
	});
	expect(check).toHaveBeenCalledTimes(1);
	expect(response.status).toBe(409);
	expect(await response.json()).toMatchObject({ code: "BOARD_VERSION_CONFLICT", version: 2 });
	expect(readFileSync(file, "utf8")).toBe(concurrent);
});

import { afterAll, afterEach, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
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
import {
	correctionPreviewRoute,
	correctionRoute,
} from "#server/routes/semantic-boards/semantic-board-correction.ts";
import { checkoutWork } from "#server/wiring/owners/server-owners.ts";

import { mountSemanticBoardRoutes } from "#server/routes/semantic-boards/semantic-board-routes.ts";

const scratch = mkdtempSync(join(tmpdir(), "archboard-correction-route-"));
const vault = join(scratch, ".archboard", "vault");
const file = join(vault, "Example.semantic.json");
const at = "2026-10-01T12:00:00.000Z";
const revisions = [{ repo: "example", commit: "a".repeat(40) }];
const check = spyOn(code, "checkCandidateCode");
const suggest = spyOn(code, "suggestHistoricalCommits");
let http: Server;
let base: string;

/** Build a historical state and the current state that superseded it. */
function family() {
	const created = createBoardTransition(
		BoardCreateInputSchema.parse({
			name: "Example",
			level: "system",
			nodes: [{ name: "API", kind: "service" }],
		}),
	).apply(null, at);
	if (!created.ok) throw new Error(created.problem);
	const original = created.board.variants[0]!;
	return SemanticBoardSchema.parse({
		...created.board,
		version: 1,
		current: "next",
		variants: [
			{ ...original, lifecycle: "historical" },
			{ ...original, id: "next", name: "Implemented", parent: original.id },
		],
		adoptions: [{ variant: "next", from: original.id, at }],
	});
}

beforeAll(async () => {
	mkdirSync(vault, { recursive: true });
	const app = express();
	app.use(express.json(), requireVault);
	const signal = new AbortController().signal;
	app.post("/preview", (req, res, next) => {
		void correctionPreviewRoute(req, res, next, signal).catch((error: unknown) => {
			setImmediate(next, error);
		});
	});
	app.post("/apply", (req, res, next) => {
		void correctionRoute(req, res, next, signal).catch((error: unknown) => {
			setImmediate(next, error);
		});
	});
	mountSemanticBoardRoutes(app);

	http = await new Promise<Server>((resolve) => {
		const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
	});
	const address = http.address();
	if (address === null || typeof address === "string") throw new Error("no port");
	base = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
	writeFileSync(file, JSON.stringify(family()));
	check.mockResolvedValue({ ok: true, findings: [], skipped: [], timings: [] });
	suggest.mockResolvedValue([]);
});
afterEach(() => {
	check.mockClear();
	suggest.mockClear();
});
afterAll(() => {
	check.mockRestore();
	suggest.mockRestore();
	http.close();
	rmSync(scratch, { recursive: true, force: true });
});

/** Ask a correction route, with the caller's explicit write preconditions. */
async function ask(
	route: string,
	query: Record<string, string> = {},
	edit: Record<string, unknown> = { summary: "Corrected account" },
) {
	return fetch(`${base}/${route}?${new URLSearchParams({ vault, expectVersion: "1", ...query })}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			board: "Example",
			correct: { variant: "Initial", reason: "Repair the recorded fact", revisions, edit },
		}),
	});
}

test("preview checks a candidate without writing or requiring a doing line", async () => {
	const before = readFileSync(file, "utf8");
	const response = await ask("preview");
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		success: true,
		previousVersion: 1,
		board: { version: 2 },
	});
	expect(check).toHaveBeenCalledTimes(1);
	expect(check.mock.calls[0]![0]).toMatchObject({
		revisions,
		variant: { lifecycle: "historical", summary: "Corrected account" },
	});
	expect(readFileSync(file, "utf8")).toBe(before);
});

test("a stopping server cancels the correction's code reading", async () => {
	const started = Promise.withResolvers<AbortSignal>();
	check.mockImplementation(
		async ({ signal }) =>
			new Promise((_resolve, reject) => {
				started.resolve(signal);
				signal.addEventListener("abort", () => reject(signal.reason), { once: true });
			}),
	);
	const before = readFileSync(file, "utf8");
	const answer = ask("apply", { doing: "Correcting the historical account" });
	const reading = await started.promise;
	checkoutWork.quiesce();
	try {
		expect((await answer).status).toBe(500);
		expect(reading.aborted).toBe(true);
	} finally {
		checkoutWork.resume();
	}
	expect(readFileSync(file, "utf8")).toBe(before);
});

test("a code warning refuses apply without changing the file", async () => {
	const before = readFileSync(file, "utf8");
	check.mockResolvedValue({
		ok: true,
		findings: [
			{
				severity: "warning",
				code: "DOCUMENT_PATH_MISSING",
				file,
				board: "Example",
				variant: "Initial",
				path: "variants.old.documents.0",
				message: "Missing document",
			},
		],
		skipped: [],
		timings: [],
	});
	const response = await ask("apply", { doing: "Correcting the historical account" });
	expect(response.status).toBe(422);
	expect(await response.json()).toMatchObject({ success: false, code: "HISTORICAL_CODE_MISMATCH" });
	expect(readFileSync(file, "utf8")).toBe(before);
});

test("apply writes the checked subject identities and correction evidence", async () => {
	const response = await ask(
		"apply",
		{ doing: "Correcting the historical account" },
		{ nodes: [{ name: "Worker", kind: "service" }] },
	);
	expect(response.status).toBe(200);
	const candidate = check.mock.calls[0]![0].board;
	const stored = SemanticBoardSchema.parse(JSON.parse(readFileSync(file, "utf8")));
	expect(stored.variants).toEqual(candidate.variants);
	expect(stored.version).toBe(candidate.version);
	expect((await response.json()).board).toEqual(stored);
});

test("stale versions and undescribed applies stop before checking or writing", async () => {
	const before = readFileSync(file, "utf8");
	const stale = await ask("apply", {
		expectVersion: "0",
		doing: "Correcting the historical account",
	});
	expect(stale.status).toBe(409);
	expect(await stale.json()).toMatchObject({ code: "BOARD_VERSION_CONFLICT", version: 1 });
	const undescribed = await ask("apply");
	expect(undescribed.status).toBe(400);
	expect(await undescribed.json()).toMatchObject({ code: "DOING_REQUIRED" });
	expect(check).not.toHaveBeenCalled();
	expect(readFileSync(file, "utf8")).toBe(before);
});

test("suggestion uses the historical state's supersession time", async () => {
	const response = await fetch(
		`${base}/api/semantic-boards/correct-suggest?${new URLSearchParams({ vault, board: "Example", variant: "Initial" })}`,
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({ success: true, at, revisions: [] });
	expect(suggest).toHaveBeenCalledTimes(1);
	expect(suggest.mock.calls[0]![0]).toBe(vault);
	expect(suggest.mock.calls[0]![1]).toMatchObject({ name: "Initial", lifecycle: "historical" });
	expect(suggest.mock.calls[0]![2]).toBe(at);
});

/**
 * Ask for suggestions about one variant.
 * @param variant The variant name.
 * @returns The refusal code.
 */
const refusal = async (variant: string) => {
	const query = new URLSearchParams({ vault, board: "Example", variant });
	const response = await fetch(`${base}/api/semantic-boards/correct-suggest?${query}`);
	expect(response.status).toBe(422);
	return ((await response.json()) as { code: string }).code;
};

test("suggestion tells an unknown variant from one that is not historical", async () => {
	expect(await refusal("Missing")).toBe("UNKNOWN_VARIANT");
	expect(await refusal("Implemented")).toBe("VARIANT_NOT_HISTORICAL");
	expect(suggest).not.toHaveBeenCalled();
});

test("suggestion refuses a board address that contains a variant", async () => {
	const before = readFileSync(file, "utf8");
	const query = new URLSearchParams({ vault, board: "Example@Initial", variant: "Initial" });
	const response = await fetch(`${base}/api/semantic-boards/correct-suggest?${query}`);
	expect(response.status).toBe(400);
	expect(await response.json()).toMatchObject({ code: "BAD_BOARD_NAME" });
	expect(suggest).not.toHaveBeenCalled();
	expect(readFileSync(file, "utf8")).toBe(before);
});

test("correction preview names the drafts that inherit a content repair", async () => {
	const before = family();
	const historical = before.variants[0]!;
	before.variants.push({
		...historical,
		id: "draft",
		name: "Proposal",
		parent: historical.id,
		lifecycle: "draft",
	});
	writeFileSync(file, JSON.stringify(before));
	const bytes = readFileSync(file, "utf8");
	const response = await ask(
		"preview",
		{},
		{ nodes: [{ ...historical.content.nodes[0]!, responsibility: "Accepts orders" }] },
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toMatchObject({
		reconciliation: { required: false, drafts: [{ variant: "draft", outcome: "merged" }] },
	});
	expect(readFileSync(file, "utf8")).toBe(bytes);
});

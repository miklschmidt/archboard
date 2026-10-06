// A pane reads what the last code pass found and never starts one (ADR 0046,
// TASK-367.24). Each pass that finishes leaves its findings in the server's
// memory, beside the version of each board it read; `GET
// /api/vault/code-findings` answers from that memory alone. A later pass
// replaces the readings of the boards it read and keeps the others, and a pass
// the caller cancelled leaves the memory as it was.
//
// A stand-in pass counts how often it runs, so "a read starts no pass" is
// observed rather than assumed.

import { afterAll, beforeAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import type * as RouteModule from "@/server/archboard/code-check";
import { RememberedFindingsSchema, type CodeCheckAnswer } from "@/shared/code-check/index";

const scratch = mkdtempSync(join(tmpdir(), "archboard-code-findings-route-"));
const caller = process.env["ARCHBOARD_VAULT"];
process.env["ARCHBOARD_VAULT"] = scratch;
let route: typeof RouteModule;
const listening: Server[] = [];

beforeAll(async () => {
	route = await import("@/server/archboard/code-check");
});

afterAll(() => {
	for (const http of listening) http.close();
	if (caller === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = caller;
	rmSync(scratch, { recursive: true, force: true });
});

/**
 * Listen on a free port.
 * @param app The application.
 * @returns Its base URL.
 */
async function listen(app: express.Express): Promise<string> {
	const http = await new Promise<Server>((resolve) => {
		const started = app.listen(0, "127.0.0.1", () => resolve(started));
	});
	listening.push(http);
	const address = http.address();
	if (address === null || typeof address === "string") throw new Error("no port");
	return `http://127.0.0.1:${address.port}`;
}

/**
 * The answer of a pass over some boards at their current variant, `v1`, with
 * one warning on each board it names in `warned`.
 * @param boards The boards it read, each at version 3.
 * @param warned The boards it found something on.
 * @returns The answer.
 */
function answerOver(boards: readonly string[], warned: readonly string[]): CodeCheckAnswer {
	return {
		boards: boards.map((board) => ({ board, variant: "v1", version: 3 })),
		findings: warned.map((board) => ({
			code: "ANCHOR_SYMBOL_MISSING",
			severity: "warning",
			file: `${board}.semantic.json`,
			path: "variants[0].content.edges[0].anchor",
			board,
			variant: "v1",
			subject: { kind: "edge", id: "e1", name: "A -> B" },
			message: "The anchored file neither defines nor references writeBoard.",
		})),
		skipped: [],
		behind: [],
	};
}

/**
 * A server whose passes answer what the test says, counting each one.
 * @param answers What each pass answers, in turn.
 * @param cancel Whether each pass's caller cancels it before it settles.
 * @returns How to read the server, and how many passes ran.
 */
async function serverWith(
	answers: CodeCheckAnswer[],
	cancel = false,
): Promise<{ base: string; passes: () => number }> {
	const app = express();
	let passes = 0;
	route.mountCodeCheckRoute(app, {
		memory: route.createCodeFindingsMemory(),
		runCheckout: (_request, _response, _name, work) => {
			const control = new AbortController();
			if (cancel) control.abort();
			return work(control.signal);
		},
		check: async () => {
			passes += 1;
			return answers.shift() ?? answerOver([], []);
		},
	});
	return { base: await listen(app), passes: () => passes };
}

/**
 * What a pane reads.
 * @param base The server.
 * @returns The remembered readings, by board.
 */
async function readFindings(base: string): Promise<Map<string, number>> {
	const reply = await fetch(`${base}/api/vault/code-findings`);
	expect(reply.status).toBe(200);
	const { readings } = RememberedFindingsSchema.parse(await reply.json());
	return new Map(readings.map((reading) => [reading.board, reading.findings.length]));
}

test("a pass fills the memory, and reading it starts no pass", async () => {
	const { base, passes } = await serverWith([answerOver(["orders", "payments"], ["orders"])]);

	expect((await readFindings(base)).size).toBe(0);
	await (await fetch(`${base}/api/vault/code-check`)).json();
	expect(passes()).toBe(1);

	const reply = await fetch(`${base}/api/vault/code-findings`);
	const { readings } = RememberedFindingsSchema.parse(await reply.json());
	expect(readings.map(({ board, variant, version }) => ({ board, variant, version }))).toEqual([
		{ board: "orders", variant: "v1", version: 3 },
		{ board: "payments", variant: "v1", version: 3 },
	]);
	expect(readings.find((reading) => reading.board === "orders")?.findings).toHaveLength(1);
	await readFindings(base);
	expect(passes()).toBe(1);
});

test("a later pass replaces what it read and keeps the rest", async () => {
	const { base } = await serverWith([
		answerOver(["orders", "payments"], ["orders", "payments"]),
		answerOver(["orders"], []),
	]);
	await (await fetch(`${base}/api/vault/code-check`)).json();
	await (await fetch(`${base}/api/vault/code-check`)).json();

	expect(await readFindings(base)).toEqual(
		new Map([
			["orders", 0],
			["payments", 1],
		]),
	);
});

test("a cancelled pass leaves the memory as it was", async () => {
	const { base, passes } = await serverWith([answerOver(["orders"], ["orders"])], true);
	await fetch(`${base}/api/vault/code-check`).catch(() => undefined);

	expect(passes()).toBe(1);
	expect((await readFindings(base)).size).toBe(0);
});

// A pane reads what the last code pass found and never starts one (ADR 0046,
// TASK-367.24). Each pass that finishes leaves its findings in the server's
// memory, beside the version of each board it read; `GET
// /api/vault/code-findings` answers from that memory alone. A later pass
// replaces the readings of the boards it read and keeps the others, and a pass
// the caller cancelled leaves the memory as it was. The memory keeps when the
// vault's last pass ran, so a pass that read no board is not taken for none.
//
// The pass also leaves what each container it judged exposes (TASK-539.01): the
// panes poll its counts with the findings, and `GET
// /api/vault/code-findings/exposure` answers the names of one container from
// the same memory. `archboard check code` carries them only with `--exposed`.
//
// A stand-in pass counts how often it runs, so "a read starts no pass" is
// observed rather than assumed.

import { afterAll, expect, test } from "bun:test";
import type { Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { mountCodeCheckRoute } from "#server/routes/code-check/code-check-route.ts";
import { createCodeFindingsMemory } from "#server/state/code-findings/code-findings-memory.ts";
import {
	CodeCheckAnswerSchema,
	RememberedExposureSchema,
	RememberedFindingsSchema,
	type CodeCheckAnswer,
} from "@archboard/code-intel/code-check";

/** What one judged container exposes. */
type ContainerExposure = NonNullable<CodeCheckAnswer["exposures"]>[number];

const scratch = mkdtempSync(join(tmpdir(), "archboard-code-findings-route-"));
const ownVault = vaultIn(scratch);
const listening: Server[] = [];

/**
 * Make the vault of a directory, where the server serves one from (ADR 0050).
 * @param holder The directory.
 * @returns The vault.
 */
function vaultIn(holder: string): string {
	const vault = join(holder, ".archboard", "vault");
	mkdirSync(vault, { recursive: true });
	return vault;
}

afterAll(() => {
	for (const http of listening) http.close();
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
 * @param exposures What the containers it judged expose.
 * @returns The answer.
 */
function answerOver(
	boards: readonly string[],
	warned: readonly string[],
	exposures: ContainerExposure[] = [],
): CodeCheckAnswer {
	return {
		exposures,
		timings: [],
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
	mountCodeCheckRoute(app, {
		memory: createCodeFindingsMemory(),
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
 * The query that names a vault, as every call to the server does (ADR 0049).
 * @param vault The vault, which is the one the test owns unless another is named.
 * @returns The query string.
 */
function named(vault = ownVault): string {
	return `vault=${encodeURIComponent(vault)}`;
}

/**
 * What a pane reads.
 * @param base The server.
 * @param vault The vault the pane shows.
 * @returns The remembered readings, by board.
 */
async function readFindings(base: string, vault = ownVault): Promise<Map<string, number>> {
	const reply = await fetch(`${base}/api/vault/code-findings?${named(vault)}`);
	expect(reply.status).toBe(200);
	const { readings } = RememberedFindingsSchema.parse(await reply.json());
	return new Map(readings.map((reading) => [reading.board, reading.findings.length]));
}

test("a pass fills the memory, and reading it starts no pass", async () => {
	const { base, passes } = await serverWith([answerOver(["orders", "payments"], ["orders"])]);

	expect((await readFindings(base)).size).toBe(0);
	await (await fetch(`${base}/api/vault/code-check?${named()}`)).json();
	expect(passes()).toBe(1);

	const reply = await fetch(`${base}/api/vault/code-findings?${named()}`);
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
	await (await fetch(`${base}/api/vault/code-check?${named()}`)).json();
	await (await fetch(`${base}/api/vault/code-check?${named()}`)).json();

	expect(await readFindings(base)).toEqual(
		new Map([
			["orders", 0],
			["payments", 1],
		]),
	);
});

test("a pass that read no board is remembered as a pass, with the time it ran", async () => {
	const { base } = await serverWith([answerOver([], [])]);
	const before = RememberedFindingsSchema.parse(
		await (await fetch(`${base}/api/vault/code-findings?${named()}`)).json(),
	);
	expect(before.lastCheckedAt).toBeUndefined();
	await (await fetch(`${base}/api/vault/code-check?${named()}`)).json();
	const after = RememberedFindingsSchema.parse(
		await (await fetch(`${base}/api/vault/code-findings?${named()}`)).json(),
	);
	expect(after.readings).toEqual([]);
	expect(after.lastCheckedAt).toBeString();
});

test("a cancelled pass leaves the memory as it was", async () => {
	const { base, passes } = await serverWith([answerOver(["orders"], ["orders"])], true);
	await fetch(`${base}/api/vault/code-check?${named()}`).catch(() => undefined);

	expect(passes()).toBe(1);
	expect((await readFindings(base)).size).toBe(0);
});

test("what a pass found in one vault is not shown for a board of the same name in another", async () => {
	const other = mkdtempSync(join(tmpdir(), "archboard-code-findings-other-"));
	const otherVault = vaultIn(other);
	try {
		const { base } = await serverWith([answerOver(["orders"], ["orders"])]);
		await (await fetch(`${base}/api/vault/code-check?${named()}`)).json();

		expect((await readFindings(base)).get("orders")).toBe(1);
		expect((await readFindings(base, otherVault)).size).toBe(0);
	} finally {
		rmSync(other, { recursive: true, force: true });
	}
});

/**
 * What a container of the board `orders` exposes: one name, one user.
 * @param container The container's part id.
 * @returns The reading.
 */
function exposing(container: string): ContainerExposure {
	return {
		board: "orders",
		variant: "v1",
		container,
		module: "src/orders",
		rootFiles: ["src/orders/index.ts"],
		exposed: 2,
		usedOutside: 1,
		names: [
			{
				name: "place",
				path: "src/orders/place.ts",
				line: 4,
				via: ["src/orders/index.ts"],
				users: 1,
				usedBy: [{ path: "src/api/routes.ts", line: 9, parts: ["Api"] }],
			},
			{ name: "cancel", path: "src/orders/cancel.ts", line: 2, via: [], users: 0, usedBy: [] },
		],
	};
}

test("a reading carries the counts of its containers, and its skips with those that name no board", async () => {
	const { base } = await serverWith([
		{
			...answerOver(["orders", "payments"], [], [exposing("Orders")]),
			skipped: [
				{ reason: "exposure-unknown", board: "orders", variant: "v1", repo: "r", detail: "orders" },
				{ reason: "text-only", repo: "r", detail: "yaml" },
				{ reason: "exposure-unknown", board: "payments", variant: "v1", repo: "r", detail: "pay" },
			],
		},
	]);
	await (await fetch(`${base}/api/vault/code-check?${named()}`)).json();

	const reply = await fetch(`${base}/api/vault/code-findings?${named()}`);
	const { readings } = RememberedFindingsSchema.parse(await reply.json());
	const orders = readings.find((reading) => reading.board === "orders");
	expect(orders?.skipped.map((skip) => skip.detail)).toEqual(["orders", "yaml"]);
	expect(orders?.containers).toEqual([
		{ container: "Orders", module: "src/orders", exposed: 2, usedOutside: 1 },
	]);
	// A pane polls this, so the names stay behind the route that is asked for them.
	expect(JSON.stringify(orders)).not.toContain("place");
	const payments = readings.find((reading) => reading.board === "payments");
	expect(payments?.skipped.map((skip) => skip.detail)).toEqual(["yaml", "pay"]);
	expect(payments?.containers).toEqual([]);
});

test("the exposure route answers one container from memory and starts no pass", async () => {
	const { base, passes } = await serverWith([
		answerOver(["orders"], [], [exposing("Orders"), exposing("Shipping")]),
	]);
	const ask = (container: string, vault = ownVault) =>
		fetch(
			`${base}/api/vault/code-findings/exposure?${named(vault)}&board=orders&variant=v1&container=${container}`,
		);

	expect((await ask("Orders")).status).toBe(404);
	await (await fetch(`${base}/api/vault/code-check?${named()}`)).json();
	expect(passes()).toBe(1);

	const reply = await ask("Shipping");
	expect(reply.status).toBe(200);
	const kept = RememberedExposureSchema.parse(await reply.json());
	expect(kept).toMatchObject({ version: 3, exposure: { container: "Shipping", exposed: 2 } });
	expect(kept.exposure.names.map((name) => name.name)).toEqual(["place", "cancel"]);
	expect((await ask("Nothing")).status).toBe(404);
	expect(passes()).toBe(1);
});

test("the exposure route refuses a call that names no vault or no container, and shows another vault nothing", async () => {
	const other = mkdtempSync(join(tmpdir(), "archboard-code-findings-other-"));
	const otherVault = vaultIn(other);
	try {
		const { base } = await serverWith([answerOver(["orders"], [], [exposing("Orders")])]);
		await (await fetch(`${base}/api/vault/code-check?${named()}`)).json();
		const query = "board=orders&variant=v1&container=Orders";

		const nameless = await fetch(`${base}/api/vault/code-findings/exposure?${query}`);
		expect([nameless.status, ((await nameless.json()) as { code: string }).code]).toEqual([
			400,
			"VAULT_REQUIRED",
		]);
		const incomplete = await fetch(
			`${base}/api/vault/code-findings/exposure?${named()}&board=orders`,
		);
		expect(incomplete.status).toBe(400);
		const elsewhere = await fetch(
			`${base}/api/vault/code-findings/exposure?${named(otherVault)}&${query}`,
		);
		expect(elsewhere.status).toBe(404);
	} finally {
		rmSync(other, { recursive: true, force: true });
	}
});

test("the answer of the check carries exposures only when the request says exposed=true", async () => {
	const exposures = [exposing("Orders")];
	const { base } = await serverWith([
		answerOver(["orders"], [], exposures),
		answerOver(["orders"], [], exposures),
	]);
	const read = async (query: string) =>
		(await (await fetch(`${base}/api/vault/code-check?${named()}${query}`)).json()) as Record<
			string,
			unknown
		>;

	const plain = await read("");
	const { exposures: _optional, ...answerKeys } = CodeCheckAnswerSchema.shape;
	expect(Object.keys(plain).toSorted()).toEqual(["success", ...Object.keys(answerKeys)].toSorted());

	const asked = await read("&exposed=true");
	expect(Object.keys(asked).toSorted()).toEqual(
		["success", "exposures", ...Object.keys(answerKeys)].toSorted(),
	);
	expect(asked["exposures"]).toEqual(exposures);
});

test("a pass that was not asked for its exposures still leaves them in memory for the panes", async () => {
	const { base } = await serverWith([answerOver(["orders"], [], [exposing("Orders")])]);
	await fetch(`${base}/api/vault/code-check?${named()}`);
	const kept = await fetch(
		`${base}/api/vault/code-findings/exposure?${named()}&board=orders&variant=v1&container=Orders`,
	);
	expect(kept.status).toBe(200);
});

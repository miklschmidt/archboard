import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "../support/http.ts";
import {
	openTestPane,
	waitForPaneMessage,
	waitForPaneMessageWhere,
} from "../support/pane-websocket.ts";
import { sanitizedEnvironment } from "./support/process-http.ts";

// What the public lock surface promises, against a real canvas process: a
// claim is one writer for a stretch of work, a person can end it with one
// explicit control, and the agent is told once that it lost the board and
// never quietly carries on (ADR 0016, ADR 0022).
//
// A person's own hold is not here and cannot be: a person does not author a
// board any more, so the only thing a pane ever asks of the lock is that
// somebody else's claim be given back (ADR 0023).

const repoRoot = resolve(import.meta.dir, "../../..");

test("the public lock API preserves claims, refusals and told-once recovery", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-lock-api-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: sanitizedEnvironment(root, vault),
	});
	resources.defer(() => canvas.dispose());
	const request = createJsonRequester(canvas);

	const created = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "starting the payment path",
		body: {
			board: "payments",
			origin: "agent",
			create: { level: "system", nodes: [{ name: "Gateway", kind: "service" }], edges: [] },
		},
	});
	expect(created.status).toBe(200);

	const pane = await openTestPane(canvas.base, request, "pane-lock-owner", 0, {
		board: "payments",
	});
	resources.defer(() => pane.close());
	try {
		// A pane arriving on a free board is told so outright rather than left to
		// assume it: the fail-open the ADR forbids.
		expect(
			await pane.waitFor((message) => message.type === "board_lock" && message["held"] === false),
		).toBeDefined();

		const reason = "redrawing the payment path";
		const claimStart = pane.since();
		const claim = await request<{
			claim: { holder: { reason: string; claimed: boolean } };
			version: number;
		}>("/api/semantic-boards/claim?board=payments", { method: "POST", body: { reason } });
		expect(claim.status).toBe(200);
		expect(claim.body.claim.holder).toMatchObject({ claimed: true, reason });
		// The claim was told which version it holds, so its first write states one.
		expect(claim.body.version).toBe(1);
		expect(await waitForPaneMessage(pane, claimStart, "board_lock")).toMatchObject({
			held: true,
			holder: { kind: "agent", claimed: true, reason },
		});

		// Twenty writes under one claim: the whole point of claiming.
		let version = claim.body.version;
		for (let index = 0; index < 20; index += 1) {
			const wrote = await request<{ success: boolean; version: number }>(
				`/api/semantic-boards/edit?expectVersion=${version}`,
				{
					method: "POST",
					doing: `adding step ${index + 1}`,
					body: {
						board: "payments",
						origin: "agent",
						edit: { nodes: [{ name: `Step ${index + 1}`, kind: "service" }] },
					},
				},
			);
			expect(wrote.status).toBe(200);
			version = wrote.body.version;
		}
		expect(version).toBe(21);

		// The one explicit control ends the claim and leaves the board to nobody.
		const takeBackStart = pane.since();
		const takenBack = await request<{ released: boolean; claim?: { reason?: string } }>(
			"/api/semantic-boards/take-back?board=payments",
			{ method: "POST", body: { clientId: pane.clientId } },
		);
		expect(takenBack.status).toBe(200);
		expect(takenBack.body).toMatchObject({ released: true, claim: { claimed: true, reason } });
		expect(
			await waitForPaneMessageWhere(
				pane,
				takeBackStart,
				(message) => message.type === "board_lock" && message["held"] === false,
				2_000,
			),
		).toBeDefined();

		// Told once, and told what it means: nothing was rolled back.
		const revoked = await request<{ code: string; error: string }>(
			"/api/semantic-boards/claim?board=payments",
			{ method: "POST", body: { reason: "carrying on" } },
		);
		expect(revoked.status).toBe(409);
		expect(revoked.body.code).toBe("CLAIM_REVOKED");
		expect(revoked.body.error).toContain("nothing was undone");

		// Everything the claim wrote is on the board, and an ordinary write still
		// lands: losing the claim is not losing the board.
		const read = await request<{ board: { version: number } }>(
			"/api/semantic-boards/board?board=payments",
		);
		expect(read.body.board.version).toBe(21);
		const ordinary = await request(`/api/semantic-boards/edit?expectVersion=21`, {
			method: "POST",
			doing: "saying where I left it",
			body: {
				board: "payments",
				origin: "agent",
				edit: { nodes: [{ name: "Ledger", kind: "datastore" }] },
			},
		});
		expect(ordinary.status).toBe(200);

		// Releasing a claim nobody holds, and taking back a board nobody claimed,
		// are both answers rather than failures.
		expect(
			(
				await request<{ released: boolean }>("/api/semantic-boards/claim/release?board=payments", {
					method: "POST",
				})
			).body.released,
		).toBeFalse();
		expect(
			(
				await request<{ released: boolean }>("/api/semantic-boards/take-back?board=payments", {
					method: "POST",
					body: { clientId: pane.clientId },
				})
			).body,
		).toMatchObject({ success: true, released: false });

		// Every lock route says what it needs rather than guessing.
		for (const [path, body, status] of [
			["/api/semantic-boards/claim", { reason: "anything" }, 400],
			["/api/semantic-boards/claim?board=payments", {}, 400],
			["/api/semantic-boards/take-back?board=payments", {}, 400],
			["/api/semantic-boards/claim?board=nowhere", { reason: "anything" }, 404],
		] as const) {
			expect((await request(path, { method: "POST", body })).status).toBe(status);
		}
	} finally {
		await resources.disposeAsync();
	}
}, 30_000);

import { describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WebSocket } from "ws";

import { startOwnedServer } from "../support/owned-server.ts";
import { ensureSemanticVaultConfiguration } from "../support/semantic-vault.ts";
import { createRequester, waitFor } from "./support/http.ts";
import { openPaneSession, type PaneEvent } from "./support/pane-session.ts";

// ADR 0049: one server serves several vaults, and every call names the one it means.
// One owned server and two vaults, the second a directory of the test's own.

const repoRoot = resolve(import.meta.dir, "../../..");

const READ_ROUTES = [
	"/api/semantic-boards",
	"/api/semantic-boards/board?board=payments",
	"/api/semantic-boards/render?board=payments",
	"/api/semantic-boards/locality?board=payments",
	"/api/semantic-boards/footprint?board=payments",
	"/api/vault/check",
	"/api/vault/code-check",
	"/api/vault/code-findings",
	"/api/panes/semantic-context",
];
const WRITE_ROUTES = [
	"/api/semantic-boards/create",
	"/api/semantic-boards/edit",
	"/api/semantic-boards/branch",
	"/api/semantic-boards/resolve",
	"/api/semantic-boards/adopt",
	"/api/semantic-boards/shelve",
	"/api/semantic-boards/rename",
	"/api/semantic-boards/discard",
	"/api/semantic-boards/claim",
	"/api/semantic-boards/claim/release",
	"/api/semantic-boards/take-back",
	"/api/panes",
	"/api/panes/show",
	"/api/code-targets/open",
];

/**
 * Whether a pane event shows an agent's claim: on the board's lock, or in the navigator's
 * account of agent work.
 * @param event What the pane heard.
 * @returns True when it shows a claim.
 */
function claimed(event: PaneEvent): boolean {
	return (
		(event.type === "board_lock" && JSON.stringify(event["holder"]).includes('"claimed":true')) ||
		(event.type === "agent_activity" && JSON.stringify(event["activity"]).includes('"claim":{'))
	);
}

describe.serial("every call names its vault", () => {
	test("two vaults on one server keep their boards, news, claims and leases apart", async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-vault-naming-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vaultA = join(root, "vault-a");
		const vaultB = join(root, "vault-b");
		mkdirSync(vaultB, { recursive: true });
		ensureSemanticVaultConfiguration(vaultB);
		const server = await startOwnedServer({
			serverPath: join(repoRoot, "src/server.ts"),
			vault: vaultA,
			env: { LOG_FILE_PATH: join(root, "server.log") },
		});
		resources.defer(() => server.dispose());
		const inA = createRequester(server);
		const inB = createRequester({
			base: server.base,
			assertRunning: server.assertRunning,
			vault: realpathSync(vaultB),
		});

		const versions: number[] = [];
		for (const request of [inA, inB]) {
			const created = await request<{ version: number }>("/api/semantic-boards/create", {
				method: "POST",
				doing: "starting the payment path",
				body: { board: "payments", create: { level: "system", nodes: [] } },
			});
			expect(created.status).toBe(200);
			versions.push(created.body.version);
		}
		const listed = await inB<{ boards: Array<{ name: string }> }>("/api/semantic-boards");
		expect(listed.body.boards.map((board) => board.name)).toEqual(["payments"]);

		const paneA = await openPaneSession(server.base, inA, {
			clientId: "pane-a",
			board: "payments",
			primary: true,
		});
		resources.defer(() => paneA.close());
		const paneB = await openPaneSession(server.base, inB, {
			clientId: "pane-b",
			board: "payments",
			primary: true,
		});
		resources.defer(() => paneB.close());
		// A pane is in the vault the server put it in: a report naming another one
		// registers nothing there.
		const crossed = await inB<{ registered: boolean; code: string }>("/api/panes", {
			method: "POST",
			doing: false,
			body: { ...paneA.registration, board: "payments" },
		});
		const { registered, code } = crossed.body;
		expect({ status: crossed.status, registered, code }).toEqual({
			status: 200,
			registered: false,
			code: "PANE_MOVED",
		});
		const startA = paneA.mark();
		const startB = paneB.mark();

		// A write in vault A is heard by A's pane of that board and by no pane of vault B,
		// although B holds a board of the same name.
		const wrote = await inA<{ version: number }>(
			`/api/semantic-boards/edit?expectVersion=${versions[0]}`,
			{
				method: "POST",
				doing: "adding a queue to vault A",
				body: { board: "payments", edit: { nodes: [{ name: "Queue", kind: "service" }] } },
			},
		);
		expect(wrote.status).toBe(200);
		const news = await paneA.waitFor("board_doing", startA);
		expect(news).toMatchObject({ board: "payments" });
		await paneB.sync();
		const heardInB = paneB.events.slice(startB).filter((event: PaneEvent) => event.board);
		expect(heardInB).toEqual([]);

		// A claim in vault A does not block vault B, and the lease is a file of vault A alone.
		const beforeClaimA = paneA.mark();
		const beforeClaimB = paneB.mark();
		const claim = await inA("/api/semantic-boards/claim?board=payments", {
			method: "POST",
			doing: false,
			body: { reason: "reworking vault A" },
		});
		expect(claim.status).toBe(200);
		const blockedElsewhere = await inB(`/api/semantic-boards/edit?expectVersion=${versions[1]}`, {
			method: "POST",
			doing: "adding a ledger to vault B",
			body: { board: "payments", edit: { nodes: [{ name: "Ledger", kind: "datastore" }] } },
		});
		expect(blockedElsewhere.status).toBe(200);
		expect(existsSync(join(vaultA, ".archboard", "locks", "payments.lock"))).toBe(true);
		expect(existsSync(join(vaultB, ".archboard", "locks", "payments.lock"))).toBe(false);
		const boardInA = await inA<{ board: { nodes?: unknown } }>(
			"/api/semantic-boards/board?board=payments",
		);
		expect(JSON.stringify(boardInA.body)).toContain("Queue");
		expect(JSON.stringify(boardInA.body)).not.toContain("Ledger");

		// The claim is shown wherever vault A's board is shown, by its lock and in the
		// navigator's account of agent work, and on no pane of vault B (ADR 0022).
		await waitFor(
			() =>
				["board_lock", "agent_activity"].every((type) =>
					paneA.events.slice(beforeClaimA).some((event) => event.type === type && claimed(event)),
				),
			"vault A's pane to show the claim by its lock and its agent activity",
		);
		await paneB.sync();
		expect(paneB.events.slice(beforeClaimB).filter(claimed)).toEqual([]);
		await inA("/api/semantic-boards/claim/release?board=payments", {
			method: "POST",
			doing: false,
			body: {},
		});

		// A board of vault B replaced by another writer is news to B's pane and to no pane of A.
		const beforeDiskA = paneA.mark();
		const beforeDiskB = paneB.mark();
		const fileB = join(vaultB, "payments.semantic.json");
		const onDisk = JSON.parse(readFileSync(fileB, "utf8")) as { version: number };
		writeFileSync(`${fileB}.incoming`, JSON.stringify({ ...onDisk, version: onDisk.version + 1 }));
		renameSync(`${fileB}.incoming`, fileB);
		await waitFor(
			() => paneB.events.slice(beforeDiskB).some((event) => event.type === "board_note"),
			"vault B's pane to hear that its board changed on disk",
		);
		await paneA.sync();
		expect(paneA.events.slice(beforeDiskA).filter((event) => event.type === "board_note")).toEqual(
			[],
		);
	}, 60_000);

	test("a call that names no vault, or one the server cannot read, is refused and creates nothing", async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-vault-refused-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const server = await startOwnedServer({
			serverPath: join(repoRoot, "src/server.ts"),
			vault: join(root, "vault"),
			env: { LOG_FILE_PATH: join(root, "server.log") },
		});
		resources.defer(() => server.dispose());
		const request = createRequester(server);
		const missing = join(root, "not-a-vault");

		for (const route of READ_ROUTES) {
			const refused = await request<{ code: string }>(route, { vault: false });
			expect({ route, status: refused.status, code: refused.body.code }).toEqual({
				route,
				status: 400,
				code: "VAULT_REQUIRED",
			});
		}
		for (const route of WRITE_ROUTES) {
			const refused = await request<{ code: string }>(route, {
				method: "POST",
				doing: "trying a call that names no vault",
				vault: false,
				headers: { Origin: server.base, "Sec-Fetch-Site": "same-origin" },
				body: { board: "payments" },
			});
			expect({ route, status: refused.status, code: refused.body.code }).toEqual({
				route,
				status: 400,
				code: "VAULT_REQUIRED",
			});
		}

		for (const vault of [missing, "relative/vault"]) {
			const unreadable = await request<{ code: string }>("/api/semantic-boards/create", {
				method: "POST",
				doing: "starting a board in a vault that is not there",
				vault,
				body: { board: "payments", create: { level: "system", nodes: [] } },
			});
			expect(unreadable.status).toBe(404);
			expect(unreadable.body.code).toBe("VAULT_UNREADABLE");
		}
		expect(existsSync(missing)).toBe(false);

		// The socket names its vault when it connects, or it is refused.
		const endpoint = new URL(server.base);
		endpoint.protocol = "ws:";
		endpoint.searchParams.set("clientId", "nameless");
		const socket = new WebSocket(endpoint);
		resources.defer(() => socket.terminate());
		const outcome = await new Promise<string>((settle) => {
			socket.once("open", () => settle("open"));
			socket.once("error", () => settle("refused"));
			socket.once("unexpected-response", () => settle("refused"));
		});
		expect(outcome).toBe("refused");

		// The browser learns the one vault the server reports.
		const served = await request<{ vault: string }>("/api/served-vault", { vault: false });
		expect(served.body.vault).toBe(realpathSync(join(root, "vault")));
	}, 60_000);
});

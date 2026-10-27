import { seedCanonicalFixture } from "../support/canonical-fixture.ts";
import { expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";

import { startOwnedServer } from "../support/owned-server.ts";
import { runServerCli } from "../support/run-cli.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	productionRecords as records,
	productionSnapshot as snapshots,
	productionLeaseTarget as leaseTarget,
	productionPane as pane,
	type ApplicationSocket,
} from "./support/codex-production.ts";
import { createRequester } from "./support/http.ts";
import { coordinatorModelFixture } from "./fixtures/fake-codex-production-data.ts";
import { SHOWN_CONVERSATION_ROUTE } from "@archboard/workbench/browser-contract";
import { productionServer } from "./support/production-server.ts";

const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");
const repoRoot = resolve(import.meta.dir, "../../..");

/**
 * Claim the lease on one pane's socket and send one command under it.
 * @param socket The pane's socket.
 * @param command The command name.
 * @param extra The command's own fields.
 * @returns The result.
 */
async function leased(
	socket: ApplicationSocket,
	command: string,
	extra: Record<string, unknown> = {},
) {
	const lease = await socket.request("claimLease");
	return socket.request("command", {
		command: { kind: "browser_command", command, ...leaseTarget(lease), ...extra },
	});
}

/**
 * The workhorse list a pane's snapshot shows: the shown checkout, and each listed one with
 * whether it is live.
 * @param socket The pane's socket.
 * @returns The list.
 */
async function listOf(socket: ApplicationSocket) {
	const snapshot = snapshots(await socket.request("snapshot"));
	const list = snapshot["workhorses"] as {
		readonly shown: string;
		readonly entries: readonly { readonly checkout: string; readonly live: boolean }[];
	};
	return {
		shown: list.shown,
		entries: list.entries.map(({ checkout, live }) => [checkout, live]),
		threadId: (snapshot["threadLink"] as Record<string, unknown>)["threadId"],
	};
}

// The shown conversation (ADR 0050, TASK-472.11): the panes of a tab show the conversation of the
// checkout the person last activated in the page. What is guarded: the tab's focused pane pins it,
// whichever pane is read first, the page's call changes it for every pane of the tab, a pick is taken only for a checkout the
// tab works in, a message and New conversation from any pane go to the shown checkout's workhorse,
// and an agent's show of a pane changes nothing of it.
test("the page's activation changes the conversation every pane of a tab shows, and an agent's show does not", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(resources, executableSource);
		const server = await startOwnedServer({
			...productionServer,
			vault: fixture.vault,
			env: {
				ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
				ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
				ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
				XDG_STATE_HOME: join(fixture.root, "state"),
			},
		});
		resources.defer(() => server.dispose());
		const request = createRequester(server);
		const shopVault = vaultIn(join(fixture.root, "shop"));
		const payments = realpathSync(fixture.root);
		const shop = realpathSync(join(fixture.root, "shop"));
		for (const vault of [fixture.vault, shopVault]) {
			seedCanonicalFixture(vault);
		}
		// One tab: pane A in the payments checkout, pane B in the shop checkout.
		const a = await openApplicationSocket(server.base, "client-a", { tabSession: "tab-one" });
		resources.defer(() => a.close());
		const b = await openApplicationSocket(server.base, "client-b", {
			tabSession: "tab-one",
			vault: shopVault,
		});
		resources.defer(() => b.close());
		const registered = [
			await request("/api/panes", {
				method: "POST",
				doing: false,
				body: pane("client-a", "A", false, true),
			}),
			await request("/api/panes", {
				method: "POST",
				doing: false,
				vault: shopVault,
				body: pane("client-b", "B", true, false),
			}),
		];
		expect(registered.map(({ status }) => status)).toEqual([200, 200]);
		expect(await a.request("connect")).toMatchObject({ ok: true });
		expect(await b.request("connect")).toMatchObject({ ok: true });

		// The focused pane pins the tab though A is read first, and both panes show that one
		// conversation.
		expect(await listOf(a)).toMatchObject({ shown: shop, entries: [[shop, false]] });
		expect((await listOf(b)).shown).toBe(shop);

		const page: Record<string, string> = { Origin: server.base, "Sec-Fetch-Site": "same-origin" };
		const activate = (clientId: string, checkout?: string, vault = fixture.vault, headers = page) =>
			request<{ success?: boolean; shown?: string; changed?: boolean; code?: string }>(
				SHOWN_CONVERSATION_ROUTE,
				{
					method: "POST",
					doing: false,
					vault,
					headers,
					body: { clientId, ...(checkout === undefined ? {} : { checkout }) },
				},
			);
		// Only the page reaches it; a pane it does not know, a pane in another vault and a
		// directory the tab works nowhere in are refused, and nothing changes.
		expect((await activate("client-a", shop, fixture.vault, {})).status).toBe(403);
		const refusals = [
			await activate("client-nobody"),
			await activate("client-a", undefined, shopVault),
			await activate("client-a", join(fixture.root, "nowhere")),
		];
		expect(refusals.map(({ status, body }) => [status, body.code])).toEqual([
			[404, "PANE_UNKNOWN"],
			[409, "VAULT_MISMATCH"],
			[409, "CHECKOUT_NOT_SHOWABLE"],
		]);
		expect((await listOf(a)).shown).toBe(shop);

		// The person focuses A: every pane of the tab shows payments.
		expect((await activate("client-a")).body).toEqual({
			success: true,
			shown: payments,
			changed: true,
		});
		expect((await listOf(b)).shown).toBe(payments);

		// A picks the shop checkout, where B is: every pane of the tab shows it.
		expect((await activate("client-a", shop)).body).toEqual({
			success: true,
			shown: shop,
			changed: true,
		});
		expect((await listOf(b)).shown).toBe(shop);

		// New conversation and a message from A, a pane in payments, go to the shop workhorse.
		expect(await leased(a, "threadLinkCreate")).toMatchObject({
			ok: true,
			value: { outcome: "delivered" },
		});
		const linked = await listOf(a);
		expect(linked).toMatchObject({ shown: shop, entries: [[shop, true]] });
		expect(
			await leased(a, "start", { threadId: linked.threadId, prompt: "What is in the shop?" }),
		).toMatchObject({ ok: true, value: { outcome: "delivered" } });
		const workhorseStarts = records(fixture.logPath).filter(
			(entry) =>
				entry.kind === "frame" &&
				entry.method === "thread/start" &&
				entry.params?.["model"] !== coordinatorModelFixture.model,
		);
		expect(workhorseStarts.map((entry) => entry.params?.["cwd"])).toEqual([shop]);
		const workhorseThreads = records(fixture.logPath)
			.filter((entry) => entry.kind === "response" && entry.method === "thread/start")
			.map((entry) => entry.result as { thread: { id: string }; model: string })
			.filter(({ model }) => model !== coordinatorModelFixture.model)
			.map(({ thread }) => thread.id);
		const turnStarts = records(fixture.logPath).filter(
			(entry) => entry.kind === "frame" && entry.method === "turn/start",
		);
		expect(turnStarts.map((entry) => entry.params?.["threadId"])).toEqual(workhorseThreads);

		// An agent shows B a board of the payments checkout: the pane moves, the dock does not.
		const shown = runServerCli({
			repoRoot,
			server,
			vault: fixture.vault,
			args: ["browser", "show", "scratch", "--pane", "client-b"],
			input: undefined,
		});
		expect(shown.status, shown.stderr).toBe(0);
		expect((await listOf(b)).shown).toBe(shop);

		// The person focuses B, now in payments: the tab shows payments, and still lists shop's
		// live workhorse, which a pick shows again though no pane is in shop any more.
		expect((await activate("client-b")).body).toEqual({
			success: true,
			shown: payments,
			changed: true,
		});
		expect((await activate("client-a")).body).toMatchObject({ shown: payments, changed: false });
		expect((await listOf(a)).entries.toSorted()).toEqual(
			[
				[payments, false],
				[shop, true],
			].toSorted(),
		);
		expect((await activate("client-a", shop)).body).toMatchObject({ shown: shop, changed: true });
	} finally {
		await resources.disposeAsync();
	}
}, 45_000);

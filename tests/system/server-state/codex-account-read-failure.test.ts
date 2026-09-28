import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	openApplicationSocket,
	prepareProductionFixture,
	productionSnapshot as snapshots,
	productionPane as pane,
} from "./support/codex-production.ts";
import { createRequester } from "./support/http.ts";

const serverPath = join(import.meta.dir, "fixtures/codex-production-server.ts");
const executableSource = join(import.meta.dir, "fixtures/fake-codex-production.ts");

// Since Codex 0.158.0 reading a ChatGPT account asks the backend for its workspace routing, so
// Codex can answer account/read with an error. That answer once abandoned startup and stopped
// the server; it is now an account the pane is told to refresh.
test("an account Codex cannot read leaves the server running until a refresh reads it", async () => {
	const resources = new AsyncDisposableStack();
	try {
		const fixture = prepareProductionFixture(resources, executableSource);
		writeFileSync(fixture.controlPath, JSON.stringify({ accountReadFails: true }));
		const server = await startOwnedServer({
			serverPath,
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
		const socket = await openApplicationSocket(server.base, "account-client");
		resources.defer(() => socket.close());
		const registration = pane("account-client", "account-pane", true, true);
		expect(
			(await request("/api/panes", { method: "POST", doing: false, body: registration })).status,
		).toBe(200);
		const connected = snapshots(await socket.request("connect"));
		expect(connected["account"]).toMatchObject({ state: "failed" });
		expect(connected["readiness"]).toMatchObject({ state: "login_capable" });
		await server.assertRunning();

		writeFileSync(fixture.controlPath, JSON.stringify({}));
		expect(await socket.request("accountRead")).toMatchObject({ ok: true });
		expect(snapshots(await socket.request("snapshot"))["readiness"]).toMatchObject({
			state: "thread_capable",
		});
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);

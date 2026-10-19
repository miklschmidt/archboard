import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import { waitFor } from "./support/http.ts";
import { reversibleCheckoutEdit } from "./support/reversible-checkout-edit.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const executable = join(repoRoot, "bin/archboard");

interface Health {
	pid: number;
	source: {
		checkout: string;
		stale: boolean;
		evaluatedAt: string;
		newestFile: string;
		newestAt: string;
	};
}

describe.serial("source staleness", () => {
	test("reports a touched loaded source and the exact restart remedy", async () => {
		await using resources = new AsyncDisposableStack();
		const root = mkdtempSync(join(tmpdir(), "archboard-staleness-source-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const vault = vaultIn(join(root, "vault"));
		const state = join(root, "state");
		const server = await startOwnedServer({
			serverPath: join(repoRoot, "apps/server/src/server.ts"),
			vault,
			env: { XDG_STATE_HOME: state, LOG_FILE_PATH: join(root, "server.log") },
		});
		resources.defer(() => server.dispose());
		const health = async () => {
			const response = await fetch(`${server.base}/health`);
			await server.assertRunning();
			return (await response.json()) as Health;
		};
		const cli = () => {
			const result = spawnSync(executable, ["status"], {
				cwd: repoRoot,
				encoding: "utf8",
				env: {
					...process.env,
					ARCHBOARD_URL: server.base,
					ARCHBOARD_NO_AUTOSTART: "1",
					XDG_STATE_HOME: state,
					LOG_LEVEL: "error",
				},
			});
			return {
				status: result.status,
				stderr: result.stderr,
				json: JSON.parse(result.stdout) as { stale?: { changedFile?: string } },
			};
		};

		const first = await health();
		// The checkout whose source the server runs, which a command of another
		// checkout's source refuses (ADR 0049).
		expect(first.source.checkout).toBe(realpathSync.native(repoRoot));
		expect(first.source.stale).toBeFalse();
		expect(first.source.newestFile).toMatch(/^(packages|apps)\//);
		expect(Number.isNaN(Date.parse(first.source.evaluatedAt))).toBeFalse();
		expect(Number.isNaN(Date.parse(first.source.newestAt))).toBeFalse();
		const quiet = cli();
		expect(quiet.status).toBe(0);
		expect(quiet.json.stale).toBeUndefined();
		expect(quiet.stderr).not.toMatch(/older code/);

		// A file of a workspace package counts as source too.
		const changedFile = "packages/timing/src/shared/constants/timing.ts";
		const touched = join(repoRoot, changedFile);
		// So does a file of the server app, which the server loads as its entry.
		const appFile = "apps/server/src/server.ts";
		const appTouched = join(repoRoot, appFile);
		const edit = reversibleCheckoutEdit(repoRoot, [touched, appTouched]);
		resources.defer(() => edit.restore());
		edit.edit(touched, (source) => source);
		const stale = await waitFor(async () => {
			const current = await health();
			return current.source.stale ? current : undefined;
		}, "server to report touched source");
		if (!stale) {
			throw new Error("The server never returned its stale source state.");
		}
		expect(stale.source.newestFile).toBe(changedFile);
		expect(stale.pid).toBe(first.pid);
		const loud = cli();
		expect(loud.status).toBe(0);
		expect(loud.json.stale?.changedFile).toBe(changedFile);
		expect(loud.stderr).toMatch(/answering from the older code/);
		expect(loud.stderr).toMatch(/archboard restart/);

		edit.edit(appTouched, (source) => source);
		const appStale = await waitFor(async () => {
			const current = await health();
			return current.source.newestFile === appFile ? current : undefined;
		}, "server to report touched app source");
		expect(appStale?.source.stale).toBeTrue();
	}, 30_000);
});

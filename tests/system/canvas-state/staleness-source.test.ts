import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { waitFor } from "./support/http.ts";
import { reversibleCheckoutEdit } from "./support/reversible-checkout-edit.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const executable = join(repoRoot, "bin/canvas");

interface Health {
	pid: number;
	source: {
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
		const vault = join(root, "vault");
		const state = join(root, "state");
		const canvas = await startOwnedCanvas({
			serverPath: join(repoRoot, "src/server.ts"),
			vault,
			env: { XDG_STATE_HOME: state, LOG_FILE_PATH: join(root, "canvas.log") },
		});
		resources.defer(() => canvas.dispose());
		const health = async () => {
			const response = await fetch(`${canvas.base}/health`);
			await canvas.assertRunning();
			return (await response.json()) as Health;
		};
		const cli = () => {
			const result = spawnSync(executable, ["status"], {
				cwd: repoRoot,
				encoding: "utf8",
				env: {
					...process.env,
					EXPRESS_SERVER_URL: canvas.base,
					EXCALIDRAW_NO_AUTOSTART: "1",
					ARCHBOARD_VAULT: vault,
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
		expect(first.source.stale).toBeFalse();
		expect(first.source.newestFile).toStartWith("src/");
		expect(Number.isNaN(Date.parse(first.source.evaluatedAt))).toBeFalse();
		expect(Number.isNaN(Date.parse(first.source.newestAt))).toBeFalse();
		const quiet = cli();
		expect(quiet.status).toBe(0);
		expect(quiet.json.stale).toBeUndefined();
		expect(quiet.stderr).not.toMatch(/older code/);

		const touched = join(repoRoot, "src/runtime/engine/compare.ts");
		const edit = reversibleCheckoutEdit(repoRoot, [touched]);
		resources.defer(() => edit.restore());
		edit.edit(touched, (source) => source);
		const stale = await waitFor(async () => {
			const current = await health();
			return current.source.stale ? current : undefined;
		}, "canvas to report touched source");
		if (!stale) throw new Error("The canvas never returned its stale source state.");
		expect(stale.source.newestFile).toBe("src/runtime/engine/compare.ts");
		expect(stale.pid).toBe(first.pid);
		const loud = cli();
		expect(loud.status).toBe(0);
		expect(loud.json.stale?.changedFile).toBe("src/runtime/engine/compare.ts");
		expect(loud.stderr).toMatch(/answering from the older code/);
		expect(loud.stderr).toMatch(/archboard stop && archboard start/);
		expect(loud.stderr).not.toMatch(/bun run reload/);
		expect(loud.stderr).toMatch(/the panes on screen/);
		expect(loud.stderr).toMatch(/in the vault/);
	}, 30_000);
});

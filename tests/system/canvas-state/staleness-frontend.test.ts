import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { createRequester } from "./support/http.ts";
import { openPaneSession } from "./support/pane-session.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const indexFile = join(repoRoot, "dist/frontend/index.html");

interface Registration {
	registered: boolean;
	staleFrontend?: {
		stale: boolean;
		current: string;
		loaded: string;
		message: string;
	};
}

describe.serial("frontend staleness", () => {
	test("reports only an outdated built bundle", async () => {
		await using resources = new AsyncDisposableStack();
		const distExisted = existsSync(join(repoRoot, "dist"));
		const frontendExisted = existsSync(dirname(indexFile));
		const indexExisted = existsSync(indexFile);
		if (!indexExisted) {
			mkdirSync(dirname(indexFile), { recursive: true });
			writeFileSync(
				indexFile,
				'<!doctype html><script type="module" src="/assets/index-task13008.js"></script>\n',
			);
			resources.defer(() => {
				rmSync(indexFile, { force: true });
				if (!frontendExisted) rmSync(dirname(indexFile), { recursive: true, force: true });
				if (!distExisted) rmSync(join(repoRoot, "dist"), { recursive: true, force: true });
			});
		}
		const expectedBuild = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(
			readFileSync(indexFile, "utf8"),
		)?.[1];
		if (!expectedBuild) throw new Error("The owned frontend index names no module bundle.");
		expect(expectedBuild).toStartWith("/assets/");

		const root = mkdtempSync(join(tmpdir(), "archboard-staleness-frontend-"));
		resources.defer(() => rmSync(root, { recursive: true, force: true }));
		const canvas = await startOwnedCanvas({
			serverPath: join(repoRoot, "src/server.ts"),
			vault: join(root, "vault"),
			env: { XDG_STATE_HOME: join(root, "state"), LOG_FILE_PATH: join(root, "canvas.log") },
		});
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);
		const health = (await (await fetch(`${canvas.base}/health`)).json()) as {
			frontendBuild: string;
		};
		expect(health.frontendBuild).toBe(expectedBuild);

		const pane = await openPaneSession(canvas.base, request, {
			clientId: "stale-frontend-pane",
			primary: true,
			focused: true,
		});
		resources.defer(() => pane.close());
		const register = async (build?: string) =>
			(
				await request<Registration>("/api/panes", {
					method: "POST",
					doing: false,
					body: { ...pane.registration, board: "scratch", ...(build ? { build } : {}) },
				})
			).body;

		const old = await register("/assets/index-fromlastweek.js");
		expect(old.registered).toBeTrue();
		expect(old.staleFrontend).toMatchObject({
			stale: true,
			loaded: "/assets/index-fromlastweek.js",
			current: expectedBuild,
		});
		expect(old.staleFrontend?.message).toContain("index-fromlastweek.js");
		expect(old.staleFrontend?.message).toContain(expectedBuild!);
		expect(old.staleFrontend?.message).toMatch(/Reload the tab/);
		expect((await register(expectedBuild)).staleFrontend).toBeUndefined();
		expect((await register("/src/main.tsx")).staleFrontend).toBeUndefined();
		const unnamed = await register();
		expect(unnamed.registered).toBeTrue();
		expect(unnamed.staleFrontend).toBeUndefined();
	}, 20_000);
});

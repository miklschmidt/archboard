import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { WebSocket } from "ws";

import { createRequester, sleep, waitFor } from "./support/http.ts";
import { reversibleCheckoutEdit } from "./support/reversible-checkout-edit.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const executable = join(repoRoot, "bin/canvas");
const SETTLE_MS = 300;
const PROBE_ROUTE =
	"\napp.get('/__reload_probe', (_req: Request, res: Response) => { res.json({ probe: 'live' }); });\n";
const hotBox = (label: string, x: number) => ({
	type: "rectangle",
	x,
	y: 40,
	width: 160,
	height: 80,
	label: { text: label },
	customData: { archboard: { node: label.toLowerCase(), kind: "service", name: label } },
});

interface Health {
	pid: number;
	reloadable: boolean;
	websocket_clients: number;
	source: { stale: boolean; evaluatedAt: string; newestFile: string; newestAt: string };
}
interface PaneEvent {
	type: string;
	board?: string;
	created?: Array<{ id: string }>;
	complaints?: string[];
}
interface HotCanvas {
	base: string;
	vault: string;
	state: string;
	pid: number;
	output(): string;
	health(): Promise<Health>;
	assertRunning(cause?: unknown): Promise<void>;
	dispose(): Promise<void>;
}

async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((resolveListen, reject) => {
		server.once("error", reject);
		server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolveListen);
	});
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Port probe returned no TCP port.");
	await new Promise<void>((resolveClose, reject) =>
		server.close((error) => (error ? reject(error) : resolveClose())),
	);
	return address.port;
}

async function startHotCanvas(
	readiness: (canvas: HotCanvas) => Promise<void> = async (canvas) => {
		await waitFor(async () => {
			try {
				const current = await canvas.health();
				return current.pid === canvas.pid ? current : undefined;
			} catch {
				await canvas.assertRunning();
				return undefined;
			}
		}, "owned hot canvas to answer health");
	},
): Promise<HotCanvas> {
	const root = mkdtempSync(join(tmpdir(), "archboard-hot-reload-"));
	const vault = join(root, "vault");
	const state = join(root, "state");
	const port = await freePort();
	const base = `http://127.0.0.1:${port}`;
	const child = spawn(process.execPath, ["--hot", join(repoRoot, "src/dev-canvas.ts")], {
		cwd: repoRoot,
		detached: true,
		env: {
			...process.env,
			PORT: String(port),
			HOST: "127.0.0.1",
			ARCHBOARD_VAULT: vault,
			XDG_STATE_HOME: state,
			ARCHBOARD_SETTLE_MS: String(SETTLE_MS),
			LOG_LEVEL: "info",
			LOG_FILE_PATH: join(root, "canvas.log"),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	if (!child.pid) throw new Error("Hot canvas has no pid.");
	let output = "";
	child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
	child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
	let exited = false;
	const exit = new Promise<void>((resolveExit) =>
		child.once("exit", () => {
			exited = true;
			resolveExit();
		}),
	);
	let disposal: Promise<void> | undefined;
	const health = async () => {
		const response = await fetch(`${base}/health`);
		return (await response.json()) as Health;
	};
	const canvas: HotCanvas = {
		base,
		vault,
		state,
		pid: child.pid,
		output: () => output,
		health,
		async assertRunning(cause?: unknown) {
			if (exited || child.exitCode !== null || child.signalCode !== null) {
				throw new Error(`Hot canvas ${child.pid} exited.\n${output.slice(-2000)}`, { cause });
			}
		},
		dispose() {
			disposal ??= (async () => {
				if (!exited) {
					try {
						process.kill(-child.pid!, "SIGTERM");
					} catch {
						child.kill("SIGTERM");
					}
					if (!(await Promise.race([exit.then(() => true), sleep(3_000).then(() => false)]))) {
						try {
							process.kill(-child.pid!, "SIGKILL");
						} catch {
							child.kill("SIGKILL");
						}
						await Promise.race([exit, sleep(3_000)]);
					}
				}
				if (!exited) throw new Error(`Hot canvas ${child.pid} did not exit.`);
				rmSync(root, { recursive: true, force: true });
			})();
			return disposal;
		},
	};
	try {
		await readiness(canvas);
	} catch (cause) {
		try {
			await canvas.dispose();
		} catch (disposalFailure) {
			throw new AggregateError(
				[cause, disposalFailure],
				"Hot canvas readiness failed and disposal also failed.",
				{ cause: disposalFailure },
			);
		}
		throw cause;
	}
	return canvas;
}

describe.serial("hot reload", () => {
	test("cleans a canvas whose readiness check fails", async () => {
		const readinessFailure = new Error("forced hot readiness failure");
		let started: HotCanvas | undefined;
		let rejected: unknown;
		try {
			const unexpected = await startHotCanvas(async (canvas: HotCanvas) => {
				started = canvas;
				throw readinessFailure;
			});
			await unexpected.dispose();
		} catch (error) {
			rejected = error;
		}
		expect(rejected).toBe(readinessFailure);
		expect(started).toBeDefined();
		expect(existsSync(resolve(started!.vault, ".."))).toBeFalse();
		expect(() => process.kill(started!.pid, 0)).toThrow();
	});

	test("restores later snapshots and reports checkout state after an earlier failure", () => {
		const root = mkdtempSync(join(tmpdir(), "archboard-hot-restore-failure-"));
		try {
			const paths = ["first.ts", "second.ts", "third.ts"].map((name) => join(root, name));
			for (const [index, path] of paths.entries()) writeFileSync(path, `before-${index}\n`);
			for (const args of [
				["init", "-q"],
				["add", "."],
			]) {
				const git = spawnSync("git", args, { cwd: root, encoding: "utf8" });
				expect(git.status, git.stderr).toBe(0);
			}
			const snapshots = paths.map((path) => ({
				path,
				bytes: readFileSync(path),
				mtimeNs: statSync(path, { bigint: true }).mtimeNs,
			}));
			const edit = reversibleCheckoutEdit(root, paths);
			for (const path of paths) edit.edit(path, (source) => `${source}changed\n`);
			rmSync(paths[0]!);
			mkdirSync(paths[0]!);
			writeFileSync(join(paths[0]!, "blocking-entry"), "blocks restoration\n");

			let failure: unknown;
			try {
				edit.restore();
			} catch (error) {
				failure = error;
			}
			expect(failure).toBeInstanceOf(AggregateError);
			expect((failure as Error).message).toContain("checkout restoration failed");
			expect((failure as AggregateError).errors.join("\n")).toContain("Checkout status changed");
			for (const snapshot of snapshots.slice(1)) {
				expect(readFileSync(snapshot.path)).toEqual(snapshot.bytes);
				expect(statSync(snapshot.path, { bigint: true }).mtimeNs).toBe(snapshot.mtimeNs);
			}
			rmSync(paths[0]!, { recursive: true });
			writeFileSync(paths[0]!, "retry target\n");
			edit.restore();
			for (const snapshot of snapshots) {
				expect(readFileSync(snapshot.path)).toEqual(snapshot.bytes);
				expect(statSync(snapshot.path, { bigint: true }).mtimeNs).toBe(snapshot.mtimeNs);
			}
			edit.restore();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test("reloads only on request and preserves every live public state boundary", async () => {
		await using resources = new AsyncDisposableStack();
		const canvas = await startHotCanvas();
		resources.defer(() => canvas.dispose());
		const request = createRequester(canvas);
		const sourcePaths = [
			join(repoRoot, "src/server.ts"),
			join(repoRoot, "src/runtime/engine/board-store.ts"),
			join(repoRoot, "src/server/canvas/lib/application.ts"),
		];
		const sourceSnapshots = sourcePaths.map((path) => ({
			path,
			hash: createHash("sha256").update(readFileSync(path)).digest("hex"),
			mtimeNs: statSync(path, { bigint: true }).mtimeNs,
		}));
		const edit = reversibleCheckoutEdit(repoRoot, sourcePaths);
		resources.defer(() => {
			let restorationError: unknown;
			try {
				edit.restore();
			} catch (error) {
				restorationError = error;
			}
			for (const snapshot of sourceSnapshots) {
				const hash = createHash("sha256").update(readFileSync(snapshot.path)).digest("hex");
				if (hash !== snapshot.hash)
					throw new Error(`Independent byte audit failed for ${snapshot.path}.`);
				if (statSync(snapshot.path, { bigint: true }).mtimeNs !== snapshot.mtimeNs) {
					throw new Error(`Independent mtimeNs audit failed for ${snapshot.path}.`);
				}
			}
			if (restorationError) throw restorationError;
		});
		const first = await canvas.health();
		expect(first.reloadable).toBeTrue();

		const socket = new WebSocket(`${canvas.base.replace("http", "ws")}/?clientId=hot-pane`);
		const events: PaneEvent[] = [];
		let closeCode: number | undefined;
		socket.on("message", (data) => events.push(JSON.parse(data.toString()) as PaneEvent));
		socket.on("close", (code) => (closeCode = code));
		await new Promise<void>((resolveOpen, reject) => {
			socket.once("open", resolveOpen);
			socket.once("error", reject);
		});
		resources.defer(
			() =>
				new Promise<void>((resolveClose) => {
					if (socket.readyState === WebSocket.CLOSED) return resolveClose();
					socket.once("close", () => resolveClose());
					socket.close();
				}),
		);
		const board = await waitFor(
			() => events.find(({ type }) => type === "initial_elements")?.board,
			"hot pane initial board",
		);
		expect(board).toBe("scratch");
		await request("/api/panes", {
			method: "POST",
			doing: false,
			body: {
				clientId: "hot-pane",
				paneId: "hot-pane",
				primary: true,
				focused: true,
				elementCount: 0,
				board,
				rect: { x: 0, y: 0, width: 1280, height: 800 },
				viewport: { x: 0, y: 0, width: 1280, height: 800, zoom: 1 },
			},
		});
		await request(`/api/elements?board=${board}`, { method: "POST", body: hotBox("Auth", 0) });
		await request(`/api/elements?board=${board}`, { method: "POST", body: hotBox("Orders", 400) });
		const panesBefore = (
			await request<{ panes: Array<{ paneId: string; board: string }> }>("/api/panes")
		).body;
		const elementsBefore = (
			await request<{ count: number; elements: Array<{ id: string }> }>(
				`/api/elements?board=${board}`,
			)
		).body;
		expect(elementsBefore.count).toBe(4);
		expect(panesBefore.panes).toMatchObject([{ paneId: "hot-pane", board: "scratch" }]);
		await sleep(SETTLE_MS + 400);
		const feedBefore = (
			await request<{ feedId: string; cursor: number; events: unknown[] }>(
				`/api/changes?board=${board}`,
			)
		).body;
		expect(feedBefore.cursor).toBeGreaterThanOrEqual(1);
		const socketsBefore = (await canvas.health()).websocket_clients;
		expect(socketsBefore).toBe(1);

		const quietFrom = canvas.output().length;
		edit.edit(sourcePaths[0]!, (source) => `${source}\n// hot test: an ordinary save is silent.\n`);
		await sleep(900);
		edit.edit(
			sourcePaths[1]!,
			(source) => `${source}\n// hot test: another ordinary save is silent.\n`,
		);
		await sleep(1_400);
		expect(canvas.output().slice(quietFrom)).not.toContain("re-evaluated in place");
		expect((await request<{ count: number }>(`/api/elements?board=${board}`)).body.count).toBe(4);
		expect((await request("/__reload_probe")).status).toBe(404);
		expect((await canvas.health()).source.stale).toBeTrue();
		const status = spawnSync(executable, ["status"], {
			cwd: repoRoot,
			encoding: "utf8",
			env: {
				...process.env,
				EXPRESS_SERVER_URL: canvas.base,
				EXCALIDRAW_NO_AUTOSTART: "1",
				ARCHBOARD_VAULT: canvas.vault,
				XDG_STATE_HOME: canvas.state,
				LOG_LEVEL: "error",
			},
		});
		expect(status.stderr).toMatch(/bun run reload/);
		expect(status.stderr).not.toMatch(/archboard stop/);

		const reload = async () => {
			const from = canvas.output().length;
			const asked = await request("/api/reload", { method: "POST" });
			expect(asked.status).toBe(200);
			await waitFor(
				() => canvas.output().slice(from).includes("re-evaluated in place"),
				"dev canvas re-evaluation",
			);
			await sleep(500);
			return canvas.output().slice(from);
		};
		edit.edit(sourcePaths[2]!, (source) => source + PROBE_ROUTE);
		await sleep(600);
		const reloadLog = await reload();
		const after = await canvas.health();
		expect(after.pid).toBe(first.pid);
		expect((await request<{ probe?: string }>("/__reload_probe")).body.probe).toBe("live");
		expect(after.source.stale).toBeFalse();
		expect(reloadLog).toContain("cost nothing");
		expect(reloadLog).not.toContain("THE RELOAD BROKE");
		expect(closeCode).toBeUndefined();
		expect(after.websocket_clients).toBe(socketsBefore);
		const elementsAfter = (
			await request<{ count: number; elements: Array<{ id: string }> }>(
				`/api/elements?board=${board}`,
			)
		).body;
		expect(elementsAfter.count).toBe(4);
		expect(elementsAfter.elements.map(({ id }) => id).toSorted()).toEqual(
			elementsBefore.elements.map(({ id }) => id).toSorted(),
		);
		expect((await request<{ panes: unknown[] }>("/api/panes")).body.panes).toEqual(
			panesBefore.panes,
		);
		const feedAfter = (
			await request<{ feedId: string; cursor: number; events: unknown[] }>(
				`/api/changes?board=${board}&since=${feedBefore.cursor}`,
			)
		).body;
		expect(feedAfter.feedId).toBe(feedBefore.feedId);
		expect(feedAfter.cursor).toBe(feedBefore.cursor);
		expect(feedAfter.events).toEqual([]);
		const beforeBroadcast = events.length;
		await request(`/api/elements?board=${board}`, { method: "POST", body: hotBox("Ledger", 800) });
		await sleep(400);
		const writes = events.slice(beforeBroadcast).filter(({ type }) => type === "elements_changed");
		expect(writes).toHaveLength(1);
		const createdElements = writes.flatMap(({ created }) => created ?? []);
		expect(createdElements.length).toBeGreaterThanOrEqual(2);
		expect(new Set(createdElements.map(({ id }) => id)).size).toBe(createdElements.length);
		await sleep(SETTLE_MS + 400);
		expect(
			(
				await request<{ events: unknown[] }>(
					`/api/changes?board=${board}&since=${feedBefore.cursor}`,
				)
			).body.events,
		).toHaveLength(1);

		const brokenFrom = events.length;
		edit.edit(sourcePaths[1]!, (source) => {
			const guarded =
				/if\s*\(\s*!boards\.has\s*\(\s*SCRATCH_KEY\s*\)\s*\)\s*\{\s*(boards\.set\s*\(\s*SCRATCH_KEY\s*,\s*newBoardState\s*\(\s*makeIdentity\s*\(\s*\{\s*board\s*:\s*SCRATCH_BOARD\s*\}\s*\)\s*\)\s*\)\s*;)\s*\}/g;
			const matches = [...source.matchAll(guarded)];
			if (matches.length !== 1)
				throw new Error(`Expected one scratch guard, found ${matches.length}.`);
			const [whole, body] = matches[0]!;
			return (
				source.slice(0, matches[0]!.index) + body + source.slice(matches[0]!.index! + whole.length)
			);
		});
		await sleep(600);
		const brokenLog = await reload();
		expect(brokenLog).toContain("THE RELOAD BROKE SOMETHING");
		expect(brokenLog).toMatch(
			/board "scratch" had its note at .*scratch\.excalidraw\.md and now has it at nowhere/,
		);
		const broken = events.slice(brokenFrom).find(({ type }) => type === "reload_broken");
		expect(broken).toBeDefined();
		expect(broken?.complaints?.join("\n")).toMatch(/board "scratch".*now has it at nowhere/);
		edit.restore();

		const plainRoot = mkdtempSync(join(tmpdir(), "archboard-plain-reload-"));
		resources.defer(() => rmSync(plainRoot, { recursive: true, force: true }));
		const plainPort = await freePort();
		const plainBase = `http://127.0.0.1:${plainPort}`;
		const plainEnv = {
			...process.env,
			EXPRESS_SERVER_URL: plainBase,
			ARCHBOARD_VAULT: join(plainRoot, "vault"),
			XDG_STATE_HOME: join(plainRoot, "state"),
			LOG_LEVEL: "error",
			LOG_FILE_PATH: join(plainRoot, "canvas.log"),
		};
		const started = spawnSync(executable, ["start"], {
			cwd: repoRoot,
			encoding: "utf8",
			env: plainEnv,
		});
		expect(started.status, started.stderr).toBe(0);
		const plainPid = (JSON.parse(started.stdout) as { pid: number }).pid;
		try {
			const argv = spawnSync("ps", ["-o", "args=", "-p", String(plainPid)], {
				encoding: "utf8",
			}).stdout.trim();
			expect(argv).toMatch(/src\/server\.ts/);
			expect(argv).not.toMatch(/--hot|--watch/);
			const plainHealth = (await (await fetch(`${plainBase}/health`)).json()) as Health;
			expect(plainHealth.reloadable).toBeFalse();
			const refused = await fetch(`${plainBase}/api/reload`, { method: "POST" });
			expect(refused.status).toBe(409);
			expect(((await refused.json()) as { error: string }).error).toMatch(/dev:canvas/);
		} finally {
			spawnSync(executable, ["stop"], { cwd: repoRoot, encoding: "utf8", env: plainEnv });
		}
	}, 60_000);
});

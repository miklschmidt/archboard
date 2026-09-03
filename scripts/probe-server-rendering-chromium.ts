import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const fixtureRoot = resolve(root, "docs/design/server-rendering-boundary-fixtures");
const chromium = "/run/current-system/sw/bin/chromium";
const setsid = "/run/current-system/sw/bin/setsid";
const chromeTimeoutMs = 20_000;
const cleanupTimeoutMs = 5_000;

function outputDirectory(argv: readonly string[]): string {
	const index = argv.indexOf("--out");
	if (index === -1 || !argv[index + 1])
		throw new Error(
			"Usage: bun scripts/probe-server-rendering-chromium.ts --out <empty-directory>",
		);
	const directory = resolve(argv[index + 1]!);
	if (!existsSync(directory)) throw new Error(`Output directory does not exist: ${directory}`);
	if (readdirSync(directory).length > 0)
		throw new Error(`Output directory is not empty: ${directory}`);
	return directory;
}

function pipe(stream: ReadableStream<Uint8Array> | number | undefined): ReadableStream<Uint8Array> {
	if (!stream || typeof stream === "number")
		throw new Error("Child did not expose the requested output pipe.");
	return stream;
}

async function waitForVite(url: string, process: Bun.Subprocess): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		if (process.exitCode !== null) {
			const stderr = await new Response(pipe(process.stderr)).text();
			throw new Error(`Vite exited (${process.exitCode}): ${stderr}`);
		}
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// Vite has not bound its loopback port yet.
		}
		await Bun.sleep(50);
	}
	await stop(process);
	const [stdout, stderr] = await Promise.all([
		new Response(pipe(process.stdout)).text(),
		new Response(pipe(process.stderr)).text(),
	]);
	throw new Error(
		`Vite did not serve the renderer fixture within 10 seconds. ${stdout}\n${stderr}`,
	);
}

async function stop(child: Bun.Subprocess, ownsProcessGroup = false): Promise<void> {
	if (child.exitCode !== null) return;
	try {
		if (ownsProcessGroup) globalThis.process.kill(-child.pid, "SIGTERM");
		else child.kill();
	} catch {
		return;
	}
	await Promise.race([child.exited, Bun.sleep(cleanupTimeoutMs)]);
	if (child.exitCode === null) throw new Error(`Child ${child.pid} survived cleanup.`);
}

function ownedProcessIds(pid: number): number[] {
	const seen = new Set<number>();
	const visit = (candidate: number) => {
		if (seen.has(candidate) || !existsSync(`/proc/${candidate}`)) return;
		seen.add(candidate);
		const childrenPath = `/proc/${candidate}/task/${candidate}/children`;
		try {
			for (const child of readFileSync(childrenPath, "utf8").trim().split(/\s+/)) {
				const parsed = Number(child);
				if (Number.isInteger(parsed) && parsed > 0) visit(parsed);
			}
		} catch {
			// A child that exits while sampled contributes no retained resource.
		}
	};
	visit(pid);
	return [...seen].toSorted((left, right) => left - right);
}

function residentBytes(pids: readonly number[]): number {
	return pids.reduce((total, pid) => {
		try {
			const rss = readFileSync(`/proc/${pid}/status`, "utf8").match(/^VmRSS:\s+(\d+)\s+kB$/m);
			return total + (rss ? Number(rss[1]) * 1024 : 0);
		} catch {
			return total;
		}
	}, 0);
}

function reserveLoopbackPort(): number {
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response("reserved"),
	});
	const { port } = server;
	server.stop(true);
	if (typeof port !== "number") throw new Error("Could not reserve a loopback port.");
	return port;
}

async function waitForChromium(url: string, process: Bun.Subprocess): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		if (process.exitCode !== null) {
			const stderr = await new Response(pipe(process.stderr)).text();
			throw new Error(`Chromium exited (${process.exitCode}): ${stderr}`);
		}
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// Chromium has not bound its private DevTools loopback port yet.
		}
		await Bun.sleep(50);
	}
	throw new Error("Chromium did not bind its private DevTools loopback port within 5 seconds.");
}

async function evaluate(webSocketUrl: string, expression: string): Promise<unknown> {
	const socket = new WebSocket(webSocketUrl);
	return await new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			socket.close();
			reject(new Error("Chromium DevTools evaluation timed out."));
		}, 5_000);
		socket.addEventListener("open", () => {
			socket.send(
				JSON.stringify({
					id: 1,
					method: "Runtime.evaluate",
					params: { expression, returnByValue: true },
				}),
			);
		});
		socket.addEventListener("message", (event) => {
			const message = JSON.parse(String(event.data)) as {
				id?: number;
				result?: { result?: { value?: unknown } };
				error?: { message?: string };
			};
			if (message.id !== 1) return;
			clearTimeout(timeout);
			socket.close();
			if (message.error) reject(new Error(message.error.message));
			else resolve(message.result?.result?.value);
		});
		socket.addEventListener("error", () => {
			clearTimeout(timeout);
			reject(new Error("Chromium DevTools connection failed."));
		});
	});
}

interface ChromiumRun {
	result: string;
	durationMs: { startup: number; render: number };
	startup: { pids: number[]; residentBytes: number };
	steady: { pids: number[]; residentBytes: number };
	cleanup: { pids: number[]; clean: boolean };
}

async function runChromium(url: string, profile: string): Promise<ChromiumRun> {
	const port = reserveLoopbackPort();
	const startedAt = performance.now();
	const child = Bun.spawn({
		cmd: [
			setsid,
			chromium,
			"--headless=new",
			"--disable-gpu",
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-crash-reporter",
			`--user-data-dir=${profile}`,
			`--remote-debugging-port=${port}`,
			"about:blank",
		],
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
	let run: ChromiumRun | null = null;
	try {
		const devToolsBase = `http://127.0.0.1:${port}`;
		await waitForChromium(`${devToolsBase}/json/version`, child);
		const startupPids = ownedProcessIds(child.pid);
		const startup = { pids: startupPids, residentBytes: residentBytes(startupPids) };
		const startupMs = performance.now() - startedAt;
		const target = (await (
			await fetch(`${devToolsBase}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })
		).json()) as { webSocketDebuggerUrl?: unknown };
		if (typeof target.webSocketDebuggerUrl !== "string")
			throw new Error("Chromium did not create a private renderer target.");
		const renderStartedAt = performance.now();
		const deadline = Date.now() + chromeTimeoutMs;
		while (Date.now() < deadline) {
			const state = await evaluate(target.webSocketDebuggerUrl, "document.body?.dataset.state");
			if (state === "done" || state === "failed") {
				const body = await evaluate(target.webSocketDebuggerUrl, "document.body.textContent");
				if (typeof body !== "string") throw new Error("Chromium renderer returned no text result.");
				const steadyPids = ownedProcessIds(child.pid);
				run = {
					result: body,
					durationMs: { startup: startupMs, render: performance.now() - renderStartedAt },
					startup,
					steady: { pids: steadyPids, residentBytes: residentBytes(steadyPids) },
					cleanup: { pids: [], clean: false },
				};
				break;
			}
			await Bun.sleep(50);
		}
		if (!run) throw new Error(`Chromium did not finish within ${chromeTimeoutMs} ms.`);
	} finally {
		const pids = ownedProcessIds(child.pid);
		await stop(child, true);
		const deadline = Date.now() + cleanupTimeoutMs;
		let survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
		while (survivors.length > 0 && Date.now() < deadline) {
			await Bun.sleep(50);
			survivors = pids.filter((pid) => existsSync(`/proc/${pid}`));
		}
		if (survivors.length > 0)
			throw new Error(`Chromium left owned processes behind: ${survivors.join(", ")}`);
		if (run) run.cleanup = { pids, clean: true };
	}
	if (!run) throw new Error("Chromium produced no renderer result.");
	return run;
}

function resultFrom(json: string): Record<string, unknown> {
	let result: Record<string, unknown>;
	try {
		result = JSON.parse(json) as Record<string, unknown>;
	} catch {
		throw new Error(`Chromium returned a non-JSON probe body: ${json.slice(0, 500)}`);
	}
	if ("error" in result) throw new Error(`Browser probe failed: ${JSON.stringify(result.error)}`);
	const isSha256 = (value: unknown) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
	const png = result.png as { bytes?: unknown; hash?: unknown; isPng?: unknown };
	if (typeof png?.bytes !== "number" || png.bytes < 1 || !isSha256(png.hash) || !png.isPng)
		throw new Error("Browser PNG export was incomplete or invalid.");
	const svg = result.svg as {
		bytes?: unknown;
		hash?: unknown;
		hasBoundLabel?: unknown;
		hasEmbeddedImage?: unknown;
	};
	if (
		typeof svg?.bytes !== "number" ||
		svg.bytes < 1 ||
		!isSha256(svg.hash) ||
		!svg.hasBoundLabel ||
		!svg.hasEmbeddedImage
	)
		throw new Error("Browser SVG export lost a required fixture feature.");
	const mermaid = result.mermaid as { elementCount?: unknown };
	if (typeof mermaid?.elementCount !== "number" || mermaid.elementCount < 1)
		throw new Error("Browser Mermaid conversion returned no elements.");
	if (result.invalidMermaid !== "Error")
		throw new Error("Browser Mermaid conversion did not reject malformed input.");
	return result;
}

const output = outputDirectory(Bun.argv.slice(2));
const profile = mkdtempSync(join(tmpdir(), "archboard-server-rendering-chromium-"));
const vitePort = reserveLoopbackPort();
const vite = Bun.spawn({
	cmd: ["bunx", "vite", ".", "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"],
	cwd: fixtureRoot,
	stdout: "pipe",
	stderr: "pipe",
});
try {
	const base = `http://127.0.0.1:${vitePort}`;
	const url = `${base}/chromium.html`;
	await waitForVite(url, vite);
	const firstRun = await runChromium(url, profile);
	const secondRun = await runChromium(url, profile);
	const first = resultFrom(firstRun.result);
	const second = resultFrom(secondRun.result);
	await Bun.write(
		join(output, "report.json"),
		JSON.stringify(
			{
				backend: "isolated server-owned headless Chromium",
				deterministic: JSON.stringify(first) === JSON.stringify(second),
				first,
				second,
				memory: {
					first: {
						durationMs: firstRun.durationMs,
						startup: firstRun.startup,
						steady: firstRun.steady,
						cleanup: firstRun.cleanup,
					},
					second: {
						durationMs: secondRun.durationMs,
						startup: secondRun.startup,
						steady: secondRun.steady,
						cleanup: secondRun.cleanup,
					},
				},
				browserClient: "none",
			},
			null,
			2,
		) + "\n",
	);
} finally {
	try {
		await stop(vite);
	} finally {
		rmSync(profile, { recursive: true, force: true });
	}
}

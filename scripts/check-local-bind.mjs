#!/usr/bin/env bun

import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const moduleFile = fileURLToPath(import.meta.url);
const moduleDir = dirname(moduleFile);
const repoRoot = join(moduleDir, "..");
const excalidrawCssPath = join(
	repoRoot,
	"node_modules",
	"@excalidraw",
	"excalidraw",
	"dist",
	"prod",
	"index.css",
);
// The bun running this file, which is also what `canvas start` spawns (ADR 0014).
const runtime = process.execPath;
const runtimeName = basename(runtime).toLowerCase();
let runtimeArgs;
const port = Number(process.env.PORT || 32000 + Math.floor(Math.random() * 2000));
const startupTimeoutMs = 5000;
const duplicateExitTimeoutMs = 2500;
// A compiled server left in dist/ by a checkout from before ADR 0014, and its
// control in the bundle the canvas is meant to serve (TASK-058).
const staleProbe = "check-local-bind-stale-server.js";
const frontendProbe = "check-local-bind-frontend.js";
const hiddenFrontendProbe = ".check-local-bind-hidden.js";

// A vault of its own, never the one on this machine: a canvas writes into the
// vault it is given, and these ones are started to be killed.
const vault = mkdtempSync(join(tmpdir(), "archboard-bind-"));

function spawnCanvas(host, options = {}) {
	const env = {
		...process.env,
		PORT: String(port),
		ARCHBOARD_VAULT: vault,
		LOG_LEVEL: "error",
	};
	if (options.noVault) delete env.ARCHBOARD_VAULT;
	if (host) {
		env.HOST = host;
	} else {
		delete env.HOST;
	}

	return spawn(runtime, runtimeArgs, {
		cwd: repoRoot,
		env,
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function collectOutput(child) {
	let output = "";
	child.stdout.on("data", (chunk) => {
		output += chunk.toString();
	});
	child.stderr.on("data", (chunk) => {
		output += chunk.toString();
	});
	return () => output.trim();
}

async function endpointResponds(url, timeoutMs = 500) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, { signal: controller.signal });
		return response.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchStatus(url, timeoutMs = 1000) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, { signal: controller.signal });
		return response.status;
	} finally {
		clearTimeout(timeout);
	}
}

async function assertExcalidrawStylesheet() {
	const response = await fetch(`http://127.0.0.1:${port}/assets/excalidraw.css`);
	const actual = Buffer.from(await response.arrayBuffer());
	const expected = fs.readFileSync(excalidrawCssPath);
	const contentType = response.headers.get("content-type") ?? "";
	const isCss = /^text\/css(?:;|$)/i.test(contentType);

	if (response.status !== 200 || !isCss || !actual.equals(expected)) {
		throw new Error(
			"Excalidraw stylesheet did not survive a dot-prefixed checkout path: " +
				`wanted status 200, text/css, and ${expected.length} installed bytes; got ` +
				`${response.status}, ${contentType || "no content type"}, and ${actual.length} bytes.`,
		);
	}
}

// Plant one file in dist/ and two in dist/frontend/, so the next three requests
// tell apart "the canvas serves the frontend bundle" from "the canvas serves
// whatever is in dist", and prove the frontend mount still denies dotfiles.
// Returns what to delete afterwards, deepest first, which includes any directory
// this had to make.
function plantStaticProbes() {
	const planted = [];
	const makeDir = (dir) => {
		if (fs.existsSync(dir)) return;
		makeDir(dirname(dir));
		fs.mkdirSync(dir);
		planted.unshift(dir);
	};
	const write = (dir, name) => {
		makeDir(dir);
		const file = join(dir, name);
		if (fs.existsSync(file)) throw new Error(`Static probe would overwrite ${file}.`);
		fs.writeFileSync(file, "// planted by check-local-bind.mjs\n");
		planted.unshift(file);
		return file;
	};

	const dist = join(repoRoot, "dist");
	write(dist, staleProbe);
	write(join(dist, "frontend"), frontendProbe);
	write(join(dist, "frontend"), hiddenFrontendProbe);

	return () => {
		for (const entry of planted) {
			if (fs.statSync(entry).isDirectory()) fs.rmdirSync(entry);
			else fs.unlinkSync(entry);
		}
	};
}

async function waitForHealth(url, timeoutMs, child, getOutput) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (child && (child.exitCode !== null || child.signalCode !== null)) {
			const status =
				child.exitCode !== null ? `exit code ${child.exitCode}` : `signal ${child.signalCode}`;
			const output = getOutput ? getOutput() : "";
			throw new Error(
				`Canvas server exited before health check with ${status}.${output ? `\n${output}` : ""}`,
			);
		}
		if (await endpointResponds(url)) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Timed out waiting for ${url}`);
}

function waitForExit(child, timeoutMs) {
	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			cleanup();
			resolve(null);
		}, timeoutMs);

		const onExit = (code, signal) => {
			cleanup();
			resolve({ code, signal });
		};

		const cleanup = () => {
			clearTimeout(timeout);
			child.off("exit", onExit);
		};

		child.once("exit", onExit);
	});
}

async function killChild(child) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	child.kill("SIGTERM");
	const exit = await waitForExit(child, 1000);
	if (!exit) {
		child.kill("SIGKILL");
	}
}

let checkoutAliasRoot;
let first;
let second;
let bindAll;
let removeStaticProbes;
let noVault;

try {
	checkoutAliasRoot = mkdtempSync(join(tmpdir(), "archboard-bind-checkout-"));
	const hiddenCheckoutParent = join(checkoutAliasRoot, ".checkout");
	const hiddenRepoRoot = join(hiddenCheckoutParent, "archboard");
	fs.mkdirSync(hiddenCheckoutParent);
	fs.symlinkSync(repoRoot, hiddenRepoRoot, "dir");
	const serverPath = join(hiddenRepoRoot, "src", "server.ts");
	runtimeArgs = ["--preserve-symlinks", "--preserve-symlinks-main", serverPath];

	first = spawnCanvas();
	const firstOutput = collectOutput(first);

	await waitForHealth(`http://127.0.0.1:${port}/health`, startupTimeoutMs, first, firstOutput);
	await assertExcalidrawStylesheet();

	if (await endpointResponds(`http://[::1]:${port}/health`)) {
		throw new Error("Default canvas server should not listen on IPv6 loopback.");
	}

	removeStaticProbes = plantStaticProbes();

	const frontendStatus = await fetchStatus(`http://127.0.0.1:${port}/${frontendProbe}`);
	if (frontendStatus !== 200) {
		throw new Error(
			`A file in dist/frontend answered ${frontendStatus}, not 200. ` +
				"The canvas is not serving the frontend bundle, so the next assertion would pass for the wrong reason.",
		);
	}

	const staleStatus = await fetchStatus(`http://127.0.0.1:${port}/${staleProbe}`);
	if (staleStatus !== 404) {
		throw new Error(
			`A file in dist/ but outside dist/frontend answered ${staleStatus}, not 404. ` +
				"The canvas is serving the whole of dist, so a compiled server left there by an older " +
				"checkout is reachable over http (TASK-058).",
		);
	}

	const hiddenStatus = await fetchStatus(`http://127.0.0.1:${port}/${hiddenFrontendProbe}`);
	if (hiddenStatus !== 404) {
		throw new Error(
			`A dotfile in dist/frontend answered ${hiddenStatus}, not 404. ` +
				"The canvas is exposing hidden files from the frontend bundle.",
		);
	}

	second = spawnCanvas();
	const secondOutput = collectOutput(second);
	const duplicateExit = await waitForExit(second, duplicateExitTimeoutMs);

	if (!duplicateExit) {
		throw new Error("Second canvas server stayed running on the same local port.");
	}
	if (duplicateExit.code === 0) {
		throw new Error("Second canvas server exited successfully instead of failing.");
	}

	bindAll = spawnCanvas("::");
	const bindAllOutput = collectOutput(bindAll);
	const bindAllExit = await waitForExit(bindAll, duplicateExitTimeoutMs);

	if (!bindAllExit) {
		throw new Error(
			"Canvas server with HOST=:: stayed running while a loopback server was active.",
		);
	}
	if (bindAllExit.code === 0) {
		throw new Error("Canvas server with HOST=:: exited successfully instead of failing.");
	}

	// No vault, no canvas (ADR 0015). Every board is a note, so there is nowhere
	// to put one, and this refusal is what a first run meets instead of a canvas
	// whose drawing turns out to have been nowhere. It is checked here because
	// this is the file about what happens when a canvas starts.
	noVault = spawnCanvas(undefined, { noVault: true });
	const noVaultOutput = collectOutput(noVault);
	const noVaultExit = await waitForExit(noVault, duplicateExitTimeoutMs);

	if (!noVaultExit) {
		throw new Error("Canvas server with no ARCHBOARD_VAULT stayed running.");
	}
	if (noVaultExit.code === 0) {
		throw new Error(
			"Canvas server with no ARCHBOARD_VAULT exited successfully instead of refusing.",
		);
	}
	const refusal = noVaultOutput();
	// The message is the product here: a refusal that only says no is a worse
	// first run than the canvas it replaces, so it has to name the step that
	// chooses a vault and the variable that carries it.
	for (const wanted of ["no vault", "install-skill", "ARCHBOARD_VAULT"]) {
		if (!refusal.includes(wanted)) {
			throw new Error(
				`Canvas server refused with no vault but never said "${wanted}":\n${refusal}`,
			);
		}
	}

	// And the CLI says it too, before it spawns anything. A canvas is started
	// detached with its stdio thrown away, so the refusal above would land
	// nowhere: without this the answer to `board list` is eight seconds of
	// silence and "the auto-started server did not become healthy".
	const cliRefusal = await new Promise((resolve) => {
		const env = {
			...process.env,
			EXPRESS_SERVER_URL: `http://127.0.0.1:${port + 1}`,
			LOG_LEVEL: "error",
		};
		delete env.ARCHBOARD_VAULT;
		const child = spawn(runtime, [join(repoRoot, "src", "bin.ts"), "board", "list"], {
			cwd: repoRoot,
			env,
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("exit", (code) => resolve({ code, stderr }));
	});
	// 3 is "canvas unreachable", which is what this is: it is not running and it
	// will not start. A foreign service on the port already exits 3 for the same
	// reason, so no new code was invented for a new cause of the same outcome.
	if (cliRefusal.code !== 3) {
		throw new Error(`CLI with no vault exited ${cliRefusal.code}, wanted 3.\n${cliRefusal.stderr}`);
	}
	if (!cliRefusal.stderr.includes("install-skill")) {
		throw new Error(`CLI with no vault never mentioned install-skill:\n${cliRefusal.stderr}`);
	}

	console.log(
		`Local bind check passed on port ${port} using ${runtimeName}: ` +
			"default bind is IPv4 loopback only, only non-hidden files in dist/frontend are served, " +
			"duplicate startup fails, HOST=:: is guarded, and with no vault both the server and the " +
			"CLI refuse and say how to get one.",
	);

	await killChild(first);
	if (process.env.DEBUG_BIND_CHECK && firstOutput()) {
		console.error(firstOutput());
	}
	if (process.env.DEBUG_BIND_CHECK && secondOutput()) {
		console.error(secondOutput());
	}
	if (process.env.DEBUG_BIND_CHECK && bindAllOutput()) {
		console.error(bindAllOutput());
	}
} catch (error) {
	if (noVault) await killChild(noVault);
	if (bindAll) await killChild(bindAll);
	if (second) await killChild(second);
	if (first) await killChild(first);
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
} finally {
	if (removeStaticProbes) removeStaticProbes();
	if (checkoutAliasRoot) fs.rmSync(checkoutAliasRoot, { recursive: true, force: true });
}

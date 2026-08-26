#!/usr/bin/env bun
//
// A canvas that is running older code than the files on disk says so, and a tab
// running an older bundle is told (TASK-056).
//
// Under ADR 0014 there are three copies of the program and they go stale at
// different times: the CLI never does, because it is a fresh process; the
// canvas does the moment you save, because it read its source once; a tab does
// when somebody rebuilds the frontend under it. Nothing had a symptom, so the
// same confusion arrived three times, twice in one session, and each time it
// cost a wrong conclusion first.
//
// Both halves are checked from both sides. Firing is only half the claim: a
// warning that cannot be quiet is one nobody reads, so every section here has
// its silent case next to its loud one.
//
// The reload case is not here. It needs `bun --hot` and a reload token, and
// scripts/check-hot-reload.mjs already stands that up; the two assertions for
// "a reload clears the warning" live there, next to the reload that clears it.
//
// Nothing here touches a canvas anybody is using: its own port, its own vault,
// its own state directory.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => path.join(repoRoot, "src", p);

let failures = 0;
const check = (label, cond, extra = "") => {
	if (!cond) failures += 1;
	console.log(`${cond ? "ok  " : "FAIL"} - ${label}${extra ? ` (${extra})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PORT = Number(process.env.PORT || 38000 + Math.floor(Math.random() * 900));
const base = `http://127.0.0.1:${PORT}`;
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-stale-"));
const state = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-stale-state-"));

// ── The frontend bundle this check compares against ───────────────────────
//
// A checkout may or may not have run `bun run build`, and this check must not
// depend on which. If dist/frontend/index.html is there it is left alone and
// read; if it is not, one is planted with the same shape vite emits and removed
// at the end. Either way nothing is overwritten.

const indexFile = path.join(repoRoot, "dist", "frontend", "index.html");
const planted = [];

function plantIndexIfMissing() {
	if (fs.existsSync(indexFile)) return;
	let dir = path.dirname(indexFile);
	const missing = [];
	while (!fs.existsSync(dir)) {
		missing.unshift(dir);
		dir = path.dirname(dir);
	}
	for (const made of missing) {
		fs.mkdirSync(made);
		planted.push(made);
	}
	fs.writeFileSync(
		indexFile,
		"<!DOCTYPE html><html><head>" +
			'<script type="module" crossorigin src="/assets/index-checkstale.js"></script>' +
			'</head><body><div id="root"></div></body></html>\n',
	);
	planted.push(indexFile);
}

function removePlanted() {
	for (const entry of planted.toReversed()) {
		try {
			if (fs.statSync(entry).isDirectory()) fs.rmdirSync(entry);
			else fs.unlinkSync(entry);
		} catch {
			/* already gone */
		}
	}
	planted.length = 0;
}

plantIndexIfMissing();

// ── A file the canvas will have loaded, touched and put back ──────────────
//
// mtime is what staleness is measured from, so the edit is a touch: the bytes
// never change, and the original mtime goes back at the end. `git status` is
// untouched throughout, which matters in a tree that usually has the change
// being tested in it.

const touched = src(path.join("runtime", "engine", "compare.ts"));
const originalTimes = fs.statSync(touched);

function touch(file) {
	const now = new Date();
	fs.utimesSync(file, now, now);
}

function untouch(file, stats) {
	fs.utimesSync(file, stats.atime, stats.mtime);
}

// ── The canvas ────────────────────────────────────────────────────────────

const server = spawn(process.execPath, [src("server.ts")], {
	cwd: repoRoot,
	env: {
		...process.env,
		PORT: String(PORT),
		HOST: "127.0.0.1",
		ARCHBOARD_VAULT: vault,
		XDG_STATE_HOME: state,
		LOG_LEVEL: "error",
	},
	stdio: ["ignore", "ignore", "pipe"],
});
let serverStderr = "";
server.stderr.on("data", (chunk) => {
	serverStderr += chunk.toString();
});

const health = async () => {
	try {
		const response = await fetch(`${base}/health`);
		return response.ok ? await response.json() : null;
	} catch {
		return null;
	}
};

const postPane = async (build, clientId) => {
	const response = await fetch(`${base}/api/panes`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			clientId,
			paneId: clientId,
			board: "scratch",
			primary: true,
			focused: true,
			elementCount: 0,
			rect: { x: 0, y: 0, width: 1280, height: 800 },
			viewport: { x: 0, y: 0, width: 1280, height: 800, zoom: 1 },
			...(build === undefined ? {} : { build }),
		}),
	});
	return response.json();
};

/** One CLI command, in its own process, the way a person runs it. */
const cli = (args) =>
	new Promise((resolve) => {
		const child = spawn(process.execPath, [src("bin.ts"), ...args], {
			cwd: repoRoot,
			env: {
				...process.env,
				EXPRESS_SERVER_URL: base,
				EXCALIDRAW_NO_AUTOSTART: "1",
				ARCHBOARD_VAULT: vault,
				XDG_STATE_HOME: state,
				LOG_LEVEL: "error",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("exit", (code) => {
			let json = null;
			try {
				json = JSON.parse(stdout);
			} catch {
				/* not JSON, which is a finding on its own */
			}
			resolve({ code, stdout, stderr, json });
		});
	});

async function waitFor(predicate, what, timeoutMs = 15000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const value = await predicate();
		if (value) return value;
		await sleep(100);
	}
	throw new Error(`Timed out waiting for ${what}.\n${serverStderr}`);
}

let socket = null;

try {
	const first = await waitFor(health, "the canvas to come up");

	// ── The server half, quiet ──────────────────────────────────

	check(
		"a canvas that has just started is not running old source",
		first.source?.stale === false,
		`newest is ${first.source?.newestFile}`,
	);
	check(
		"  and it names the file it read last, so the comparison can be checked",
		typeof first.source?.newestFile === "string" && first.source.newestFile.startsWith("src/"),
		String(first.source?.newestFile),
	);
	check(
		"  and it says when it read its source",
		!Number.isNaN(Date.parse(first.source?.evaluatedAt ?? "")),
		String(first.source?.evaluatedAt),
	);

	const quiet = await cli(["status"]);
	check(
		"status says nothing about staleness while there is nothing to say",
		quiet.json?.stale === undefined && !/older code/.test(quiet.stderr),
		JSON.stringify(quiet.stderr.trim().slice(0, 120)),
	);

	// ── The server half, loud ───────────────────────────────────
	//
	// One file the canvas loaded is touched. Nothing about the process changes,
	// which is the whole problem: it goes on answering from what it read at
	// start, and until now nothing anywhere said so.

	touch(touched);
	const stale = await waitFor(async () => {
		const now = await health();
		return now?.source?.stale ? now : null;
	}, "the canvas to notice its source changed");
	check(
		"a source file written after the canvas started makes it stale",
		stale.source.stale === true,
	);
	check(
		"  and the canvas names that file, not just the fact",
		stale.source.newestFile === "src/runtime/engine/compare.ts",
		String(stale.source.newestFile),
	);
	check(
		"  and the process is the one that started, so nothing restarted itself",
		stale.pid === first.pid,
		`${first.pid} -> ${stale.pid}`,
	);

	const loud = await cli(["status"]);
	check(
		"status reports it in the JSON, where a script reads it",
		loud.json?.stale?.changedFile === "src/runtime/engine/compare.ts",
		JSON.stringify(loud.json?.stale ?? null).slice(0, 120),
	);
	check(
		"  and in a sentence on stderr, where a person reads it",
		/answering from the older code/.test(loud.stderr),
		JSON.stringify(loud.stderr.trim().slice(0, 160)),
	);
	check(
		"  and names the remedy this canvas actually has: it cannot reload, so restart",
		/archboard stop && archboard start/.test(loud.stderr) && !/bun run reload/.test(loud.stderr),
		JSON.stringify(loud.stderr.trim().slice(-120)),
	);
	// What a restart costs changed with TASK-078: the boards are in the vault, so
	// it is the panes on screen rather than anybody's work. The sentence still has
	// to say what it costs, because "restart it" with no price on it is what
	// somebody standing at a wall display cannot afford to act on blind.
	check(
		"  and says what the restart costs, because it takes the panes down with it",
		/the panes on screen/.test(loud.stderr) && /in the vault/.test(loud.stderr),
		JSON.stringify(loud.stderr.trim().slice(-160)),
	);

	untouch(touched, originalTimes);

	// ── The tab's half ──────────────────────────────────────────
	//
	// A pane is a socket and a registration, the standin scripts/check-boards.mjs
	// uses. What matters here is the reply to the registration: a tab that says
	// which bundle it loaded is told, on its own pulse, when that is no longer
	// the bundle on disk. Before this the same tab found out by having a command
	// time out on it ten seconds later, or not at all.

	const current = (await health()).frontendBuild;
	check(
		"the canvas knows which bundle it is serving",
		typeof current === "string" && current.startsWith("/assets/"),
		String(current),
	);

	socket = new WebSocket(`ws://127.0.0.1:${PORT}/?clientId=p-stale-1`);
	await new Promise((resolve, reject) => {
		socket.once("open", resolve);
		socket.once("error", reject);
	});
	await sleep(150);

	const old = await postPane("/assets/index-fromlastweek.js", "p-stale-1");
	check(
		"a pane on a bundle the canvas no longer serves is told at once",
		old.staleFrontend?.stale === true,
		JSON.stringify(old.staleFrontend ?? null).slice(0, 100),
	);
	check(
		"  in a sentence that names both builds and what to do",
		/index-fromlastweek\.js/.test(old.staleFrontend?.message ?? "") &&
			old.staleFrontend.message.includes(current) &&
			/Reload the tab/.test(old.staleFrontend?.message ?? ""),
		JSON.stringify(old.staleFrontend?.message ?? null),
	);
	check(
		"  and the pane is still registered, because being old is not being wrong",
		old.registered === true,
	);

	const fresh = await postPane(current, "p-stale-1");
	check(
		"a pane on the bundle that is on disk hears nothing",
		fresh.staleFrontend === undefined,
		JSON.stringify(fresh.staleFrontend ?? null),
	);

	const dev = await postPane("/src/main.tsx", "p-stale-1");
	check(
		"a tab served by the vite dev server hears nothing, having no bundle to be old",
		dev.staleFrontend === undefined,
		JSON.stringify(dev.staleFrontend ?? null),
	);

	const silent = await postPane(undefined, "p-stale-1");
	check(
		"a client that says nothing about its build is not guessed at",
		silent.staleFrontend === undefined && silent.registered === true,
		JSON.stringify(silent.staleFrontend ?? null),
	);
} catch (error) {
	failures += 1;
	console.log(`FAIL - ${error instanceof Error ? error.message : String(error)}`);
} finally {
	untouch(touched, originalTimes);
	removePlanted();
	try {
		socket?.close();
	} catch {
		/* nothing to close */
	}
	server.kill("SIGTERM");
	await sleep(200);
	if (server.exitCode === null) server.kill("SIGKILL");
	fs.rmSync(vault, { recursive: true, force: true });
	fs.rmSync(state, { recursive: true, force: true });
}

if (failures > 0) {
	console.error(`\n${failures} staleness failure${failures === 1 ? "" : "s"}.`);
	if (serverStderr.trim()) console.error(serverStderr.trim());
	process.exit(1);
}
console.log(
	"staleness: the canvas says when it is running old source, and a tab is told when it is old.",
);

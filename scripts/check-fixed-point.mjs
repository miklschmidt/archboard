#!/usr/bin/env bun
//
// What we write should be a document Excalidraw does not change (TASK-071).
//
// Every other check in scripts/ stands a WebSocket in for a pane, and says so.
// That works because a pane is a socket plus a registration for everything
// except the one thing this check is about: rendering. Excalidraw is the
// renderer, it holds the document while a human edits it, and it silently
// corrects anything it disagrees with the moment it renders. A socket cannot
// disagree with us, so a socket cannot catch that.
//
// Which is why "there is one converter" is the wrong property to check. A
// converter that is single and still wrong passes it. The property that
// matters is that a board we write is a fixed point: opened in a real browser
// and rendered once, nothing comes back different. Under ADR 0015 the note is
// the board, so every correction Excalidraw makes is a write, and a board an
// agent drew headlessly gets rewritten the first time somebody looks at it.
//
// WHAT IT DOES. Builds a board covering every element type an agent can
// create — rectangle, ellipse, diamond, standalone text, line, freedraw, a
// bound arrow and a labelled bound arrow — saves it, so the document under
// test is exactly the note our exporter writes. Opens a real headless Chrome
// on the canvas, re-reads the note into the pane, waits for the fonts and for
// the scene to stop moving, reads back what the pane is holding, and diffs it
// against what the server holds, element by element and field by field.
//
// It names fields rather than counting elements on purpose. "8 of 12 elements
// changed" would not tell anyone which correction had stopped working, and it
// was the field lists that showed how much of that eight was our own frontend
// converting on read rather than anything Excalidraw wanted.
//
// THE BASELINE IS ZERO. It was 8 of 12 when this landed, as a measurement of
// what stage 5 had to fix; stage 5 fixed it (TASK-072) and the table is empty.
// A row in it is a regression.
//
// IT IS IN `bun run test`, which means running the suite needs `agent-browser`
// and a browser on the machine. That is deliberate: this is the only check
// that can tell whether a board we write is one Excalidraw agrees with, and a
// converter that has quietly started disagreeing is not something to discover
// in a user's scene. Without a browser it exits 2 — "I could not run" —
// rather than claiming a pass.
//
// It rebuilds the frontend itself unless given --skip-build, because the
// frontend is half of what it is measuring and a stale bundle would quietly
// test the wrong code. It takes about eleven seconds plus the build.
//
// HOW THE BROWSER IS DRIVEN, since nothing here did it before. `agent-browser`
// on PATH, in a session of its own so it cannot touch a tab a human is using,
// with its own headless Chrome. Two commands carry the whole check: `open` and
// `eval`. The page is the real canvas served by the throwaway server on a
// random port, so what renders is the shipped frontend and the shipped
// Excalidraw, not a shim.
//
// READING THE SCENE BACK reaches into React, and that is deliberate. The
// frontend exposes no handle on the Excalidraw API, so the read walks the
// fiber up from the `.excalidraw` node to the App instance and asks its scene.
// That is an internal and it can break; when it does, this check fails loudly
// with "no Excalidraw app instance" rather than silently reporting zero.
//
// The alternative was to force a change report and read what the pane posts.
// It is worse. A pane only reports once a human has touched it
// (`userInteractedRef` in useCanvasSession), so arming the report needs a
// keystroke, and any keystroke that arms it also edits the board — the report
// would then mix Excalidraw's corrections with the check's own typing.
// Reading the scene asks the question directly.
//
// WHAT IS IGNORED, and why those and nothing else:
//
//   createdAt, updatedAt, syncedAt, source, syncTimestamp, version
//       the server's own bookkeeping. `cleanElementForExcalidraw` strips all
//       six on the way into the scene, so the browser never sees them and
//       "the browser dropped it" would be a lie.
//   version, versionNonce, updated
//       Excalidraw's own bookkeeping, rewritten on every mutation.
//
// Nothing else is ignored. `seed`, `index`, `rawText`, `lastCommittedPoint`
// and the rest all count, because under ADR 0015 they are all in the note and
// a field the browser rewrites is a write.

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withDoing } from "./lib/doing.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => path.join(repoRoot, "src", p);
const finiteTelemetry = (value) => typeof value === "number" && Number.isFinite(value);
const roundedGeometry = (report) => ({
	rect: {
		x: Math.round(report?.rect?.x),
		y: Math.round(report?.rect?.y),
		width: Math.round(report?.rect?.width),
		height: Math.round(report?.rect?.height),
	},
	viewport: {
		x: Math.round(report?.viewport?.x),
		y: Math.round(report?.viewport?.y),
		width: Math.round(report?.viewport?.width),
		height: Math.round(report?.viewport?.height),
		zoom: Math.round(report?.viewport?.zoom),
	},
});
const skipBuild = process.argv.includes("--skip-build");

let failures = 0;
const check = (label, cond, extra = "") => {
	if (!cond) failures += 1;
	console.log(`${cond ? "ok  " : "FAIL"} - ${label}${extra ? ` (${extra})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { PANE_DEBOUNCE_MS, PANE_LAYOUT_TIMEOUT_MS, PANE_SETTLE_CAP_MS, REPORT_PROGRESS_MS } =
	await import(src("shared/timing/timing.ts"));

// Browser waits are observations with a deadline, not guessed pauses. The poll
// cadence follows the two browser debounces, and the outer cap is the same one
// the server uses while waiting for a pane to exist.
const BROWSER_POLL_MS = Math.floor(Math.min(PANE_DEBOUNCE_MS, REPORT_PROGRESS_MS) / 3);
const PANE_SUPPRESSION_MARGIN_MS = Math.ceil(PANE_DEBOUNCE_MS / 3);
const PANE_SUPPRESSION_WAIT_MS = PANE_DEBOUNCE_MS + PANE_SUPPRESSION_MARGIN_MS;

async function waitFor(observe, ready, timeoutMs = PANE_LAYOUT_TIMEOUT_MS) {
	const deadline = Date.now() + timeoutMs;
	let value = null;
	while (Date.now() < deadline) {
		value = await observe();
		if (ready(value)) return value;
		await sleep(BROWSER_POLL_MS);
	}
	return value;
}

// ---------------------------------------------------------------------------
// The measured baseline
// ---------------------------------------------------------------------------
//
// Element name -> the fields that came back different. `+field` is one the
// browser added, `-field` one it dropped, a bare name one it rewrote. Values
// are printed but not asserted: they are measurements, and pinning
// 208.85975646972656 would turn this into a font-version detector.
//
// A bound text is named after the element it belongs to, because its id is
// minted by the converter and saying `GNd4kMNS` here would mean nothing to
// anyone reading a failure.
//
// IT IS EMPTY, AND THAT IS THE POINT. TASK-072 made it empty. The board this
// check writes is a fixed point: opened in a real browser and rendered,
// nothing comes back different. Any row appearing here is a regression, and
// the field names in the failure say which.
//
// What used to be here, and where each of it went (measured on 2026-08-20,
// then again after each half of stage 5 landed):
//
//   width/height/x/y on text   our estimator, 76.7 px wrong on `AuthService`,
//                              against Excalidraw's measureText. Now measured,
//                              in `src/runtime/engine/measure-text.ts`.
//   -rawText                   dropped by the frontend's converter, not by
//                              Excalidraw, which keeps it.
//   index                      `a${n}` stops increasing at ten, because `a10`
//                              sorts before `a2`. Now `fractionalIndex`.
//   points on an arrow         inset by half a stroke width by the frontend's
//                              converter, and gone with it.
//   +lastCommittedPoint,       freedraw fields our converter never wrote and
//   +pressures,                the frontend filled in on a server update, so the note
//   +simulatePressure          never learned them. Now written.
//
// Of the eight elements this check used to report, seven were the frontend
// converting on read. The one thing Excalidraw itself rewrote was `index`.

const BASELINE = {};

const IGNORED = [
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
	"version",
	"versionNonce",
	"updated",
];
const ignored = new Set(IGNORED);

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

const which = spawnSync("agent-browser", ["--version"], { stdio: "ignore" });
if (which.error) {
	console.error("fixed-point: agent-browser is not on PATH, so there is no browser to render in.");
	console.error("  This check needs one. Running it in CI is TASK-082.");
	process.exit(2);
}

// The daemon listens on <socket dir>/<session>.sock, and a unix socket path is
// capped at 103 bytes. The default socket dir follows HOME, so a checkout under
// a long home directory fails with "session name is too long" before the
// browser ever opens. Found on a machine with a scrubbed environment while
// working out what CI needs (TASK-082); a short dir of our own is the fix.
const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-"));
const browserEnv = { ...process.env, AGENT_BROWSER_SOCKET_DIR: socketDir };

const sessionId = (() => {
	const asked = spawnSync(
		"agent-browser",
		["session", "id", "--scope", "worktree", "--prefix", "archboard-fixedpoint"],
		{ encoding: "utf-8", env: browserEnv },
	);
	const named = asked.stdout.trim();
	return named || `archboard-fixedpoint-${Math.random().toString(36).slice(2, 10)}`;
})();

/** One agent-browser command, in this check's own session. */
const browser = (args, stdin) =>
	new Promise((resolve, reject) => {
		const child = spawn("agent-browser", ["--session", sessionId, ...args], {
			stdio: ["pipe", "pipe", "pipe"],
			env: browserEnv,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (c) => {
			stdout += c.toString();
		});
		child.stderr.on("data", (c) => {
			stderr += c.toString();
		});
		child.stdin.end(stdin ?? "");
		child.on("exit", (code) =>
			code === 0
				? resolve(stdout)
				: reject(new Error(`agent-browser ${args[0]} failed: ${(stderr || stdout).trim()}`)),
		);
	});

const evalInPage = async (js) => JSON.parse(await browser(["eval", "--stdin"], js));

// Walking the fiber to the Excalidraw App instance, then asking its scene.
// Deleted elements included: a label somebody emptied is a deleted text
// element, and leaving it out would hide a whole class of divergence.
const READ_SCENE = `(() => {
  const node = document.querySelector('.excalidraw');
  const key = node && Object.keys(node).find(k => k.startsWith('__reactFiber$'));
  let fiber = key ? node[key] : null;
  for (let i = 0; fiber && i < 60; i++) {
    const app = fiber.stateNode;
    if (app && typeof app === 'object' && app.scene
        && typeof app.scene.getElementsIncludingDeleted === 'function') {
      return { elements: app.scene.getElementsIncludingDeleted().map(e => ({ ...e })) };
    }
    fiber = fiber.return;
  }
  return { error: 'no Excalidraw app instance' };
})()`;

const strip = (element) => {
	const kept = {};
	for (const [k, v] of Object.entries(element)) if (!ignored.has(k)) kept[k] = v;
	return kept;
};

// ---------------------------------------------------------------------------
// The font gate
// ---------------------------------------------------------------------------
//
// A page that has not loaded Excalifont measures every string on Chrome's
// last-resort font, and this check would then diff our widths against the
// wrong font's — forever, however right the converter got.
//
// `document.fonts` cannot tell you. `check('20px Excalifont')` returned **true
// in a fresh tab before a single FontFace had been added**, because it asks
// whether every font in the set that would be used is loaded, and a family
// with no FontFace at all is not in the set, so nothing is pending and the
// answer is true. `fonts.ready` has the same hole: it resolves immediately
// when nothing has been requested yet. This check waited on `ready` and its
// first recorded baseline was measured on the fallback — `a standalone
// caption` came back 163.271484375 px wide, which is exactly what Chrome
// returns for `20px serif` and for an invented family name
// (docs/design/measuring-text-outside-a-browser.md).
//
// The only reliable test is the width itself, so that is what this waits for.
// The numbers are Chrome's, with the font loaded; the fallback column is what
// the same string measures with the family absent, and the two are more than
// ten pixels apart, which no rounding explains.

const FONT_PROBES = {
	1: { css: "Virgil", size: 16, text: "AuthService", loaded: 90.54, fallback: 79.98 },
	5: { css: "Excalifont", size: 20, text: "AuthService", loaded: 114.4999, fallback: 99.97 },
};

// Asking for the font is half of it. Excalidraw registers its FontFaces
// without fetching them, so a family is in `document.fonts` and still not
// loaded until something asks; `load()` is the documented way to ask, and the
// width is how you find out whether the answer arrived.
const measureInPage = (css, size, text) =>
	evalInPage(`(async () => {
  const font = '${size}px ${css}';
  try { await document.fonts.load(font, ${JSON.stringify(text)}); } catch (e) { /* not registered yet */ }
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = font;
  return { width: ctx.measureText(${JSON.stringify(text)}).width };
})()`);

/** Wait until the page is measuring in the fonts the board is written in. */
const waitForFonts = async (families) => {
	for (const fontFamily of families) {
		const probe = FONT_PROBES[fontFamily];
		if (!probe) {
			check(
				`the page's font for fontFamily ${fontFamily} cannot be confirmed`,
				false,
				"no Chrome width is recorded for it, so this check cannot tell it from the fallback",
			);
			continue;
		}
		let width = null;
		for (let i = 0; i < 80; i++) {
			width = (await measureInPage(probe.css, probe.size, probe.text)).width;
			if (Math.abs(width - probe.loaded) < 0.05) break;
			await sleep(250);
		}
		check(
			`the page is rendering in ${probe.css}, not the last-resort font`,
			Math.abs(width - probe.loaded) < 0.05,
			`"${probe.text}" at ${probe.size}px measures ${width}; ${probe.css} is ${probe.loaded} ` +
				`and the fallback is ${probe.fallback}`,
		);
	}
};

/**
 * The scene once it has stopped moving.
 *
 * Things move under us. A bound arrow is re-routed when the label it points at
 * changes size, and that happens a moment after the render, so reading once
 * would report a document nobody ever holds. Waiting for a repeat is the
 * honest way to say "this is what it settled on".
 *
 * What does *not* happen is a re-measure when a font lands, which is why the
 * font gate above has to run before the board is delivered rather than being
 * something this could wait out.
 */
const sceneWhenStill = async ({ tries = 40, gap = 250 } = {}) => {
	let previous = null;
	let stable = 0;
	for (let i = 0; i < tries; i++) {
		const read = await evalInPage(READ_SCENE);
		if (read.error) throw new Error(`could not read the scene: ${read.error}`);
		const shot = JSON.stringify(read.elements.map(strip));
		stable = shot === previous ? stable + 1 : 0;
		previous = shot;
		if (stable >= 2) return read.elements;
		await sleep(gap);
	}
	throw new Error("the scene never stopped changing");
};

// ---------------------------------------------------------------------------
// The canvas, on a port of its own with a vault of its own
// ---------------------------------------------------------------------------

if (!skipBuild) {
	console.log("# building the frontend (this check renders dist/frontend)");
	const built = spawnSync(process.execPath, ["run", "build"], { cwd: repoRoot, encoding: "utf-8" });
	if (built.status !== 0) {
		console.error("fixed-point: the frontend would not build.");
		console.error((built.stderr || built.stdout || "").split("\n").slice(-20).join("\n"));
		process.exit(2);
	}
}
if (!fs.existsSync(path.join(repoRoot, "dist/frontend/index.html"))) {
	console.error("fixed-point: no dist/frontend to serve. Run `bun run build`.");
	process.exit(2);
}

const freePort = () =>
	new Promise((resolve) => {
		const probe = net.createServer();
		probe.listen(0, "127.0.0.1", () => {
			const { port } = probe.address();
			probe.close(() => resolve(port));
		});
	});

const PORT = Number(process.env.PORT) || (await freePort());
const base = `http://127.0.0.1:${PORT}`;
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-fixedpoint-"));

// A note from before TASK-117, with the exact shape that blanked the board:
// auto-resizing Helvetica text and no finite width or height. Build the valid
// form through the same converter as a normal write, then remove only those
// two fields. The correction later restores these original bytes.
const { renderBoardNote } = await import(src("runtime/engine/board.ts"));
const { expandElements } = await import(src("runtime/engine/expand-elements.ts"));
const legacyIdentity = { board: "legacy-geometry", variant: "current" };
const validLegacyScene = {
	type: "excalidraw",
	version: 2,
	source: "archboard",
	elements: expandElements(
		[
			{
				id: "helv",
				type: "text",
				x: 120,
				y: 140,
				width: 180,
				height: 25,
				text: "legacy Helvetica",
				fontFamily: 2,
				autoResize: true,
			},
		],
		{ deterministic: true },
	),
	appState: { gridSize: 20, viewBackgroundColor: "#ffffff" },
	files: {},
};
const validLegacyNote = renderBoardNote(validLegacyScene, null, legacyIdentity);
const malformedLegacyScene = structuredClone(validLegacyScene);
delete malformedLegacyScene.elements[0].width;
delete malformedLegacyScene.elements[0].height;
const malformedLegacyNote = renderBoardNote(malformedLegacyScene, null, legacyIdentity);
const legacyFile = path.join(vault, "legacy-geometry.excalidraw.md");
fs.writeFileSync(legacyFile, malformedLegacyNote);

// Startup has a separate seam from board open. Scratch is adopted before the
// listener binds, so plant the same malformed scene at its persisted address
// before the server process exists.
const scratchIdentity = { board: "scratch", variant: "current" };
const scratchFile = path.join(vault, ".archboard", "scratch.excalidraw.md");
const malformedScratchNote = renderBoardNote(malformedLegacyScene, null, scratchIdentity);
const validScratchNote = renderBoardNote(
	{
		type: "excalidraw",
		version: 2,
		source: "archboard",
		elements: [],
		appState: {},
		files: {},
	},
	null,
	scratchIdentity,
);
fs.mkdirSync(path.dirname(scratchFile), { recursive: true });
fs.writeFileSync(scratchFile, malformedScratchNote);

const server = spawn(process.execPath, [src("server.ts")], {
	env: {
		...process.env,
		PORT: String(PORT),
		HOST: "127.0.0.1",
		ARCHBOARD_VAULT: vault,
		LOG_LEVEL: "error",
	},
	stdio: ["ignore", "ignore", "pipe"],
});
let serverStderr = "";
server.stderr.on("data", (chunk) => {
	serverStderr += chunk.toString();
});

const api = async (method, url, body) => {
	// Every write says what it is doing, once for the whole check (TASK-095,
	// scripts/lib/doing.mjs). The refusal itself is proved in check-doing.mjs.
	url = withDoing(url, method, "checking the board a real browser renders");
	const response = await fetch(`${base}${url}`, {
		method,
		...(body === undefined
			? {}
			: {
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}),
	});
	return { status: response.status, body: await response.json().catch(() => null) };
};

// ---------------------------------------------------------------------------
// The diff
// ---------------------------------------------------------------------------

/**
 * A bound text is named after its container, because its own id was minted by
 * the note writer and means nothing to a reader.
 */
const nameOf = (element) => (element.containerId ? `${element.containerId}:label` : element.id);

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** What the browser did to each element, as field names plus printable values. */
const whatMoved = (held, rendered) => {
	const serverElements = new Map(held.map((e) => [e.id, e]));
	const page = new Map(rendered.map((e) => [e.id, e]));
	const moved = {};
	const values = {};

	for (const [id, ours] of serverElements) {
		const theirs = page.get(id);
		const name = nameOf(ours);
		if (!theirs) {
			moved[name] = ["<gone from the scene>"];
			values[name] = [`the browser is not holding ${id} at all`];
			continue;
		}
		const fields = [];
		const shown = [];
		const keys = [...new Set([...Object.keys(ours), ...Object.keys(theirs)])]
			.filter((k) => !ignored.has(k))
			.toSorted();
		for (const key of keys) {
			if (!(key in ours)) {
				fields.push(`+${key}`);
				shown.push(`+${key} = ${JSON.stringify(theirs[key])}`);
			} else if (!(key in theirs)) {
				fields.push(`-${key}`);
				shown.push(`-${key} (was ${JSON.stringify(ours[key])})`);
			} else if (!sameValue(ours[key], theirs[key])) {
				fields.push(key);
				shown.push(`${key}: ${JSON.stringify(ours[key])} -> ${JSON.stringify(theirs[key])}`);
			}
		}
		if (fields.length > 0) {
			moved[name] = fields.toSorted((a, b) => a.localeCompare(b));
			values[name] = shown;
		}
	}

	for (const [id, theirs] of page) {
		if (serverElements.has(id)) continue;
		const name = `${nameOf(theirs)} <invented>`;
		moved[name] = ["<not on the server at all>"];
		values[name] = [`the browser is holding a ${theirs.type} the server never wrote`];
	}
	return { moved, values, serverCount: serverElements.size, pageCount: page.size };
};

const report = ({ moved, values, serverCount, pageCount }) => {
	const names = Object.keys(moved).toSorted();
	console.log(
		`\n# ${names.length} of ${serverCount} elements came back changed` +
			(pageCount === serverCount ? "" : ` (the browser holds ${pageCount})`),
	);
	for (const name of names) {
		console.log(`#   ${name}`);
		for (const line of values[name]) console.log(`#     ${line}`);
	}
	console.log("");
};

/** Field-set difference in both directions, which is what a failure has to say. */
const against = (moved, baseline) => {
	const news = [];
	const gone = [];
	for (const name of new Set([...Object.keys(moved), ...Object.keys(baseline)])) {
		const now = new Set(moved[name] ?? []);
		const then = new Set(baseline[name] ?? []);
		for (const field of now) if (!then.has(field)) news.push(`${name}.${field}`);
		for (const field of then) if (!now.has(field)) gone.push(`${name}.${field}`);
	}
	return { news: news.toSorted(), gone: gone.toSorted() };
};

// ---------------------------------------------------------------------------

try {
	const healthy = await waitFor(async () => {
		try {
			return (await fetch(`${base}/health`)).ok;
		} catch {
			return false;
		}
	}, Boolean);
	check(
		"a malformed persisted scratch note does not stop the canvas server",
		healthy === true,
		serverStderr.trim(),
	);
	if (!healthy) throw new Error(`canvas did not start: ${serverStderr.trim()}`);

	// --- the board -----------------------------------------------------------
	//
	// Every type an agent can create, so nothing is a fixed point by never
	// having been drawn. The two arrows are bound to shapes, and one carries a
	// label, because a bound arrow is where a change to a text's width turns
	// into a change to a path.

	await api("POST", "/api/boards/new", { board: "fixedpoint", level: "service" });
	const made = await api("POST", "/api/elements/batch?board=fixedpoint", {
		elements: [
			{
				id: "rect1",
				type: "rectangle",
				x: 100,
				y: 100,
				width: 220,
				height: 90,
				label: { text: "AuthService" },
			},
			{
				id: "ell1",
				type: "ellipse",
				x: 420,
				y: 100,
				width: 160,
				height: 90,
				label: { text: "Queue" },
			},
			{
				id: "dia1",
				type: "diamond",
				x: 680,
				y: 100,
				width: 160,
				height: 90,
				label: { text: "Gate" },
			},
			{
				id: "text1",
				type: "text",
				x: 100,
				y: 260,
				width: 240,
				height: 25,
				text: "a standalone caption",
			},
			{
				id: "line1",
				type: "line",
				x: 100,
				y: 340,
				points: [
					[0, 0],
					[200, 0],
					[200, 80],
				],
			},
			{
				id: "draw1",
				type: "freedraw",
				x: 420,
				y: 340,
				points: [
					[0, 0],
					[40, 30],
					[90, 10],
					[120, 60],
				],
			},
			{
				id: "arr1",
				type: "arrow",
				x: 330,
				y: 145,
				points: [
					[0, 0],
					[84, 0],
				],
				start: { id: "rect1" },
				end: { id: "ell1" },
			},
			{
				id: "arr2",
				type: "arrow",
				x: 590,
				y: 145,
				points: [
					[0, 0],
					[84, 0],
				],
				start: { id: "ell1" },
				end: { id: "dia1" },
				label: { text: "gRPC" },
			},
			{
				id: "negative-path",
				type: "arrow",
				x: 900,
				y: 420,
				points: [
					[0, 0],
					[-120, -90],
				],
			},
			{
				id: "bridge-under",
				type: "line",
				x: 200,
				y: 300,
				points: [
					[0, 0],
					[0, 80],
				],
			},
		],
	});
	// Fourteen, not ten: four of those elements carry a label, and a label is a
	// text element from the moment it is written (ADR 0015).
	check(
		"a board is drawn covering every type an agent can create and a negative path",
		made.status === 200 && made.body?.elements?.length === 14,
		`status ${made.status}, ${made.body?.elements?.length} elements`,
	);
	const bridge = await api("POST", "/api/bridges?board=fixedpoint", {
		over: "line1",
		under: "bridge-under",
		background: "#ffffff",
	});
	check(
		"the fixed-point board includes one product bridge pair",
		bridge.status === 200 &&
			bridge.body?.elements?.length === 2 &&
			bridge.body?.elements?.[0]?.id === bridge.body?.bridgeId &&
			bridge.body?.elements?.[0]?.customData?.archboard?.bridge?.role === "mask" &&
			bridge.body?.elements?.[1]?.customData?.archboard?.bridge?.role === "redraw",
		bridge.body?.error ?? "",
	);

	// Saved and read back, so the document under test is the note our exporter
	// writes rather than whatever the store happened to be holding.
	const saved = await api("POST", "/api/boards/save", { board: "fixedpoint" });
	check(
		"  and saved, so what is under test is the note we write",
		saved.status === 200 && fs.existsSync(saved.body?.file ?? ""),
		saved.body?.error ?? "",
	);

	// --- the browser ---------------------------------------------------------

	await browser(["open", base]);
	check("a real browser opens the canvas", true, `session ${sessionId}`);

	// Headless is not a preference here, it is a requirement of the machine this
	// runs on. A window that maps takes focus under Hyprland, so a headed browser
	// would yank the desktop away from whoever is working mid-suite — and this
	// check is in `bun run test`, so that would be every run. Nothing pins it
	// today except `open` happening to default headless and nobody passing
	// --headed, which is the kind of invariant this repository has spent its time
	// removing. Chrome states it in its own user agent, so ask the page rather
	// than trusting the flag.
	const ua = await evalInPage("navigator.userAgent");
	check("  without mapping a window, because a window would steal focus", /headless/i.test(ua), ua);

	let panes = await waitFor(
		async () => (await api("GET", "/api/panes")).body,
		(telemetry) => telemetry?.paneCount >= 1,
	);
	check(
		"  and registers a pane, so there is something rendering",
		panes?.paneCount === 1,
		`paneCount ${panes?.paneCount ?? "none"}`,
	);

	const scratchFailure = await waitFor(
		() =>
			evalInPage(`(() => {
      const alert = document.querySelector('[role="alert"]');
      const read = ${READ_SCENE};
      const zoomNode = document.querySelector('.excalidraw');
      const key = zoomNode && Object.keys(zoomNode).find(k => k.startsWith('__reactFiber$'));
      let fiber = key ? zoomNode[key] : null;
      let zoom = null;
      for (let n = 0; fiber && n < 60; n++) {
        const app = fiber.stateNode;
        if (app && typeof app === 'object' && app.scene && app.state) {
          zoom = app.state.zoom?.value;
          break;
        }
        fiber = fiber.return;
      }
      return {
        text: alert?.textContent ?? null,
        elementIds: read.elements?.map(element => element.id) ?? [],
        finiteZoom: Number.isFinite(zoom),
        hasNaNZoom: document.body.innerText.includes('%NaN%')
      };
    })()`),
		(state) => state?.text?.includes("helv (text): width, height"),
	);
	check(
		"malformed scratch startup shows an actionable visible board error",
		scratchFailure?.text?.includes("helv (text): width, height"),
		JSON.stringify(scratchFailure),
	);
	check(
		"  without sending malformed scratch geometry to Excalidraw",
		scratchFailure?.elementIds?.includes("helv") === false &&
			scratchFailure?.finiteZoom === true &&
			scratchFailure?.hasNaNZoom === false,
		JSON.stringify(scratchFailure),
	);
	check(
		"  or changing the malformed scratch note",
		fs.readFileSync(scratchFile, "utf8") === malformedScratchNote,
	);

	// The check repairs its own fixture after proving the application did not.
	// Reloading the now-valid note also proves the canvas remains usable after
	// the startup refusal.
	fs.writeFileSync(scratchFile, validScratchNote);
	const scratchPane = panes?.panes?.[0];
	const recoveredScratch = await api("POST", "/api/boards/open", {
		board: "scratch",
		reload: true,
		pane: scratchPane?.clientId,
	});
	check(
		"  and the usable canvas can reload corrected scratch bytes",
		recoveredScratch.status === 200,
		recoveredScratch.body?.error,
	);
	await evalInPage(`document.querySelector('.notice-dismiss')?.click()`);

	// --- malformed legacy note and visible recovery ------------------------

	const legacyRowReady = await waitFor(
		() =>
			evalInPage(
				`Boolean(document.querySelector('.board-group[aria-label="legacy-geometry"] .board-nav-row'))`,
			),
		Boolean,
	);
	const legacyOpenStarted = await evalInPage(`(() => {
    const row = document.querySelector('.board-group[aria-label="legacy-geometry"] .board-nav-row');
    if (!row) return false;
    row.click();
    return true;
  })()`);
	const legacyFailure = await waitFor(
		() =>
			evalInPage(`(() => {
      const alert = document.querySelector('[role="alert"]');
      if (!alert) return null;
      const node = document.querySelector('.excalidraw');
      const key = node && Object.keys(node).find(k => k.startsWith('__reactFiber$'));
      let fiber = key ? node[key] : null;
      let zoom = null;
      for (let n = 0; fiber && n < 60; n++) {
        const app = fiber.stateNode;
        if (app && typeof app === 'object' && app.scene && app.state) {
          zoom = app.state.zoom?.value;
          break;
        }
        fiber = fiber.return;
      }
      return {
        text: alert.textContent,
        zoom,
        finiteZoom: Number.isFinite(zoom),
        hasNaNZoom: document.body.innerText.includes('%NaN%')
      };
    })()`),
		(state) => state?.text?.includes("helv (text): width, height"),
	);
	check(
		"opening malformed legacy geometry through the board atlas shows the board error",
		legacyRowReady &&
			legacyOpenStarted &&
			legacyFailure?.text?.includes("helv (text): width, height"),
		JSON.stringify(legacyFailure),
	);
	check(
		"  while the existing canvas keeps a finite zoom and never shows %NaN%",
		legacyFailure?.finiteZoom === true && legacyFailure?.hasNaNZoom === false,
		JSON.stringify(legacyFailure),
	);
	check(
		"  and opening it did not rewrite the legacy note",
		fs.readFileSync(legacyFile, "utf8") === malformedLegacyNote,
	);

	fs.writeFileSync(legacyFile, validLegacyNote);
	const correctedOpenStarted = await evalInPage(`(() => {
    const row = document.querySelector('.board-group[aria-label="legacy-geometry"] .board-nav-row');
    if (!row) return false;
    row.click();
    return true;
  })()`);
	const correctedLegacy = await waitFor(
		() =>
			evalInPage(`(() => {
      const board = document.querySelector('.board-name')?.textContent.trim();
      const node = document.querySelector('.excalidraw');
      const key = node && Object.keys(node).find(k => k.startsWith('__reactFiber$'));
      let fiber = key ? node[key] : null;
      for (let n = 0; fiber && n < 60; n++) {
        const app = fiber.stateNode;
        if (app && typeof app === 'object' && app.scene && app.state) {
          const elements = app.scene.getElementsIncludingDeleted();
          return {
            board,
            rendered: elements.some(element => element.id === 'helv' && !element.isDeleted),
            zoom: app.state.zoom?.value,
            hasNaNZoom: document.body.innerText.includes('%NaN%')
          };
        }
        fiber = fiber.return;
      }
      return { board, rendered: false, zoom: null, hasNaNZoom: true };
    })()`),
		(state) => state?.board === "legacy-geometry" && state?.rendered,
	);
	const correctedPanes = await waitFor(
		async () => (await api("GET", "/api/panes")).body,
		(telemetry) =>
			telemetry?.panes?.[0]?.board === "legacy-geometry" &&
			telemetry?.panes?.[0]?.elementCount === 1,
		PANE_SETTLE_CAP_MS,
	);
	const correctedPane = correctedPanes?.panes?.[0];
	check(
		"after the note is corrected, the same board opens and renders",
		correctedOpenStarted &&
			correctedLegacy?.board === "legacy-geometry" &&
			correctedLegacy?.rendered === true,
		JSON.stringify(correctedLegacy),
	);
	check(
		"  with finite zoom and a finite registered viewport",
		finiteTelemetry(correctedLegacy?.zoom) &&
			correctedLegacy?.hasNaNZoom === false &&
			correctedPane?.board === "legacy-geometry" &&
			correctedPane?.elementCount === 1 &&
			Object.values(correctedPane.viewport ?? {}).every(finiteTelemetry),
		JSON.stringify({ correctedLegacy, pane: correctedPane }),
	);

	// The fonts have to be there before the board is, and this is the step that
	// makes sure of it.
	//
	// A page that has just loaded has no Excalifont and no Virgil, and measures
	// every string on Chrome's last-resort font. Whatever is measured then keeps
	// its widths: the font lands a moment later and nothing goes back over the
	// scene. That is what this check's first recorded baseline caught without
	// anybody noticing — `a standalone caption` came back 163.271484375 wide,
	// which is `20px serif`.
	//
	// The families are read off the note rather than assumed, so the gate keeps
	// meaning what it says when the converter's `fontFamily` constant changes.
	const written = (await api("GET", "/api/elements?board=fixedpoint")).body?.elements ?? [];
	const families = [
		...new Set(written.filter((e) => e.type === "text").map((e) => e.fontFamily ?? 1)),
	];
	await waitForFonts(families);

	const opened = await api("POST", "/api/boards/open", { board: "fixedpoint", reload: true });
	check(
		"  and the note is re-read into it, with the fonts already there",
		opened.status === 200 && opened.body?.source === "vault" && opened.body?.elementCount === 13,
		`${opened.body?.source} / ${opened.body?.elementCount} elements`,
	);

	// Pane telemetry has its own recovery path. Return to the exact rounded
	// rect and viewport that were already published. The retry can only leave
	// the page if the invalid branch forgot that key.
	const publishedPane = await waitFor(
		async () => (await api("GET", "/api/panes")).body?.panes?.[0] ?? null,
		(pane) => pane?.board === "fixedpoint" && pane?.elementCount === 13,
		PANE_SETTLE_CAP_MS,
	);
	const expectedPublishedGeometry = roundedGeometry(publishedPane);
	const telemetryProbeInstalled = await evalInPage(`(() => {
    const pane = document.querySelector('.pane-canvas');
    const expected = ${JSON.stringify(publishedPane)};
    const node = document.querySelector('.excalidraw');
    const key = node && Object.keys(node).find(k => k.startsWith('__reactFiber$'));
    let fiber = key ? node[key] : null;
    let app = null;
    for (let n = 0; fiber && n < 60; n++) {
      if (fiber.stateNode && typeof fiber.stateNode === 'object' && fiber.stateNode.scene && fiber.stateNode.state) {
        app = fiber.stateNode;
        break;
      }
      fiber = fiber.return;
    }
    if (!pane || !app || !expected?.rect || !expected?.viewport) return false;
    const nativeFetch = window.fetch.bind(window);
    window.__task117PanePosts = [];
    window.fetch = (...args) => {
      const [input, init] = args;
      const url = typeof input === 'string' ? input : input?.url ?? '';
      if (url.includes('/api/panes') && init?.method === 'POST') {
        window.__task117PanePosts.push(init.body);
      }
      return nativeFetch(...args);
    };
    window.__task117PaneRect = pane.getBoundingClientRect.bind(pane);
    window.__task117PaneExpected = expected;
    window.__task117Excalidraw = app;
    pane.getBoundingClientRect = () => ({
      ...window.__task117PaneRect(),
      left: expected.rect.x,
      top: expected.rect.y,
      width: Infinity,
      height: expected.rect.height
    });
    app.updateScene({ appState: {
      scrollX: -expected.viewport.x + 1,
      scrollY: -expected.viewport.y,
      zoom: { value: expected.viewport.zoom }
    }});
    return true;
  })()`);
	// The invalid report is due after PANE_DEBOUNCE_MS. One third of the
	// debounce is the documented scheduling margin for a slow frame.
	await sleep(PANE_SUPPRESSION_WAIT_MS);
	const suppressedTelemetry = await evalInPage(`window.__task117PanePosts ?? []`);
	check(
		"the pane suppresses its own non-finite telemetry before JSON can turn it into null",
		telemetryProbeInstalled && suppressedTelemetry.length === 0,
		JSON.stringify(suppressedTelemetry),
	);

	const telemetryRestored = await evalInPage(`(() => {
    const pane = document.querySelector('.pane-canvas');
    const expected = window.__task117PaneExpected;
    const app = window.__task117Excalidraw;
    if (!pane || !app || !expected) return false;
    pane.getBoundingClientRect = () => ({
      ...window.__task117PaneRect(),
      left: expected.rect.x,
      top: expected.rect.y,
      width: expected.rect.width,
      height: expected.rect.height
    });
    window.__task117PanePosts = [];
    app.updateScene({ appState: {
      scrollX: -expected.viewport.x,
      scrollY: -expected.viewport.y,
      zoom: { value: expected.viewport.zoom }
    }});
    return true;
  })()`);
	const recoveredTelemetry = await waitFor(
		() =>
			evalInPage(`(() => {
    const bodies = (window.__task117PanePosts ?? []).map(body => JSON.parse(body));
    return bodies.at(-1) ?? null;
  })()`),
		(telemetry) => telemetry !== null,
		PANE_SETTLE_CAP_MS,
	);
	const recoveredOnServer = await waitFor(
		async () => (await api("GET", "/api/panes")).body?.panes?.[0] ?? null,
		(pane) =>
			pane?.at !== publishedPane?.at &&
			JSON.stringify(roundedGeometry(pane)) === JSON.stringify(expectedPublishedGeometry),
		PANE_SETTLE_CAP_MS,
	);
	const recoveredGeometry = roundedGeometry(recoveredTelemetry);
	const recoveredFinite =
		recoveredTelemetry &&
		[
			...Object.values(recoveredTelemetry.rect),
			...Object.values(recoveredTelemetry.viewport),
		].every((value) => typeof value === "number" && Number.isFinite(value));
	check(
		"  and republishes the exact previous finite rect and viewport after correction",
		telemetryRestored &&
			recoveredFinite === true &&
			JSON.stringify(recoveredGeometry) === JSON.stringify(expectedPublishedGeometry) &&
			recoveredOnServer?.at !== publishedPane?.at,
		JSON.stringify({ expectedPublishedGeometry, recoveredTelemetry, recoveredOnServer }),
	);

	const rendered = await sceneWhenStill();
	const held = (await api("GET", "/api/elements?board=fixedpoint")).body?.elements ?? [];
	check(
		"  and the browser is holding every element the server is",
		rendered.length === held.length,
		`server ${held.length}, browser ${rendered.length}`,
	);

	// And the scene was measured in that font, which the gate above cannot say
	// on its own: it asks what the page can measure *now*, while a scene
	// measured before the fonts arrived keeps its fallback widths for good.
	// This is the assertion that fails if the double open is ever taken out.
	const AUTHSERVICE = { "1@16": 90.5442, "5@20": 114.4999 };
	const label = rendered.find((e) => e.type === "text" && e.text === "AuthService");
	const wanted = AUTHSERVICE[`${label?.fontFamily}@${label?.fontSize}`];
	check(
		"  and measured the scene in it, rather than keeping fallback widths",
		wanted !== undefined && Math.abs(label.width - wanted) < 0.05,
		wanted === undefined
			? `no Chrome width is recorded for "AuthService" at fontFamily ${label?.fontFamily} size ${label?.fontSize}`
			: `"AuthService" rendered ${label.width} wide, and Chrome measures ${wanted}`,
	);

	// --- what the render changed --------------------------------------------

	const measured = whatMoved(held, rendered);
	report(measured);

	const { news, gone } = against(measured.moved, BASELINE);
	const changedCount = Object.keys(measured.moved).length;
	const baselineCount = Object.keys(BASELINE).length;

	check(
		baselineCount === 0
			? `the board is a fixed point: none of its ${held.length} elements came back changed`
			: `the recorded baseline is ${baselineCount} of ${held.length} elements changed`,
		changedCount === baselineCount,
		`this run changed ${changedCount}`,
	);
	check(
		"  and the fields that moved are the ones the baseline names",
		news.length === 0 && gone.length === 0,
		[
			news.length ? `newly moving: ${news.join(", ")}` : "",
			gone.length ? `no longer moving: ${gone.join(", ")}` : "",
		]
			.filter(Boolean)
			.join("; "),
	);

	// --- proof that a zero is real ------------------------------------------
	//
	// This check reports zero now, and a read-back that had quietly stopped
	// working would report the same zero. So before believing one, plant
	// something Excalidraw must correct and watch the diff catch it.
	// scripts/check-hot-reload.mjs breaks a reload on purpose for the same
	// reason.
	//
	// A duplicated `index`, because that is the only thing Excalidraw was ever
	// measured correcting. A wrong *width* used to be the plant here and it is
	// no good: Excalidraw does not re-measure a text element it is handed, which
	// is a finding of this stage and the reason the widths in a note have to be
	// right rather than merely close.

	const first = held.find((e) => e.id === "rect1");
	const wrong = { ...held.find((e) => e.id === "text1"), index: first.index };
	await api("POST", "/api/elements/changes?board=fixedpoint", {
		upserts: [wrong],
		deletes: [],
		clientId: "check-fixed-point",
	});
	const afterPlant = await sceneWhenStill();
	const planted = whatMoved(
		(await api("GET", "/api/elements?board=fixedpoint")).body?.elements ?? [],
		afterPlant,
	);
	check(
		"an index Excalidraw must repair is reported, so the zero above is real",
		(planted.moved["text1"] ?? []).includes("index"),
		`text1 moved: ${(planted.moved["text1"] ?? ["nothing"]).join(", ")}`,
	);

	// --- the shell is a workspace, not a strip of controls ------------------

	const desktopShell = await evalInPage(`(() => {
    const nav = document.querySelector('.board-nav');
    const pane = document.querySelector('.pane');
    const canvas = document.querySelector('.canvas-zone');
    const rail = document.querySelector('.agent-rail');
    const workspace = document.querySelector('.workspace');
    const actions = [...document.querySelectorAll('.bar-actions .btn')];
    const current = document.querySelector('.board-nav-row[aria-current="page"]');
    if (!nav || !pane || !canvas || !rail || !workspace || !current) return null;
    const navRect = nav.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const railRect = rail.getBoundingClientRect();
    return {
      navLeftOfCanvas: navRect.right <= canvasRect.left + 0.5,
      railRightOfCanvas: railRect.left >= canvasRect.right - 0.5,
      columnsAlign: Math.abs(navRect.top - canvasRect.top) < 1 &&
        Math.abs(navRect.bottom - canvasRect.bottom) < 1 &&
        Math.abs(railRect.top - canvasRect.top) < 1,
      actionHeights: actions.map(button => button.getBoundingClientRect().height),
      currentBoard: current.textContent.trim(),
      workspaceWidth: workspace.getBoundingClientRect().width
    };
  })()`);
	check(
		"the desktop shell aligns the board atlas, canvas and activity rail",
		desktopShell?.navLeftOfCanvas === true &&
			desktopShell?.railRightOfCanvas === true &&
			desktopShell?.columnsAlign === true,
		JSON.stringify(desktopShell),
	);
	check(
		"  and its primary actions have touch-sized targets",
		desktopShell?.actionHeights?.length >= 5 &&
			desktopShell.actionHeights.every((height) => height >= 43.5),
		JSON.stringify(desktopShell),
	);
	check(
		"  and identifies the board currently on screen",
		desktopShell?.currentBoard?.includes("Current") === true,
		JSON.stringify(desktopShell),
	);

	// --- the doing presentation fits a narrow pane --------------------------

	await browser(["set", "viewport", "420", "700"]);
	const activity = [
		"marking the unverified regional database boundary",
		"shortening labels and removing arrow crossings",
		"fitting dense labels inside their boxes",
		"replacing the four stale bound labels with current names",
		"recentering the shortened bound labels",
	];
	for (const [index, doing] of activity.entries()) {
		const wrote = await api(
			"POST",
			`/api/elements?board=fixedpoint&doing=${encodeURIComponent(doing)}`,
			{
				id: `activity-${index}`,
				type: "rectangle",
				x: 900 + index * 20,
				y: 500,
				width: 10,
				height: 10,
			},
		);
		check(
			`activity line ${index + 1} lands`,
			wrote.status === 200 || wrote.status === 201,
			`status ${wrote.status}`,
		);
	}

	const doingLayout = await waitFor(
		() =>
			evalInPage(`(() => {
      const rail = document.querySelector('.agent-rail');
      const panel = document.querySelector('.pane-doing');
      const lines = [...document.querySelectorAll('.pane-doing-line')];
      const canvas = document.querySelector('.canvas-zone');
      if (!rail || !panel || !canvas || lines.length !== 5) return null;
      const railRect = rail.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const timestamps = [...document.querySelectorAll('.pane-doing-when')]
        .map(node => node.getBoundingClientRect().left);
      return {
        lineCount: lines.length,
        linesFit: lines.every(line => line.scrollWidth <= line.clientWidth),
        panelFits: panelRect.left >= railRect.left && panelRect.right <= railRect.right &&
          panelRect.bottom <= railRect.bottom,
        canvasClear: railRect.top >= canvas.getBoundingClientRect().bottom - 0.5,
        timestampsAlign: timestamps.every(left => Math.abs(left - timestamps[0]) < 0.5),
        widths: lines.map(line => [line.clientWidth, line.scrollWidth])
      };
    })()`),
		Boolean,
	);
	check(
		"the five latest activity lines render in the pane",
		doingLayout?.lineCount === 5,
		JSON.stringify(doingLayout),
	);
	check(
		"  with every line fully readable instead of clipped at the right edge",
		doingLayout?.linesFit === true &&
			doingLayout?.panelFits === true &&
			doingLayout?.canvasClear === true,
		JSON.stringify(doingLayout),
	);
	check(
		"  and their timestamps stay in one column",
		doingLayout?.timestampsAlign === true,
		JSON.stringify(doingLayout),
	);

	const narrowShell = await evalInPage(`(() => {
    const nav = document.querySelector('.board-nav');
    const pane = document.querySelector('.pane');
    const bar = document.querySelector('.bar');
    const canvas = document.querySelector('.canvas-zone');
    const rail = document.querySelector('.agent-rail');
    const actions = [...document.querySelectorAll('.bar-actions .btn')];
    if (!nav || !pane || !bar || !canvas || !rail) return null;
    const navRect = nav.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    return {
      navAboveCanvas: navRect.bottom < paneRect.top,
      railBelowCanvas: rail.getBoundingClientRect().top >= canvas.getBoundingClientRect().bottom - 0.5,
      fitsViewport: [navRect, paneRect, barRect, rail.getBoundingClientRect()].every(rect =>
        rect.left >= -0.5 && rect.right <= innerWidth + 0.5),
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      actionHeights: actions.map(button => button.getBoundingClientRect().height)
    };
  })()`);
	check(
		"at 420px the board navigator becomes a strip above the canvas",
		narrowShell?.navAboveCanvas === true && narrowShell?.railBelowCanvas === true,
		JSON.stringify(narrowShell),
	);
	check(
		"  without horizontal page overflow or undersized actions",
		narrowShell?.fitsViewport === true &&
			narrowShell?.pageWidth === narrowShell?.viewportWidth &&
			narrowShell?.actionHeights?.every((height) => height >= 43.5),
		JSON.stringify(narrowShell),
	);

	const switchStarted = await evalInPage(`(() => {
    const scratch = document.querySelector('.board-group[aria-label="scratch"]');
    const row = scratch?.querySelector('.board-nav-row');
    if (!row) return false;
    row.click();
    return true;
  })()`);
	const switchedToScratch = await waitFor(
		() => evalInPage(`document.querySelector('.board-name')?.textContent.trim() === 'scratch'`),
		Boolean,
	);
	check(
		"a board in the navigator opens directly into the focused pane",
		switchStarted && switchedToScratch,
	);

	const switchedBack = await evalInPage(`(() => {
    const fixedpoint = document.querySelector('.board-group[aria-label="fixedpoint"]');
    const row = fixedpoint?.querySelector('.board-nav-row');
    if (!row) return false;
    row.click();
    return true;
  })()`);
	check("  and the original board remains one click away", switchedBack === true);

	// --- what is ignored is stated, and is what the pane actually drops ------

	check(
		"what the diff ignores is the server bookkeeping the pane strips, and nothing else",
		["createdAt", "updatedAt", "version", "syncedAt", "source", "syncTimestamp"].every((field) =>
			ignored.has(field),
		),
		IGNORED.join(", "),
	);
	const stripped =
		fs
			.readFileSync(path.join(repoRoot, "src/ui/canvas/elements.ts"), "utf-8")
			.match(/cleanElementForExcalidraw[\s\S]*?const\s*\{([^}]*)\}\s*=\s*element/)?.[1] ?? "";
	const declared = stripped
		.split(",")
		.map((s) => s.trim().split(":")[0].trim())
		.filter((s) => /^[a-zA-Z]+$/.test(s));
	check(
		"  and the pane has not started stripping something else since",
		declared.length > 0 && declared.every((field) => ignored.has(field)),
		`the pane strips ${declared.join(", ")}`,
	);
} catch (error) {
	failures += 1;
	console.log(`FAIL - ${error.message}`);
} finally {
	await browser(["close"]).catch(() => {});
	server.kill("SIGTERM");
	await sleep(200);
	fs.rmSync(vault, { recursive: true, force: true });
	fs.rmSync(socketDir, { recursive: true, force: true });
}

if (failures > 0) {
	console.error(`\nfixed-point: ${failures} check(s) failed.`);
	if (serverStderr.trim()) console.error(serverStderr.trim().split("\n").slice(-10).join("\n"));
	process.exit(1);
}
console.log(
	"\nfixed-point: all checks passed. What we write is a document Excalidraw does not change.",
);

#!/usr/bin/env bun
//
// Somebody types into a text element Excalidraw named, and every character
// they type is still there afterwards (TASK-098).
//
// WHAT THIS EXISTS FOR. Renaming an element is the most dangerous act in the
// system, and `src/runtime/engine/ids.ts` says why: a text element's block id is its
// element id, the Obsidian plugin's parser reads exactly eight characters
// (`/\s\^(.{8})[\n]+/`), so a longer id has to be renamed on the way into a
// note — and under ADR 0015 the note is the board, so that rename is what comes
// back to the pane. Measured with an editor open on the element: the textarea
// stays on screen, stays focused, keeps every character, and submits into an
// element the scene no longer holds. The characters go nowhere, with no error
// and nothing on screen to say so.
//
// TASK-069 took that away for every id archboard mints. It could not take it
// away for the ids Excalidraw mints, which are 21 characters and belong to
// whatever a person draws. `check-live-session` types 42 times and never once
// meets this, because its `retype` targets the bound text of an agent-created
// container, which already answers to eight characters. It proves typing
// survives a write. Only this file proves typing survives a rename, and it does
// it by making the rename happen.
//
// WHAT IT MEASURED BEFORE THE FIX, on this build, in this browser:
//
//   a user-drawn text     typed "hello", waited, typed " world"   -> "hello"
//   a user-added label    typed "ABCDE", waited, typed "FGHIJ"    -> ""
//
// Six characters and then all ten, discarded silently. Both are reproduced
// below and both now come back whole.
//
// THE TWO HALVES OF THE FIX, AND THE TWO ASSERTIONS THAT HOLD THEM UP.
// The element under an editor is withheld from the change report, so the server
// never sees a name it would want to change; and the moment the editor is gone
// the pane renames it itself, through the same `derivedId` the server would
// have used. Withholding is what the surviving characters prove. The pane
// renaming rather than the server is what the last check proves: no text id the
// pane ever posts is one the note writer would rename, so no answer this pane
// gets back can carry a rename at all.
//
// A REAL BROWSER, AND REAL INPUT. Excalidraw mints the id, so Excalidraw has to
// be the one creating the element: nothing this file could put in a scene would
// be the case under test. Synthetic pointer events do not reach Excalidraw's
// handlers (`check-fixed-point.mjs` measured that), so the user input here is the
// text tool, a mouse click, a double-click and real keystrokes.

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withDoing } from "./lib/doing.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => path.join(repoRoot, "src", p);
const skipBuild = process.argv.includes("--skip-build");

const { REPORT_IDLE_SETTLE_MS } = await import(src("core/timing.ts"));
const { isBlockId } = await import(src("core/ids.ts"));
// Long enough that the pane's debounce has fired and its answer has come back,
// which covers the delay during which the rename used to arrive.
const AFTER_A_WRITE_MS = REPORT_IDLE_SETTLE_MS + 1600;

let failures = 0;
const check = (label, cond, extra = "") => {
	if (!cond) failures += 1;
	console.log(`${cond ? "ok  " : "FAIL"} - ${label}${extra ? ` (${extra})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------

const which = spawnSync("agent-browser", ["--version"], { stdio: "ignore" });
if (which.error) {
	console.error("typed-text: agent-browser is not on PATH, so nothing can mint an id for us.");
	console.error("  A socket cannot stand in here: the element under test is one Excalidraw named.");
	process.exit(2);
}

const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-"));
const browserEnv = { ...process.env, AGENT_BROWSER_SOCKET_DIR: socketDir };

const sessionId = (() => {
	const asked = spawnSync(
		"agent-browser",
		["session", "id", "--scope", "worktree", "--prefix", "archboard-typed"],
		{ encoding: "utf-8", env: browserEnv },
	);
	return asked.stdout.trim() || `archboard-typed-${Math.random().toString(36).slice(2, 10)}`;
})();

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

const evalInPage = async (js) => {
	const out = await browser(["eval", "--stdin"], js);
	try {
		return JSON.parse(out);
	} catch {
		throw new Error(`the page did not answer with JSON: ${out.trim().slice(0, 300)}`);
	}
};

// The live Excalidraw instance, found by walking the fiber up from the canvas
// node — the same door `check-live-session.mjs` goes through, and for the same
// reason: the frontend exposes no handle, and `editingTextElement` is the one
// fact this whole file turns on.
const APP = `(() => {
  const node = document.querySelector('.excalidraw');
  const key = node && Object.keys(node).find(k => k.startsWith('__reactFiber$'));
  let fiber = key ? node[key] : null;
  for (let i = 0; fiber && i < 60; i++) {
    const app = fiber.stateNode;
    if (app && typeof app === 'object' && app.scene
        && typeof app.scene.getElementsIncludingDeleted === 'function') return app;
    fiber = fiber.return;
  }
  return null;
})()`;

/** What the pane is holding, plus who has an editor open on what. */
const paneNow = () =>
	evalInPage(`(() => {
  const app = ${APP};
  if (!app) return { error: 'no Excalidraw app instance' };
  return {
    editing: app.state.editingTextElement ? app.state.editingTextElement.id : null,
    typing: document.querySelector('textarea.excalidraw-wysiwyg')
      ? document.querySelector('textarea.excalidraw-wysiwyg').value : null,
    elements: app.scene.getElementsIncludingDeleted()
      .filter(element => !element.isDeleted)
      .map(element => ({
        id: element.id, type: element.type, text: element.text ?? null,
        containerId: element.containerId ?? null,
        boundElements: (element.boundElements ?? []).map(bound => bound.id)
      }))
  };
})()`);

// Every id this pane has ever posted, and what kind of element it was.
//
// This is the check on the second half of the fix and it needs no timing: the
// pane is supposed to have settled a foreign text id *before* the report goes
// out, so a text id the note writer would rename must never appear on the wire
// at all. A shape's id is not renamed by anybody and is expected to be a 21
// character nanoid, so what is recorded is the type as well as the id.
const RECORD_POSTED = `(() => {
  if (window.__abPosted) return { already: true };
  window.__abPosted = { upserts: [], reports: 0 };
  const original = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || (input && input.method) || 'GET';
    if (method === 'POST' && url.includes('/api/elements/changes')) {
      window.__abPosted.reports += 1;
      try {
        const body = JSON.parse((init && init.body) || '{}');
        for (const element of body.upserts || []) {
          window.__abPosted.upserts.push({ id: element.id, type: element.type });
        }
      } catch { /* a body we cannot read is a body with no ids in it */ }
    }
    return original.apply(this, arguments);
  };
  return { installed: true };
})()`;

const posted = () => evalInPage("(() => ({ ...window.__abPosted }))()");

/**
 * One edit to an element that is not the one being typed into, made the way
 * `check-live-session` makes them: through the live instance's own
 * `updateScene`, so the pane's `onChange` fires and the report goes out.
 *
 * It is here to force a write while an editor is open. Without it the standalone
 * case produces no report at all — the only element that changed is withheld —
 * and a check that asserted survival across a write nobody made would be
 * asserting nothing.
 */
const nudge = (id) =>
	evalInPage(`(() => {
  const app = ${APP};
  if (!app) return { error: 'no Excalidraw app instance' };
  const all = app.scene.getElementsIncludingDeleted().map(e => ({ ...e }));
  if (!all.some(e => e.id === ${JSON.stringify(id)})) return { error: 'no ' + ${JSON.stringify(id)} };
  app.updateScene({
    elements: all.map(e => e.id === ${JSON.stringify(id)} ? { ...e, x: e.x + 13 } : e),
    captureUpdate: 'IMMEDIATELY'
  });
  return { ok: true };
})()`);

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------

const newestUnder = (dir) => {
	let newest = 0;
	const walk = (at) => {
		for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			const full = path.join(at, entry.name);
			if (entry.isDirectory()) walk(full);
			else newest = Math.max(newest, fs.statSync(full).mtimeMs);
		}
	};
	walk(dir);
	return newest;
};

const bundle = path.join(repoRoot, "dist/frontend/index.html");
const builtAt = fs.existsSync(bundle) ? fs.statSync(bundle).mtimeMs : 0;
const sourcedAt = Math.max(
	newestUnder(path.join(repoRoot, "frontend")),
	newestUnder(path.join(repoRoot, "src")),
);

if (!skipBuild && sourcedAt > builtAt) {
	console.log("# building the frontend (a source is newer than dist/frontend)");
	const built = spawnSync(process.execPath, ["run", "build"], { cwd: repoRoot, encoding: "utf-8" });
	if (built.status !== 0) {
		console.error("typed-text: the frontend would not build.");
		console.error((built.stderr || built.stdout || "").split("\n").slice(-20).join("\n"));
		process.exit(2);
	}
} else if (!skipBuild) {
	console.log("# dist/frontend is newer than every source, so it is what this renders");
}
if (!fs.existsSync(bundle)) {
	console.error("typed-text: no dist/frontend to serve. Run `bun run build`.");
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
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-typed-"));

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
	url = withDoing(url, method, "checking that typing survives a rename");
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

const BOARD = "typed";
const held = async () => (await api("GET", `/api/elements?board=${BOARD}`)).body?.elements ?? [];
const heldById = async () => new Map((await held()).map((element) => [element.id, element]));

try {
	for (let i = 0; i < 100; i++) {
		try {
			const r = await fetch(`${base}/health`);
			if (r.ok) break;
		} catch {
			/* not up yet */
		}
		await sleep(100);
	}

	await api("POST", "/api/boards/new", { board: BOARD, level: "service" });
	await api("POST", `/api/elements/changes?board=${BOARD}`, {
		origin: "agent",
		upserts: [
			// Filled, so a double-click in the middle of it is a double-click on it
			// (TASK-009), and unlabelled, because the label is what the user adds.
			{
				id: "auth",
				type: "rectangle",
				x: 100,
				y: 100,
				width: 220,
				height: 90,
				backgroundColor: "#ffffff",
				fillStyle: "solid",
			},
			{
				id: "other",
				type: "rectangle",
				x: 100,
				y: 400,
				width: 160,
				height: 70,
				backgroundColor: "#ffffff",
				fillStyle: "solid",
			},
		],
	});
	await api("POST", "/api/boards/save", { board: BOARD });

	await browser(["open", base]);
	let panes = null;
	for (let i = 0; i < 100; i++) {
		panes = (await api("GET", "/api/panes")).body;
		if (panes?.paneCount >= 1) break;
		await sleep(100);
	}
	check(
		"a real browser opens the canvas and registers a pane",
		panes?.paneCount === 1,
		`session ${sessionId}, paneCount ${panes?.paneCount ?? "none"}`,
	);

	// Headless is a requirement of the machine this runs on, not a preference: a
	// window that maps takes focus under Hyprland, and this file types.
	const ua = await evalInPage("navigator.userAgent");
	check("  without mapping a window, because a window would steal focus", /headless/i.test(ua), ua);

	const opened = await api("POST", "/api/boards/open", { board: BOARD, reload: true });
	check(
		"  and the board is read into it from the vault",
		opened.status === 200 && opened.body?.elementCount === 2,
		`${opened.body?.source} / ${opened.body?.elementCount} elements`,
	);

	await evalInPage(RECORD_POSTED);
	// A pane nobody has touched never reports (useCanvasSession), so the user's
	// half of this does not exist until a user edit changes the scene.
	await browser(["click", ".excalidraw"]);
	await sleep(500);

	const canvasBox = await evalInPage(`(() => {
    const rect = document.querySelector('.excalidraw').getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  })()`);

	// ── a text element drawn by the user ────────────────────────────────────

	await browser(["press", "t"]);
	const tool = await evalInPage(
		`(() => { const app = ${APP}; return { tool: app.state.activeTool.type }; })()`,
	);
	check(
		"the text tool is up, so the next click draws a text element",
		tool.tool === "text",
		JSON.stringify(tool),
	);

	const drawAt = {
		x: Math.round(canvasBox.x + canvasBox.width * 0.62),
		y: Math.round(canvasBox.y + canvasBox.height * 0.72),
	};
	await browser(["mouse", "move", String(drawAt.x), String(drawAt.y)]);
	await browser(["mouse", "down"]);
	await browser(["mouse", "up"]);
	await sleep(400);

	const born = await paneNow();
	const drawnId = born.editing;
	check(
		"a click on empty canvas opens an editor on an element Excalidraw named",
		typeof drawnId === "string" && born.typing === "",
		JSON.stringify({ editing: drawnId, typing: born.typing }),
	);
	check(
		"  and that name is one the note writer would have to change",
		typeof drawnId === "string" && !isBlockId(drawnId),
		`${drawnId} is ${drawnId?.length} characters`,
	);

	await browser(["keyboard", "type", "hello"]);
	await sleep(200);
	// The write this has to survive. Nothing but the withheld element has
	// changed, so without a second edit the pane would report nothing at all and
	// there would be no rename to survive.
	const nudged = await nudge("other");
	check(
		"  a second element is moved, so a write goes out while the editor is open",
		nudged.ok === true,
		JSON.stringify(nudged),
	);
	await sleep(AFTER_A_WRITE_MS);

	const midEdit = await paneNow();
	const boardMid = await heldById();
	const postedMid = await posted();
	check(
		"  the write landed, so the server round trip under test occurred",
		postedMid.reports > 0 && boardMid.get("other") !== undefined,
		`${postedMid.reports} reports, other ${boardMid.get("other") ? "on the board" : "missing"}`,
	);
	check(
		"  the editor is still open on the element it was opened on",
		midEdit.editing === drawnId && midEdit.typing === "hello",
		JSON.stringify({ editing: midEdit.editing, typing: midEdit.typing }),
	);
	check(
		"  the pane still holds it under the name Excalidraw gave it",
		midEdit.elements.some((element) => element.id === drawnId),
		midEdit.elements
			.filter((e) => e.type === "text")
			.map((e) => e.id)
			.join(", ") || "no text elements",
	);
	check(
		"  and the server has never been told about it, which is why nothing renamed it",
		boardMid.get(drawnId) === undefined &&
			!midEdit.elements.some((e) => e.type === "text" && e.id !== drawnId),
		`board holds ${[...boardMid.keys()].join(", ")}`,
	);

	await browser(["keyboard", "type", " world"]);
	await sleep(200);
	await browser(["press", "Escape"]);
	await sleep(AFTER_A_WRITE_MS);

	const afterDrawn = await paneNow();
	const boardDrawn = await heldById();
	const drawnText = [...boardDrawn.values()].find((element) => element.type === "text");
	check(
		"every character typed into a user-drawn text element is on the board",
		drawnText?.text === "hello world",
		drawnText ? JSON.stringify(drawnText.text) : "there is no text element on the board",
	);
	check("  under a name the note writer keeps", isBlockId(drawnText?.id), String(drawnText?.id));
	check(
		"  and the pane reads the same element the same way",
		afterDrawn.elements.some((e) => e.id === drawnText?.id && e.text === "hello world"),
		afterDrawn.elements
			.filter((e) => e.type === "text")
			.map((e) => `${e.id} ${JSON.stringify(e.text)}`)
			.join(" | "),
	);

	// ── a label added by the user to a shape the agent drew ─────────────────
	//
	// The case TASK-069 measured, with the id the other way round: the container
	// is the server's and the label is Excalidraw's. A double-click on
	// `.excalidraw` lands in the middle of the canvas, so the box goes there.

	const centre = await evalInPage(`(() => {
    const app = ${APP};
    const state = app.state;
    return { x: state.width / 2 / state.zoom.value - state.scrollX,
             y: state.height / 2 / state.zoom.value - state.scrollY };
  })()`);
	await api("POST", `/api/elements/changes?board=${BOARD}`, {
		origin: "agent",
		upserts: [{ id: "auth", x: centre.x - 110, y: centre.y - 45 }],
	});
	await sleep(1200);

	await browser(["dblclick", ".excalidraw"]);
	await sleep(600);

	const labelBorn = await paneNow();
	const labelId = labelBorn.editing;
	check(
		"a double-click on a shape opens an editor on a label Excalidraw named",
		typeof labelId === "string" &&
			labelBorn.elements.some((e) => e.id === labelId && e.containerId === "auth"),
		JSON.stringify({ editing: labelId }),
	);
	check(
		"  and that name is one the note writer would have to change",
		typeof labelId === "string" && !isBlockId(labelId),
		`${labelId} is ${labelId?.length} characters`,
	);

	await browser(["keyboard", "type", "ABCDE"]);
	await sleep(AFTER_A_WRITE_MS);

	const labelMid = await paneNow();
	const boardLabelMid = await heldById();
	check(
		"  the container reached the server while the editor was open, so a write really happened",
		(boardLabelMid.get("auth")?.boundElements ?? []).some((bound) => bound.id === labelId),
		JSON.stringify(boardLabelMid.get("auth")?.boundElements),
	);
	check(
		"  the editor is still open on the label, holding what was typed",
		labelMid.editing === labelId && labelMid.typing === "ABCDE",
		JSON.stringify({ editing: labelMid.editing, typing: labelMid.typing }),
	);
	check(
		"  and the label itself is not on the server, so nothing has renamed it",
		boardLabelMid.get(labelId) === undefined,
		`board holds ${[...boardLabelMid.keys()].join(", ")}`,
	);

	await browser(["keyboard", "type", "FGHIJ"]);
	await sleep(200);
	await browser(["press", "Escape"]);
	await sleep(AFTER_A_WRITE_MS);

	const afterLabel = await paneNow();
	const boardLabel = await heldById();
	const label = [...boardLabel.values()].find((element) => element.containerId === "auth");
	check(
		"every character typed into a user-added label is on the board",
		label?.text === "ABCDEFGHIJ",
		label ? JSON.stringify(label.text) : "the container has no label",
	);
	check("  under a name the note writer keeps", isBlockId(label?.id), String(label?.id));
	check(
		"  with the container naming it, so the rename took the binding with it",
		(boardLabel.get("auth")?.boundElements ?? []).some((bound) => bound.id === label?.id),
		JSON.stringify(boardLabel.get("auth")?.boundElements),
	);
	check(
		"  and the pane agrees about both",
		afterLabel.elements.some((e) => e.id === label?.id && e.text === "ABCDEFGHIJ") &&
			afterLabel.elements.some((e) => e.id === "auth" && e.boundElements.includes(label?.id)),
		JSON.stringify(afterLabel.elements.find((e) => e.id === "auth")),
	);

	// ── the other half: nothing the pane says needs renaming ────────────────

	const wire = await posted();
	const renameable = (wire.upserts ?? []).filter(
		(element) => element.type === "text" && !isBlockId(element.id),
	);
	check(
		"no text id this pane ever posted is one the note writer would rename",
		renameable.length === 0,
		renameable.length === 0
			? `${wire.upserts.length} elements posted, ${wire.reports} reports`
			: renameable.map((element) => element.id).join(", "),
	);
	// The guard on the guard. A recorder that had quietly stopped working would
	// have nothing to rename either, so what is asserted is that it caught the
	// two reports in question: both elements went out under the settled name,
	// which is the name they would not have had if the pane had left the renaming
	// to the server.
	const names = new Set(
		(wire.upserts ?? []).filter((element) => element.type === "text").map((element) => element.id),
	);
	check(
		"  and it saw both of them go out, which is what makes that mean something",
		names.has(drawnText?.id) && names.has(label?.id),
		`text ids on the wire: ${[...names].join(", ") || "none"}`,
	);

	// ── and the note the board is ───────────────────────────────────────────

	const noteFile = (await api("GET", `/api/boards/info?board=${BOARD}`)).body?.file;
	const note = fs.readFileSync(noteFile, "utf-8");
	check(
		"the note carries both of them, under the ids the board holds",
		note.includes(`hello world ^${drawnText?.id}`) && note.includes(`ABCDEFGHIJ ^${label?.id}`),
		note.split("# Excalidraw Data")[1]?.split("%%")[0]?.trim().slice(0, 200),
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
	console.error(`\ntyped-text: ${failures} check(s) failed.`);
	if (serverStderr.trim()) console.error(serverStderr.trim().split("\n").slice(-10).join("\n"));
	process.exit(1);
}
console.log(
	"\ntyped-text: all checks passed. A user-drawn text and a user-added label were " +
		"typed into across a write each, renamed, and kept every character.",
);

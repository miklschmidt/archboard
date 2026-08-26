#!/usr/bin/env bun
//
// A proposal goes beside the current architecture, not on top of it (TASK-049).
//
// This is the second half of the failure scripts/check-branch-compare.mjs
// covers the first half of. Driving archboard by voice, the model redrew a
// variant instead of branching it, which is the other check. It also kept
// re-targeting the first pane, so every step of the proposal overwrote the
// board the human was reading.
//
// The whole cold-read trace runs here, through the CLI, in the order the skill
// teaches it:
//
//   board new payments --level service
//   library list --text
//   add / promote / board save
//   board save --board payments --variant option-a      nothing moves
//   pane open --board payments@option-a                 a NEW pane
//   add / promote / board save on the branch
//   screenshot --pane right
//   compare payments payments@option-a
//
// The assertion the report is about is the last one: at the end of all that,
// `payments` is still on screen, in the pane it started in, and that pane was
// never sent another board after the one it was given. Everything before it is
// the trace that has to hold for that assertion to mean anything.
//
// Two commands could put the branch on screen and only one of them is safe.
// `pane open --board <key>` always makes a pane and cannot be aimed at an
// existing one. `board open <key>` points a pane that already exists, and with
// one pane on screen it needs no `--pane`, so it succeeds and takes the source
// off screen. The last section runs that one too, because a check that only
// shows the right path does not say what the wrong one costs.
//
// What this cannot check is whether an agent reading the skill *reaches* for
// `pane open`. That needs a model, so it stays eval 7 in
// skills/archboard/evals/evals.json. This file checks the consequence;
// the eval checks the choice.
//
// A pane is a socket plus a registration, so the panes here are WebSockets
// standing in for browser tabs, the way scripts/check-boards.mjs does it. No
// browser, no pixels, and `pane open` still has something to answer it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { withDoing } from "./lib/doing.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => path.join(repoRoot, "src", p);
const SELF = "scripts/check-side-by-side.mjs";

let failures = 0;
const check = (label, cond, extra = "") => {
	if (!cond) failures += 1;
	console.log(`${cond ? "ok  " : "FAIL"} - ${label}${extra ? ` (${extra})` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || 37000 + Math.floor(Math.random() * 2000));
const base = `http://127.0.0.1:${PORT}`;
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-sidebyside-"));
const shots = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-shots-"));

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
	url = withDoing(url, method, "checking a proposal beside its source");
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

/**
 * One CLI command, run the way the skill writes it.
 *
 * The CLI is the surface the eval grades, and it is not a thin wrapper here:
 * `pane open --board <key>` is two server calls stitched together in
 * canvas-client, and stitching them the other way round is exactly the bug.
 * So this drives src/bin.ts rather than the routes underneath it.
 */
const cli = (args, stdin) =>
	new Promise((resolve) => {
		// The global `--doing`, on every invocation (TASK-095).
		const said = args.includes("--doing")
			? args
			: [...args, "--doing", "checking a proposal beside its source"];
		const child = spawn(process.execPath, [src("bin.ts"), ...said], {
			env: {
				...process.env,
				EXPRESS_SERVER_URL: base,
				EXCALIDRAW_NO_AUTOSTART: "1",
				ARCHBOARD_VAULT: vault,
				LOG_LEVEL: "error",
			},
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.stdin.end(stdin ?? "");
		child.on("exit", (code) => {
			let json = null;
			try {
				json = JSON.parse(stdout);
			} catch {
				/* --text output, or a failure */
			}
			resolve({ code, stdout, stderr, json });
		});
	});

// ---------------------------------------------------------------------------
// The shell, in miniature
// ---------------------------------------------------------------------------
//
// Same standin as check-boards.mjs: a socket answers `pane_open` by mounting
// another socket, which is what the browser does minus the pixels. A picture
// is answered too, because `screenshot` blocks until a tab hands one back.

const shell = { panes: [] };
let paneSerial = 0;

async function openPane(clientId, x, { primary = false, focused = false } = {}) {
	const socket = new WebSocket(`ws://127.0.0.1:${PORT}/?clientId=${clientId}`);
	const seen = [];
	let pane;
	socket.on("message", (data) => {
		const message = JSON.parse(data.toString());
		seen.push(message);
		if (message.type === "pane_open") void shellOpen();
		else if (message.type === "pane_close") void shellClose(pane);
		else if (message.type === "set_viewport") {
			void api("POST", "/api/viewport/result", { requestId: message.requestId, success: true });
		} else if (message.type === "export_image_request") {
			void api("POST", "/api/export/image/result", {
				requestId: message.requestId,
				format: message.format ?? "png",
				data: "aGk=",
			});
		} else if (message.type === "board_switched") {
			// A browser adopts the board it was switched to and re-registers under
			// it. Doing that here is what makes `panes` report the truth.
			void pane?.adopt(message.board);
		}
	});
	await new Promise((resolve, reject) => {
		socket.once("open", resolve);
		socket.once("error", reject);
	});
	await sleep(80);
	const registration = {
		clientId,
		paneId: clientId,
		primary,
		focused,
		elementCount: 0,
		rect: { x, y: 0, width: 640, height: 800 },
		viewport: { x: 0, y: 0, width: 640, height: 800, zoom: 1 },
	};
	const adopt = (key) => api("POST", "/api/panes", { ...registration, board: key });
	const board = () =>
		[...seen].toReversed().find((m) => m.type === "initial_elements" || m.type === "board_switched")
			?.board;
	await adopt(board());
	pane = { clientId, socket, seen, adopt, board, registration, since: () => seen.length };
	shell.panes.push(pane);
	return pane;
}

async function shellOpen() {
	return openPane(`p-shell-${++paneSerial}`, shell.panes.length * 640);
}

async function shellClose(pane) {
	shell.panes = shell.panes.filter((entry) => entry !== pane);
	pane.socket.close();
}

/** Where a board is showing right now, by the server's own report. */
async function paneShowing(boardKey) {
	const report = await api("GET", "/api/panes");
	return (report.body?.panes ?? []).find((entry) => entry.board === boardKey) ?? null;
}

/** Draw a row of labelled boxes, arrow them together, and promote each one. */
async function drawRow(boardKey, boxes, variant) {
	const payload = boxes.map(([label], index) => ({
		type: "rectangle",
		x: index * 300,
		y: 100,
		width: 200,
		height: 100,
		label: { text: label },
	}));
	const added = await cli(["add", "--board", boardKey], JSON.stringify(payload));
	const ids = (added.json?.elements ?? []).map((el) => el.id);
	const arrows = ids.slice(1).map((id, index) => ({
		type: "arrow",
		x: 0,
		y: 0,
		width: 100,
		height: 0,
		start: { id: ids[index] },
		end: { id },
	}));
	await cli(["add", "--board", boardKey], JSON.stringify(arrows));
	for (const [index, [label, kind]] of boxes.entries()) {
		await cli([
			"promote",
			"--board",
			boardKey,
			"--ids",
			ids[index],
			"--kind",
			kind,
			"--name",
			label,
			"--variant",
			variant,
		]);
	}
	return { added, ids };
}

try {
	for (let i = 0; i < 100; i++) {
		try {
			await fetch(`${base}/health`);
			break;
		} catch {
			await sleep(100);
		}
	}

	// --- one pane, and the architecture that exists on it -------------------

	const source = await openPane("p-source", 0, { primary: true, focused: true });
	check("the canvas starts on one pane, holding scratch", source.board() === "scratch");

	const made = await cli(["board", "new", "payments", "--level", "service"]);
	await sleep(120);
	check(
		"`board new` puts the source board in the only pane on screen",
		made.code === 0 && made.json?.pane?.place === "the only pane",
		made.stderr.trim(),
	);
	check("  and the pane is holding it", source.board() === "payments", source.board());

	// Everything from here on is the work on the proposal, and none of it may
	// reach this pane. The one switch that is allowed is the one just above,
	// which is how the board got here in the first place.
	const settled = source.since();

	const palette = await cli(["library", "list", "--text"]);
	check(
		"the palette can be read before anything is drawn",
		palette.code === 0 && /stencil/i.test(palette.stdout),
		palette.stderr.trim(),
	);

	await drawRow(
		"payments",
		[
			["API Gateway", "gateway"],
			["Orders Service", "service"],
			["Orders Postgres", "datastore"],
		],
		"current",
	);
	const savedSource = await cli(["board", "save", "--board", "payments"]);
	check(
		"the source board saves as one note",
		savedSource.code === 0 && fs.existsSync(savedSource.json?.file ?? ""),
		savedSource.stderr.trim(),
	);
	// Distinct nodes, not stamped elements: promoting a labelled box stamps its
	// bound label too, and that label is on the board from the moment the box is
	// written (TASK-072).
	const promotedNodes = new Set(
		(await api("GET", "/api/elements?board=payments")).body?.elements
			?.map((el) => el.customData?.archboard?.node)
			.filter(Boolean),
	);
	check("  with its three nodes promoted", promotedNodes.size === 3, [...promotedNodes].join(", "));
	const sourceHeld = (await api("GET", "/api/elements?board=payments")).body?.count;

	// --- branching moves nothing (ADR 0012) --------------------------------

	const beforeBranch = source.since();
	const branched = await cli(["board", "save", "--board", "payments", "--variant", "option-a"]);
	await sleep(150);
	check(
		"branching writes the proposal as its own note",
		branched.code === 0 && branched.json?.board === "payments@option-a",
		branched.stderr.trim(),
	);
	check(
		"  and reports itself as a branch that moved no pane",
		branched.json?.saveKind === "branch" && branched.json?.panes?.moved?.length === 0,
		JSON.stringify(branched.json?.panes),
	);
	check(
		"  so the pane holding the source is still holding it",
		source.board() === "payments",
		source.board(),
	);
	check(
		"  and was sent nothing at all",
		source.seen.slice(beforeBranch).every((m) => m.type !== "board_switched"),
		JSON.stringify(source.seen.slice(beforeBranch).map((m) => m.type)),
	);

	// --- the branch goes in a pane of its own -------------------------------

	const beforeSplit = source.since();
	const beside = await cli(["pane", "open", "--board", "payments@option-a"]);
	await sleep(200);
	check(
		"`pane open --board <branch>` puts the proposal on screen",
		beside.code === 0 && beside.json?.board?.board === "payments@option-a",
		beside.stderr.trim(),
	);
	check(
		"  in a pane that did not exist a moment ago",
		beside.json?.paneCount === 2 && beside.json?.pane?.place === "right",
		JSON.stringify(beside.json?.pane),
	);
	check(
		"  and the CLI says the other pane was left alone",
		/other pane was not touched/i.test(beside.stderr),
		beside.stderr.trim(),
	);
	check(
		"  which it was: no board reached it",
		source.seen.slice(beforeSplit).every((m) => m.type !== "board_switched"),
		JSON.stringify(source.seen.slice(beforeSplit).map((m) => m.type)),
	);

	const branchPane = shell.panes.find((entry) => entry.clientId === beside.json?.pane?.clientId);
	check("  the new pane is a real registration, not a promise", Boolean(branchPane));
	await sleep(80);
	check(
		"  and it is the one holding the branch",
		branchPane?.board() === "payments@option-a",
		branchPane?.board(),
	);

	const sideBySide = await api("GET", "/api/panes");
	check(
		"the two boards are side by side, one each",
		sideBySide.body?.sameBoard === false &&
			sideBySide.body?.panes?.map((p) => p.board).join(",") === "payments,payments@option-a",
		JSON.stringify(sideBySide.body?.panes?.map((p) => p.board)),
	);

	// A third pane is not available, which is why `pane open` has to be the
	// command that makes the second one rather than a habit for every board.
	// No `--board` on this one: a refusal has to be a refusal, and a probe that
	// could put a board somewhere would repair the very state being checked.
	const third = await cli(["pane", "open"]);
	check(
		"a third pane is refused, so two is the whole screen",
		third.code !== 0,
		`exit ${third.code}`,
	);
	check(
		"  and both panes are still where they were",
		source.board() === "payments" && branchPane?.board() === "payments@option-a",
	);

	// --- the one change, drawn on the branch --------------------------------

	const beforeDrawing = source.since();
	const cacheAdd = await cli(
		["add", "--board", "payments@option-a"],
		JSON.stringify([
			{
				type: "rectangle",
				x: 300,
				y: 320,
				width: 200,
				height: 100,
				label: { text: "Orders Cache" },
			},
		]),
	);
	const cacheId = cacheAdd.json?.elements?.[0]?.id;
	const onBranch = (await api("GET", "/api/elements?board=payments@option-a")).body?.elements ?? [];
	const serviceOnBranch = onBranch.find(
		(el) => el.customData?.archboard?.node === "orders-service",
	);
	await cli([
		"promote",
		"--board",
		"payments@option-a",
		"--ids",
		cacheId,
		"--kind",
		"datastore",
		"--name",
		"Orders Cache",
		"--variant",
		"option-a",
	]);
	await api("POST", "/api/elements?board=payments@option-a", {
		type: "arrow",
		x: 0,
		y: 0,
		width: 100,
		height: 0,
		start: { id: serviceOnBranch.id },
		end: { id: cacheId },
	});
	const savedBranch = await cli(["board", "save", "--board", "payments@option-a"]);
	check(
		"the proposal saves to its own note",
		savedBranch.code === 0 && savedBranch.json?.file !== savedSource.json?.file,
		savedBranch.stderr.trim(),
	);
	const sourceStillHolds = (await api("GET", "/api/elements?board=payments")).body?.count;
	check(
		"  and drawing on it wrote nothing to the source board",
		sourceStillHolds === sourceHeld,
		`payments held ${sourceHeld}, now holds ${sourceStillHolds}`,
	);
	check(
		"  and moved nothing on screen",
		source.seen.slice(beforeDrawing).every((m) => m.type !== "board_switched") &&
			source.board() === "payments",
	);

	// --- looking at what was drawn ------------------------------------------

	const beforePicture = source.since();
	const branchBeforePicture = branchPane.since();
	const shot = path.join(shots, "proposal.png");
	const picture = await cli(["screenshot", "--pane", "right", "--out", shot]);
	check(
		"`screenshot --pane right` photographs the proposal",
		picture.code === 0 && fs.existsSync(shot),
		picture.stderr.trim(),
	);
	check(
		"  by asking the pane holding it",
		branchPane.seen.slice(branchBeforePicture).some((m) => m.type === "export_image_request"),
	);
	check(
		"  and not the pane holding the source",
		source.seen.slice(beforePicture).every((m) => m.type !== "export_image_request"),
	);

	const diff = await cli(["compare", "payments", "payments@option-a"]);
	check(
		"`compare` reads the two boards as one architecture and one change",
		diff.code === 0 &&
			diff.json?.summary?.comparable === true &&
			diff.json?.summary?.sharedNodes === 3 &&
			diff.json?.summary?.nodesAdded === 1 &&
			diff.json?.summary?.nodesRemoved === 0,
		JSON.stringify(diff.json?.summary),
	);
	check(
		"  naming the cache as the thing that was added",
		diff.json?.nodes?.added?.length === 1 && diff.json?.nodes?.added?.[0]?.node === "orders-cache",
	);

	// --- the assertion the whole trace exists for ---------------------------
	//
	// Everything above is one session of work on a proposal. The report that
	// started this said the architecture the human was reading did not survive
	// it. Here it has to.

	const stillThere = await paneShowing("payments");
	check(
		"THE SOURCE BOARD IS STILL ON SCREEN at the end of the whole trace",
		Boolean(stillThere),
		JSON.stringify((await api("GET", "/api/panes")).body?.panes?.map((p) => p.board)),
	);
	check(
		"  in the pane it started in, not one it was shuffled into",
		stillThere?.paneId === "p-source" && stillThere?.place === "left",
		`${stillThere?.paneId} at ${stillThere?.place}`,
	);
	check(
		"  never having been switched, once, across any of the work on the proposal",
		source.seen.slice(settled).every((m) => m.type !== "board_switched"),
		JSON.stringify(source.seen.slice(settled).map((m) => m.type)),
	);
	check(
		"  and it is the board it always was, not the branch under its name",
		(await api("GET", "/api/elements?board=payments")).body?.elements?.every(
			(el) => (el.customData?.archboard?.variant ?? "current") === "current",
		),
	);

	// --- and what the other command costs ------------------------------------
	//
	// `board open` is the command that points a pane that already exists, and it
	// is not wrong. It is wrong here, and with one pane on screen nothing stops
	// it: no `--pane` is needed, so the source goes off screen without anybody
	// being asked. That is the behaviour the report described, reproduced.

	await cli(["pane", "close", "right"]);
	await sleep(250);
	check(
		"back to one pane, holding the source",
		(await api("GET", "/api/panes")).body?.paneCount === 1 && source.board() === "payments",
		source.board(),
	);

	const overwritten = await cli(["board", "open", "payments@option-a"]);
	await sleep(200);
	check(
		"with one pane, `board open <branch>` is accepted without naming a pane",
		overwritten.code === 0 && overwritten.json?.pane?.place === "the only pane",
		overwritten.stderr.trim(),
	);
	check(
		"  and it re-points the pane the human was reading",
		source.seen.some((m) => m.type === "board_switched" && m.board === "payments@option-a"),
	);
	check(
		"  so the source is off the screen, which is the failure this eval is about",
		(await paneShowing("payments")) === null,
		JSON.stringify((await api("GET", "/api/panes")).body?.panes?.map((p) => p.board)),
	);
	check(
		"  though the board itself is unharmed, just not showing",
		(await api("GET", "/api/elements?board=payments")).body?.count > 0,
	);

	// --- the half a script cannot check -------------------------------------
	//
	// Which of those two commands an agent reaches for is a choice, so it is an
	// eval, and the eval file has to say that this script is the objective half
	// of it. Otherwise the split is a thing somebody remembered once.

	const evalsPath = path.join(repoRoot, "skills/archboard/evals/evals.json");
	const evals = JSON.parse(fs.readFileSync(evalsPath, "utf-8")).evals ?? [];
	const mine = evals.find((e) => e.graded_by === SELF);
	check(
		"an eval names this check as its grader",
		Boolean(mine),
		evals.map((e) => `#${e.id} ${e.graded_by}`).join(", "),
	);
	check(
		"  and it is the one about putting a proposal beside its source",
		/pane open/.test(mine?.expected_output ?? ""),
	);
	check(
		"  and it says what happens if the agent reuses the pane instead",
		/FAILS if/.test(mine?.expected_output ?? ""),
	);
} finally {
	for (const pane of shell.panes) pane.socket.close();
	await sleep(100);
	server.kill("SIGTERM");
	await sleep(200);
	fs.rmSync(vault, { recursive: true, force: true });
	fs.rmSync(shots, { recursive: true, force: true });
}

if (failures > 0) {
	console.error(`\nside-by-side: ${failures} check(s) failed.`);
	if (serverStderr.trim()) console.error(serverStderr.trim().split("\n").slice(-10).join("\n"));
	process.exit(1);
}
console.log("\nside-by-side: all checks passed.");

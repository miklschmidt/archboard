#!/usr/bin/env bun

// Human-only responsiveness on a deliberately large board (TASK-118).
//
// The pre-fix probe attributed the periodic missed frame to the ordinary
// change-report response: a roughly 500-byte drag returned and reconciled a
// 5.7 MB whole document. The note fsyncs happen synchronously in the server
// process, but they did not line up with the browser pause. This retained gate
// keeps the structural cause measurable: every normal acknowledgement is
// compact, a no-correction acknowledgement causes no scene replacement, and
// trusted drag, resize, and typing continue locally while persistence is held
// in flight. Timing is diagnostic and relative to this run's own frame median;
// machine-specific milliseconds are not an acceptance threshold.

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { withDoing } from "./lib/doing.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (file) => path.join(repoRoot, "src", file);
const skipBuild = process.argv.includes("--skip-build");
const { REPORT_PROGRESS_MS, REPORT_IDLE_SETTLE_MS } = await import(src("core/timing.ts"));
const FIXTURE_SIZE = 10_000;
const RESPONSE_DELAY_MS = REPORT_PROGRESS_MS + 300;

let failures = 0;
const check = (label, condition, detail = "") => {
	if (!condition) failures += 1;
	console.log(`${condition ? "ok  " : "FAIL"} - ${label}${detail ? ` (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browserAvailable = spawnSync("agent-browser", ["--version"], { stdio: "ignore" });
if (browserAvailable.error) {
	console.error(
		"human-performance: agent-browser is not on PATH, so trusted input cannot be _measured.",
	);
	process.exit(2);
}
if (spawnSync("strace", ["--version"], { stdio: "ignore" }).status !== 0) {
	console.error("human-performance: strace is required to count durability fsyncs.");
	process.exit(2);
}

const newestUnder = (dir) => {
	let newest = 0;
	const walk = (current) => {
		for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
			if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
			const full = path.join(current, entry.name);
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
		console.error("human-performance: the frontend would not build.");
		console.error((built.stderr || built.stdout || "").split("\n").slice(-20).join("\n"));
		process.exit(2);
	}
}
if (!fs.existsSync(bundle)) {
	console.error("human-performance: no dist/frontend to serve. Run `bun run build`.");
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

const socketDir = fs.mkdtempSync(path.join(os.tmpdir(), "ab-"));
const browserEnv = { ...process.env, AGENT_BROWSER_SOCKET_DIR: socketDir };
const sessionId = (() => {
	const answer = spawnSync(
		"agent-browser",
		["session", "id", "--scope", "worktree", "--prefix", "archboard-human-perf"],
		{ encoding: "utf-8", env: browserEnv },
	);
	return answer.stdout.trim() || `archboard-human-perf-${Math.random().toString(36).slice(2, 9)}`;
})();
const browser = (args, stdin) =>
	new Promise((resolve, reject) => {
		const child = spawn("agent-browser", ["--session", sessionId, ...args], {
			stdio: ["pipe", "pipe", "pipe"],
			env: browserEnv,
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
		child.on("exit", (code) =>
			code === 0
				? resolve(stdout)
				: reject(new Error(`agent-browser ${args[0]} failed: ${(stderr || stdout).trim()}`)),
		);
	});
const evalInPage = async (source) => JSON.parse(await browser(["eval", "--stdin"], source));

const APP = `(() => {
  const node = document.querySelector('.excalidraw');
  const key = node && Object.keys(node).find(candidate => candidate.startsWith('__reactFiber$'));
  let fiber = key ? node[key] : null;
  for (let depth = 0; fiber && depth < 60; depth++) {
    const app = fiber.stateNode;
    if (app && typeof app === 'object' && app.scene
        && typeof app.scene.getElementsIncludingDeleted === 'function') return app;
    fiber = fiber.return;
  }
  return null;
})()`;

const installProbe = `(() => {
  const app = ${APP};
  if (!app) return { error: 'no Excalidraw app instance' };
  const perf = window.__abHumanPerf = {
    holds: 0, releases: 0, reports: 0, agentWrites: 0, inflight: 0,
    bodyBytes: [], reportStarts: [], responses: [], frames: [], replacements: 0,
    nextResponseDelay: null
  };
  let lastFrame = performance.now();
  const frame = now => {
    perf.frames.push({ at: now, gap: now - lastFrame });
    if (perf.frames.length > 2000) perf.frames.shift();
    lastFrame = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  const replace = app.scene.replaceAllElements.bind(app.scene);
  app.scene.replaceAllElements = function (elements) {
    perf.replacements += 1;
    return replace(elements);
  };
  const original = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || (input && input.method) || 'GET';
    if (method === 'POST' && url.includes('/api/boards/hold/release')) perf.releases += 1;
    else if (method === 'POST' && url.includes('/api/boards/hold')) perf.holds += 1;
    if (method !== 'POST' || !url.includes('/api/elements/changes')) {
      return original.apply(this, arguments);
    }
    perf.reports += 1;
    perf.inflight += 1;
    const startedAt = performance.now();
    perf.reportStarts.push(startedAt);
    const responseDelay = perf.nextResponseDelay ?? ${RESPONSE_DELAY_MS};
    perf.nextResponseDelay = null;
    const body = String((init && init.body) || '');
    perf.bodyBytes.push(body.length);
    let requestFullReport = false;
    try {
      const parsed = JSON.parse(body);
      if (parsed.origin === 'agent') perf.agentWrites += 1;
      requestFullReport = parsed.fullReport === true;
    } catch { }
    const response = await original.apply(this, arguments);
    const text = await response.clone().text();
    const parseStarted = performance.now();
    const answer = JSON.parse(text);
    const parseMs = performance.now() - parseStarted;
    const corrections = (answer.corrections?.upserts?.length || 0) +
      (answer.corrections?.deletes?.length || 0);
    const correctionSample = (answer.corrections?.upserts || []).find(element => /^f/.test(element.id));
    const visibleSample = correctionSample
      ? app.scene.getElementsIncludingDeleted().find(element => element.id === correctionSample.id)
      : null;
    const correctionDiff = correctionSample && visibleSample
      ? [...new Set([...Object.keys(correctionSample), ...Object.keys(visibleSample)])]
        .filter(key => JSON.stringify(correctionSample[key]) !== JSON.stringify(visibleSample[key]))
        .slice(0, 12).map(key => [key, visibleSample[key], correctionSample[key]])
      : [];
    const record = {
      startedAt,
      requestFullReport,
      bytes: text.length,
      parseMs,
      hasDocument: Object.prototype.hasOwnProperty.call(answer, 'document'),
      corrections,
      correctionUpserts: answer.corrections?.upserts?.length || 0,
      correctionDeletes: answer.corrections?.deletes?.length || 0,
      correctionIds: (answer.corrections?.upserts || []).slice(0, 4).map(element => element.id),
      correctionDiff,
      returnedAt: 0,
      replacementsAtReturn: 0,
      replacementsAfter: null
    };
    perf.responses.push(record);
    await new Promise(resolve => setTimeout(resolve, responseDelay));
    record.returnedAt = performance.now();
    record.replacementsAtReturn = perf.replacements;
    setTimeout(() => { record.replacementsAfter = perf.replacements - record.replacementsAtReturn; }, 120);
    perf.inflight -= 1;
    return response;
  };
  return { installed: true };
})()`;

const pageState = () =>
	evalInPage(`(() => {
  const app = ${APP};
  const perf = window.__abHumanPerf;
  return {
    perf,
    editing: app?.state.editingTextElement?.id ?? null,
    typing: document.querySelector('textarea.excalidraw-wysiwyg')?.value ?? null,
    elements: app?.scene.getElementsIncludingDeleted().filter(element => !element.isDeleted)
      .filter(element => ['drag', 'resize', 'typing'].includes(element.id))
      .map(element => ({ id: element.id, x: element.x, y: element.y,
        width: element.width, height: element.height })) ?? []
  };
})()`);

const port = Number(process.env.PORT) || (await freePort());
const base = `http://127.0.0.1:${port}`;
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-human-perf-"));
const traceFile = path.join(vault, "fsync.trace");
const tracedServer = spawn(
	"strace",
	["-f", "-e", "trace=fsync", "-o", traceFile, process.execPath, src("server.ts")],
	{
		cwd: repoRoot,
		detached: true,
		env: {
			...process.env,
			PORT: String(port),
			HOST: "127.0.0.1",
			ARCHBOARD_VAULT: vault,
			LOG_LEVEL: "error",
		},
		stdio: ["ignore", "ignore", "pipe"],
	},
);
let serverStderr = "";
tracedServer.stderr.on("data", (chunk) => {
	serverStderr += chunk.toString();
});

const api = async (method, url, body) => {
	const routed = withDoing(url, method, "checking human editing performance");
	const response = await fetch(`${base}${routed}`, {
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
const fsyncCount = () =>
	fs.existsSync(traceFile)
		? fs
				.readFileSync(traceFile, "utf-8")
				.split("\n")
				.filter((line) => /fsync\(/.test(line)).length
		: 0;
const frameElement = async (id) => {
	const response = await api("POST", "/api/viewport", {
		scrollToElementIds: [id],
		viewportZoomFactor: 0.5,
	});
	if (response.status !== 200)
		throw new Error(`cannot frame ${id}: ${response.status} ${response.body?.error ?? ""}`);
	await sleep(650);
	return response;
};
const pointOf = (id, edge = false) =>
	evalInPage(`(() => {
  const app = ${APP};
  const element = app.scene.getElementsIncludingDeleted().find(candidate => candidate.id === ${JSON.stringify(id)});
  if (!element) return { error: 'missing ${id}' };
  const zoom = app.state.zoom?.value ?? 1;
  const x = element.x + (${edge ? "true" : "false"} ? element.width : element.width / 2);
  const y = element.y + (${edge ? "true" : "false"} ? element.height : element.height / 2);
  return { x: Math.round((x + app.state.scrollX) * zoom + app.state.offsetLeft),
    y: Math.round((y + app.state.scrollY) * zoom + app.state.offsetTop) };
})()`);
const dragFrom = async (point, dx, dy) => {
	if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.y < 0) {
		throw new Error(`cannot drive pointer from ${JSON.stringify(point)}`);
	}
	await browser(["mouse", "move", String(point.x), String(point.y)]);
	await browser(["mouse", "down"]);
	for (let step = 1; step <= 4; step++) {
		await browser([
			"mouse",
			"move",
			String(Math.round(point.x + (dx * step) / 4)),
			String(Math.round(point.y + (dy * step) / 4)),
		]);
	}
	await browser(["mouse", "up"]);
};

try {
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			if ((await fetch(`${base}/health`)).ok) break;
		} catch {}
		await sleep(100);
	}

	await api("POST", "/api/boards/new", { board: "performance", level: "service" });
	const upserts = [
		{
			id: "drag",
			type: "rectangle",
			x: 0,
			y: 0,
			width: 180,
			height: 90,
			backgroundColor: "#ffffff",
			fillStyle: "solid",
		},
		{
			id: "resize",
			type: "rectangle",
			x: 260,
			y: 0,
			width: 180,
			height: 90,
			backgroundColor: "#ffffff",
			fillStyle: "solid",
		},
		{
			id: "typing",
			type: "rectangle",
			x: 520,
			y: 0,
			width: 220,
			height: 100,
			backgroundColor: "#ffffff",
			fillStyle: "solid",
		},
	];
	for (let index = 3; index < FIXTURE_SIZE; index++) {
		upserts.push({
			id: `f${index.toString(36)}`,
			type: "rectangle",
			x: (index % 100) * 130,
			y: 300 + Math.floor(index / 100) * 90,
			width: 90,
			height: 50,
			backgroundColor: "#ffffff",
			fillStyle: "solid",
		});
	}
	const seeded = await api("POST", "/api/elements/changes?board=performance", {
		clientId: "fixture",
		upserts,
		deletes: [],
	});
	check(
		"a large board is seeded entirely through the human change-report route",
		seeded.status === 200 && seeded.body?.count === FIXTURE_SIZE,
		`${seeded.status} / ${seeded.body?.count ?? "no"} elements`,
	);
	await api("POST", "/api/boards/save", { board: "performance" });

	await browser(["open", base]);
	let panes = null;
	for (let attempt = 0; attempt < 120; attempt++) {
		panes = (await api("GET", "/api/panes")).body;
		if (panes?.paneCount === 1) break;
		await sleep(100);
	}
	const ua = await evalInPage("navigator.userAgent");
	check(
		"a real headless browser owns the _measured pane",
		panes?.paneCount === 1 && /headless/i.test(ua),
		`${panes?.paneCount ?? 0} pane / ${ua}`,
	);
	const opened = await api("POST", "/api/boards/open", { board: "performance", reload: true });
	check(
		"the browser renders the complete fixed fixture",
		opened.body?.elementCount === FIXTURE_SIZE,
		`${opened.body?.elementCount ?? 0} elements`,
	);
	const fullDocumentBytes = JSON.stringify(
		(await api("GET", "/api/elements?board=performance")).body?.elements ?? [],
	).length;
	await evalInPage(installProbe);
	await sleep(300);
	const fsyncBefore = fsyncCount();

	// Drag once to start a report, then again while its response is deliberately
	// withheld from the client. Both movements are trusted pointer input.
	await frameElement("drag");
	const beforeDragState = await pageState();
	const dragBefore = beforeDragState.elements.find((element) => element.id === "drag");
	await evalInPage(
		`(() => { window.__abHumanPerf.nextResponseDelay = ${REPORT_PROGRESS_MS}; return true; })()`,
	);
	await dragFrom(await pointOf("drag"), 20, 0);
	let afterDragProgress = null;
	for (let attempt = 0; attempt < 50; attempt++) {
		afterDragProgress = await pageState();
		if (
			afterDragProgress.perf.reports === beforeDragState.perf.reports + 1 &&
			afterDragProgress.perf.inflight === 1
		)
			break;
		await sleep(50);
	}
	check(
		"the first trusted drag has observably started its progress report",
		afterDragProgress?.perf.reports === beforeDragState.perf.reports + 1 &&
			afterDragProgress?.perf.inflight === 1,
		`${afterDragProgress?.perf.reports - beforeDragState.perf.reports} report(s), ` +
			`inflight ${afterDragProgress?.perf.inflight}`,
	);
	const afterFirstDrag = afterDragProgress.elements.find((element) => element.id === "drag");
	const reportsBeforeIdle = afterDragProgress.perf.reports;
	const finalEditAt = await evalInPage("performance.now()");
	await browser(["press", "ArrowRight"]);
	const dragDuring = await pageState();
	const dragged = dragDuring.elements.find((element) => element.id === "drag");
	check(
		"trusted dragging remains local while a human report is in flight",
		dragDuring.perf.inflight === 1 && dragged.x > dragBefore.x + 10 && dragged.x > afterFirstDrag.x,
		`inflight ${dragDuring.perf.inflight}, x ${dragBefore.x} -> ${dragged?.x}`,
	);
	await sleep(REPORT_PROGRESS_MS + 100);
	const afterFinalProgress = (await pageState()).perf;
	check(
		"an isolated final dirty edit is not sent by the progress deadline",
		afterFinalProgress.reports === reportsBeforeIdle,
		`${afterFinalProgress.reports - reportsBeforeIdle} report(s)`,
	);
	await sleep(REPORT_IDLE_SETTLE_MS - REPORT_PROGRESS_MS + 150);
	const afterFinalIdle = (await pageState()).perf;
	const idleStart = afterFinalIdle.reportStarts.find((startedAt) => startedAt >= finalEditAt);
	const idleStartFloor = REPORT_IDLE_SETTLE_MS - REPORT_PROGRESS_MS / 4;
	check(
		"the trailing idle deadline starts one accepted final report",
		afterFinalIdle.reports === reportsBeforeIdle + 1 &&
			idleStart &&
			idleStart - finalEditAt >= idleStartFloor,
		`${afterFinalIdle.reports - reportsBeforeIdle} report(s), start ` +
			`${idleStart ? (idleStart - finalEditAt).toFixed(0) : "missing"} ms after edit`,
	);
	await sleep(RESPONSE_DELAY_MS + 300);
	const settledAfterIdle = (await pageState()).perf;
	check(
		"the accepted final idle report manufactures no no-op tail",
		settledAfterIdle.reports === afterFinalIdle.reports &&
			settledAfterIdle.responses.length === settledAfterIdle.reports &&
			settledAfterIdle.inflight === 0,
	);

	// Select and move the south-east resize handle twice, with the second move
	// occurring under the delayed acknowledgement from the first.
	await frameElement("resize");
	const resizeBefore = (await pageState()).elements.find((element) => element.id === "resize");
	await browser(["click", ".excalidraw"]);
	await dragFrom(await pointOf("resize", true), 24, 18);
	await sleep(REPORT_PROGRESS_MS + 120);
	await dragFrom(await pointOf("resize", true), 24, 18);
	const resizeDuring = await pageState();
	const resized = resizeDuring.elements.find((element) => element.id === "resize");
	check(
		"trusted resizing remains local while a human report is in flight",
		resizeDuring.perf.inflight === 1 && resized.width > resizeBefore.width + 10,
		`inflight ${resizeDuring.perf.inflight}, width ${resizeBefore.width} -> ${resized?.width}`,
	);
	await sleep(REPORT_IDLE_SETTLE_MS + RESPONSE_DELAY_MS * 2 + 500);

	// Open a real editor, start a report by changing another local element, and
	// continue typing with trusted keyboard input before that response returns.
	await frameElement("typing");
	await browser(["dblclick", ".excalidraw"]);
	await sleep(350);
	await browser(["keyboard", "type", "responsive"]);
	await evalInPage(`(() => {
    const app = ${APP};
    const all = app.scene.getElementsIncludingDeleted().map(element => ({ ...element }));
    app.updateScene({ elements: all.map(element => element.id === 'drag'
      ? { ...element, y: element.y + 7 } : element), captureUpdate: 'IMMEDIATELY' });
    return { nudged: true };
  })()`);
	await sleep(REPORT_PROGRESS_MS + 120);
	await browser(["keyboard", "type", " typing"]);
	const typingDuring = await pageState();
	check(
		"trusted typing remains local while a human report is in flight",
		typingDuring.perf.inflight === 1 && typingDuring.typing === "responsive typing",
		`inflight ${typingDuring.perf.inflight}, text ${JSON.stringify(typingDuring.typing)}`,
	);
	await browser(["press", "Escape"]);
	await sleep(REPORT_IDLE_SETTLE_MS + RESPONSE_DELAY_MS * 2 + 700);

	await pageState();
	await sleep(180);
	const finalProbe = (await pageState()).perf;
	const fsyncs = fsyncCount() - fsyncBefore;
	// Responses are deliberately overlapped. A correction next to an ordinary
	// acknowledgement can land inside that acknowledgement's 120 ms sample;
	// isolated ordinary responses have no legitimate replacement to observe.
	const isolatedNoCorrectionResponses = finalProbe.responses.filter(
		(response, index, responses) =>
			response.corrections === 0 &&
			response.replacementsAfter !== null &&
			!(responses[index - 1]?.corrections > 0) &&
			!(responses[index + 1]?.corrections > 0),
	);
	check(
		"ordinary human acknowledgements are compact and never carry the full document",
		finalProbe.responses.length >= 3 &&
			finalProbe.responses.every((response) => !response.hasDocument) &&
			Math.max(...finalProbe.responses.map((response) => response.bytes)) * 20 < fullDocumentBytes,
		`${finalProbe.responses.length} responses, max ${Math.max(...finalProbe.responses.map((r) => r.bytes))} B ` +
			`against ${fullDocumentBytes} B document`,
	);
	check(
		"a no-correction acknowledgement performs no full-scene reconciliation",
		isolatedNoCorrectionResponses.length > 0 &&
			isolatedNoCorrectionResponses.every((response) => response.replacementsAfter === 0),
		JSON.stringify(isolatedNoCorrectionResponses.map((response) => response.replacementsAfter)),
	);
	check(
		"the _measured window contains human reports and no agent-origin write",
		finalProbe.reports >= 3 && finalProbe.agentWrites === 0,
		`${finalProbe.reports} reports / ${finalProbe.agentWrites} agent writes`,
	);
	check(
		"one in-flight plus one latest queued report keeps request counts bounded",
		finalProbe.reports <= 8 &&
			finalProbe.holds <= finalProbe.reports + 3 &&
			finalProbe.releases <= finalProbe.holds,
		`${finalProbe.holds} holds, ${finalProbe.reports} reports, ${finalProbe.releases} releases`,
	);
	check(
		"the durability evidence stays proportional to accepted human reports",
		fsyncs >= finalProbe.reports * 2 && fsyncs <= finalProbe.reports * 4 + 2,
		`${fsyncs} fsyncs for ${finalProbe.reports} reports`,
	);

	const gaps = finalProbe.frames
		.map((frame) => frame.gap)
		.filter((gap) => gap > 0)
		.toSorted((a, b) => a - b);
	const median = gaps[Math.floor(gaps.length / 2)] || 1;
	const reportGaps = finalProbe.responses.flatMap((response) =>
		finalProbe.frames
			.filter((frame) => Math.abs(frame.at - response.returnedAt) <= median * 8)
			.map((frame) => frame.gap),
	);
	const worstReportGap = Math.max(0, ...reportGaps);
	check(
		"report completion has no disproportionate main-thread frame gap",
		reportGaps.length > 0 && worstReportGap <= median * 8,
		`median ${median.toFixed(1)} ms, worst report-correlated ${worstReportGap.toFixed(1)} ms`,
	);

	console.log(
		`# _measured: bodies ${finalProbe.bodyBytes.join("/")} B; responses ` +
			`${finalProbe.responses.map((response) => response.bytes).join("/")} B; ` +
			`shapes ${finalProbe.responses
				.map((response) =>
					response.hasDocument
						? `document(full:${response.requestFullReport})`
						: `corrections:${response.correctionUpserts}+/${response.correctionDeletes}-` +
							`[${response.correctionIds.join(",")}](full:${response.requestFullReport})`,
				)
				.join("/")}; ` +
			`sample ${JSON.stringify(finalProbe.responses.find((response) => response.correctionDiff.length)?.correctionDiff ?? [])}; ` +
			`JSON ${finalProbe.responses.map((response) => response.parseMs.toFixed(2)).join("/")} ms; ` +
			`${fsyncs} fsyncs; frame median ${median.toFixed(1)} ms`,
	);
} catch (error) {
	failures += 1;
	console.log(`FAIL - ${error.message}`);
} finally {
	await browser(["close"]).catch(() => {});
	try {
		process.kill(-tracedServer.pid, "SIGTERM");
	} catch {}
	await sleep(250);
	fs.rmSync(vault, { recursive: true, force: true });
	fs.rmSync(socketDir, { recursive: true, force: true });
}

if (failures > 0) {
	console.error(`\nhuman-performance: ${failures} check(s) failed.`);
	if (serverStderr.trim()) console.error(serverStderr.trim().split("\n").slice(-12).join("\n"));
	process.exit(1);
}
console.log(
	"\nhuman-performance: all checks passed. The 10,000-element human-only board stayed locally " +
		"responsive and ordinary acknowledgements did not return or reconcile the full document.",
);

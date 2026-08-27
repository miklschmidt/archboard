#!/usr/bin/env bun

// Public CLI contract check. Every child runs the package's declared bin from
// a directory outside the checkout, while a tiny HTTP double records the wire
// contract. Command inventory always comes from the production declarations.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const declaredBin = pkg.bin?.archboard;
if (typeof declaredBin !== "string") throw new Error("package.json must declare bin.archboard");
const bin = resolve(repoRoot, declaredBin);
const argvGolden = JSON.parse(
	readFileSync(
		join(repoRoot, "src", "cli", "command-contract", "tests", "argv-golden.json"),
		"utf8",
	),
);
const compatibility = JSON.parse(
	readFileSync(
		join(repoRoot, "src", "cli", "command-contract", "tests", "fixed-base-compatibility.json"),
		"utf8",
	),
);
const { cliSurface } = await import(join(repoRoot, "src", "cli", "commands", "run.ts"));
const { CANVAS_SERVICE_NAME } = await import(
	join(repoRoot, "src", "runtime", "engine", "canvas-client.ts")
);
const outside = mkdtempSync(join(tmpdir(), "archboard-cli-contract-"));
const compatibilityOnly = process.argv.includes("--compatibility-only");

let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
	checks += 1;
	if (condition) return;
	failures += 1;
	console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
}

function parseJson(label, value) {
	try {
		return JSON.parse(value);
	} catch (error) {
		check(label, false, `${error.message}: ${JSON.stringify(value)}`);
		return null;
	}
}

const fixedBaseGeneralHelp = (value) =>
	value
		.replace(/^  bridge\s+Mark or remove a verified connector crossing\n/m, "")
		.replace(/^  check\s+Inspect a persisted board for deterministic quality findings\n/m, "")
		.replace(/^               check only: 6 warnings, 7 errors, 8 indeterminate coverage\.\n/m, "");

let activeEvents = null;
let activeCompatibilityRecord = null;

function cli(args, { url, input, cwd = outside } = {}) {
	return new Promise((finish) => {
		const events = [];
		activeEvents = events;
		const child = spawn(bin, args, {
			cwd,
			env: {
				...process.env,
				EXCALIDRAW_NO_AUTOSTART: "1",
				...(url ? { EXPRESS_SERVER_URL: url } : {}),
			},
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
			events.push(`stdout:${chunk}`);
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
			events.push(`stderr:${chunk}`);
		});
		const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000);
		child.on("error", (error) => {
			clearTimeout(timeout);
			activeEvents = null;
			finish({ status: null, stdout, stderr: stderr + error.message, events });
		});
		child.on("close", (status, signal) => {
			clearTimeout(timeout);
			events.push(`exit:${status}`);
			activeEvents = null;
			finish({ status, signal, stdout, stderr, events });
		});
		child.stdin.end(input);
	});
}

function cliMerged(args, { url, cwd = outside } = {}) {
	return new Promise((finish) => {
		const events = [];
		activeEvents = events;
		const mergedPath = join(outside, `merged-${Date.now()}-${Math.random()}.log`);
		const descriptor = openSync(mergedPath, "w+");
		const child = spawn(bin, args, {
			cwd,
			env: {
				...process.env,
				EXCALIDRAW_NO_AUTOSTART: "1",
				...(url ? { EXPRESS_SERVER_URL: url } : {}),
			},
			stdio: ["ignore", descriptor, descriptor],
		});
		const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000);
		child.on("close", (status) => {
			clearTimeout(timeout);
			closeSync(descriptor);
			events.push(`exit:${status}`);
			activeEvents = null;
			finish({ status, merged: readFileSync(mergedPath, "utf8"), events });
		});
	});
}

const element = { id: "shape1", type: "rectangle", x: 0, y: 0, width: 100, height: 80 };
const document = [element];
const fingerprint = { elements: 1, note: "contract-note", version: 7 };
const bridgeFacts = {
	bridgeId: "Bridge01",
	overConnectorId: "over",
	underConnectorId: "under",
	overSegmentIndex: 0,
	underSegmentIndex: 0,
	crossing: { x: 50, y: 50 },
	background: "#ffffff",
};
const bridgeParts = ["mask", "redraw"].map((role, index) => ({
	id: index === 0 ? bridgeFacts.bridgeId : "Redraw01",
	type: "line",
	x: 44,
	y: 50,
	points: [
		[0, 0],
		[12, 0],
	],
	groupIds: [],
	startBinding: null,
	endBinding: null,
	customData: { archboard: { bridge: { ...bridgeFacts, role } } },
}));
const boardIdentity = {
	board: "contract",
	variant: "current",
	level: "system",
	displayName: "Contract",
};
const boardState = {
	board: "contract",
	identity: boardIdentity,
	elementCount: 1,
	version: 7,
	placeholder: false,
	file: "/vault/contract.excalidraw.md",
	savedAt: "2026-08-26T10:00:00.000Z",
	loadedAt: "2026-08-26T09:00:00.000Z",
};
const paneRef = {
	paneId: "pane-right",
	clientId: "client-right",
	place: "right",
	position: 2,
};
const injectionStatus = {
	enabled: true,
	armed: true,
	loud: false,
	refusal: null,
	host: "127.0.0.1",
	socket: {
		path: "/tmp/app-server.sock",
		exists: true,
		isSocket: true,
		ownedByUs: true,
		mode: "600",
	},
	connected: true,
	lastError: null,
	target: {
		threadId: "thread-fixture",
		reason: "pinned",
		explanation: "the fixture thread is pinned",
		activeTurnId: null,
	},
	threadsSeen: 1,
	pending: 0,
	debounceMs: 200,
	minIntervalMs: 500,
	injected: { quiet: 2, loud: 1, failed: 0 },
	lastInjectionAt: "2026-08-26T10:01:00.000Z",
	lastInjection: {
		channel: "quiet",
		threadId: "thread-fixture",
		at: "2026-08-26T10:01:00.000Z",
		text: "fixture change",
	},
};
const requests = [];
let browserClients = 1;

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(request) {
		const url = new URL(request.url);
		activeEvents?.push(`${request.method} ${url.pathname}`);
		if (url.pathname === "/health") {
			return Response.json({
				service: CANVAS_SERVICE_NAME,
				status: "ok",
				websocket_clients: browserClients,
			});
		}

		const text = request.method === "GET" ? "" : await request.text();
		let body = null;
		if (text) {
			try {
				body = JSON.parse(text);
			} catch {
				return Response.json({ success: false, error: "invalid JSON" }, { status: 400 });
			}
		}
		requests.push({ method: request.method, url, body });
		const held =
			url.searchParams.get("board") === "held"
				? { board: "held", message: "held board diagnostic", writes: 1 }
				: url.searchParams.get("board") === "invalid-held-read"
					? { board: 7, message: false }
					: undefined;
		if (request.method === "POST" && url.pathname === "/api/viewport") {
			return Response.json({ success: true, message: "Viewport updated" });
		}
		if (request.method === "GET" && url.pathname === "/api/boards/info") {
			if (activeCompatibilityRecord === "promote-binding-resolution-failure") {
				return Response.json(
					{ success: false, error: "unexpected /api/boards/info" },
					{ status: 404 },
				);
			}
			return Response.json({ success: true, ...boardState });
		}
		if (request.method === "POST" && url.pathname === "/api/boards/new") {
			return Response.json({
				success: true,
				...boardState,
				version: null,
				elementCount: 0,
				created: true,
				saved: false,
				pane: null,
			});
		}
		if (request.method === "POST" && url.pathname === "/api/boards/open") {
			return Response.json({
				success: true,
				...boardState,
				source: "vault",
				pane: body?.pane ? paneRef : null,
			});
		}
		if (request.method === "POST" && url.pathname === "/api/panes/open") {
			return Response.json({
				success: true,
				pane: paneRef,
				paneCount: 2,
				onScreen: [{ paneId: paneRef.paneId, place: paneRef.place, board: "contract" }],
			});
		}
		if (request.method === "GET" && url.pathname === "/api/injection") {
			return Response.json({ success: true, ...injectionStatus });
		}
		if (request.method === "POST" && url.pathname === "/api/injection/test") {
			return Response.json({
				success: true,
				channel: body?.loud ? "loud" : "quiet",
				threadId: "thread-fixture",
				text: "fixture injection text",
			});
		}
		if (request.method === "POST" && url.pathname === "/api/boards/save") {
			if (url.searchParams.get("board") === "false-success") {
				return Response.json({
					success: false,
					board: "false-success",
					identity: { board: "false-success", variant: "current" },
				});
			}
			const conflict = {
				board: "save-conflict",
				file: "/vault/save-conflict.excalidraw.md",
				reason: "changed",
				actualHash: "actual",
				versionMove: "ahead",
				outcomes: {
					reload: "board open save-conflict --reload",
					overwrite: "board save --force",
					saveAs: "board save --as save-conflict@from-canvas",
				},
				message: "Refusing fixed-base board save. Nothing was written.",
			};
			const malformedHeld = url.searchParams.get("board") === "invalid-held";
			return Response.json(
				{
					success: false,
					error: conflict.message,
					conflict,
					held: malformedHeld
						? { board: 9, message: false }
						: {
								board: "save-conflict",
								message: "held board diagnostic",
								writes: 0,
							},
				},
				{ status: 409 },
			);
		}

		if (request.method !== "GET" && !url.searchParams.get("doing")) {
			return Response.json(
				{ success: false, code: "DOING_REQUIRED", error: "doing required" },
				{ status: 400 },
			);
		}
		if (request.method === "PUT" && url.pathname === "/api/elements/refuse") {
			return Response.json(
				{
					success: false,
					code: "BOARD_VERSION_CONFLICT",
					error: "Refusing contract write",
					document,
					version: 7,
					versionConflict: { expected: 6, actual: 7 },
				},
				{ status: 409 },
			);
		}
		if (request.method === "GET" && url.pathname === "/api/elements") {
			return Response.json({ success: true, elements: document, ...(held ? { held } : {}) });
		}
		if (request.method === "GET" && url.pathname === "/api/elements/search") {
			const searched = url.searchParams.get("type") === "ellipse" ? [] : document;
			return Response.json({ success: true, elements: searched, ...(held ? { held } : {}) });
		}
		if (request.method === "GET" && url.pathname === "/api/files") {
			return Response.json({ success: true, files: {}, ...(held ? { held } : {}) });
		}
		if (request.method === "POST" && url.pathname === "/api/bridges") {
			const receiptOver =
				body?.over === "invalid-receipt" ? "wrong-over" : bridgeFacts.overConnectorId;
			return Response.json({
				success: true,
				board: "contract",
				bridgeId: bridgeFacts.bridgeId,
				overConnectorId: receiptOver,
				underConnectorId: bridgeFacts.underConnectorId,
				overSegmentIndex: bridgeFacts.overSegmentIndex,
				underSegmentIndex: bridgeFacts.underSegmentIndex,
				crossing: bridgeFacts.crossing,
				elements: bridgeParts,
				fingerprint,
			});
		}
		if (request.method === "DELETE" && url.pathname.startsWith("/api/bridges/")) {
			const requestedBridge = decodeURIComponent(url.pathname.slice("/api/bridges/".length));
			return Response.json({
				success: true,
				board: "contract",
				bridgeId: requestedBridge,
				deleted: ["Bridge01", "Redraw01"],
				elements: [],
				fingerprint,
			});
		}

		const askedForDocument = url.searchParams.get("document") === "1" || body?.document === true;
		const answer = {
			success: true,
			board: "contract",
			element,
			elements: document,
			created: url.pathname.endsWith("/batch") ? 1 : 0,
			updated: request.method === "PUT" ? 1 : 0,
			deleted: url.pathname.endsWith("/changes") ? 1 : 0,
			count: 1,
			fingerprint,
			...(held ? { held } : {}),
			...(askedForDocument ? { document } : {}),
		};
		if (url.pathname.startsWith("/api/elements")) return Response.json(answer);
		return Response.json({ success: false, error: `unexpected ${url.pathname}` }, { status: 404 });
	},
});

const canvasUrl = `http://127.0.0.1:${server.port}`;
const closedUrl = "http://127.0.0.1:1";

function writesSince(offset) {
	return requests
		.slice(offset)
		.filter((request) => request.method !== "GET" && request.url.pathname.startsWith("/api/"));
}

async function expectSuccessfulJson(label, args) {
	const before = requests.length;
	const result = await cli(args, { url: canvasUrl });
	check(`${label} exits normally`, result.status === 0, String(result.status));
	check(`${label} keeps stderr clean`, result.stderr === "", result.stderr.trim());
	const answer = parseJson(`${label} emits one JSON answer`, result.stdout);
	return { answer, writes: writesSince(before) };
}

function normalized(value, record, runtime) {
	let result = value;
	for (const rule of record.normalizations) {
		result = result.replaceAll(runtime[rule.value], rule.token);
	}
	return result;
}

function expandArgv(record, runtime) {
	return record.argv.map((token) =>
		token.replaceAll("{{SKILL_ROOT}}", join(runtime.outside, "compat-skills")),
	);
}

function heldStateOf(stdout) {
	try {
		const result = JSON.parse(stdout);
		return result && typeof result === "object" && "held" in result ? result.held : null;
	} catch {
		return null;
	}
}

function localEffectsOf(record, result, requestEffects, runtime) {
	if (
		record.name === "board-list-here-failure" &&
		result.stderr.startsWith("Standing in github.com/miklschmidt/archboard.\n")
	) {
		return ["repository-identity-resolved"];
	}
	if (record.name === "promote-binding-resolution-failure") {
		return requestEffects.includes("GET /api/boards/info") &&
			!requestEffects.some((effect) => effect.startsWith("POST "))
			? ["binding-resolution-failed"]
			: [];
	}
	if (record.name === "install-skill-late-failure") {
		const installed = join(runtime.outside, "compat-skills", "archboard");
		return !existsSync(join(installed, "old.txt")) &&
			existsSync(join(installed, "SKILL.md")) &&
			!existsSync("/proc/AGENTS.md")
			? ["existing-skill-replaced", "repository-doc-not-written"]
			: [];
	}
	return [];
}

async function exerciseCompatibilityRecord(record) {
	let foreign;
	activeCompatibilityRecord = record.name;
	const runtime = { outside, closedUrl, canvasUrl };
	let options = { url: canvasUrl };
	if (record.fixture === "closed-server") options = { url: closedUrl };
	if (record.fixture === "mock-server-repo-cwd") options = { url: canvasUrl, cwd: repoRoot };
	if (record.fixture === "existing-skill-proc-repo") options = {};
	if (record.fixture === "foreign-server") {
		foreign = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch() {
				activeEvents?.push("GET /health");
				return Response.json({ service: "somebody-else", status: "ok" });
			},
		});
		runtime.foreignUrl = `http://127.0.0.1:${foreign.port}`;
		options = { url: runtime.foreignUrl };
	}
	const argv = expandArgv(record, runtime);
	const prepare = () => {
		if (record.fixture !== "existing-skill-proc-repo") return;
		const skillRoot = join(outside, "compat-skills");
		rmSync(skillRoot, { recursive: true, force: true });
		const oldSkill = join(skillRoot, "archboard");
		mkdirSync(oldSkill, { recursive: true });
		writeFileSync(join(oldSkill, "old.txt"), "old");
	};

	try {
		prepare();
		const artifactTargets = argv.flatMap((token, index) =>
			token === "--out" && argv[index + 1] ? [argv[index + 1]] : [],
		);
		const artifactBefore = new Map(
			artifactTargets.map((path) => [path, existsSync(path) ? readFileSync(path) : null]),
		);
		const requestOffset = requests.length;
		const result = await cli(argv, options);
		const requestEffects = requests
			.slice(requestOffset)
			.map((request) => `${request.method} ${request.url.pathname}`);
		const prerequisiteContacts = result.events.filter((event) => event === "GET /health");
		const actualLocalEffects = localEffectsOf(record, result, requestEffects, runtime);
		const artifactCommits = artifactTargets.filter((path) => {
			if (!existsSync(path)) return false;
			const before = artifactBefore.get(path);
			return before === null || !readFileSync(path).equals(before);
		});
		check(`${record.name} fixed-base argv exits exactly`, result.status === record.exit);
		check(
			`${record.name} fixed-base stdout bytes`,
			normalized(result.stdout, record, runtime) === record.stdout,
			result.stdout,
		);
		check(
			`${record.name} fixed-base stderr bytes`,
			normalized(result.stderr, record, runtime) === record.stderr,
			result.stderr,
		);
		check(
			`${record.name} fixed-base held state`,
			JSON.stringify(heldStateOf(result.stdout)) === JSON.stringify(record.heldState),
		);
		check(
			`${record.name} fixed-base prerequisite contacts`,
			JSON.stringify(prerequisiteContacts) === JSON.stringify(record.prerequisiteContacts),
			prerequisiteContacts.join(" | "),
		);
		check(
			`${record.name} fixed-base REST effects`,
			JSON.stringify(requestEffects) === JSON.stringify(record.restEffects),
			requestEffects.join(" | "),
		);
		check(
			`${record.name} fixed-base local effects`,
			JSON.stringify(actualLocalEffects) === JSON.stringify(record.localEffects),
			actualLocalEffects.join(" | "),
		);
		check(
			`${record.name} fixed-base artifact commits`,
			JSON.stringify(artifactCommits) === JSON.stringify(record.artifactCommits),
			artifactCommits.join(" | "),
		);

		prepare();
		const merged = await cliMerged(argv, options);
		const expectedContacts = record.mergedEvents
			.filter((event) => event.kind === "contact")
			.map((event) => event.value);
		const expectedMerged = record.mergedEvents
			.filter((event) => event.kind === "stdout" || event.kind === "stderr-bytes")
			.map((event) => (event.kind === "stdout" ? record.stdout : event.value))
			.join("");
		const expectedExit = record.mergedEvents.find((event) => event.kind === "exit")?.value;
		check(
			`${record.name} fixed-base merged event contacts`,
			JSON.stringify(merged.events.slice(0, -1)) === JSON.stringify(expectedContacts),
			merged.events.join(" | "),
		);
		check(
			`${record.name} fixed-base merged stream order`,
			normalized(merged.merged, record, runtime) === expectedMerged,
			merged.merged,
		);
		check(
			`${record.name} fixed-base merged exit is last`,
			merged.status === expectedExit && merged.events.at(-1) === `exit:${expectedExit}`,
			merged.events.join(" | "),
		);
	} finally {
		activeCompatibilityRecord = null;
		foreign?.stop(true);
	}
}

try {
	check("package bin exists", existsSync(bin), bin);
	check("package bin is bin/canvas", declaredBin === "bin/canvas", declaredBin);
	check(
		"commands run outside the checkout",
		outside !== repoRoot && !existsSync(join(outside, ".git")),
	);

	const bare = await cli([]);
	check("no-argument invocation exits normally", bare.status === 0, String(bare.status));
	check("no-argument invocation writes no diagnostic", bare.stderr === "", bare.stderr.trim());
	check("no-argument invocation shows CLI help", /^archboard .*\n\nUsage:/m.test(bare.stdout));
	check(
		"no-argument help describes no alternate protocol transport",
		!/(model context protocol|json-rpc|stdio server)/i.test(bare.stdout),
	);

	for (const record of compatibility.orderedCases) {
		await exerciseCompatibilityRecord(record);
	}
	if (compatibilityOnly) {
		if (failures > 0) {
			console.error(`\n${failures} of ${checks} compatibility checks failed.`);
			server.stop(true);
			rmSync(outside, { recursive: true, force: true });
			process.exit(1);
		}
		console.log(`cli compatibility: ${compatibility.orderedCases.length} records passed.`);
		server.stop(true);
		rmSync(outside, { recursive: true, force: true });
		process.exit(0);
	}

	const boardInfo = await cli(["board", "info", "--board", "contract"], { url: canvasUrl });
	const boardInfoBody = parseJson("board info fixture", boardInfo.stdout);
	check("board info accepts the protected identity response", boardInfo.status === 0);
	check(
		"board info exposes required version and placeholder",
		boardInfoBody?.version === 7 && boardInfoBody?.placeholder === false,
	);
	check("board info does not invent vaultBacked", !("vaultBacked" in (boardInfoBody ?? {})));

	const boardNew = await cli(["board", "new", "contract-new"], { url: canvasUrl });
	const boardNewBody = parseJson("board new fixture", boardNew.stdout);
	check("board new accepts its protected response", boardNew.status === 0);
	check(
		"board new exposes creation and save state",
		boardNewBody?.created === true &&
			boardNewBody?.saved === false &&
			boardNewBody?.version === null,
	);

	const boardOpen = await cli(["board", "open", "contract"], { url: canvasUrl });
	const boardOpenBody = parseJson("board open fixture", boardOpen.stdout);
	check("board open accepts its protected response", boardOpen.status === 0);
	check("board open exposes its source", boardOpenBody?.source === "vault");

	const paneOpen = await cli(["pane", "open", "--board", "contract"], { url: canvasUrl });
	const paneOpenBody = parseJson("pane open fixture", paneOpen.stdout);
	check("pane open accepts its nested board response", paneOpen.status === 0);
	check(
		"pane open nests the truthful board-open fields",
		paneOpenBody?.board?.source === "vault" &&
			paneOpenBody?.board?.version === 7 &&
			paneOpenBody?.board?.placeholder === false,
	);

	const injectStatusResult = await cli(["inject", "status"], { url: canvasUrl });
	const injectStatusBody = parseJson("inject status fixture", injectStatusResult.stdout);
	check("inject status accepts the complete status report", injectStatusResult.status === 0);
	check(
		"inject status exposes its target and counters",
		injectStatusBody?.target?.threadId === "thread-fixture" &&
			injectStatusBody?.injected?.quiet === 2,
	);

	const injectTestResult = await cli(["inject", "test", "--note", "fixture"], {
		url: canvasUrl,
	});
	const injectTestBody = parseJson("inject test fixture", injectTestResult.stdout);
	check("inject test accepts its concrete probe result", injectTestResult.status === 0);
	check(
		"inject test exposes channel, thread, and text",
		injectTestBody?.channel === "quiet" &&
			injectTestBody?.threadId === "thread-fixture" &&
			injectTestBody?.text === "fixture injection text",
	);

	const conflictMessage = "Refusing fixed-base board save. Nothing was written.";
	const malformedHeld = await cli(
		["board", "save", "--board", "invalid-held", "--doing", "checking validation"],
		{ url: canvasUrl },
	);
	check("malformed held data is a validation failure", malformedHeld.status === 1);
	check("malformed held data reaches no structured stdout", malformedHeld.stdout === "");
	check(
		"malformed held data fails before the declared conflict presentation",
		!malformedHeld.stderr.includes(conflictMessage) &&
			!malformedHeld.stderr.includes("has stopped saving"),
		malformedHeld.stderr,
	);
	const falseSuccess = await cli(
		["board", "save", "--board", "false-success", "--doing", "checking discrimination"],
		{ url: canvasUrl },
	);
	check("board save rejects success:false without a conflict", falseSuccess.status === 1);
	check("board save false success reaches no structured stdout", falseSuccess.stdout === "");

	const malformedReadHeld = await cli(["query", "--board", "invalid-held-read"], {
		url: canvasUrl,
	});
	check("stderr-note rejects malformed held state", malformedReadHeld.status === 1);
	check("stderr-note malformed held reaches no structured stdout", malformedReadHeld.stdout === "");
	check(
		"stderr-note malformed held emits no held diagnostic",
		!malformedReadHeld.stderr.includes("held board diagnostic"),
		malformedReadHeld.stderr,
	);

	const malformedFilePath = join(outside, "malformed-held-export.excalidraw");
	const malformedFileHeld = await cli(
		["export", "--board", "invalid-held-read", "--out", malformedFilePath],
		{ url: canvasUrl },
	);
	check("file output rejects malformed held state", malformedFileHeld.status === 1);
	check(
		"file output malformed held reaches no structured receipt",
		malformedFileHeld.stdout === "",
	);
	check("file output malformed held commits no artifact", !existsSync(malformedFilePath));

	const lateSaveClosed = await cli(["board", "save", "--unknown", "--board", "contract"], {
		url: closedUrl,
	});
	check("board save keeps server before staged token validation", lateSaveClosed.status === 3);
	const lateSaveMock = await cli(["board", "save", "--unknown", "--board", "contract"], {
		url: canvasUrl,
	});
	check("board save staged unknown flag exits usage after contact", lateSaveMock.status === 2);
	check(
		"board save staged token validation performs no save",
		lateSaveMock.events.includes("GET /health") &&
			!lateSaveMock.events.includes("POST /api/boards/save"),
		lateSaveMock.events.join(" | "),
	);

	for (const golden of argvGolden.cases) {
		browserClients = golden.server === "no-browser" ? 0 : 1;
		const result = await cli(
			golden.argv,
			golden.server === "mock" || golden.server === "no-browser"
				? { url: canvasUrl }
				: golden.server === "closed"
					? { url: closedUrl }
					: {},
		);
		browserClients = 1;
		check(`${golden.name} exit`, result.status === golden.status, String(result.status));
		for (const stream of ["stdout", "stderr"]) {
			const actual = result[stream]
				.replaceAll(outside, "{{OUTSIDE}}")
				.replaceAll(canvasUrl, "{{CANVAS_URL}}");
			const expected = golden[stream]?.replaceAll("{{VERSION}}", pkg.version);
			const digest = createHash("sha256").update(actual).digest("hex");
			check(
				`${golden.name} ${stream}`,
				expected === undefined ? digest === golden[`${stream}Sha256`] : actual === expected,
				actual,
			);
		}
	}
	for (const alias of [["-h"], ["--help"], ["help", "unknown-topic"]]) {
		const result = await cli(alias);
		const digest = createHash("sha256").update(fixedBaseGeneralHelp(result.stdout)).digest("hex");
		check(`${alias.join(" ")} exits normally`, result.status === 0, String(result.status));
		check(`${alias.join(" ")} owns stdout`, result.stderr === "", result.stderr);
		check(
			`${alias.join(" ")} keeps legacy help bytes`,
			digest === argvGolden.generalHelpSha256,
			digest,
		);
	}

	const surface = cliSurface();
	check(
		"current general help adds the check command once",
		(bare.stdout.match(/^  check\s/gm) ?? []).length === 1,
	);
	check(
		"current general help adds the bridge command once",
		(bare.stdout.match(/^  bridge\s/gm) ?? []).length === 1,
	);
	check(
		"current general help adds the exact check-only exit line",
		bare.stdout.includes(
			"               check only: 6 warnings, 7 errors, 8 indeterminate coverage.\n",
		),
	);
	check("the CLI declares commands", surface.length > 0, `${surface.length} commands`);
	let subcommandCount = 0;
	for (const { name, subcommands } of surface) {
		check(`general help lists ${name}`, new RegExp(`^  ${name}\\s`, "m").test(bare.stdout));
		const help = await cli(["help", name]);
		check(`help ${name} exits normally`, help.status === 0, String(help.status));
		check(`help ${name} prints its usage`, help.stdout.startsWith("Usage: archboard "));
		check(`help ${name} keeps stderr clean`, help.stderr === "", help.stderr.trim());
		for (const subcommand of subcommands) {
			subcommandCount += 1;
			const topic = await cli(["help", name, subcommand]);
			check(`help ${name} ${subcommand} exits normally`, topic.status === 0, String(topic.status));
			check(
				`help ${name} ${subcommand} identifies its declared topic`,
				new RegExp(`(^|[^a-z0-9-])${subcommand}([^a-z0-9-]|$)`, "i").test(topic.stdout),
			);
			check(
				`help ${name} ${subcommand} keeps stderr clean`,
				topic.stderr === "",
				topic.stderr.trim(),
			);
		}
	}

	const writeCases = [
		{ name: "add", argv: ["add", "--one", JSON.stringify(element)] },
		{ name: "update", argv: ["update", element.id, "--set", '{"x":10}'] },
		{ name: "delete", argv: ["delete", element.id] },
	];
	for (const writeCase of writeCases) {
		for (const wantsDocument of [false, true]) {
			const doing = `${writeCase.name} contract shape`;
			const args = [
				...writeCase.argv,
				...(wantsDocument ? ["--document"] : []),
				"--board",
				"contract",
				"--doing",
				doing,
			];
			const label = `${writeCase.name}${wantsDocument ? " --document" : ""}`;
			const { answer, writes } = await expectSuccessfulJson(label, args);
			check(`${label} performs one write`, writes.length === 1, `${writes.length} writes`);
			const write = writes[0];
			check(`${label} sends the global board`, write?.url.searchParams.get("board") === "contract");
			check(`${label} sends global --doing`, write?.url.searchParams.get("doing") === doing);
			check(
				`${label} preserves document response shape`,
				wantsDocument ? Array.isArray(answer?.document) : !("document" in (answer ?? {})),
			);
			const sentDocument =
				writeCase.name === "delete"
					? write?.body?.document === true
					: write?.url.searchParams.get("document") === "1";
			check(
				`${label} transports --document only when requested`,
				wantsDocument ? sentDocument : !sentDocument,
			);
		}
	}

	const bridgeBefore = requests.length;
	const bridged = await cli(
		[
			"bridge",
			"--over",
			"over",
			"--under",
			"under",
			"--background",
			"#FFFFFF",
			"--at",
			"50,50",
			"--board",
			"contract",
			"--doing",
			"marking crossing",
		],
		{ url: canvasUrl },
	);
	const bridgedAnswer = parseJson("bridge JSON", bridged.stdout);
	const bridgeWrites = writesSince(bridgeBefore);
	check("bridge package adapter exits normally", bridged.status === 0, bridged.stderr);
	check(
		"bridge package adapter performs exactly one POST",
		bridgeWrites.length === 1 && bridgeWrites[0]?.url.pathname === "/api/bridges",
	);
	check(
		"bridge package adapter normalizes the explicit background",
		bridgeWrites[0]?.body?.background === "#ffffff",
	);
	check(
		"bridge package result keeps the role-ordered pair",
		bridgedAnswer?.elements?.[0]?.customData?.archboard?.bridge?.role === "mask" &&
			bridgedAnswer?.elements?.[1]?.customData?.archboard?.bridge?.role === "redraw",
	);

	for (const at of ["1,", ",2", " , "]) {
		const before = requests.length;
		const invalidAt = await cli(
			[
				"bridge",
				"--over",
				"over",
				"--under",
				"under",
				"--background",
				"#ffffff",
				"--at",
				at,
				"--board",
				"contract",
				"--doing",
				"marking crossing",
			],
			{ url: canvasUrl },
		);
		check(`blank --at coordinate ${JSON.stringify(at)} is usage exit 2`, invalidAt.status === 2);
		check(
			`blank --at coordinate ${JSON.stringify(at)} contacts no server or write route`,
			requests.length === before && invalidAt.stdout === "",
		);
	}

	const invalidCreateReceipt = await cli(
		[
			"bridge",
			"--over",
			"invalid-receipt",
			"--under",
			"under",
			"--background",
			"#ffffff",
			"--board",
			"contract",
			"--doing",
			"checking bridge receipt",
		],
		{ url: canvasUrl },
	);
	check(
		"bridge rejects a server receipt whose top-level facts disagree with its parts",
		invalidCreateReceipt.status !== 0 && invalidCreateReceipt.stdout === "",
		invalidCreateReceipt.stderr,
	);

	const removeBefore = requests.length;
	const removedBridge = await cli(
		["bridge", "remove", "Bridge01", "--board", "contract", "--doing", "removing crossing"],
		{ url: canvasUrl },
	);
	const removeWrites = writesSince(removeBefore);
	check(
		"bridge remove package adapter exits normally",
		removedBridge.status === 0,
		removedBridge.stderr,
	);
	check(
		"bridge remove performs exactly one DELETE and no pre-GET",
		removeWrites.length === 1 &&
			removeWrites[0]?.method === "DELETE" &&
			removeWrites[0]?.url.pathname === "/api/bridges/Bridge01",
	);
	check(
		"bridge remove returns the exact provenance pair",
		JSON.stringify(parseJson("bridge remove JSON", removedBridge.stdout)?.deleted) ===
			JSON.stringify(["Bridge01", "Redraw01"]),
	);
	const invalidRemoveReceipt = await cli(
		[
			"bridge",
			"remove",
			"InvalidReceipt",
			"--board",
			"contract",
			"--doing",
			"checking removal receipt",
		],
		{ url: canvasUrl },
	);
	check(
		"bridge remove rejects a server receipt whose mask ID disagrees with bridgeId",
		invalidRemoveReceipt.status !== 0 && invalidRemoveReceipt.stdout === "",
		invalidRemoveReceipt.stderr,
	);

	const invalidBackgroundBefore = requests.length;
	const invalidBackground = await cli(
		[
			"bridge",
			"--over",
			"over",
			"--under",
			"under",
			"--background",
			"transparent",
			"--board",
			"contract",
			"--doing",
			"marking crossing",
		],
		{ url: canvasUrl },
	);
	check("invalid bridge background is usage exit 2", invalidBackground.status === 2);
	check(
		"invalid bridge background contacts no write route",
		requests.length === invalidBackgroundBefore,
	);

	const queryBefore = requests.length;
	const queried = await cli([
		"--url",
		canvasUrl,
		"query",
		"ignored-position",
		"--type=ellipse",
		"--type",
		"rectangle",
		"--filter",
		"locked=true",
		"--filter",
		"id=shape1",
		"--board=contract",
	]);
	check("query real adapter exits normally", queried.status === 0, String(queried.status));
	check("query real adapter keeps stderr clean", queried.stderr === "", queried.stderr);
	check(
		"query keeps its bare-array result",
		Array.isArray(parseJson("query JSON", queried.stdout)),
	);
	const structuredSuccess = await cli(["get", "shape1", "--board", "contract"], {
		url: canvasUrl,
	});
	const jqSuccess = spawnSync("jq", ["-r", ".id"], {
		input: structuredSuccess.stdout,
		encoding: "utf8",
	});
	check("structured success command preserves exit 0", structuredSuccess.status === 0);
	check("structured success command preserves empty stderr", structuredSuccess.stderr === "");
	check("structured success stdout is consumable by real jq", jqSuccess.status === 0);
	check("jq selects a structured success field", jqSuccess.stdout === "shape1\n", jqSuccess.stdout);
	check(
		"jq writes no diagnostic for structured success",
		jqSuccess.stderr === "",
		jqSuccess.stderr,
	);
	const structuredNonzero = await cli(["status"], { url: closedUrl });
	const jqNonzero = spawnSync("jq", ["-r", ".running"], {
		input: structuredNonzero.stdout,
		encoding: "utf8",
	});
	check("structured nonzero command preserves exit 3", structuredNonzero.status === 3);
	check("structured nonzero command preserves empty stderr", structuredNonzero.stderr === "");
	check("structured nonzero stdout is consumable by real jq", jqNonzero.status === 0);
	check("jq selects a structured nonzero field", jqNonzero.stdout === "false\n", jqNonzero.stdout);
	check(
		"jq writes no diagnostic for structured nonzero",
		jqNonzero.stderr === "",
		jqNonzero.stderr,
	);
	const queryRequest = requests
		.slice(queryBefore)
		.find((request) => request.url.pathname.startsWith("/api/elements/search"));
	check(
		"query nonrepeatable flags remain last-wins",
		queryRequest?.url.searchParams.get("type") === "rectangle",
	);

	const stdinBefore = requests.length;
	const stdinUpdate = await cli(
		[
			"update",
			"shape1",
			"-",
			"ignored-tail",
			"--board",
			"contract",
			"--doing",
			"updating from stdin",
		],
		{ url: canvasUrl, input: '{"x":44}' },
	);
	check("update dash stdin exits normally", stdinUpdate.status === 0, String(stdinUpdate.status));
	const stdinWrite = writesSince(stdinBefore)[0];
	check("update dash routes stdin and ignores excess positionals", stdinWrite?.body?.x === 44);

	const repeatedBefore = requests.length;
	const repeatedUpdate = await cli(
		[
			"update",
			"shape1",
			"--set",
			'{"x":1}',
			'--set={"x":2}',
			"--document",
			"--document",
			"--board",
			"contract",
			"--doing",
			"checking repeated flags",
		],
		{ url: canvasUrl },
	);
	check(
		"repeated update flags exit normally",
		repeatedUpdate.status === 0,
		String(repeatedUpdate.status),
	);
	const repeatedWrite = writesSince(repeatedBefore)[0];
	check("nonrepeatable --set remains last-wins", repeatedWrite?.body?.x === 2);
	check(
		"repeated boolean flags remain true",
		repeatedWrite?.url.searchParams.get("document") === "1",
	);

	const optionLooking = await cli(["update", "shape1", "--set", "--document"]);
	check(
		"required options consume option-looking values",
		optionLooking.status === 2,
		String(optionLooking.status),
	);
	check(
		"the consumed value reaches Zod/local JSON validation",
		/Invalid JSON in --set/.test(optionLooking.stderr),
	);

	const queryPrecedence = await cli(["query", "--bbox", "not-a-box"], { url: closedUrl });
	check(
		"query keeps server-before-bbox precedence",
		queryPrecedence.status === 3,
		String(queryPrecedence.status),
	);
	const filterBefore = requests.length;
	const queryFilterPrecedence = await cli(
		["query", "--filter", "missing-equals", "--board", "contract"],
		{
			url: canvasUrl,
		},
	);
	check(
		"query invalid filter exits usage",
		queryFilterPrecedence.status === 2,
		String(queryFilterPrecedence.status),
	);
	check(
		"query keeps read-before-filter precedence",
		requests.slice(filterBefore).some((request) => request.url.pathname === "/api/elements"),
	);

	const viewportBefore = requests.length;
	const moved = await cli(["viewport", "ignored", "--zoom=1.5", "--offset-x", "2"], {
		url: canvasUrl,
	});
	check("viewport real adapter exits normally", moved.status === 0, String(moved.status));
	const viewportRequest = requests
		.slice(viewportBefore)
		.find((request) => request.url.pathname === "/api/viewport");
	check(
		"viewport preserves numeric coercion after browser preflight",
		viewportRequest?.body?.zoom === 1.5,
	);
	check("viewport preserves ignored excess positionals", viewportRequest?.body?.offsetX === 2);
	const idsBefore = requests.length;
	const idsViewport = await cli(["viewport", "--ids", "shape1, shape2,,"], {
		url: canvasUrl,
	});
	check("viewport ids exit normally", idsViewport.status === 0, String(idsViewport.status));
	const idsRequest = requests
		.slice(idsBefore)
		.find((request) => request.url.pathname === "/api/viewport");
	check(
		"viewport staged Zod coercion supplies the handler's id array",
		JSON.stringify(idsRequest?.body?.scrollToElementIds) === JSON.stringify(["shape1", "shape2"]),
	);
	const numericBeforeServer = await cli(["viewport", "--zoom", "not-a-number"], { url: closedUrl });
	check(
		"viewport keeps server before numeric refusal",
		numericBeforeServer.status === 3,
		String(numericBeforeServer.status),
	);
	browserClients = 0;
	const numericBeforeBrowser = await cli(["viewport", "--zoom", "not-a-number"], {
		url: canvasUrl,
	});
	browserClients = 1;
	check(
		"viewport keeps browser before numeric refusal",
		numericBeforeBrowser.status === 4,
		String(numericBeforeBrowser.status),
	);
	const crossFieldBeforeServer = await cli(["viewport", "--fit", "--element", "shape1"], {
		url: closedUrl,
	});
	check(
		"viewport keeps cross-field refusal before server",
		crossFieldBeforeServer.status === 2,
		String(crossFieldBeforeServer.status),
	);

	const rawExport = await cli(["export", "ignored", "--board", "contract"], { url: canvasUrl });
	check("raw export exits normally", rawExport.status === 0, String(rawExport.status));
	check(
		"raw export owns stdout without a wrapper",
		parseJson("raw export", rawExport.stdout)?.source === "archboard",
	);
	check("raw export bypasses held diagnostics", rawExport.stderr === "", rawExport.stderr);

	const fileExport = await cli(["export", "--out=-", "--board", "contract"], { url: canvasUrl });
	const fileReceipt = parseJson("file export receipt", fileExport.stdout);
	check("export --out - exits normally", fileExport.status === 0, String(fileExport.status));
	check("export --out - remains a literal file", fileReceipt?.file === join(outside, "-"));
	check(
		"export file receipt follows JSON stream ownership",
		fileExport.stderr === "",
		fileExport.stderr,
	);
	const inferredPath = join(outside, "inferred.excalidraw.md");
	const inferredExport = await cli(["export", "--out", inferredPath, "--board", "contract"], {
		url: canvasUrl,
	});
	const inferredReceipt = parseJson("inferred export receipt", inferredExport.stdout);
	check(
		"export .md inference exits normally",
		inferredExport.status === 0,
		String(inferredExport.status),
	);
	check("export staged Zod inference selects obsidian", inferredReceipt?.format === "obsidian");
	check(
		"export staged Zod inference writes Obsidian content",
		/^---\n.*excalidraw-plugin:/s.test(readFileSync(inferredPath, "utf8")),
	);
	const localFormat = await cli(["export", "--format", "invalid"], { url: closedUrl });
	check(
		"export format refusal stays before server",
		localFormat.status === 2,
		String(localFormat.status),
	);
	const unsafeTarget = join(outside, "unsafe.excalidraw.md");
	writeFileSync(unsafeTarget, "ordinary note");
	const unsafeExport = await cli(["export", "--out", unsafeTarget], { url: closedUrl });
	check(
		"export overwrite refusal stays before server",
		unsafeExport.status === 2,
		String(unsafeExport.status),
	);
	check(
		"export overwrite refusal leaves the target unchanged",
		readFileSync(unsafeTarget, "utf8") === "ordinary note",
	);

	const heldQuery = await cli(["query", "--board", "held"], { url: canvasUrl });
	check(
		"held query keeps its bare array",
		Array.isArray(parseJson("held query", heldQuery.stdout)),
	);
	check(
		"held query writes only the note to stderr",
		heldQuery.stderr === "held board diagnostic\n",
		heldQuery.stderr,
	);

	const heldUpdate = await cli(
		["update", "shape1", "--set", '{"x":3}', "--board", "held", "--doing", "checking held update"],
		{ url: canvasUrl },
	);
	check(
		"held update adds the public held field",
		parseJson("held update", heldUpdate.stdout)?.held?.board === "held",
	);
	check(
		"held update also owns its stderr note",
		heldUpdate.stderr === "held board diagnostic\n",
		heldUpdate.stderr,
	);

	const heldRaw = await cli(["export", "--board", "held"], { url: canvasUrl });
	check("held raw export bypasses held stderr", heldRaw.stderr === "", heldRaw.stderr);
	check(
		"held raw export remains raw content",
		parseJson("held raw export", heldRaw.stdout)?.source === "archboard",
	);

	const heldFile = await cli(["export", "--out", "held.excalidraw", "--board", "held"], {
		url: canvasUrl,
	});
	check(
		"held file receipt adds the public held field",
		parseJson("held file", heldFile.stdout)?.held?.board === "held",
	);
	check(
		"held file receipt also owns its stderr note",
		heldFile.stderr === "held board diagnostic\n",
		heldFile.stderr,
	);

	const scenePath = join(outside, "contract.excalidraw");
	writeFileSync(scenePath, JSON.stringify({ type: "excalidraw", version: 2, elements: document }));
	const imported = await expectSuccessfulJson("import from caller cwd", [
		"import",
		"contract.excalidraw",
		"--board",
		"contract",
		"--doing",
		"importing contract scene",
	]);
	check("import reads the CLI-owned path", imported.answer?.imported === 1);
	check("import sends one batch write", imported.writes.length === 1);

	const missingDoing = await cli(["add", "--one", JSON.stringify(element), "--board", "contract"], {
		url: canvasUrl,
	});
	check("a write without --doing fails", missingDoing.status === 1, String(missingDoing.status));
	check("a write refusal leaves stdout empty", missingDoing.stdout === "", missingDoing.stdout);
	check("a write refusal stays on stderr", /Error: doing required/.test(missingDoing.stderr));

	const refused = await cli(
		[
			"update",
			"refuse",
			"--set",
			'{"x":10}',
			"--document",
			"--board",
			"contract",
			"--doing",
			"probing structured refusal",
		],
		{ url: canvasUrl },
	);
	check("board refusal uses exit 5", refused.status === 5, String(refused.status));
	check("board refusal leaves stdout empty", refused.stdout === "", refused.stdout);
	check(
		"board refusal retains its reason",
		refused.stderr.startsWith("Error: Refusing contract write"),
	);
	check("board refusal retains its code", /"code": "BOARD_VERSION_CONFLICT"/.test(refused.stderr));
	check("board refusal retains its document", /"document": \[/.test(refused.stderr));
	check("board refusal retains its version", /"version": 7/.test(refused.stderr));

	const usage = await cli(["delete", "--board", "contract", "--doing", "invalid delete"], {
		url: canvasUrl,
	});
	check("usage refusal uses exit 2", usage.status === 2, String(usage.status));
	check("usage refusal leaves stdout empty", usage.stdout === "", usage.stdout);
	check(
		"usage refusal explains the command on stderr",
		/Error:.*\nUsage: archboard delete/s.test(usage.stderr),
	);

	check("the package has no compatibility main export", !("main" in pkg));

	if (failures > 0) {
		console.error(`\n${failures} of ${checks} CLI contract checks failed.`);
		process.exitCode = 1;
	} else {
		console.log(
			`cli contract: ${surface.length} commands, ${subcommandCount} subcommands, and ${checks} checks passed.`,
		);
	}
} finally {
	server.stop(true);
	rmSync(outside, { recursive: true, force: true });
}

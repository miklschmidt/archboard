#!/usr/bin/env bun

// Public CLI contract check. Every child runs the package's declared bin from
// a directory outside the checkout, while a tiny HTTP double records the wire
// contract. Command inventory always comes from the production declarations.

import { spawn } from "node:child_process";
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
const { cliSurface } = await import(join(repoRoot, "src", "cli", "commands", "run.ts"));
const { CANVAS_SERVICE_NAME } = await import(
	join(repoRoot, "src", "runtime", "engine", "canvas-client.ts")
);
const outside = mkdtempSync(join(tmpdir(), "archboard-cli-contract-"));

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

let activeEvents = null;

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
			activeEvents = null;
			finish({ status, merged: readFileSync(mergedPath, "utf8"), events });
		});
	});
}

const element = { id: "shape1", type: "rectangle", x: 0, y: 0, width: 100, height: 80 };
const document = [element];
const fingerprint = { elements: 1, note: "contract-note", version: 7 };
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

	const unavailableStatus = await cli(["status"], { url: closedUrl });
	check(
		"status unavailable exits 3",
		unavailableStatus.status === 3,
		String(unavailableStatus.status),
	);
	check(
		"status unavailable keeps stderr empty",
		unavailableStatus.stderr === "",
		unavailableStatus.stderr,
	);
	check(
		"status unavailable exact stdout bytes",
		unavailableStatus.stdout === JSON.stringify({ running: false, url: closedUrl }, null, 2) + "\n",
		unavailableStatus.stdout,
	);
	check(
		"status unavailable sets exit after stdout",
		unavailableStatus.events.at(-1) === "exit:3" &&
			unavailableStatus.events[0]?.startsWith("stdout:"),
		unavailableStatus.events.join(" | "),
	);

	const foreign = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch() {
			activeEvents?.push("GET /health");
			return Response.json({ service: "somebody-else", status: "ok" });
		},
	});
	try {
		const foreignUrl = `http://127.0.0.1:${foreign.port}`;
		const foreignStatus = await cli(["status"], { url: foreignUrl });
		check(
			"status foreign service exits 3",
			foreignStatus.status === 3,
			String(foreignStatus.status),
		);
		check(
			"status foreign service keeps stderr empty",
			foreignStatus.stderr === "",
			foreignStatus.stderr,
		);
		check(
			"status foreign service exact stdout bytes",
			foreignStatus.stdout ===
				JSON.stringify(
					{
						running: false,
						url: foreignUrl,
						conflict: "another service (or a pre-1.1 canvas build) is answering at this URL",
					},
					null,
					2,
				) +
					"\n",
			foreignStatus.stdout,
		);
		check(
			"status foreign service preserves health-output-exit order",
			foreignStatus.events[0] === "GET /health" &&
				foreignStatus.events[1]?.startsWith("stdout:") &&
				foreignStatus.events.at(-1) === "exit:3",
			foreignStatus.events.join(" | "),
		);
	} finally {
		foreign.stop(true);
	}

	const saveConflict = await cli(
		["board", "save", "--board", "save-conflict", "--doing", "checking conflict"],
		{ url: canvasUrl },
	);
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
	const held = {
		board: "save-conflict",
		message: "held board diagnostic",
		writes: 0,
	};
	check("board save conflict exits 5", saveConflict.status === 5, String(saveConflict.status));
	check(
		"board save conflict exact stdout bytes and final newline",
		saveConflict.stdout === JSON.stringify({ success: false, conflict, held }, null, 2) + "\n",
		saveConflict.stdout,
	);
	check(
		"board save conflict exact ordered stderr bytes",
		saveConflict.stderr ===
			conflict.message +
				"\n" +
				held.message +
				"\n" +
				'"save-conflict" has stopped saving. Changes from here are held on the canvas and reach no note until one of those three is run.\n',
		saveConflict.stderr,
	);
	const mergedSaveConflict = await cliMerged(
		["board", "save", "--board", "save-conflict", "--doing", "checking merged order"],
		{ url: canvasUrl },
	);
	const expectedMergedConflict =
		conflict.message +
		"\n" +
		JSON.stringify({ success: false, conflict, held }, null, 2) +
		"\n" +
		held.message +
		"\n" +
		'"save-conflict" has stopped saving. Changes from here are held on the canvas and reach no note until one of those three is run.\n';
	check(
		"board save conflict preserves contacts and conflict-result-held-continuation-exit order",
		mergedSaveConflict.status === 5 &&
			mergedSaveConflict.events.indexOf("GET /health") <
				mergedSaveConflict.events.indexOf("POST /api/boards/save") &&
			mergedSaveConflict.merged === expectedMergedConflict,
		`${mergedSaveConflict.events.join(" | ")}\n${mergedSaveConflict.merged}`,
	);
	const malformedHeld = await cli(
		["board", "save", "--board", "invalid-held", "--doing", "checking validation"],
		{ url: canvasUrl },
	);
	check("malformed held data is a validation failure", malformedHeld.status === 1);
	check("malformed held data reaches no structured stdout", malformedHeld.stdout === "");
	check(
		"malformed held data fails before the declared conflict presentation",
		!malformedHeld.stderr.includes(conflict.message) &&
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

	for (const action of ["save", "restore"]) {
		const missingName = await cli(["snapshot", action, "--board", "contract"], {
			url: canvasUrl,
		});
		check(`snapshot ${action} missing name exits usage`, missingName.status === 2);
		check(
			`snapshot ${action} preserves server-before-name order`,
			missingName.events[0] === "GET /health" &&
				missingName.events.some((event) => event.startsWith("stderr:Error:")),
			missingName.events.join(" | "),
		);
	}

	const boardHere = await cliMerged(["board", "list", "--here"], {
		url: canvasUrl,
		cwd: repoRoot,
	});
	check("board list --here failure keeps its immediate diagnostic", boardHere.status === 1);
	check(
		"board list --here diagnostic precedes its request failure",
		/^Standing in .+\.\nError:/s.test(boardHere.merged),
		boardHere.merged,
	);

	const promoteBinding = await cli(
		[
			"promote",
			"--kind",
			"service",
			"--ids",
			"shape1",
			"--path",
			"missing.ts",
			"--board",
			"contract",
			"--doing",
			"checking binding order",
		],
		{ url: canvasUrl },
	);
	check("promote missing binding fails after its board read", promoteBinding.status === 1);
	check(
		"promote binding resolution follows server and element contact without a write",
		promoteBinding.events.includes("GET /health") &&
			promoteBinding.events.includes("GET /api/elements") &&
			!promoteBinding.events.some((event) => event.startsWith("POST /api/elements")),
		promoteBinding.events.join(" | "),
	);

	const skillRoot = join(outside, "compat-skills");
	const oldSkill = join(skillRoot, "archboard");
	mkdirSync(oldSkill, { recursive: true });
	writeFileSync(join(oldSkill, "old.txt"), "old");
	const installFailure = await cliMerged(
		["install-skill", "--dir", skillRoot, "--repo", "/proc", "--yes"],
		{},
	);
	check("install-skill post-replacement failure exits 1", installFailure.status === 1);
	check(
		"install-skill replacement diagnostic precedes the later setup failure",
		installFailure.merged.startsWith(`Replaced existing install at ${oldSkill}\nError:`),
		installFailure.merged,
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
		const digest = createHash("sha256").update(result.stdout).digest("hex");
		check(`${alias.join(" ")} exits normally`, result.status === 0, String(result.status));
		check(`${alias.join(" ")} owns stdout`, result.stderr === "", result.stderr);
		check(
			`${alias.join(" ")} keeps legacy help bytes`,
			digest === argvGolden.generalHelpSha256,
			digest,
		);
	}

	const surface = cliSurface();
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

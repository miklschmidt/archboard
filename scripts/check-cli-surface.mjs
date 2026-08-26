#!/usr/bin/env bun

// Public CLI contract check. Every child runs the package's declared bin from
// a directory outside the checkout, while a tiny HTTP double records the wire
// contract. Command inventory always comes from the production declarations.

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const declaredBin = pkg.bin?.archboard;
if (typeof declaredBin !== "string") throw new Error("package.json must declare bin.archboard");
const bin = resolve(repoRoot, declaredBin);
const { cliSurface } = await import(join(repoRoot, "src", "cli", "commands", "run.ts"));
const { CANVAS_SERVICE_NAME } = await import(join(repoRoot, "src", "runtime", "engine", "canvas-client.ts"));
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

function cli(args, { url, input } = {}) {
	return new Promise((finish) => {
		const child = spawn(bin, args, {
			cwd: outside,
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
		child.stdout.on("data", (chunk) => (stdout += chunk));
		child.stderr.on("data", (chunk) => (stderr += chunk));
		const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000);
		child.on("error", (error) => {
			clearTimeout(timeout);
			finish({ status: null, stdout, stderr: stderr + error.message });
		});
		child.on("close", (status, signal) => {
			clearTimeout(timeout);
			finish({ status, signal, stdout, stderr });
		});
		child.stdin.end(input);
	});
}

const element = { id: "shape1", type: "rectangle", x: 0, y: 0, width: 100, height: 80 };
const document = [element];
const fingerprint = { elements: 1, note: "contract-note", version: 7 };
const requests = [];

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	async fetch(request) {
		const url = new URL(request.url);
		if (url.pathname === "/health") {
			return Response.json({ service: CANVAS_SERVICE_NAME, status: "ok" });
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
			return Response.json({ success: true, elements: document });
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
			...(askedForDocument ? { document } : {}),
		};
		if (url.pathname.startsWith("/api/elements")) return Response.json(answer);
		return Response.json({ success: false, error: `unexpected ${url.pathname}` }, { status: 404 });
	},
});

const canvasUrl = `http://127.0.0.1:${server.port}`;

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

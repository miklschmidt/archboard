import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

interface ProcessIdentity {
	pid: number;
	startTime: string;
}

function identity(pid: number): ProcessIdentity {
	const raw = readFileSync(`/proc/${pid}/stat`, "utf8");
	const close = raw.lastIndexOf(")");
	const fields = raw
		.slice(close + 2)
		.trim()
		.split(/\s+/);
	const startTime = fields[19];
	if (!startTime) throw new Error(`Process ${pid} did not expose a start time.`);
	return { pid, startTime };
}

function holdOpen(): void {
	Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () => new Response("fixture"),
	});
}

async function readLine(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
	const decoder = new TextDecoder();
	let text = "";
	for (;;) {
		const next = await reader.read();
		text += decoder.decode(next.value, { stream: !next.done });
		const newline = text.indexOf("\n");
		if (newline >= 0) return text.slice(0, newline);
		if (next.done) throw new Error("Package process descendant exited before readiness.");
	}
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => undefined);
}

if (process.argv[2] === "inherited-descendant") {
	writeFileSync(process.argv[3]!, JSON.stringify(identity(process.pid)));
	holdOpen();
} else if (process.argv[2] === "descendant") {
	process.stdout.write(`${JSON.stringify(identity(process.pid))}\n`);
	holdOpen();
} else {
	const marker = process.env.ARCHBOARD_PACKAGE_PROCESS_READY;
	if (!marker) throw new Error("ARCHBOARD_PACKAGE_PROCESS_READY is required.");
	const entry = fileURLToPath(import.meta.url);
	const inheritPipes = process.env.ARCHBOARD_PACKAGE_PROCESS_DESCENDANT_INHERITS_PIPES === "1";
	const descendantMarker = `${marker}.descendant`;
	const descendant = Bun.spawn(
		[
			process.execPath,
			entry,
			inheritPipes ? "inherited-descendant" : "descendant",
			descendantMarker,
		],
		{
			stdin: "ignore",
			stdout: inheritPipes ? "inherit" : "pipe",
			stderr: inheritPipes ? "inherit" : "pipe",
		},
	);
	let descendantIdentity: ProcessIdentity;
	if (inheritPipes) {
		while (!existsSync(descendantMarker)) await Bun.sleep(1);
		descendantIdentity = JSON.parse(readFileSync(descendantMarker, "utf8")) as ProcessIdentity;
	} else {
		const reader = (descendant.stdout as ReadableStream<Uint8Array>).getReader();
		descendantIdentity = JSON.parse(await readLine(reader)) as ProcessIdentity;
		reader.releaseLock();
	}
	if (descendantIdentity.pid !== descendant.pid) {
		throw new Error(
			`Package process descendant reported ${descendantIdentity.pid}, expected ${descendant.pid}.`,
		);
	}
	const ready = {
		group: process.pid,
		leader: identity(process.pid),
		descendant: descendantIdentity,
	};
	await Bun.sleep(Number(process.env.ARCHBOARD_PACKAGE_PROCESS_READY_DELAY_MS ?? 0));
	writeFileSync(marker, JSON.stringify(ready));
	process.stdout.write(`${JSON.stringify(ready)}\n`);
	holdOpen();
}

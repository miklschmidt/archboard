import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

import { listProcessObservations } from "@/shared/process-observation";

const repositoryRoot = join(import.meta.dir, "../../../..");
const publicPreload = join(import.meta.dir, "../fixtures/public-codex-startup-preload.ts");

function canvasChildPids(pid: number): number[] {
	return listProcessObservations()
		.filter((observation) => observation.state !== "zombie" && observation.parentPid === pid)
		.map((observation) => observation.pid);
}

function publicStartEnvironment(
	root: string,
	base: string,
	executable?: string,
): NodeJS.ProcessEnv {
	const state = join(root, "state");
	const persistent = publicWorkbenchRoot(root);
	for (const directory of ["home", "config", "cache", "tmp", "vault", "state"]) {
		mkdirSync(join(root, directory), { recursive: true, mode: 0o700 });
	}
	mkdirSync(persistent, { recursive: true, mode: 0o700 });
	writeFileSync(join(persistent, "pre-existing-sentinel"), "preserve me");
	return {
		...process.env,
		HOME: join(root, "home"),
		XDG_CONFIG_HOME: join(root, "config"),
		XDG_CACHE_HOME: join(root, "cache"),
		XDG_STATE_HOME: state,
		TMPDIR: join(root, "tmp"),
		ARCHBOARD_VAULT: join(root, "vault"),
		EXPRESS_SERVER_URL: base,
		BUN_OPTIONS: `--preload=${publicPreload}`,
		...(executable === undefined ? {} : { ARCHBOARD_TEST_PUBLIC_CODEX_EXECUTABLE: executable }),
	};
}

function writePublicCodexExecutable(path: string, body: string): void {
	writeFileSync(path, `#!${process.execPath}\n${body}\n`);
	chmodSync(path, 0o700);
}

function runPublicCanvas(command: "start" | "stop", environment: NodeJS.ProcessEnv) {
	return spawnSync(join(repositoryRoot, "bin/canvas"), [command], {
		cwd: repositoryRoot,
		env: environment,
		encoding: "utf8",
		timeout: 20_000,
		killSignal: "SIGKILL",
	});
}

function runPublicCanvasAsync(command: "start" | "stop", environment: NodeJS.ProcessEnv) {
	return new Promise<{ readonly status: number | null; readonly stderr: string }>(
		(resolve, reject) => {
			const child = spawn(join(repositoryRoot, "bin/canvas"), [command], {
				cwd: repositoryRoot,
				env: environment,
				stdio: ["ignore", "ignore", "pipe"],
			});
			let stderr = "";
			child.stderr.on("data", (chunk: Buffer | string) => void (stderr += chunk));
			child.once("error", reject);
			child.once("close", (status) => resolve({ status, stderr }));
		},
	);
}

async function loggedRequestFailure(base: string, root: string) {
	const response = await fetch(`${base}/api/elements?board=scratch&doing=probe`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{",
	});
	await Bun.sleep(25);
	return {
		status: response.status,
		health: await (await fetch(`${base}/health`)).json(),
		logged: readFileSync(publicLogPath(root), "utf8").includes("Unhandled error"),
	};
}

function publicLogPath(root: string): string {
	if (process.platform === "darwin") {
		return join(root, "home/Library/Logs/archboard.log");
	}
	if (process.platform === "win32") {
		return join(root, "home/AppData/Local/Archboard/archboard.log");
	}
	return join(root, "state/archboard/archboard.log");
}

function publicStateRoot(root: string): string {
	if (process.platform === "darwin") {
		return join(root, "home/Library/Application Support/excalidraw-canvas");
	}
	if (process.platform === "win32") {
		return join(root, "home/AppData/Local/Excalidraw-Canvas");
	}
	return join(root, "state/excalidraw-canvas");
}

function publicWorkbenchRoot(root: string): string {
	return join(publicStateRoot(root), "codex-workbench");
}

export {
	canvasChildPids,
	publicStartEnvironment,
	writePublicCodexExecutable,
	runPublicCanvas,
	runPublicCanvasAsync,
	loggedRequestFailure,
	publicLogPath,
	publicStateRoot,
	publicWorkbenchRoot,
};

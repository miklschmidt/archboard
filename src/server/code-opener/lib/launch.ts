import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import type { OpenerCommand } from "../../../shared/code-target/index.js";

export type LaunchResult =
	| { ok: true }
	| { ok: false; code: "OPENER_UNAVAILABLE" | "OPENER_SPAWN_FAILED"; error: string };

function executableFile(candidate: string): boolean {
	try {
		if (!fs.statSync(candidate).isFile()) return false;
		fs.accessSync(candidate, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

function resolveExecutable(executable: string): string | null {
	if (path.posix.isAbsolute(executable) || path.win32.isAbsolute(executable)) {
		return executableFile(executable) ? executable : null;
	}
	return Bun.which(executable) ?? null;
}

export async function launchOpener(command: OpenerCommand): Promise<LaunchResult> {
	const executable = resolveExecutable(command.executable);
	if (!executable) {
		return {
			ok: false,
			code: "OPENER_UNAVAILABLE",
			error: `The opener executable ${command.executable} was not found. Open opener settings.`,
		};
	}
	return new Promise((resolve) => {
		let settled = false;
		let child: ReturnType<typeof spawn>;
		const finish = (result: LaunchResult): void => {
			if (settled) return;
			settled = true;
			child.removeListener("spawn", onSpawn);
			child.removeListener("error", onError);
			resolve(result);
		};
		const onSpawn = (): void => {
			child.unref();
			finish({ ok: true });
		};
		const onError = (error: Error): void => {
			finish({
				ok: false,
				code: "OPENER_SPAWN_FAILED",
				error: `Could not launch ${command.executable}: ${error.message}. Open opener settings.`,
			});
		};
		try {
			child = spawn(executable, command.argv, {
				shell: false,
				detached: true,
				stdio: "ignore",
				windowsHide: true,
			});
			child.once("spawn", onSpawn);
			child.once("error", onError);
		} catch (error) {
			resolve({
				ok: false,
				code: "OPENER_SPAWN_FAILED",
				error: `Could not launch ${command.executable}: ${String(error)}. Open opener settings.`,
			});
		}
	});
}

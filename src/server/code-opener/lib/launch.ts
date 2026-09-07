import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import type { OpenerCommand } from "@/shared/code-target";

type LaunchResult =
	| { ok: true }
	| { ok: false; code: "OPENER_UNAVAILABLE" | "OPENER_SPAWN_FAILED"; error: string };
type ResolvedOpenerCommand =
	| { ok: true; command: OpenerCommand }
	| { ok: false; code: "OPENER_UNAVAILABLE"; error: string };

/**
 * Tells whether a path names a regular file this process may execute.
 * @param candidate An absolute path.
 * @returns True for an executable regular file.
 */
function executableFile(candidate: string): boolean {
	try {
		if (!fs.statSync(candidate).isFile()) {
			return false;
		}
		fs.accessSync(candidate, fs.constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/**
 * Finds the executable an opener names, on PATH for a bare name or in place for an absolute one.
 * @param executable The executable as the selection spells it.
 * @returns The path to run, or null when nothing runnable was found.
 */
function resolveExecutable(executable: string): string | null {
	if (path.posix.isAbsolute(executable) || path.win32.isAbsolute(executable)) {
		return executableFile(executable) ? executable : null;
	}
	return Bun.which(executable) ?? null;
}

/**
 * Resolves a planned command's executable so a launch can name what it will run.
 * @param command The planned opener command.
 * @returns The command with its executable resolved, or the unavailability failure.
 */
function resolveOpenerCommand(command: OpenerCommand): ResolvedOpenerCommand {
	const executable = resolveExecutable(command.executable);
	return executable
		? { ok: true, command: { executable, argv: command.argv } }
		: {
				ok: false,
				code: "OPENER_UNAVAILABLE",
				error: `The opener executable ${command.executable} was not found. Open opener settings.`,
			};
}

/**
 * Starts the opener detached, reporting only whether the process came up.
 * @param command The planned opener command.
 * @returns Success once the child spawned, or the failure that prevented it.
 */
async function launchOpener(command: OpenerCommand): Promise<LaunchResult> {
	const resolved = resolveOpenerCommand(command);
	if (!resolved.ok) {
		return resolved;
	}
	return new Promise((resolve) => {
		let settled = false;
		let child: ReturnType<typeof spawn>;
		/**
		 * Settles the launch once, detaching the listeners that could settle it again.
		 * @param result The launch outcome.
		 */
		const finish = (result: LaunchResult): void => {
			if (settled) {
				return;
			}
			settled = true;
			child.removeListener("spawn", onSpawn);
			child.removeListener("error", onError);
			resolve(result);
		};
		/** Lets the opener outlive this process once it has started. */
		const onSpawn = (): void => {
			child.unref();
			finish({ ok: true });
		};
		/**
		 * Reports a child that could not start.
		 * @param error The spawn error.
		 */
		const onError = (error: Error): void => {
			finish({
				ok: false,
				code: "OPENER_SPAWN_FAILED",
				error: `Could not launch ${command.executable}: ${error.message}. Open opener settings.`,
			});
		};
		try {
			child = spawn(resolved.command.executable, resolved.command.argv, {
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

export { type LaunchResult, type ResolvedOpenerCommand, resolveOpenerCommand, launchOpener };

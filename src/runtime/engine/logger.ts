import winston from "winston";
import * as path from "path";
import * as fs from "fs";
import { homedir, tmpdir } from "os";

/**
 * Choose a platform-compatible default log path. Archboard commands run in
 * the caller's working directory, so a relative path would scatter log files
 * across unrelated project and cloud-synced folders.
 *
 * LOG_FILE_PATH can still override this default.
 */
function defaultLogPath(): string {
	if (process.platform === "darwin") {
		return path.join(homedir(), "Library", "Logs", "archboard.log");
	}
	if (process.platform === "win32") {
		const base = process.env["LOCALAPPDATA"] || path.join(homedir(), "AppData", "Local");
		return path.join(base, "Archboard", "archboard.log");
	}
	// Linux and other POSIX platforms: follow the XDG state convention.
	const xdgState = process.env["XDG_STATE_HOME"] || path.join(homedir(), ".local", "state");
	return path.join(xdgState, "archboard", "archboard.log");
}

const LOG_FILE_PATH = process.env["LOG_FILE_PATH"] || defaultLogPath();

/**
 * Make sure the log file's directory exists and is writable before winston opens it.
 * @param filePath The log file to prepare for.
 * @returns The same path, once its directory is known to accept writes.
 */
function ensureWritableLogFile(filePath: string): string {
	const logDir = path.dirname(filePath);
	fs.mkdirSync(logDir, { recursive: true });
	fs.accessSync(logDir, fs.constants.W_OK);
	return filePath;
}

/**
 * The log file this process will write: the configured or platform default
 * path, falling back to the temp directory when that path cannot be written
 * and nobody asked for it explicitly.
 * @returns A writable log file path.
 */
function resolveLogFilePath(): string {
	try {
		return ensureWritableLogFile(LOG_FILE_PATH);
	} catch (error) {
		if (process.env["LOG_FILE_PATH"]) {
			throw error;
		}
	}

	return ensureWritableLogFile(path.join(tmpdir(), "archboard.log"));
}

const RESOLVED_LOG_FILE_PATH = resolveLogFilePath();

const logger: winston.Logger = winston.createLogger({
	level: process.env["LOG_LEVEL"] || "info",

	format: winston.format.combine(
		winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
		winston.format.uncolorize(),
		winston.format.metadata({ fillExcept: ["message", "level", "timestamp"] }),
		winston.format.printf((info) => {
			const extra =
				info["metadata"] && Object.keys(info["metadata"]).length
					? ` ${JSON.stringify(info["metadata"])}`
					: "";
			return `${String(info["timestamp"])} [${info.level}] ${String(info.message)}${extra}`;
		}),
	),

	transports: [
		new winston.transports.Console({
			level: "warn", // only warn+error to stderr
			stderrLevels: ["warn", "error"],
		}),

		new winston.transports.File({
			filename: RESOLVED_LOG_FILE_PATH, // all levels to file
			level: "debug",
		}),
	],
});

/**
 * Flush every queued record and close each transport before process exit.
 * @param target The logger to finish; the process logger by default.
 */
export async function closeLogger(target: winston.Logger = logger): Promise<void> {
	if (target.writableFinished || target.destroyed) {
		target.close();
		return;
	}
	await new Promise<void>((resolve, reject) => {
		/** Settle once the stream has flushed, dropping the failure listener. */
		const finished = (): void => {
			target.off("error", failed);
			resolve();
		};
		/**
		 * Settle with the stream's failure, dropping the finish listener.
		 * @param error What the stream reported.
		 */
		const failed = (error: Error): void => {
			target.off("finish", finished);
			reject(error);
		};
		target.once("finish", finished);
		target.once("error", failed);
		target.end();
	});
	target.close();
}

/**
 * Terminal fallback for a logger whose normal stream finalization failed.
 * @param target The logger to tear down; the process logger by default.
 */
export function forceCloseLogger(target: winston.Logger = logger): void {
	for (const transport of target.transports) {
		transport.destroy();
	}
	target.destroy();
	target.close();
}

export { logger };
// Three files in the server area still import the default —
// canvas/lib/board-response.ts, canvas/lib/library-routes.ts and
// browser-presentation/lib/owner.ts. They are being switched to the named
// export in that area's own TASK-151 pass; this export and the disable below
// come out at integration, once they have.
// oxlint-disable-next-line no-restricted-exports -- the server area's importers land first
export default logger;

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

function ensureWritableLogFile(filePath: string): string {
	const logDir = path.dirname(filePath);
	fs.mkdirSync(logDir, { recursive: true });
	fs.accessSync(logDir, fs.constants.W_OK);
	return filePath;
}

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
			return `${String(info["timestamp"])} [${String(info.level)}] ${String(info.message)}${extra}`;
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

/** Flush every queued record and close each transport before process exit. */
export async function closeLogger(target: winston.Logger = logger): Promise<void> {
	if (target.writableFinished || target.destroyed) {
		target.close();
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const finished = (): void => {
			target.off("error", failed);
			resolve();
		};
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

/** Terminal fallback for a logger whose normal stream finalization failed. */
export function forceCloseLogger(target: winston.Logger = logger): void {
	for (const transport of target.transports) transport.destroy();
	target.destroy();
	target.close();
}

export default logger;

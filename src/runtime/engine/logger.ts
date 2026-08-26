import winston from "winston";
import * as path from "path";
import * as fs from "fs";
import { homedir, tmpdir } from "os";
import { kept } from "../../runtime/engine/hot.js";

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
		const base = process.env.LOCALAPPDATA || path.join(homedir(), "AppData", "Local");
		return path.join(base, "Archboard", "archboard.log");
	}
	// Linux and other POSIX platforms: follow the XDG state convention.
	const xdgState = process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state");
	return path.join(xdgState, "archboard", "archboard.log");
}

const LOG_FILE_PATH = process.env.LOG_FILE_PATH || defaultLogPath();

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
		if (process.env.LOG_FILE_PATH) {
			throw error;
		}
	}

	return ensureWritableLogFile(path.join(tmpdir(), "archboard.log"));
}

const RESOLVED_LOG_FILE_PATH = resolveLogFilePath();

// One logger per process, not one per module evaluation.
//
// A reload re-evaluates this file, and building the logger again would open a
// second write stream on the same log file while every module that imported
// the old one kept writing to that. Nothing crashes; the file descriptors just
// accumulate, one per reload, which is precisely the sort of quiet damage a
// reload is not allowed to do (ADR 0014).
//
// The cost is the usual one for a kept thing: editing this file changes
// nothing until the canvas is restarted.
const logger: winston.Logger = kept("logger", () =>
	winston.createLogger({
		level: process.env.LOG_LEVEL || "info",

		format: winston.format.combine(
			winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
			winston.format.uncolorize(),
			winston.format.metadata({ fillExcept: ["message", "level", "timestamp"] }),
			winston.format.printf((info) => {
				const extra =
					info.metadata && Object.keys(info.metadata).length
						? ` ${JSON.stringify(info.metadata)}`
						: "";
				return `${info.timestamp} [${info.level}] ${info.message}${extra}`;
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
	}),
);

export default logger;

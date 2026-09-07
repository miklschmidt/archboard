import fs from "node:fs";
import path from "node:path";

import type { OpenerSelection } from "@/shared/code-target";
import { writeFileAtomic } from "@/runtime/engine/atomic-write";
import { stateDir } from "@/runtime/engine/state-dir";
import { validateOpenerSelection } from "@/server/code-opener/lib/planning";

interface OpenerConfigurationSuccess {
	ok: true;
	selection: OpenerSelection;
}

interface OpenerConfigurationFailure {
	ok: false;
	code: "OPENER_CONFIG_INVALID";
	error: string;
}

type OpenerConfigurationResult = OpenerConfigurationSuccess | OpenerConfigurationFailure;

const DEFAULT_SELECTION: OpenerSelection = { version: 1, kind: "platform" };

/**
 * Tells whether a thrown value is the file-system error for a missing file.
 * @param error The value a file read threw.
 * @returns True when the error carries the ENOENT code.
 */
function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
	);
}

/**
 * Locates the opener state file, honouring the override used by tests and launchers.
 * @returns The absolute path of the opener state file.
 */
function openerConfigPath(): string {
	return process.env["ARCHBOARD_OPENER_CONFIG"] || path.join(stateDir(), "opener.json");
}

/**
 * Reads the persisted opener selection, treating an absent file as the platform default.
 * @returns The selection, or a configuration failure when the file is unreadable or invalid.
 */
function readOpenerSelection(): OpenerConfigurationResult {
	const file = openerConfigPath();
	let raw: string;
	try {
		raw = fs.readFileSync(file, "utf8");
	} catch (error) {
		if (isMissingFileError(error)) {
			return { ok: true, selection: DEFAULT_SELECTION };
		}
		return { ok: false, code: "OPENER_CONFIG_INVALID", error: `Cannot read ${file}.` };
	}
	try {
		const selection = validateOpenerSelection(JSON.parse(raw));
		return "ok" in selection ? selection : { ok: true, selection };
	} catch {
		return {
			ok: false,
			code: "OPENER_CONFIG_INVALID",
			error: `The opener state at ${file} is invalid.`,
		};
	}
}

/**
 * Validates a selection and writes it atomically to the opener state file.
 * @param selection The candidate selection, not yet trusted.
 * @returns The stored selection, or a configuration failure.
 */
function writeSelection(selection: unknown): OpenerConfigurationResult {
	const validated = validateOpenerSelection(selection);
	if ("ok" in validated) {
		return validated;
	}
	const file = openerConfigPath();
	try {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		writeFileAtomic(file, `${JSON.stringify(validated, null, 2)}\n`);
		return { ok: true, selection: validated };
	} catch {
		return { ok: false, code: "OPENER_CONFIG_INVALID", error: `Cannot write ${file}.` };
	}
}

/**
 * Replaces the opener selection, refusing to overwrite a state file it cannot read.
 * @param selection The candidate selection, not yet trusted.
 * @returns The stored selection, or a configuration failure.
 */
function saveOpenerSelection(selection: unknown): OpenerConfigurationResult {
	const current = readOpenerSelection();
	if (!current.ok) {
		return current;
	}
	return writeSelection(selection);
}

/**
 * Restores the platform-default opener selection.
 * @returns The stored default selection, or a configuration failure.
 */
function resetOpenerSelection(): OpenerConfigurationResult {
	return writeSelection(DEFAULT_SELECTION);
}

export {
	type OpenerConfigurationSuccess,
	type OpenerConfigurationFailure,
	type OpenerConfigurationResult,
	openerConfigPath,
	readOpenerSelection,
	saveOpenerSelection,
	resetOpenerSelection,
};

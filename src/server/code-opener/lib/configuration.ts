import fs from "node:fs";
import path from "node:path";

import type { OpenerSelection } from "../../../shared/code-target/index.js";
import { writeFileAtomic } from "../../../runtime/engine/atomic-write.js";
import { stateDir } from "../../../runtime/engine/state-dir.js";
import { validateOpenerSelection } from "./planning.js";

export interface OpenerConfigurationSuccess {
	ok: true;
	selection: OpenerSelection;
}

export interface OpenerConfigurationFailure {
	ok: false;
	code: "OPENER_CONFIG_INVALID";
	error: string;
}

export type OpenerConfigurationResult = OpenerConfigurationSuccess | OpenerConfigurationFailure;

const DEFAULT_SELECTION: OpenerSelection = { version: 1, kind: "platform" };

export function openerConfigPath(): string {
	return process.env.ARCHBOARD_OPENER_CONFIG || path.join(stateDir(), "opener.json");
}

export function readOpenerSelection(): OpenerConfigurationResult {
	const file = openerConfigPath();
	let raw: string;
	try {
		raw = fs.readFileSync(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
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

function writeSelection(selection: unknown): OpenerConfigurationResult {
	const validated = validateOpenerSelection(selection);
	if ("ok" in validated) return validated;
	const file = openerConfigPath();
	try {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		writeFileAtomic(file, `${JSON.stringify(validated, null, 2)}\n`);
		return { ok: true, selection: validated };
	} catch {
		return { ok: false, code: "OPENER_CONFIG_INVALID", error: `Cannot write ${file}.` };
	}
}

export function saveOpenerSelection(selection: unknown): OpenerConfigurationResult {
	const current = readOpenerSelection();
	if (!current.ok) return current;
	return writeSelection(selection);
}

export function resetOpenerSelection(): OpenerConfigurationResult {
	return writeSelection(DEFAULT_SELECTION);
}

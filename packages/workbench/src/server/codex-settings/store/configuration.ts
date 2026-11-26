import fs from "node:fs";
import path from "node:path";

import { logger } from "@archboard/diagnostics/logger";
import { writeFileAtomic } from "@archboard/workspace/atomic-write";
import { stateDir } from "@archboard/workspace/state-dir";
import type { VoiceAgentModelPreferences } from "@archboard/codex-realtime-voice/server";
import {
	CodexModelPreferencesSchema,
	type CodexModelPreferences,
} from "#shared/codex-settings/schemas/codex-settings.ts";

interface CodexModelConfigSuccess {
	readonly ok: true;
	readonly selection: CodexModelPreferences;
}

interface CodexModelConfigFailure {
	readonly ok: false;
	readonly code: "CODEX_CONFIG_INVALID";
	readonly error: string;
}

type CodexModelConfigResult = CodexModelConfigSuccess | CodexModelConfigFailure;

const DEFAULT_CODEX_MODEL_PREFERENCES: CodexModelPreferences = Object.freeze({
	version: 1,
	orchestrator: null,
	workhorse: null,
});

/**
 * Tell whether a file-system error means the state file does not exist yet.
 * @param error The error thrown by reading the file.
 * @returns True when the error carries ENOENT.
 */
function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

/**
 * Locate the persisted Codex model settings file, honouring the test override env var.
 * @returns Absolute path of the Codex model settings file.
 */
function codexModelsConfigPath(): string {
	return process.env["ARCHBOARD_CODEX_MODELS_CONFIG"] || path.join(stateDir(), "codex-models.json");
}

/**
 * Read the persisted Codex model preferences, treating a missing file as defaults.
 * @returns The stored preferences or a configuration failure when unreadable or invalid.
 */
function readCodexModelPreferences(): CodexModelConfigResult {
	const file = codexModelsConfigPath();
	let raw: string;
	try {
		raw = fs.readFileSync(file, "utf8");
	} catch (error) {
		if (isMissingFileError(error)) {
			return { ok: true, selection: DEFAULT_CODEX_MODEL_PREFERENCES };
		}
		return { ok: false, code: "CODEX_CONFIG_INVALID", error: `Cannot read ${file}.` };
	}
	try {
		const parsed = CodexModelPreferencesSchema.safeParse(JSON.parse(raw));
		if (!parsed.success) {
			return {
				ok: false,
				code: "CODEX_CONFIG_INVALID",
				error: `The Codex model settings at ${file} are invalid.`,
			};
		}
		return { ok: true, selection: parsed.data };
	} catch {
		return {
			ok: false,
			code: "CODEX_CONFIG_INVALID",
			error: `The Codex model settings at ${file} are invalid.`,
		};
	}
}

/**
 * Atomically persist validated Codex model preferences to the state file.
 * @param selection Candidate preferences to validate and store.
 * @returns The stored preferences or a configuration failure.
 */
function writeCodexModelPreferences(selection: unknown): CodexModelConfigResult {
	const parsed = CodexModelPreferencesSchema.safeParse(selection);
	if (!parsed.success) {
		return {
			ok: false,
			code: "CODEX_CONFIG_INVALID",
			error: "The Codex model preferences payload is invalid.",
		};
	}
	const file = codexModelsConfigPath();
	try {
		fs.mkdirSync(path.dirname(file), { recursive: true });
		writeFileAtomic(file, `${JSON.stringify(parsed.data, null, 2)}\n`);
		return { ok: true, selection: parsed.data };
	} catch {
		return { ok: false, code: "CODEX_CONFIG_INVALID", error: `Cannot write ${file}.` };
	}
}

/**
 * Save updated Codex model preferences after verifying the existing file is readable.
 * @param selection Candidate preferences to persist.
 * @returns The saved preferences or a configuration failure.
 */
function saveCodexModelPreferences(selection: CodexModelPreferences): CodexModelConfigResult {
	const current = readCodexModelPreferences();
	if (!current.ok) {
		return current;
	}
	return writeCodexModelPreferences(selection);
}

/**
 * Reset Codex model preferences back to the built-in defaults.
 * @returns The reset preferences or a configuration failure.
 */
function resetCodexModelPreferences(): CodexModelConfigResult {
	return writeCodexModelPreferences(DEFAULT_CODEX_MODEL_PREFERENCES);
}

/**
 * Read current model preferences in the voice-agent coordinator/workhorse shape.
 * Falls back to defaults when the state file cannot be read so threads can still start.
 * @returns Optional overrides for coordinator and workhorse threads.
 */
function readVoiceAgentModelPreferences(): VoiceAgentModelPreferences {
	const current = readCodexModelPreferences();
	if (!current.ok) {
		logger().error("Cannot read Codex model preferences; using defaults:", current.error);
		return { coordinator: null, workhorse: null };
	}
	return {
		coordinator: current.selection.orchestrator,
		workhorse: current.selection.workhorse,
	};
}

export {
	DEFAULT_CODEX_MODEL_PREFERENCES,
	readCodexModelPreferences,
	saveCodexModelPreferences,
	resetCodexModelPreferences,
	readVoiceAgentModelPreferences,
	type CodexModelConfigResult,
};

import path from "node:path";

import {
	OpenerSelectionSchema,
	PATH_TOKEN,
	type CodeTargetFailureCode,
	type OpenerCommand,
	type OpenerSelection,
} from "../../../shared/code-target/index.js";

export interface OpenerPlanSuccess {
	ok: true;
	command: OpenerCommand;
}

export interface OpenerPlanFailure {
	ok: false;
	code: Extract<CodeTargetFailureCode, "OPENER_CONFIG_INVALID" | "OPENER_PLATFORM_UNSUPPORTED">;
	error: string;
}

export type OpenerPlan = OpenerPlanSuccess | OpenerPlanFailure;
export type OpenerSelectionInvalid = OpenerPlanFailure & { code: "OPENER_CONFIG_INVALID" };

const PRESET_EXECUTABLES = { vscode: "code", cursor: "cursor", zed: "zed" } as const;
const PLATFORM_EXECUTABLES: Readonly<Record<string, string | undefined>> = {
	darwin: "open",
	linux: "xdg-open",
	win32: "explorer.exe",
};

function invalid(error: string): OpenerSelectionInvalid {
	return { ok: false, code: "OPENER_CONFIG_INVALID", error };
}

function validExecutable(value: string): boolean {
	const hasSeparator = value.includes("/") || value.includes("\\");
	return !hasSeparator || path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}

export function validateOpenerSelection(
	selection: unknown,
): OpenerSelection | OpenerSelectionInvalid {
	const parsed = OpenerSelectionSchema.safeParse(selection);
	if (!parsed.success) return invalid("The opener selection is invalid.");
	if (parsed.data.kind === "custom" && !validExecutable(parsed.data.executable)) {
		return invalid("A custom executable must be absolute or a bare PATH name.");
	}
	return parsed.data;
}

export function planOpenerCommand(
	selection: OpenerSelection,
	target: string,
	platform: string = process.platform,
): OpenerPlan {
	const validated = validateOpenerSelection(selection);
	if ("ok" in validated) return validated;
	if (validated.kind === "platform") {
		const executable = PLATFORM_EXECUTABLES[platform];
		return executable
			? { ok: true, command: { executable, argv: [target] } }
			: {
					ok: false,
					code: "OPENER_PLATFORM_UNSUPPORTED",
					error: `Archboard has no native opener for ${platform}. Choose a custom opener.`,
				};
	}
	if (validated.kind === "preset") {
		return {
			ok: true,
			command: { executable: PRESET_EXECUTABLES[validated.preset], argv: [target] },
		};
	}
	return {
		ok: true,
		command: {
			executable: validated.executable,
			argv: validated.argv.map((argument) => argument.replace(PATH_TOKEN, target)),
		},
	};
}

import {
	OpenerSelectionSchema,
	PATH_TOKEN,
	isAbsoluteOrBareOpenerExecutable,
	type CodeTargetFailureCode,
	type OpenerCommand,
	type OpenerSelection,
} from "@/shared/code-target";

interface OpenerPlanSuccess {
	ok: true;
	command: OpenerCommand;
}

interface OpenerPlanFailure {
	ok: false;
	code: Extract<CodeTargetFailureCode, "OPENER_CONFIG_INVALID" | "OPENER_PLATFORM_UNSUPPORTED">;
	error: string;
}

type OpenerPlan = OpenerPlanSuccess | OpenerPlanFailure;
type OpenerSelectionInvalid = OpenerPlanFailure & { code: "OPENER_CONFIG_INVALID" };

const PRESET_EXECUTABLES = { vscode: "code", cursor: "cursor", zed: "zed" } as const;
const PLATFORM_EXECUTABLES: Readonly<Record<string, string | undefined>> = {
	darwin: "open",
	linux: "xdg-open",
	win32: "explorer.exe",
};

/**
 * Builds the failure that names an unusable opener selection.
 * @param error Why the selection is refused.
 * @returns The configuration-invalid failure.
 */
function invalid(error: string): OpenerSelectionInvalid {
	return { ok: false, code: "OPENER_CONFIG_INVALID", error };
}

/**
 * Checks a selection against the schema and the rule that a custom executable is absolute or bare.
 * @param selection The candidate selection, not yet trusted.
 * @returns The typed selection, or the failure describing why it is refused.
 */
function validateOpenerSelection(selection: unknown): OpenerSelection | OpenerSelectionInvalid {
	const parsed = OpenerSelectionSchema.safeParse(selection);
	if (!parsed.success) {
		return invalid("The opener selection is invalid.");
	}
	if (parsed.data.kind === "custom" && !isAbsoluteOrBareOpenerExecutable(parsed.data.executable)) {
		return invalid("A custom executable must be absolute or a bare PATH name.");
	}
	return parsed.data;
}

/**
 * Turns a selection into the command line that opens one target path.
 * @param selection The opener selection to plan for.
 * @param target The path to open, substituted for the path token in a custom argv.
 * @param platform The platform whose native opener a platform selection maps to.
 * @returns The planned command, or the failure when the selection cannot be planned here.
 */
function planOpenerCommand(
	selection: OpenerSelection,
	target: string,
	platform: string = process.platform,
): OpenerPlan {
	const validated = validateOpenerSelection(selection);
	if ("ok" in validated) {
		return validated;
	}
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

export {
	type OpenerPlanSuccess,
	type OpenerPlanFailure,
	type OpenerPlan,
	type OpenerSelectionInvalid,
	validateOpenerSelection,
	planOpenerCommand,
};

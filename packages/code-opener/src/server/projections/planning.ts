import {
	LINE_TOKEN,
	OpenerSelectionSchema,
	PATH_TOKEN,
	type OpenerCommand,
	type OpenerSelection,
} from "#shared/schemas/opener-settings.ts";
import { isAbsoluteOrBareOpenerExecutable } from "#shared/rules/opener-executable.ts";
import type { CodeTargetFailureCode } from "#shared/schemas/code-target-open.ts";

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
 * The arguments with which a named editor opens a path, at a line where there is one.
 * @param preset The editor.
 * @param target The path to open.
 * @param line The line to open at, if there is one.
 * @returns Its arguments.
 */
function presetArguments(
	preset: keyof typeof PRESET_EXECUTABLES,
	target: string,
	line: PlanOptions["line"],
): string[] {
	if (line === undefined) {
		return [target];
	}
	return preset === "zed" ? [`${target}:${line}`] : ["--goto", `${target}:${line}`];
}

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

/** What a plan may depend on besides the selection and the path. */
interface PlanOptions {
	/**
	 * The line to open at, where the binding's symbol was found, or `{line}` itself
	 * where the command is shown with its tokens rather than run.
	 */
	line?: number | typeof LINE_TOKEN | undefined;
	/** The platform whose native opener a platform selection maps to. */
	platform?: string;
}

/**
 * The arguments of a custom opener, with its tokens replaced.
 * @param argv The arguments as the selection spells them.
 * @param target The path to open, for `{path}`.
 * @param line The line to open at, for `{line}`, which reads 1 where there is none.
 * @returns The arguments to run with.
 */
function customArguments(argv: readonly string[], target: string, line: PlanOptions["line"]) {
	const lineText = String(line ?? 1);
	// The path goes in last, so a path that happens to contain `{line}` is never read as one.
	return argv.map((argument) =>
		argument
			.split(PATH_TOKEN)
			.map((part) => part.replaceAll(LINE_TOKEN, lineText))
			.join(target),
	);
}

/**
 * Turns a selection into the command line that opens one target path, at a
 * line where the opener can say so. The editors that Archboard names open at a
 * line: `code` and `cursor` with `--goto path:line`, `zed` with `path:line`. The
 * native opener of a platform has no line, so it opens the file. A custom opener
 * gets the line only where its argument writes `{line}`, and reads 1 where the
 * binding has no line. Planned for `{path}` at `{line}`, it is the command as the
 * opener settings show it.
 * @param selection The opener selection to plan for.
 * @param target The path to open, substituted for the path token in a custom argv.
 * @param options What else the plan depends on: the line to open at, and the
 * platform whose native opener a platform selection maps to.
 * @returns The planned command, or the failure when the selection cannot be planned here.
 */
function planOpenerCommand(
	selection: OpenerSelection,
	target: string,
	options: PlanOptions = {},
): OpenerPlan {
	const validated = validateOpenerSelection(selection);
	if ("ok" in validated) {
		return validated;
	}
	if (validated.kind === "platform") {
		return planPlatformOpener(target, options.platform ?? process.platform);
	}
	const command =
		validated.kind === "preset"
			? {
					executable: PRESET_EXECUTABLES[validated.preset],
					argv: presetArguments(validated.preset, target, options.line),
				}
			: {
					executable: validated.executable,
					argv: customArguments(validated.argv, target, options.line),
				};
	return { ok: true, command };
}

/**
 * The plan for the native opener of a platform, which has no line.
 * @param target The path to open.
 * @param platform The platform.
 * @returns The command, or the failure when Archboard knows no native opener there.
 */
function planPlatformOpener(target: string, platform: string): OpenerPlan {
	const executable = PLATFORM_EXECUTABLES[platform];
	return executable
		? { ok: true, command: { executable, argv: [target] } }
		: {
				ok: false,
				code: "OPENER_PLATFORM_UNSUPPORTED",
				error: `Archboard has no native opener for ${platform}. Choose a custom opener.`,
			};
}

export {
	type OpenerPlanSuccess,
	type OpenerPlanFailure,
	type OpenerPlan,
	type OpenerSelectionInvalid,
	type PlanOptions,
	validateOpenerSelection,
	planOpenerCommand,
};

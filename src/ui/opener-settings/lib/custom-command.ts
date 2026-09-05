// Pure helpers behind the opener form: the radio choice for a selection, the
// draft for a custom command, and the check that turns a draft back into a
// selection through the shared schema. No second schema lives here.

import {
	OpenerSelectionSchema,
	PATH_TOKEN,
	isAbsoluteOrBareOpenerExecutable,
	type OpenerSelection,
} from "@/shared/code-target";
import type {
	CustomCommandCheck,
	CustomCommandDraft,
	CustomCommandIssues,
	OpenerChoice,
} from "@/ui/opener-settings/lib/contracts";

type PresetName = Extract<OpenerSelection, { kind: "preset" }>["preset"];

const EXECUTABLE_SHAPE_MESSAGE =
	"Use a bare command name found on PATH, or an absolute path to the executable.";

/**
 * The radio entry for a preset.
 * @param preset The preset name.
 * @returns Its radio value.
 */
function presetChoice(preset: PresetName): OpenerChoice {
	return `preset:${preset}`;
}

/**
 * The radio entry a saved selection lands on.
 * @param selection The saved selection.
 * @returns Its radio value.
 */
function choiceOfSelection(selection: OpenerSelection): OpenerChoice {
	switch (selection.kind) {
		case "platform":
			return "platform";
		case "preset":
			return presetChoice(selection.preset);
		default:
			return "custom";
	}
}

/**
 * The preset a radio entry names, or null for the other entries.
 * @param choice The radio value.
 * @returns The preset name, or null.
 */
function presetOfChoice(choice: OpenerChoice): PresetName | null {
	switch (choice) {
		case "preset:vscode":
			return "vscode";
		case "preset:cursor":
			return "cursor";
		case "preset:zed":
			return "zed";
		default:
			return null;
	}
}

/**
 * The custom form's starting text. A non-custom selection starts the form
 * with the one argument every custom command needs.
 * @param selection The saved selection.
 * @returns The draft.
 */
function draftOfSelection(selection: OpenerSelection): CustomCommandDraft {
	if (selection.kind !== "custom") {
		return { executable: "", argvText: PATH_TOKEN };
	}
	return { executable: selection.executable, argvText: selection.argv.join("\n") };
}

/**
 * One argument per line; blank lines are not arguments.
 * @param text The textarea's text.
 * @returns The argv.
 */
function argvOfText(text: string): string[] {
	return text
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

/**
 * Where a schema issue belongs.
 * @param path The issue's path.
 * @returns The field.
 */
function fieldOfPath(path: readonly PropertyKey[]): "executable" | "argv" {
	return path[0] === "executable" ? "executable" : "argv";
}

type ParsedSelection = ReturnType<typeof OpenerSelectionSchema.safeParse>;

/**
 * The executable-shape rule the server applies before it spawns anything.
 * @param executable The trimmed executable.
 * @returns The message, or nothing when the shape is acceptable or blank.
 */
function shapeIssues(executable: string): readonly string[] {
	return executable !== "" && !isAbsoluteOrBareOpenerExecutable(executable)
		? [EXECUTABLE_SHAPE_MESSAGE]
		: [];
}

/**
 * The shared schema's own messages, routed to their field.
 * @param shape The shape issues already found.
 * @param parsed The schema's verdict.
 * @returns Shape and schema messages together, per field.
 */
function mergeSchemaIssues(shape: readonly string[], parsed: ParsedSelection): CustomCommandIssues {
	const executable = [...shape];
	const argv: string[] = [];
	if (parsed.success) {
		return { executable, argv };
	}
	for (const issue of parsed.error.issues) {
		(fieldOfPath(issue.path) === "executable" ? executable : argv).push(issue.message);
	}
	return { executable, argv };
}

/**
 * Check a custom command through the shared schema, plus the executable-shape
 * rule the server applies before it spawns anything.
 * @param draft What the person typed.
 * @returns The accepted selection, or the messages per field.
 */
function checkCustomCommand(draft: CustomCommandDraft): CustomCommandCheck {
	const executable = draft.executable.trim();
	const argv = argvOfText(draft.argvText);
	const shape = shapeIssues(executable);
	const parsed = OpenerSelectionSchema.safeParse({ version: 1, kind: "custom", executable, argv });
	if (parsed.success && parsed.data.kind === "custom" && shape.length === 0) {
		return { ok: true, selection: parsed.data };
	}
	return { ok: false, issues: mergeSchemaIssues(shape, parsed) };
}

/**
 * The selection a radio choice and the custom draft describe.
 * @param choice The radio value.
 * @param draft The custom command, read only for the custom choice.
 * @returns The selection to save or test, or the custom form's issues.
 */
function selectionOfChoice(
	choice: OpenerChoice,
	draft: CustomCommandDraft,
): { ok: true; selection: OpenerSelection } | Extract<CustomCommandCheck, { ok: false }> {
	if (choice === "platform") {
		return { ok: true, selection: { version: 1, kind: "platform" } };
	}
	const preset = presetOfChoice(choice);
	if (preset !== null) {
		return { ok: true, selection: { version: 1, kind: "preset", preset } };
	}
	return checkCustomCommand(draft);
}

export {
	argvOfText,
	checkCustomCommand,
	choiceOfSelection,
	draftOfSelection,
	presetChoice,
	presetOfChoice,
	selectionOfChoice,
	type PresetName,
};

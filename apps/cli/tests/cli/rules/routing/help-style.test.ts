// The layout of a description survives Commander's wrapping, and its emphasis
// follows Commander's own decision about the output.

import { expect, test } from "bun:test";
import { Command } from "commander";
import { HELP_STYLE } from "#cli/rules/routing/help-style.ts";

const DESCRIPTION = [
	"A paragraph.",
	"",
	"Warnings:",
	"- CODE: a list item that is long enough to wrap past the width of the help text.",
	"- Another one names `repo language-server`.",
].join("\n");

/**
 * The help of one command with the description, at a width of 40.
 * @param colors - Whether the output shows emphasis.
 * @returns The help text.
 */
function help(colors: boolean): string {
	return new Command("x")
		.description(DESCRIPTION)
		.configureHelp(HELP_STYLE)
		.configureOutput({ getOutHelpWidth: () => 40, getOutHasColors: () => colors })
		.helpInformation();
}

test("a wrapped list item goes on under its first word, and no emphasis keeps the text as written", () => {
	const lines = help(false).split("\n");
	const item = lines.findIndex((line) => line.startsWith("- CODE:"));
	expect(lines[item + 1]).toMatch(/^ {2}\S/u);
	expect(lines).toContain("Warnings:");
	expect(help(false)).toContain("`repo");
});

test("with emphasis a heading is bold and a code span loses its backticks", () => {
	const text = help(true);
	expect(text).toContain("\u001b[1mWarnings:\u001b[22m");
	expect(text).not.toContain("`");
});

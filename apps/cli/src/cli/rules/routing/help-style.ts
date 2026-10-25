// How help text looks in a terminal: the layout a contract's description
// writes, kept when Commander wraps it, and a little emphasis.
//
// A description is plain text. A blank line starts a paragraph, a line that
// ends with a colon is a heading, a line that starts with `-` or `1.` is a list
// item, and a word in backticks is code. Commander wraps every line; a list
// item's wrapped lines keep the indent of its text. Commander alone decides
// whether the output shows emphasis (NO_COLOR, FORCE_COLOR, a terminal), and
// without it a code span keeps its backticks.

import { Help, type HelpConfiguration } from "commander";
import { stripVTControlCharacters, styleText } from "node:util";

/** A list item's start: its indent, its marker and the space after it. */
const LIST_ITEM = /^\s*(?:[-*]|\d+\.)\s+/u;

/** A word or words in backticks. */
const CODE = /`([^`]+)`/gu;

/**
 * A heading in bold. Commander strips the emphasis where the output shows none.
 * @param text - The heading.
 * @returns The heading as printed.
 */
function heading(text: string): string {
	return styleText("bold", text, { validateStream: false });
}

/**
 * One line of a description with its emphasis: a heading in bold and each
 * code span in cyan, without its backticks.
 * @param line - The line.
 * @returns The line as printed.
 */
function styledLine(line: string): string {
	if (line.endsWith(":") && !LIST_ITEM.test(line)) return heading(line);
	return line.replaceAll(CODE, (_span, code: string) =>
		styleText("cyan", code, { validateStream: false }),
	);
}

/** Commander's help, with whether this output shows emphasis. */
interface StyledHelp extends Help {
	colors?: boolean;
}

/**
 * Wraps text as Commander does, but a list item's wrapped lines start under
 * its first word, not at the margin.
 * @param this - Commander's help, for its own wrapping of one line.
 * @param text - The text, with its line breaks.
 * @param width - The width to wrap at.
 * @returns The wrapped text.
 */
function boxWrap(this: Help, text: string, width: number): string {
	if (width < this.minWidthToWrap) return text;
	// Commander's narrowest width applies to the whole line, not to an item's text after its marker.
	const helper = new Help();
	helper.minWidthToWrap = 0;
	return text
		.split("\n")
		.map((line) => {
			const hang = LIST_ITEM.exec(line)?.[0].length ?? 0;
			if (hang === 0) return Help.prototype.boxWrap.call(this, line, width);
			const lead = line.slice(0, hang);
			return Help.prototype.boxWrap
				.call(helper, line.slice(hang), width - hang)
				.split("\n")
				.map((wrapped, index) => (index === 0 ? lead : " ".repeat(hang)) + wrapped)
				.join("\n");
		})
		.join("\n");
}

/** What every command's help takes from this module. */
const HELP_STYLE: HelpConfiguration = {
	/**
	 * Keeps Commander's width, and whether the output shows emphasis.
	 * @param this - The help.
	 * @param context - What Commander knows of the output.
	 * @param context.helpWidth - The width to wrap at.
	 * @param context.outputHasColors - Whether the output shows emphasis.
	 */
	prepareContext(
		this: StyledHelp,
		context: { helpWidth?: number; outputHasColors?: boolean },
	): void {
		Help.prototype.prepareContext.call(this, context);
		this.colors = context.outputHasColors === true;
	},
	styleTitle: heading,
	/**
	 * A description with its headings and code spans styled, or as written
	 * where the output shows no emphasis.
	 * @param this - The help.
	 * @param text - The description.
	 * @returns The description as printed.
	 */
	styleCommandDescription(this: StyledHelp, text: string): string {
		return this.colors === true ? text.split("\n").map(styledLine).join("\n") : text;
	},
	boxWrap,
};

/**
 * Text printed after Commander's help, with emphasis only where the help has it.
 * @param text - The text, possibly with emphasis.
 * @param colors - Whether the output shows emphasis.
 * @returns The text as printed.
 */
function afterText(text: string, colors: boolean): string {
	return colors ? text : stripVTControlCharacters(text);
}

export { HELP_STYLE, afterText, heading };

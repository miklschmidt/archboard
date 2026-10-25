import { VaultDiagnosticSchema } from "@archboard/board/policy";
// What a person types into a semantic board command, before it is a command.
//
// Reading a stated architecture off a file or standard input, refusing what is
// not one, and saying what a selector may be. None of it is about any one
// command, and all of it is shared by four, so it lives here rather than in the
// file that defines them.

import { z } from "zod";
import type { renderSemanticBoardOnServer } from "#cli/clients/server/semantic-boards.ts";
import { CliUsageError, type CommandContext } from "#cli/protocol/contract/contract.ts";
import { statedInvocation } from "@archboard/server-lifecycle/server-client";
import {
	addressedVariant,
	SemanticBoardSchema,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import type { RenderedChanges, RenderedVariantSchema } from "@archboard/board/render-reply";

type RenderedVariant = z.infer<typeof RenderedVariantSchema>;

/**
 * What a variant option means when it is left out, said the same way by every
 * command that takes one.
 */
const UNNAMED_VARIANT =
	"when absent, the one the board's name opens: its current variant, or its draft on a board " +
	"nobody has built";

/**
 * What a drawing command's help says about the picture it draws: which other
 * variant is in it, and that the receipt names that one.
 */
const DRAWN_AGAINST =
	"By default, every variant but the current one is drawn as the comparison with the current one, or on a " +
	"board with none with the variant it came from. Use --no-comparison to hide its marks and removed subjects";

/**
 * The variant a command named, or the one the board's name opens.
 * @param board The board as read.
 * @param asked The variant id or name typed, if any.
 * @returns The variant.
 * @throws {CliUsageError} When the address opens nothing, saying why.
 */
function askedVariant(board: SemanticBoard, asked: string | undefined): SemanticVariant {
	const found = addressedVariant(board, asked);
	if (!found.ok) {
		throw new CliUsageError(`"${board.name}": ${found.problem}`);
	}
	return found.variant;
}

/**
 * The variant a picture was drawn against, for the receipt that answers a draw.
 *
 * A variant read against another is drawn as the comparison with it, and neither
 * the SVG nor the PNG says so. Both drawing commands therefore carry the other
 * side on their receipt, and they read it the same way here so the two answers
 * cannot drift apart.
 * @param drawn What the render answered.
 * @param drawn.changes How it differs from the variant it is read against, or null.
 * @param noComparison Whether the caller hid comparison treatment.
 * @returns That variant, or null when there is nothing to read it against.
 */
function drawnAgainst(
	drawn: { readonly changes: RenderedChanges | null },
	noComparison = false,
): RenderedVariant | null {
	return noComparison || drawn.changes === null ? null : drawn.changes.against;
}

type RenderOptions = NonNullable<Parameters<typeof renderSemanticBoardOnServer>[1]>;

/**
 * Select the same self-contained picture for SVG, PNG and clipboard output.
 * @param input The requested variant, view, theme, layout, comparison treatment, title and legend.
 * @returns The request, whose picture draws its words as glyphs, so it outlives its server.
 */
function exportRenderRequest(
	input: {
		[Key in keyof Omit<RenderOptions, "comparison" | "title" | "titled" | "legendOnly">]?:
			| RenderOptions[Key]
			| undefined;
	} & {
		noComparison: boolean;
		title?: string | true | undefined;
		legendOnly?: boolean | undefined;
	},
): RenderOptions {
	return {
		...selectedVariant(input),
		...(input.theme === undefined ? {} : { theme: input.theme }),
		...(input.layout === undefined ? {} : { layout: input.layout }),
		...(input.noComparison ? { comparison: "off" } : {}),
		...framingRequest(input),
	};
}

/**
 * Which variant and view an export draws, and which variant it is read against.
 * @param input The requested variant, view and variant to read it against.
 * @param input.variant The variant, by id or name.
 * @param input.view The view, by id or name.
 * @param input.against The id of the variant to read it against.
 * @returns The route's parameters.
 */
function selectedVariant(input: {
	variant?: string | undefined;
	view?: string | undefined;
	against?: string | undefined;
}): Pick<RenderOptions, "variant" | "view" | "against"> {
	return {
		...(input.variant === undefined ? {} : { variant: input.variant }),
		...(input.view === undefined ? {} : { view: input.view }),
		...(input.against === undefined ? {} : { against: input.against }),
	};
}

/**
 * What an export asks to carry beside its drawing, as the render route reads it.
 * @param input The requested title and legend.
 * @param input.title Words for the title, or true for the names of what is drawn.
 * @param input.legend How the legend is laid out.
 * @param input.legendOnly Whether the legend is drawn alone.
 * @returns The route's title and legend parameters.
 */
function framingRequest(input: {
	title?: string | true | undefined;
	legend?: RenderOptions["legend"] | undefined;
	legendOnly?: boolean | undefined;
}): Pick<RenderOptions, "title" | "titled" | "legend" | "legendOnly"> {
	return {
		...(input.title === true
			? { titled: "on" }
			: input.title === undefined
				? {}
				: { title: input.title }),
		...(input.legend === undefined ? {} : { legend: input.legend }),
		...(input.legendOnly === true ? { legendOnly: "on" } : {}),
	};
}

/**
 * The stated change, from a file when one was named and standard input
 * otherwise. Nothing is invented when neither is there: a create with no stated
 * content is an empty board, which is a board somebody meant to start.
 * @param input What the command was given.
 * @param input.input A file to read the change from, when one was named.
 * @param context The command context.
 * @returns The parsed JSON, or undefined when nothing was stated.
 * @throws {CliUsageError} When what arrived is not JSON.
 */
async function statedJson(
	input: { readonly input?: string | undefined },
	context: CommandContext,
): Promise<unknown> {
	const text =
		input.input === undefined
			? (await context.readStdin()).trim()
			: context.readTextFile(context.resolvePath(input.input));
	if (text === "") {
		return undefined;
	}
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new CliUsageError(
			`The stated change is not JSON: ${error instanceof Error ? error.message : "unreadable"}`,
		);
	}
}

/**
 * The stated architecture with the name the command line gave it.
 *
 * The name is the command's, not the file's: a stated architecture is content,
 * and asking a person to keep the two in step would make renaming a board a
 * two-file edit.
 *
 * Nothing stated is an empty board, which is a board somebody meant to start.
 * Something stated that is not an architecture is a mistake, and it is said so
 * rather than quietly becoming an empty board — a `null`, a number or a list
 * arriving here is a producer that got its shape wrong, and creating an empty
 * board for it would hide that until somebody opened the board and found
 * nothing on it.
 * @param stated What was stated, or undefined when nothing was.
 * @param name The board's name.
 * @returns The create input, before it is validated.
 * @throws {CliUsageError} When something was stated that is not an object.
 */
function named(stated: unknown, name: string): Record<string, unknown> {
	if (stated === undefined) {
		return { name };
	}
	if (typeof stated !== "object" || stated === null || Array.isArray(stated)) {
		return failStated(stated);
	}
	return { ...stated, name };
}

/**
 * Refuse a stated architecture that is not one.
 * @param stated What arrived.
 * @throws {CliUsageError} Always.
 */
function failStated(stated: unknown): never {
	throw new CliUsageError(
		`The stated architecture must be a JSON object with \`nodes\` and \`edges\`, not ${describeJson(stated)}. ` +
			"Leave it out entirely to start an empty board.",
	);
}

/**
 * What arrived, in one word, for a refusal to quote.
 * @param value What arrived.
 * @returns The word.
 */
function describeJson(value: unknown): string {
	if (value === null) {
		return "null";
	}
	return Array.isArray(value) ? "a list" : `a ${typeof value}`;
}

/**
 * A selector somebody typed. Leaving one out asks for the default — the variant
 * the board's name opens, the whole of it — but typing one that says nothing
 * (`--view ''`) is a command that went wrong before it got here, and drawing the
 * whole variant for it would quietly answer a question nobody asked.
 */
const SelectorSchema = z.string().trim().min(1);

/**
 * The stated change with the variant the command line named.
 *
 * Which variant a write lands on is one fact with two places to say it: the
 * `--variant` flag every variant command takes, and the stated change's own
 * `variant`. The flag wins — it is the part somebody typed, and refusing the
 * pair would turn a redundancy into a wasted call — but it does not win
 * quietly: where the two are not written the same, the write says which one it
 * took and which it passed over, on standard error with every other warning,
 * leaving the machine-readable answer on stdout the board and nothing else. It
 * says it where it notices, not with the answer: a flag naming no variant is
 * refused by the server, and that is the run where hearing it matters most.
 *
 * What is compared is what was typed, because that is all there is here: the
 * board is on the server, reading it to resolve an id against a name would be
 * the extra call this exists to spare, and a read outside the lease could be
 * stale before the write lands. So the line says what happened — the flag
 * overrode the stated variant — rather than claiming the two are different
 * variants, which two spellings of one variant would make untrue.
 * @param stated The stated change, as it arrived.
 * @param asked The variant the command line named, if any.
 * @returns The change to parse, and what is worth saying about it.
 */
function targetedVariant(
	stated: object,
	asked: string | undefined,
): { stated: Record<string, unknown>; diagnostics: string[] } {
	const change: Record<string, unknown> = { ...stated };
	if (asked === undefined) {
		return { stated: change, diagnostics: [] };
	}
	const inChange = change["variant"];
	const written = typeof inChange === "string" && inChange.trim() === asked.trim();
	return {
		stated: { ...change, variant: asked },
		diagnostics:
			inChange === undefined || written
				? []
				: [
						`warning: --variant "${asked}" overrides the stated change's \`variant\` ` +
							`${typeof inChange === "string" ? `"${inChange}"` : describeJson(inChange)}; ` +
							`this write names "${asked}".`,
					],
	};
}

/**
 * The stated change of a write that lands on a variant, read once for `semantic
 * edit` and `semantic resolve`, in the order that matters.
 *
 * The version comes first, so a write that does not say what it read never
 * opens its input. Then the input is read and must be a JSON object. Then the
 * variant is targeted and any override is said on standard error at once: a
 * write the server or the schema goes on to refuse still overrode the stated
 * variant, and that is most worth hearing when no answer comes back.
 *
 * What stays with the command is the server it needs, the schema it parses the
 * returned change with, and anything it adds to the change.
 * @param input What the command was given.
 * @param input.name The board's name.
 * @param input.variant The variant the command line named, if any.
 * @param input.input A file to read the change from, when one was named.
 * @param context The command context.
 * @param stating The command, for the refusal of an input that stated nothing.
 * @param stating.command The command's words, such as `semantic edit`.
 * @param stating.needs What it needs, such as `a stated change`.
 * @returns The change to parse, with the variant the write names.
 * @throws {CliUsageError} When no version was stated, nothing was stated, or what was stated is not a JSON object.
 */
async function readVariantChange(
	input: {
		readonly name: string;
		readonly variant?: string | undefined;
		readonly input?: string | undefined;
	},
	context: CommandContext,
	stating: { readonly command: string; readonly needs: string },
): Promise<Record<string, unknown>> {
	editedVersion(input.name);
	const stated = await statedJson(input, context);
	if (stated === undefined) {
		throw new CliUsageError(
			`${stating.command} needs ${stating.needs}: give it --input <file.json> or JSON on standard input`,
		);
	}
	if (typeof stated !== "object" || stated === null || Array.isArray(stated)) {
		return failStated(stated);
	}
	const targeted = targetedVariant(stated, input.variant);
	for (const line of targeted.diagnostics) {
		context.diagnostic(line);
	}
	return targeted.stated;
}

const expectVersionRefusal = {
	code: "EXPECT_VERSION_REQUIRED",
	exit: 2,
	stream: "stderr" as const,
	description: "A semantic edit did not say which version of the board it was written against.",
};

/**
 * The version this edit was written against.
 *
 * Stating it is not optional. An edit that does not say which board it read is
 * an edit applied to whatever the board says now, which is exactly how one
 * agent's change disappears under another's — and the whole point of an
 * architecture two people are working on is that neither loses.
 * @param board The board being edited, for the refusal to quote.
 * @returns The version.
 * @throws {CliUsageError} When no version was stated.
 */
function editedVersion(board: string): number {
	const stated = statedInvocation().expectedVersion;
	if (typeof stated !== "number") {
		throw new CliUsageError(
			`This edit does not say which version of "${board}" it was written against, so there is no ` +
				"way to tell whether somebody else has changed it since. Read the board first with " +
				`\`archboard semantic show ${board}\`, write your change against what it says, and pass the ` +
				"version it reported as --expect-version. Reading it again immediately before writing " +
				"would make the check pass by construction and hide the change you were meant to notice. " +
				"Nothing was written.",
		);
	}
	return stated;
}

/**
 * What a read of a board answers with: the board, and nothing else.
 *
 * Deliberately not the write envelope. A read lands no version and leaves
 * nothing to settle, and a `reconciliation: null` on it would invite somebody to
 * check a field that can never say anything.
 */
const SemanticBoardReadSchema = z.object({
	warnings: z.array(VaultDiagnosticSchema).default([]),
	success: z.literal(true),
	board: SemanticBoardSchema,
});

export {
	UNNAMED_VARIANT,
	askedVariant,
	SemanticBoardReadSchema,
	drawnAgainst,
	exportRenderRequest,
	DRAWN_AGAINST,
	statedJson,
	named,
	describeJson,
	SelectorSchema,
	readVariantChange,
	expectVersionRefusal,
	editedVersion,
};

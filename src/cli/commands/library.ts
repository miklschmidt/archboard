import { z } from "zod";
import {
	AmbiguousStencilError,
	catalogueText,
	insertStencil,
	readCatalogue,
} from "@/runtime/engine/library-catalogue";
import { CliUsageError, defineCommand } from "@/cli/command-contract/contract";
import { HoldReportSchema, ServerElementSchema } from "@/cli/command-contract/schemas";
import { boardWriteRefusals, serverRefusal } from "@/cli/command-contract/common";

const tail = z.array(z.string()).default([]);

const LibraryNamespaceInputSchema = z.object({ tail });
type LibraryNamespaceInput = z.infer<typeof LibraryNamespaceInputSchema>;
const LibraryNamespaceResultSchema = z.never();
type LibraryNamespaceResult = z.infer<typeof LibraryNamespaceResultSchema>;
const libraryContract = defineCommand({
	path: ["library"],
	summary: "What stencils are in the library, and dropping one onto the board",
	usage:
		"library list [--text] | library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]",
	description: "Routes stencil catalogue commands.",
	examples: ["archboard library list"],
	parameters: [
		{
			kind: "positional",
			key: "tail",
			name: "arguments",
			repeatable: true,
			route: "pass-through",
			description: "Namespace arguments",
		},
	],
	input: { ingress: LibraryNamespaceInputSchema },
	result: LibraryNamespaceResultSchema,
	output: {
		cases: [{ id: "json", when: {}, mode: "json", held: "none", description: "Namespace refusal" }],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	/**
	 * Refuses the bare namespace with its subcommand usage line.
	 * @returns Never; the usage error is the whole behaviour.
	 */
	async handler() {
		throw new CliUsageError(
			"Usage: library list [--text] | library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]",
		);
	},
});

const LibraryListInputSchema = z.object({ text: z.boolean().default(false), tail });
type LibraryListInput = z.infer<typeof LibraryListInputSchema>;
const LibraryListJsonResultSchema = z.looseObject({
	count: z.number().int().nonnegative(),
	seeded: z.array(z.string()),
	file: z.string().nullable(),
	vaultBacked: z.boolean(),
	items: z.array(
		z.object({
			id: z.string(),
			name: z.string().nullable(),
			source: z.string().nullable(),
			elements: z.number().int().nonnegative(),
			width: z.number().nonnegative(),
			height: z.number().nonnegative(),
			text: z.string().nullable(),
		}),
	),
	held: HoldReportSchema.optional(),
});
type LibraryListJsonResult = z.infer<typeof LibraryListJsonResultSchema>;
const LibraryListResultSchema = z.union([LibraryListJsonResultSchema, z.string()]);
type LibraryListResult = z.infer<typeof LibraryListResultSchema>;
const libraryListContract = defineCommand({
	path: ["library", "list"],
	summary: "List the stencil palette",
	usage: "library list [--text]",
	description: "Reads the server-backed stencil catalogue.",
	examples: ["archboard library list --text"],
	parameters: [
		{
			kind: "option",
			key: "text",
			spellings: ["--text"],
			value: "none",
			description: "Print a human-readable catalogue",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: { ingress: LibraryListInputSchema },
	result: LibraryListResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: { key: "text", present: false },
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Structured catalogue",
				presentation: ["result", "held-note"],
			},
			{
				id: "text",
				when: { key: "text", present: true },
				mode: "text",
				held: "none",
				description: "Human-readable catalogue",
				presentation: ["result"],
			},
		],
		/**
		 * Chooses the human catalogue when `--text` was given, otherwise the json one.
		 * @param input - The parsed list options.
		 * @returns The output case id.
		 */
		select: (input) => (input.text ? "text" : "json"),
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal],
	relationships: [
		{ method: "GET", path: "/api/library", cardinality: "one", description: "Read the catalogue" },
	],
	/**
	 * Reads the stencil catalogue the server holds.
	 * @param input - The parsed list options.
	 * @param context - The command context.
	 * @returns The catalogue as text or json.
	 */
	async handler(input, context) {
		await context.require("server", "library list");
		const catalogue = await readCatalogue();
		return { result: input.text ? catalogueText(catalogue) : catalogue };
	},
});

const LibraryInsertInputSchema = z.object({
	name: z.string().optional(),
	x: z.string().optional(),
	y: z.string().optional(),
	source: z.string().optional(),
	id: z.string().optional(),
	tail,
});
type LibraryInsertInput = z.infer<typeof LibraryInsertInputSchema>;

/**
 * Coerces the `--x` and `--y` option values to a finite point.
 * @param x - The raw `--x` value.
 * @param y - The raw `--y` value.
 * @returns The point, or undefined when either coordinate is not a finite number.
 */
function finitePoint(x: string, y: string): { x: number; y: number } | undefined {
	const point = { x: Number(x), y: Number(y) };
	return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : undefined;
}

const LibraryInsertStageSchema = z
	.object({
		name: z.string().optional(),
		x: z.string().optional(),
		y: z.string().optional(),
		source: z.string().optional(),
		id: z.string().optional(),
	})
	.transform((input, context) => {
		if (!input.name && !input.id) {
			context.addIssue({
				code: "custom",
				message:
					"Usage: library insert <name> --x <x> --y <y> [--source <file>] (or --id <libraryItemId> instead of a name)",
			});
			return z.NEVER;
		}
		if (input.x === undefined || input.y === undefined) {
			context.addIssue({
				code: "custom",
				message: "library insert requires --x <number> --y <number>",
			});
			return z.NEVER;
		}
		const point = finitePoint(input.x, input.y);
		if (point === undefined) {
			context.addIssue({ code: "custom", message: "--x and --y must be numbers" });
			return z.NEVER;
		}
		return { name: input.name, source: input.source, itemId: input.id, x: point.x, y: point.y };
	});
type LibraryInsertStage = z.infer<typeof LibraryInsertStageSchema>;

/**
 * Builds the catalogue insertion request, naming only the selectors given.
 * @param request - The validated insert stage.
 * @returns The request for the catalogue.
 */
function insertRequest(request: LibraryInsertStage): {
	x: number;
	y: number;
	name?: string;
	source?: string;
	itemId?: string;
} {
	return {
		x: request.x,
		y: request.y,
		...(request.name === undefined ? {} : { name: request.name }),
		...(request.source === undefined ? {} : { source: request.source }),
		...(request.itemId === undefined ? {} : { itemId: request.itemId }),
	};
}

/**
 * Translates a catalogue lookup failure into a usage error that says how to
 * fix the request; other failures are left to propagate.
 * @param error - The value the catalogue threw.
 * @returns The usage error to throw instead, or undefined to rethrow the original.
 */
function insertUsageError(error: unknown): CliUsageError | undefined {
	if (error instanceof AmbiguousStencilError) {
		return new CliUsageError(`${error.message} Disambiguate with --source or --id.`);
	}
	if (error instanceof Error && error.name === "UnknownStencilError") {
		return new CliUsageError(`${error.message} Use "library list" to see what is available.`);
	}
	return undefined;
}
const LibraryInsertResultSchema = z.looseObject({
	success: z.literal(true),
	name: z.string().nullable(),
	source: z.string().nullable(),
	id: z.string(),
	at: z.object({ x: z.number(), y: z.number() }),
	count: z.number().int().nonnegative(),
	elements: z.array(ServerElementSchema),
	held: HoldReportSchema.optional(),
});
type LibraryInsertResult = z.infer<typeof LibraryInsertResultSchema>;
const libraryInsertContract = defineCommand({
	path: ["library", "insert"],
	summary: "Drop a stencil onto the board",
	usage: "library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]",
	description: "Copies one catalogue stencil to a board in one write.",
	examples: [
		'archboard library insert "API Gateway" --x 100 --y 200 --board system --doing "adding gateway"',
	],
	parameters: [
		{
			kind: "option",
			key: "x",
			spellings: ["--x"],
			value: "required",
			description: "Left coordinate",
		},
		{
			kind: "option",
			key: "y",
			spellings: ["--y"],
			value: "required",
			description: "Top coordinate",
		},
		{
			kind: "option",
			key: "source",
			spellings: ["--source"],
			value: "required",
			description: "Source library",
		},
		{
			kind: "option",
			key: "id",
			spellings: ["--id"],
			value: "required",
			description: "Library item id",
		},
		{ kind: "positional", key: "name", name: "name", description: "Stencil name" },
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
	],
	input: {
		ingress: LibraryInsertInputSchema,
		stages: [
			{
				name: "insert-request",
				when: "before-server",
				description: "Stencil selector and finite insertion coordinates",
				rules: [
					"Require either a stencil name or item id",
					"Require x and y and coerce both to finite numbers",
				],
				schema: LibraryInsertStageSchema,
			},
		],
	},
	result: LibraryInsertResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Inserted stencil",
				presentation: ["result", "held-note"],
			},
		],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals: boardWriteRefusals,
	relationships: [
		{ method: "GET", path: "/api/library", cardinality: "one", description: "Read the catalogue" },
		{
			method: "POST",
			path: "/api/elements/batch",
			cardinality: "one",
			description: "Insert the stencil",
		},
	],
	/**
	 * Copies one catalogue stencil onto the board in one write, turning an
	 * unknown or ambiguous stencil name into a usage error.
	 * @param input - The parsed insert options.
	 * @param context - The command context.
	 * @returns The insertion receipt.
	 */
	async handler(input, context) {
		const request = context.parse(LibraryInsertStageSchema, input);
		await context.require("server", "library insert");
		try {
			return {
				result: LibraryInsertResultSchema.parse(await insertStencil(insertRequest(request))),
			};
		} catch (error) {
			const usage = insertUsageError(error);
			if (usage) {
				throw usage;
			}
			throw error;
		}
	},
});

export {
	LibraryNamespaceInputSchema,
	type LibraryNamespaceInput,
	LibraryNamespaceResultSchema,
	type LibraryNamespaceResult,
	libraryContract,
	LibraryListInputSchema,
	type LibraryListInput,
	LibraryListJsonResultSchema,
	type LibraryListJsonResult,
	LibraryListResultSchema,
	type LibraryListResult,
	libraryListContract,
	LibraryInsertInputSchema,
	type LibraryInsertInput,
	LibraryInsertStageSchema,
	type LibraryInsertStage,
	LibraryInsertResultSchema,
	type LibraryInsertResult,
	libraryInsertContract,
};

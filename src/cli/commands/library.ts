import { z } from "zod";
import {
	AmbiguousStencilError,
	catalogueText,
	insertStencil,
	readCatalogue,
	type Catalogue,
	type InsertResult,
} from "../../runtime/engine/library-catalogue.js";
import { CliUsageError, defineCommand } from "../command-contract/contract.js";
import { HoldReportSchema, type HoldReport } from "../command-contract/schemas.js";

const tail = z.array(z.string()).default([]);
const refusals = [
	{
		code: "BOARD_REQUIRED",
		exit: 2,
		stream: "stderr" as const,
		description: "No board was named.",
	},
	{
		code: "CANVAS_UNREACHABLE",
		exit: 3,
		stream: "stderr" as const,
		description: "The canvas could not be reached.",
	},
	{
		code: "BOARD_CONFLICT",
		exit: 5,
		stream: "stderr" as const,
		description: "The board write was refused.",
	},
];

export const LibraryNamespaceInputSchema = z.object({ tail });
export type LibraryNamespaceInput = z.infer<typeof LibraryNamespaceInputSchema>;
export const LibraryNamespaceResultSchema = z.never();
export type LibraryNamespaceResult = z.infer<typeof LibraryNamespaceResultSchema>;
export const libraryContract = defineCommand({
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
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	async handler() {
		throw new CliUsageError(
			"Usage: library list [--text] | library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]",
		);
	},
});

export const LibraryListInputSchema = z.object({ text: z.boolean().default(false), tail });
export type LibraryListInput = z.infer<typeof LibraryListInputSchema>;
const CatalogueValidator = z.looseObject({
	count: z.number().int().nonnegative(),
	seeded: z.array(z.string()),
	file: z.string().nullable(),
	vaultBacked: z.boolean(),
	items: z.array(z.looseObject({ id: z.string() })),
	held: HoldReportSchema.optional(),
});
export type LibraryListJsonResult = Catalogue & { held?: HoldReport };
export const LibraryListJsonResultSchema = z.custom<LibraryListJsonResult>(
	(value) => CatalogueValidator.safeParse(value).success,
);
export const LibraryListResultSchema = z.union([LibraryListJsonResultSchema, z.string()]);
export type LibraryListResult = z.infer<typeof LibraryListResultSchema>;
export const libraryListContract = defineCommand({
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
				held: "stderr-note",
				description: "Human-readable catalogue",
				presentation: ["result", "held-note"],
			},
		],
		select: (input) => (input.text ? "text" : "json"),
	},
	prerequisites: ["server"],
	effects: ["read"],
	refusals: refusals.slice(0, 2),
	relationships: [
		{ method: "GET", path: "/api/library", cardinality: "one", description: "Read the catalogue" },
	],
	async handler(input, context) {
		await context.require("server", "library list");
		const catalogue = await readCatalogue();
		return { result: input.text ? catalogueText(catalogue) : catalogue };
	},
});

export const LibraryInsertInputSchema = z.object({
	name: z.string().optional(),
	x: z.string().optional(),
	y: z.string().optional(),
	source: z.string().optional(),
	id: z.string().optional(),
	tail,
});
export type LibraryInsertInput = z.infer<typeof LibraryInsertInputSchema>;
const InsertValidator = z.looseObject({
	success: z.literal(true),
	name: z.string().nullable(),
	source: z.string().nullable(),
	id: z.string(),
	at: z.object({ x: z.number(), y: z.number() }),
	count: z.number().int().nonnegative(),
	elements: z.array(z.looseObject({ id: z.string() })),
	held: HoldReportSchema.optional(),
});
export type LibraryInsertResult = InsertResult & { held?: HoldReport };
export const LibraryInsertResultSchema = z.custom<LibraryInsertResult>(
	(value) => InsertValidator.safeParse(value).success,
);
export const libraryInsertContract = defineCommand({
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
	input: { ingress: LibraryInsertInputSchema },
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
		select: () => "json",
	},
	prerequisites: ["server", "board", "doing"],
	effects: ["read", "write"],
	refusals,
	relationships: [
		{ method: "GET", path: "/api/library", cardinality: "one", description: "Read the catalogue" },
		{
			method: "POST",
			path: "/api/elements/batch",
			cardinality: "one",
			description: "Insert the stencil",
		},
	],
	async handler(input, context) {
		if (!input.name && !input.id)
			throw new CliUsageError(
				"Usage: library insert <name> --x <x> --y <y> [--source <file>] (or --id <libraryItemId> instead of a name)",
			);
		if (input.x === undefined || input.y === undefined)
			throw new CliUsageError("library insert requires --x <number> --y <number>");
		const x = Number(input.x),
			y = Number(input.y);
		if (!Number.isFinite(x) || !Number.isFinite(y))
			throw new CliUsageError("--x and --y must be numbers");
		await context.require("server", "library insert");
		try {
			return {
				result: await insertStencil({
					name: input.name,
					source: input.source,
					itemId: input.id,
					x,
					y,
				}),
			};
		} catch (error) {
			if (error instanceof AmbiguousStencilError)
				throw new CliUsageError(`${error.message} Disambiguate with --source or --id.`);
			if (error instanceof Error && error.name === "UnknownStencilError")
				throw new CliUsageError(`${error.message} Use "library list" to see what is available.`);
			throw error;
		}
	},
});

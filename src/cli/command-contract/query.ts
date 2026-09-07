import { z } from "zod";
import { getElements, searchElements } from "@/runtime/engine/canvas-client";
import type { CommandContext } from "@/cli/command-contract/contract";
import { defineCommand } from "@/cli/command-contract/contract";
import { ServerElementSchema } from "@/cli/command-contract/schemas";
import { commonRefusals, tail } from "@/cli/command-contract/lib/common";

const QueryInputSchema = z.object({
	type: z.string().optional(),
	bbox: z.string().optional(),
	filter: z.array(z.string()).default([]),
	filterJson: z.string().optional(),
	tail,
});
type QueryInput = z.infer<typeof QueryInputSchema>;
const QueryResultSchema = z.array(ServerElementSchema);
type QueryResult = z.infer<typeof QueryResultSchema>;

const BBOX_MESSAGE = '--bbox expects "x_min,y_min,x_max,y_max"';
const bboxCoordinate = z
	.number({ error: BBOX_MESSAGE })
	.refine((value) => !Number.isNaN(value), BBOX_MESSAGE);
const bboxSchema = z
	.string()
	.transform((value) => value.split(",").map((part) => Number(part.trim())))
	.pipe(
		z.tuple([bboxCoordinate, bboxCoordinate, bboxCoordinate, bboxCoordinate], {
			error: BBOX_MESSAGE,
		}),
	);

/** The spellings a filter value may use for something other than text. */
const FILTER_LITERALS = new Map<string, boolean | null>([
	["true", true],
	["false", false],
	["null", null],
]);

/**
 * Reads a filter value as the JSON scalar it spells, so `locked=true` matches
 * a boolean field and `weight=3` a numeric one. The raw text is kept beside
 * this by the caller, so a field that really holds "true" still matches.
 * @param raw - The text after the equals sign.
 * @returns The value's coerced form, which is the text itself when it spells nothing else.
 */
function coerceFilterValue(raw: string): string | number | boolean | null {
	const literal = FILTER_LITERALS.get(raw);
	if (literal !== undefined) {
		return literal;
	}
	const numeric = Number(raw);
	if (raw.trim() !== "" && !Number.isNaN(numeric)) {
		return numeric;
	}
	return raw;
}

const filterPairSchema = z.string().transform((value, context) => {
	const equals = value.indexOf("=");
	if (equals === -1) {
		context.addIssue({ code: "custom", message: `--filter expects key=value, got "${value}"` });
		return z.NEVER;
	}
	const raw = value.slice(equals + 1);
	return { key: value.slice(0, equals), raw, coerced: coerceFilterValue(raw) };
});

const filterObjectSchema = z.record(z.string(), z.unknown());
const filterJsonSchema = z.string().transform((value, context) => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch (error) {
		context.addIssue({
			code: "custom",
			message: `Invalid JSON in --filter-json: ${error instanceof Error ? error.message : String(error)}`,
		});
		return z.NEVER;
	}
	const object = filterObjectSchema.safeParse(parsed);
	if (!object.success || Array.isArray(parsed)) {
		context.addIssue({ code: "custom", message: "Invalid JSON in --filter-json: expected object" });
		return z.NEVER;
	}
	return object.data;
});

/**
 * Follows a dotted path into a decoded element, so a filter can name a nested
 * field such as `customData.archboard.kind`.
 * @param value - The element to look inside.
 * @param dotPath - The field path, its segments separated by dots.
 * @returns The value at that path, or undefined when the path leaves the object.
 */
function lookupPath(value: unknown, dotPath: string): unknown {
	let current = value;
	for (const key of dotPath.split(".")) {
		if (current === null || typeof current !== "object") {
			return undefined;
		}
		const next: unknown = Reflect.get(current, key);
		current = next;
	}
	return current;
}

/**
 * Builds the search the server can answer on its own. Only type and bounding
 * box are the server's to filter; everything else is applied here afterwards.
 * @param input - The parsed command input.
 * @param context - The command context, which validates the bounding box.
 * @returns The query parameters, empty when the server has nothing to narrow by.
 */
function serverQuery(input: QueryInput, context: CommandContext): URLSearchParams {
	const query = new URLSearchParams();
	if (input.type !== undefined) {
		query.set("type", input.type);
	}
	if (input.bbox !== undefined) {
		const [xMin, yMin, xMax, yMax] = context.parse(bboxSchema, input.bbox);
		query.set("x_min", String(xMin));
		query.set("y_min", String(yMin));
		query.set("x_max", String(xMax));
		query.set("y_max", String(yMax));
	}
	return query;
}

/**
 * Builds one predicate per typed filter the person gave. A value matches
 * either as the text they typed or as the scalar it spells, and a field
 * holding a list matches when any of its entries does.
 * @param input - The parsed command input.
 * @param context - The command context, which validates each filter.
 * @returns The predicates, all of which an element must satisfy.
 */
function clientPredicates(
	input: QueryInput,
	context: CommandContext,
): ((element: unknown) => boolean)[] {
	const predicates: ((element: unknown) => boolean)[] = [];
	for (const value of input.filter) {
		const { key, raw, coerced } = context.parse(filterPairSchema, value);
		predicates.push((element) => {
			const actual = lookupPath(element, key);
			if (Array.isArray(actual)) {
				return actual.some((candidate) => candidate === raw || candidate === coerced);
			}
			return actual === raw || actual === coerced;
		});
	}
	if (input.filterJson === undefined) {
		return predicates;
	}
	for (const [key, expected] of Object.entries(context.parse(filterJsonSchema, input.filterJson))) {
		predicates.push((element) => {
			const actual = lookupPath(element, key);
			return Array.isArray(actual)
				? actual.some((candidate) => candidate === expected)
				: actual === expected;
		});
	}
	return predicates;
}

const queryContract = defineCommand({
	path: ["query"],
	summary: "Query elements (server + typed client-side filters)",
	usage:
		"query [--type rectangle] [--bbox x0,y0,x1,y1] [--filter locked=true] [--filter-json '{...}']",
	description: "Queries the board and applies typed client-side predicates without changing it.",
	examples: ["archboard query --board payments --type rectangle"],
	parameters: [
		{
			kind: "option",
			key: "type",
			spellings: ["--type"],
			value: "required",
			description: "Element type",
		},
		{
			kind: "option",
			key: "bbox",
			spellings: ["--bbox"],
			value: "required",
			description: "Overlap rectangle",
		},
		{
			kind: "option",
			key: "filter",
			spellings: ["--filter"],
			value: "required",
			occurrences: "append",
			description: "Typed key=value predicate",
		},
		{
			kind: "option",
			key: "filterJson",
			spellings: ["--filter-json"],
			value: "required",
			description: "JSON predicates",
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
	input: {
		ingress: QueryInputSchema,
		stages: [
			{
				name: "bbox",
				when: "after-server",
				description: "Four finite comma-separated numbers",
				schema: bboxSchema,
			},
			{
				name: "filters",
				when: "after-read",
				description: "Typed key=value and JSON predicates",
				schema: z.union([filterPairSchema, filterJsonSchema]),
			},
		],
	},
	result: QueryResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "stderr-note",
				description: "Bare element array",
			},
		],
		/**
		 * A query always answers with the element array; there is no second shape.
		 * @returns The only output case's id.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "board"],
	effects: ["read"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/elements",
			cardinality: "conditional",
			description: "Unconstrained read",
		},
		{
			method: "GET",
			path: "/api/elements/search",
			cardinality: "conditional",
			description: "Type or bbox search",
		},
	],
	/**
	 * Reads the board, narrowing on the server where it can and applying the
	 * typed predicates here, and publishes the elements that match.
	 * @param input - The parsed command input.
	 * @param context - The command context.
	 * @returns The matching elements as the command's result.
	 */
	async handler(input, context) {
		await context.require("server", "Querying elements");
		const query = serverQuery(input, context);
		const results = query.size > 0 ? await searchElements(query) : await getElements();
		const predicates = clientPredicates(input, context);
		const matching =
			predicates.length > 0
				? results.filter((element) => predicates.every((test) => test(element)))
				: results;
		return { result: QueryResultSchema.parse(matching) };
	},
});

export { QueryInputSchema, type QueryInput, QueryResultSchema, type QueryResult, queryContract };

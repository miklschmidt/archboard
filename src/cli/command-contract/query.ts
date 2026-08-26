import { z } from "zod";
import { getElements, searchElements } from "../../runtime/engine/canvas-client.js";
import { defineCommand } from "./contract.js";
import { ServerElementSchema, type ServerElementResult as PublicElement } from "./schemas.js";
import { commonRefusals, tail } from "./lib/common.js";

export const QueryInputSchema = z.object({
	type: z.string().optional(),
	bbox: z.string().optional(),
	filter: z.array(z.string()).default([]),
	filterJson: z.string().optional(),
	tail,
});
export type QueryInput = z.infer<typeof QueryInputSchema>;
export const QueryResultSchema = z.array(ServerElementSchema);
export type QueryResult = z.infer<typeof QueryResultSchema>;

const bboxSchema = z.string().transform((value, context) => {
	const parts = value.split(",").map((part) => Number(part.trim()));
	if (parts.length !== 4 || parts.some(Number.isNaN)) {
		context.addIssue({ code: "custom", message: '--bbox expects "x_min,y_min,x_max,y_max"' });
		return z.NEVER;
	}
	return parts as [number, number, number, number];
});

const filterPairSchema = z.string().transform((value, context) => {
	const equals = value.indexOf("=");
	if (equals === -1) {
		context.addIssue({ code: "custom", message: `--filter expects key=value, got "${value}"` });
		return z.NEVER;
	}
	const raw = value.slice(equals + 1);
	const coerced =
		raw === "true"
			? true
			: raw === "false"
				? false
				: raw === "null"
					? null
					: raw.trim() !== "" && !Number.isNaN(Number(raw))
						? Number(raw)
						: raw;
	return { key: value.slice(0, equals), raw, coerced };
});

const filterJsonSchema = z.string().transform((value, context) => {
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			throw new Error("expected object");
		return parsed as Record<string, unknown>;
	} catch (error) {
		context.addIssue({
			code: "custom",
			message: `Invalid JSON in --filter-json: ${(error as Error).message}`,
		});
		return z.NEVER;
	}
});

function lookupPath(value: unknown, dotPath: string): unknown {
	return dotPath.split(".").reduce((current, key) => {
		if (!current || typeof current !== "object") return undefined;
		return (current as Record<string, unknown>)[key];
	}, value);
}

export const queryContract = defineCommand({
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
	async handler(input, context) {
		await context.require("server", "Querying elements");
		const query = new URLSearchParams();
		if (input.type !== undefined) query.set("type", input.type);
		if (input.bbox !== undefined) {
			const [xMin, yMin, xMax, yMax] = context.parse(bboxSchema, input.bbox);
			query.set("x_min", String(xMin));
			query.set("y_min", String(yMin));
			query.set("x_max", String(xMax));
			query.set("y_max", String(yMax));
		}

		let results = query.size > 0 ? await searchElements(query) : await getElements();
		const predicates: Array<(element: unknown) => boolean> = [];
		for (const value of input.filter) {
			const { key, raw, coerced } = context.parse(filterPairSchema, value);
			predicates.push((element) => {
				const actual = lookupPath(element, key);
				if (Array.isArray(actual)) return actual.includes(raw) || actual.includes(coerced as never);
				return actual === raw || actual === coerced;
			});
		}
		if (input.filterJson !== undefined) {
			for (const [key, expected] of Object.entries(
				context.parse(filterJsonSchema, input.filterJson),
			)) {
				predicates.push((element) => {
					const actual = lookupPath(element, key);
					return Array.isArray(actual) ? actual.includes(expected as never) : actual === expected;
				});
			}
		}
		if (predicates.length > 0)
			results = results.filter((element) => predicates.every((test) => test(element)));
		return { result: results as unknown as PublicElement[] };
	},
});

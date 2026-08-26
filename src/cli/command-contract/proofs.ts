import { z } from "zod";
import {
	getElements,
	searchElements,
	setViewport,
	updateElementStrict,
} from "../../runtime/engine/canvas-client.js";
import { buildSceneFile } from "../../runtime/engine/scene-document.js";
import { isObsidianExcalidrawMd, wrapSceneAsObsidianMd } from "../../runtime/engine/obsidian-md.js";
import {
	CliUsageError,
	defineCommand,
	type AnyCommandContract,
	type CommandContext,
	type PendingArtifact,
} from "./contract.js";

const elementType = z.enum([
	"rectangle",
	"ellipse",
	"diamond",
	"arrow",
	"text",
	"line",
	"freedraw",
	"image",
]);

const ServerElementSchema = z.looseObject({
	id: z.string(),
	type: elementType,
	x: z.number(),
	y: z.number(),
});
type PublicElement = z.infer<typeof ServerElementSchema>;

const HoldReportSchema = z.looseObject({
	board: z.string(),
	message: z.string(),
});

const BoardFingerprintSchema = z.object({
	elements: z.number().int().nonnegative(),
	note: z.string(),
	version: z.number().int().nonnegative().nullable(),
});

const commonRefusals = [
	{
		code: "BOARD_REQUIRED",
		exit: 2,
		stream: "stderr" as const,
		description: "A board-sensitive request did not name a board.",
	},
	{
		code: "CANVAS_UNREACHABLE",
		exit: 3,
		stream: "stderr" as const,
		description: "The canvas server could not be reached or started.",
	},
];

const tail = z.array(z.string()).default([]);

export const WRITE_ANSWER = [
	"  ANSWERS WITH WHAT THE BOARD BECAME: `elements` is every element the write touched in",
	"  its resulting form, including what the server made and you never named — the ids it",
	"  minted, the text element it expanded from a `label`, the arrows it re-routed behind a",
	"  move. `fingerprint` is the board in one line: how many elements, the sha-256 of its",
	"  note, and which edit of that note this write produced. Keep the last one and you can",
	"  tell in a single comparison whether anything you did not do has changed, instead of",
	"  re-reading the board — and pass `fingerprint.version` as --expect-version on your",
	"  next write to have it refused if somebody got there first.",
	"",
	"  --document adds the whole board. OFF BY DEFAULT AND USUALLY WRONG: 300 elements is",
	"  about 60,000 tokens, so a loop that asks for it pulls the board through a context once",
	"  per box. Use `describe` for a summary or `query` for a part.",
].join("\n");

const queryIngress = z.object({
	type: z.string().optional(),
	bbox: z.string().optional(),
	filter: z.array(z.string()).default([]),
	filterJson: z.string().optional(),
	tail,
});

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
	return { key: value.slice(0, equals), raw: value.slice(equals + 1) };
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

function coerceFilter(value: string): unknown {
	if (value === "true") return true;
	if (value === "false") return false;
	if (value === "null") return null;
	if (value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
	return value;
}

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
		ingress: queryIngress,
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
	result: z.array(ServerElementSchema),
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
	prerequisites: ["server"],
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
			const { key, raw } = context.parse(filterPairSchema, value);
			const coerced = coerceFilter(raw);
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

const updateIngress = z.object({
	id: z.preprocess(
		(value) => value ?? "",
		z.string().min(1, { error: 'Usage: update <id> --set \'{"backgroundColor": "#ffc9c9"}\'' }),
	),
	input: z.string().optional(),
	tail,
	set: z.string().optional(),
	document: z.boolean().default(false),
});

const updatesSchema = z.record(z.string(), z.unknown());
const updateResultSchema = z.object({
	success: z.literal(true),
	element: ServerElementSchema,
	elements: z.array(ServerElementSchema),
	fingerprint: BoardFingerprintSchema,
	document: z.array(ServerElementSchema).optional(),
	held: HoldReportSchema.optional(),
});

async function updateInput(input: z.infer<typeof updateIngress>, context: CommandContext) {
	let raw: string;
	let label: string;
	if (input.set !== undefined) {
		raw = input.set;
		label = "in --set";
	} else {
		raw =
			input.input !== undefined && input.input !== "-"
				? context.readTextFile(input.input)
				: await context.readStdin();
		label = "updates";
		if (!raw.trim()) {
			throw new CliUsageError("No updates provided (pass a file argument or pipe JSON to stdin)");
		}
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new CliUsageError(
			input.set !== undefined
				? `Invalid JSON in --set: ${(error as Error).message}`
				: `Invalid JSON updates: ${(error as Error).message}`,
		);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new CliUsageError(
			label === "updates" ? "Updates must be a JSON object" : "Updates must be a JSON object",
		);
	}
	return context.parse(updatesSchema, parsed);
}

export const updateContract = defineCommand({
	path: ["update"],
	summary: "Update one element",
	usage: [
		'update <id> --set \'{"backgroundColor":"#ffc9c9"}\' [--document]',
		"",
		WRITE_ANSWER,
	].join("\n"),
	description: "Updates one element in one version-checked board write.",
	examples: ['archboard update box --set \'{"x":120}\' --board payments --doing "moving box"'],
	parameters: [
		{ kind: "positional", key: "id", name: "id", description: "Element id" },
		{
			kind: "positional",
			key: "input",
			name: "updates.json|-",
			route: "stdin-or-file",
			description: "JSON update source",
		},
		{
			kind: "positional",
			key: "tail",
			name: "ignored",
			repeatable: true,
			route: "pass-through",
			description: "Legacy ignored positional content",
		},
		{
			kind: "option",
			key: "set",
			spellings: ["--set"],
			value: "required",
			description: "Inline JSON update",
		},
		{
			kind: "option",
			key: "document",
			spellings: ["--document"],
			value: "none",
			description: "Include the whole board",
		},
	],
	input: {
		ingress: updateIngress,
		stages: [
			{
				name: "updates",
				when: "before-server",
				description: "JSON object from --set, file, or stdin",
				schema: updatesSchema,
			},
		],
	},
	result: updateResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Versioned write result",
			},
		],
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["local-read", "write"],
	refusals: [
		...commonRefusals,
		{ code: "BOARD_HELD", exit: 5, stream: "stderr", description: "The note changed on disk." },
		{
			code: "BOARD_VERSION_CONFLICT",
			exit: 5,
			stream: "stderr",
			description: "The board advanced past expect-version.",
		},
		{
			code: "CLAIM_REVOKED",
			exit: 5,
			stream: "stderr",
			description: "The person took back the claim.",
		},
	],
	relationships: [
		{
			method: "PUT",
			path: "/api/elements/:id",
			cardinality: "one",
			description: "Exactly one board write",
		},
	],
	async handler(input, context) {
		const updates = await updateInput(input, context);
		await context.require("server", "Updating an element");
		const response = await updateElementStrict(
			{ ...updates, id: input.id },
			input.document ? { document: true } : {},
		);
		return {
			result: {
				success: true as const,
				element: response.element as unknown as PublicElement,
				elements: (response.elements ?? []) as unknown as PublicElement[],
				fingerprint: response.fingerprint!,
				...(response.document ? { document: response.document as unknown as PublicElement[] } : {}),
			},
		};
	},
});

const viewportIngress = z
	.object({
		fit: z.boolean().default(false),
		ids: z.string().optional(),
		element: z.string().optional(),
		zoom: z.string().optional(),
		offsetX: z.string().optional(),
		offsetY: z.string().optional(),
		zoomFactor: z.string().optional(),
		pane: z.string().optional(),
		tail,
	})
	.superRefine((value, context) => {
		const manual =
			value.zoom !== undefined || value.offsetX !== undefined || value.offsetY !== undefined;
		const modes = [value.fit, value.ids !== undefined, value.element !== undefined, manual].filter(
			Boolean,
		).length;
		if (modes !== 1) {
			context.addIssue({
				code: "custom",
				message:
					"Say exactly one thing to do with the camera: --fit (everything on the board), " +
					"--ids a,b,c (fit those elements), --element <id> (centre on one), " +
					"or --zoom / --offset-x / --offset-y (set explicit values).",
			});
		}
		if (value.zoomFactor !== undefined && !value.fit && value.ids === undefined) {
			context.addIssue({
				code: "custom",
				message: "--zoom-factor is the padding on a fit, so it needs --fit or --ids.",
			});
		}
	});

const finiteNumber = (flag: string) =>
	z.string().transform((value, context) => {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) {
			context.addIssue({ code: "custom", message: `--${flag} needs a number, not "${value}"` });
			return z.NEVER;
		}
		return parsed;
	});

const viewportResultSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
	held: HoldReportSchema.optional(),
});

export const viewportContract = defineCommand({
	path: ["viewport"],
	summary: "Point a pane's camera: fit, centre, or zoom (needs a browser tab)",
	usage: [
		"viewport --fit [--zoom-factor 0.8] [--pane <spec>]",
		"viewport --ids a,b,c [--zoom-factor 0.8] [--pane <spec>]",
		"viewport --element <id> [--pane <spec>]",
		"viewport --zoom 1.5 [--offset-x 0] [--offset-y 0] [--pane <spec>]",
		"",
		"  Exactly one of those four. --fit frames everything on the board, --ids frames those elements,",
		"  --element centres on one without changing zoom, and the last sets explicit camera values.",
		"  --zoom-factor is the padding on a fit: lower leaves more room around the content.",
		"",
		"  It names a PANE, not a board, because a pane holds one board and that settles which is meant",
		"  (ADR 0009). With one pane on screen that is the one; with two, --pane says which half moves,",
		"  and without it the pane that answers for the browser does.",
	].join("\n"),
	description: "Moves the camera owned by a rendered browser pane.",
	examples: ["archboard viewport --fit", "archboard viewport --zoom 1.5 --offset-x 20"],
	parameters: [
		{
			kind: "option",
			key: "fit",
			spellings: ["--fit"],
			value: "none",
			description: "Fit the whole board",
		},
		{
			kind: "option",
			key: "ids",
			spellings: ["--ids"],
			value: "required",
			description: "Fit selected element ids",
		},
		{
			kind: "option",
			key: "element",
			spellings: ["--element"],
			value: "required",
			description: "Centre one element",
		},
		{
			kind: "option",
			key: "zoom",
			spellings: ["--zoom"],
			value: "required",
			description: "Set zoom",
		},
		{
			kind: "option",
			key: "offsetX",
			spellings: ["--offset-x"],
			value: "required",
			description: "Set horizontal offset",
		},
		{
			kind: "option",
			key: "offsetY",
			spellings: ["--offset-y"],
			value: "required",
			description: "Set vertical offset",
		},
		{
			kind: "option",
			key: "zoomFactor",
			spellings: ["--zoom-factor"],
			value: "required",
			description: "Fit padding factor",
		},
		{
			kind: "option",
			key: "pane",
			spellings: ["--pane"],
			value: "required",
			description: "Pane selector",
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
		ingress: viewportIngress,
		stages: [
			{
				name: "numbers",
				when: "after-browser",
				description: "Finite zoom and offset values",
				schema: finiteNumber("zoom"),
			},
		],
	},
	result: viewportResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				held: "object-field-and-stderr-note",
				description: "Viewport acknowledgement",
			},
		],
		select: () => "json",
	},
	prerequisites: ["server", "browser"],
	effects: ["browser"],
	refusals: [
		...commonRefusals,
		{
			code: "BROWSER_REQUIRED",
			exit: 4,
			stream: "stderr",
			description: "No browser pane is rendering the canvas.",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/viewport",
			cardinality: "one",
			description: "One browser camera request",
		},
	],
	async handler(input, context) {
		await context.require("server", "Moving the camera");
		await context.require("browser", "Moving the camera");
		const result = await setViewport({
			...(input.fit ? { scrollToContent: true } : {}),
			...(input.ids !== undefined
				? {
						scrollToElementIds: input.ids
							.split(",")
							.map((id) => id.trim())
							.filter(Boolean),
					}
				: {}),
			...(input.element !== undefined ? { scrollToElementId: input.element } : {}),
			...(input.zoom !== undefined
				? { zoom: context.parse(finiteNumber("zoom"), input.zoom) }
				: {}),
			...(input.offsetX !== undefined
				? { offsetX: context.parse(finiteNumber("offset-x"), input.offsetX) }
				: {}),
			...(input.offsetY !== undefined
				? { offsetY: context.parse(finiteNumber("offset-y"), input.offsetY) }
				: {}),
			...(input.zoomFactor !== undefined
				? { viewportZoomFactor: context.parse(finiteNumber("zoom-factor"), input.zoomFactor) }
				: {}),
			...(input.pane !== undefined ? { pane: input.pane } : {}),
		});
		return { result };
	},
});

const exportIngress = z.object({
	out: z.string().optional(),
	format: z.string().optional(),
	force: z.boolean().default(false),
	tail,
});

const exportFormatSchema = z.enum(["json", "obsidian"], {
	error: "--format must be json or obsidian",
});
const ExportReceiptSchema = z.object({
	success: z.literal(true),
	file: z.string(),
	elements: z.number().int().nonnegative(),
	format: exportFormatSchema,
	held: HoldReportSchema.optional(),
});
const ExportContentSchema = z.string();
const ExportResultSchema = z.union([ExportContentSchema, ExportReceiptSchema]);
const PendingArtifactSchema = z.object({
	path: z.string().min(1),
	content: z.union([z.string(), z.instanceof(Uint8Array)]),
	encoding: z.enum(["utf8", "binary"]),
});

export const exportContract = defineCommand({
	path: ["export"],
	summary: "Export the scene as .excalidraw JSON or Obsidian .excalidraw.md",
	usage:
		"export [--out scene.excalidraw | note.excalidraw.md] [--format json|obsidian] [--force] (a .md out path implies obsidian; --force overwrites a non-Excalidraw destination, still preserving its frontmatter)",
	description: "Builds a portable scene and emits raw content or writes one local file.",
	examples: [
		"archboard export --board payments",
		"archboard export --board payments --out payments.excalidraw",
	],
	parameters: [
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			route: "stdin-or-file",
			description: "Destination file",
		},
		{
			kind: "option",
			key: "format",
			spellings: ["--format"],
			value: "required",
			description: "json or obsidian",
		},
		{
			kind: "option",
			key: "force",
			spellings: ["--force"],
			value: "none",
			description: "Overwrite a non-Excalidraw note",
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
		ingress: exportIngress,
		stages: [
			{
				name: "format",
				when: "before-server",
				description: "Explicit format or .md inference",
				schema: exportFormatSchema,
			},
		],
	},
	result: ExportResultSchema,
	output: {
		cases: [
			{
				id: "raw",
				when: { key: "out", present: false },
				mode: "raw",
				held: "none",
				description: "Exact serialized scene content",
			},
			{
				id: "file",
				when: { key: "out", present: true },
				mode: "file-receipt",
				held: "object-field-and-stderr-note",
				description: "Validated file receipt",
				artifact: PendingArtifactSchema,
			},
		],
		select: (input) => (input.out === undefined ? "raw" : "file"),
	},
	prerequisites: ["server"],
	effects: ["local-read", "read", "local-write"],
	refusals: commonRefusals,
	relationships: [
		{
			method: "GET",
			path: "/api/elements",
			cardinality: "parallel",
			description: "Required scene elements",
		},
		{
			method: "GET",
			path: "/api/files",
			cardinality: "parallel",
			description: "Best-effort image files",
		},
	],
	async handler(input, context) {
		const format = context.parse(
			exportFormatSchema,
			input.format ?? (input.out?.endsWith(".md") ? "obsidian" : "json"),
		);
		const resolved = input.out ? context.resolvePath(input.out) : undefined;
		const existing =
			resolved && format === "obsidian" ? context.readOptionalTextFile(resolved) : undefined;
		if (
			existing !== undefined &&
			existing.trim() !== "" &&
			!isObsidianExcalidrawMd(existing) &&
			!input.force
		) {
			throw new CliUsageError(
				`${resolved} exists and is not an Obsidian .excalidraw.md file; exporting would overwrite it. ` +
					"Pass --force to overwrite it anyway (its frontmatter is still preserved).",
			);
		}
		await context.require("server", "Exporting the scene");
		const { scene, elementCount } = await buildSceneFile();
		const content =
			format === "obsidian"
				? wrapSceneAsObsidianMd(scene, existing)
				: JSON.stringify(scene, null, 2);
		if (!resolved) return { result: content };
		const artifact: PendingArtifact = { path: resolved, content, encoding: "utf8" };
		return {
			result: { success: true as const, file: resolved, elements: elementCount, format },
			pendingArtifact: artifact,
		};
	},
});

export const proofContracts: readonly AnyCommandContract[] = [
	queryContract,
	updateContract,
	viewportContract,
	exportContract,
] as readonly AnyCommandContract[];

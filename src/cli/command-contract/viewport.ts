import { z } from "zod";
import { setViewport } from "../../runtime/engine/canvas-client.js";
import { defineCommand } from "./contract.js";
import { HoldReportSchema } from "./schemas.js";
import { serverRefusal, tail } from "./lib/common.js";

export const ViewportInputSchema = z
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
export type ViewportInput = z.infer<typeof ViewportInputSchema>;

const finiteNumber = (flag: string) =>
	z.string().transform((value, context) => {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) {
			context.addIssue({ code: "custom", message: `--${flag} needs a number, not "${value}"` });
			return z.NEVER;
		}
		return parsed;
	});

const viewportIdsSchema = z
	.string()
	.transform((value) =>
		value
			.split(",")
			.map((id) => id.trim())
			.filter(Boolean),
	)
	.describe("Split comma-separated ids, trim whitespace, and discard empty ids.");

export const ViewportResultSchema = z.object({
	success: z.boolean(),
	message: z.string().optional(),
	held: HoldReportSchema.optional(),
});
export type ViewportResult = z.infer<typeof ViewportResultSchema>;

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
		ingress: ViewportInputSchema,
		stages: [
			{
				name: "ids",
				when: "after-browser",
				description: "Comma-separated ids become the viewport element-id array",
				rules: ["Split on commas, trim each id, and discard empty ids."],
				schema: viewportIdsSchema,
			},
			{
				name: "numbers",
				when: "after-browser",
				description: "Finite zoom and offset values",
				schema: finiteNumber("zoom"),
			},
		],
	},
	result: ViewportResultSchema,
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
		serverRefusal,
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
		const ids = input.ids === undefined ? undefined : context.parse(viewportIdsSchema, input.ids);
		const result = await setViewport({
			...(input.fit ? { scrollToContent: true } : {}),
			...(ids !== undefined ? { scrollToElementIds: ids } : {}),
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

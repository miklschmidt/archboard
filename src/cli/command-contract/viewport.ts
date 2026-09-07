import { z } from "zod";
import { setViewport } from "@/runtime/engine/canvas-client";
import type { CommandContext } from "@/cli/command-contract/contract";
import { defineCommand } from "@/cli/command-contract/contract";
import { HoldReportSchema } from "@/cli/command-contract/schemas";
import { serverRefusal, tail } from "@/cli/command-contract/lib/common";

/** The camera instructions a move may carry; exactly one of them must be given. */
interface CameraModes {
	readonly fit: boolean;
	readonly ids?: string | undefined;
	readonly element?: string | undefined;
	readonly zoom?: string | undefined;
	readonly offsetX?: string | undefined;
	readonly offsetY?: string | undefined;
}

/**
 * Counts how many things a camera move was told to do. Explicit zoom and
 * offsets count as one instruction between them, because they set one camera.
 * @param value - The parsed camera flags.
 * @returns How many distinct instructions were given.
 */
function cameraModeCount(value: CameraModes): number {
	const manual =
		value.zoom !== undefined || value.offsetX !== undefined || value.offsetY !== undefined;
	return [value.fit, value.ids !== undefined, value.element !== undefined, manual].filter(Boolean)
		.length;
}

const ViewportInputSchema = z
	.object({
		fit: z.boolean().default(false),
		ids: z.string().optional(),
		element: z.string().optional(),
		zoom: z.string().optional(),
		offsetX: z.string().optional(),
		offsetY: z.string().optional(),
		zoomFactor: z.string().optional(),
		pane: z.string().min(1, "--pane is required"),
		tail,
	})
	.superRefine((value, context) => {
		if (cameraModeCount(value) !== 1) {
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
type ViewportInput = z.infer<typeof ViewportInputSchema>;

/**
 * The schema for a camera number, naming the flag in its refusal so the person
 * knows which of several numeric flags was not a number.
 * @param flag - The flag's name, without its dashes.
 * @returns The schema, which yields the number.
 */
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

const ViewportResultSchema = z.object({
	success: z.boolean(),
	message: z.string(),
	held: HoldReportSchema.optional(),
});
type ViewportResult = z.infer<typeof ViewportResultSchema>;

/**
 * Turns the camera flags into the request the browser answers, validating each
 * number as it goes and sending only what was actually asked for.
 * @param input - The parsed command input.
 * @param context - The command context, which validates the ids and numbers.
 * @returns The camera fields of the viewport request.
 */
function cameraRequest(input: ViewportInput, context: CommandContext): Record<string, unknown> {
	const request: Record<string, unknown> = {};
	if (input.fit) {
		request["scrollToContent"] = true;
	}
	if (input.ids !== undefined) {
		request["scrollToElementIds"] = context.parse(viewportIdsSchema, input.ids);
	}
	if (input.element !== undefined) {
		request["scrollToElementId"] = input.element;
	}
	assignCameraNumbers(request, input, context);
	return request;
}

/**
 * Adds the numeric camera values that were given, each validated under the
 * name of the flag it came from.
 * @param request - The request being built.
 * @param input - The parsed command input.
 * @param context - The command context, which validates each number.
 */
function assignCameraNumbers(
	request: Record<string, unknown>,
	input: ViewportInput,
	context: CommandContext,
): void {
	const numbers: readonly [string, string, string | undefined][] = [
		["zoom", "zoom", input.zoom],
		["offsetX", "offset-x", input.offsetX],
		["offsetY", "offset-y", input.offsetY],
		["viewportZoomFactor", "zoom-factor", input.zoomFactor],
	];
	for (const [field, flag, value] of numbers) {
		if (value !== undefined) {
			request[field] = context.parse(finiteNumber(flag), value);
		}
	}
}

const viewportContract = defineCommand({
	path: ["browser", "viewport"],
	summary: "Point a pane's camera: fit, centre, or zoom (needs a browser tab)",
	usage: [
		"browser viewport --pane <spec> --fit [--zoom-factor 0.8]",
		"browser viewport --pane <spec> --ids a,b,c [--zoom-factor 0.8]",
		"browser viewport --pane <spec> --element <id>",
		"browser viewport --pane <spec> --zoom 1.5 [--offset-x 0] [--offset-y 0]",
		"",
		"  Exactly one of those four. --fit frames everything on the board, --ids frames those elements,",
		"  --element centres on one without changing zoom, and the last sets explicit camera values.",
		"  --zoom-factor is the padding on a fit: lower leaves more room around the content.",
		"",
		"  It requires a connected browser and names the pane whose visible camera moves.",
	].join("\n"),
	description: "Moves the camera owned by a rendered browser pane.",
	examples: [
		"archboard browser viewport --pane left --fit",
		"archboard browser viewport --pane right --zoom 1.5 --offset-x 20",
	],
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
		/**
		 * A camera move always answers with the acknowledgement; there is no second shape.
		 * @returns The only output case's id.
		 */
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
	/**
	 * Moves one pane's camera, in whichever of the mutually exclusive ways the
	 * input asked for.
	 * @param input - The parsed command input.
	 * @param context - The command context.
	 * @returns The browser's acknowledgement as the command's result.
	 */
	async handler(input, context) {
		await context.require("server", "Moving the camera");
		await context.require("browser", "Moving the camera");
		const result = await setViewport({ ...cameraRequest(input, context), pane: input.pane });
		return { result };
	},
});

export {
	ViewportInputSchema,
	type ViewportInput,
	ViewportResultSchema,
	type ViewportResult,
	viewportContract,
};

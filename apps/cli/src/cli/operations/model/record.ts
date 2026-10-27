import { z } from "zod";
import { ArchitectureModelReadSchema, type ArchitectureModelRead } from "@archboard/board/model";
import {
	DiagramThemeSchema,
	LayoutEngineSchema,
	DEFAULT_LAYOUT_ENGINE,
} from "@archboard/board/render-reply";
import {
	DEFAULT_RECORDING_LANGUAGE,
	RecordingLanguageSchema,
} from "@archboard/walkthrough/recording";
import { recordWalkthrough } from "@archboard/walkthrough/recorder";
import { ARCHBOARD_URL } from "@archboard/server-lifecycle/config";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import type { CommandContext } from "#cli/protocol/contract/contract.ts";
import { readArchitectureModelOnServer } from "#cli/clients/server/architecture-model.ts";
import { defineCommand, CliUsageError } from "#cli/protocol/contract/contract.ts";
import {
	containerOf,
	talkPlaceOf,
	requireWritableDirectory,
} from "#cli/rules/semantic/draw/recording-output.ts";

const InputSchema = z.object({
	checkpoint: z.string(),
	walkthrough: z.string(),
	out: z.string(),
	talk: z.string().optional(),
	theme: DiagramThemeSchema.default("dark"),
	layout: LayoutEngineSchema.default(DEFAULT_LAYOUT_ENGINE),
	language: RecordingLanguageSchema.default(DEFAULT_RECORDING_LANGUAGE),
});
type Model = Extract<ArchitectureModelRead, { success: true }>;
/**
 * Require a complete retained recording before starting voice.
 * @param model The resolved model.
 * @returns Its complete playback metadata.
 */
function recordingPlayback(model: Model) {
	const playback = model.playback;
	if (!playback || !model.checkpoint || playback.beats.some((beat) => beat.status !== "ready"))
		throw new CliUsageError(
			"Every beat must be available in one retained reading. Repair the walkthrough and retain it before recording.",
		);
	return playback;
}

/**
 * Prepare the existing recorder from the exact canonical reading.
 * @param input The local recording request.
 * @param context The invocation capabilities.
 * @param architecture The complete retained playback.
 * @returns The existing recorder request.
 */
function recordingRequest(
	input: z.infer<typeof InputSchema>,
	context: CommandContext,
	architecture: Model,
): Parameters<typeof recordWalkthrough>[0] {
	if (!context.vault) throw new CliUsageError("Canonical recording requires an explicit vault.");
	const playback = recordingPlayback(architecture);
	const walkthrough = { id: playback.walkthrough.id, name: playback.walkthrough.name };
	return {
		architecture,
		vault: context.vault.path,
		serverUrl: ARCHBOARD_URL,
		policy: {
			policy: architecture.policy,
			configurationValid: true,
			configurationFile: ".archboard/config.yaml",
			fingerprint: architecture.revision.digest,
			diagnostics: [],
		},
		variant: architecture.selectedState?.id ?? null,
		against: null,
		repository: null,
		walkthrough,
		language: input.language,
		container: containerOf(input.out),
		theme: input.theme,
		layout: input.layout,
		out: context.resolvePath(input.out),
		talk: talkPlaceOf(
			input.talk === undefined ? undefined : context.resolvePath(input.talk),
			architecture.manifest.name,
		),
		signal: context.signal,
		say: context.diagnostic,
		/**
		 * Report narrative progress from the existing page driver.
		 * @param state The recording state.
		 */
		onProgress: (state) => {
			if (state.phase === "recording" && state.step !== null)
				context.diagnostic(`Recording step ${state.step} of ${state.of}.`);
		},
	};
}

const modelRecordContract = defineCommand({
	prerequisites: ["server"],
	refusals: [serverRefusal],
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The canonical recording receipt or structured refusal",
			},
		],
		/**
		 * Select the recording receipt.
		 * @returns The JSON output case.
		 */
		select: () => "json",
	},
	path: ["model", "record"],
	shared: ["url", "directory"],
	summary: "Record one exact retained canonical walkthrough",
	description:
		"Uses the existing local voice, talk storage, and frame renderer. Every beat reads the same retained checkpoint. Missing subjects refuse recording before voice starts.",
	examples: ["archboard model record --checkpoint <id> --walkthrough Tour --out tour.mp4"],
	parameters: [
		...(["out", "theme", "layout", "language", "talk"] as const).map((key) => ({
			kind: "option" as const,
			key,
			spellings: [`--${key}`] as const,
			value: "required" as const,
			required: key === "out",
			placeholder: "value",
			description: `The recording ${key}`,
		})),
		{
			kind: "option",
			key: "checkpoint",
			spellings: ["--checkpoint"],
			value: "required",
			placeholder: "id",
			required: true,
			description: "One exact retained checkpoint",
		},
		{
			kind: "option",
			key: "walkthrough",
			spellings: ["--walkthrough"],
			value: "required",
			placeholder: "id|name",
			required: true,
			description: "One walkthrough in the retained reading",
		},
	],
	input: { ingress: InputSchema },
	result: z.union([
		z.object({
			success: z.literal(true),
			model: z.string(),
			state: z.string().nullable(),
			checkpoint: z.string(),
			revision: ArchitectureModelReadSchema.options[0].shape.revision,
			walkthrough: z.object({ id: z.string(), name: z.string() }),
			steps: z.int(),
			file: z.string(),
			bytes: z.int(),
			mimeType: z.string(),
			durationMs: z.int(),
			frames: z.int(),
			theme: DiagramThemeSchema,
			layout: LayoutEngineSchema,
			talk: z.string(),
		}),
		ArchitectureModelReadSchema.options[1],
	]),
	outcomes: [
		{
			id: "unavailable",
			exit: 2,
			stream: "stdout-and-stderr",
			presentation: ["diagnostics", "result"],
			description: "The retained walkthrough cannot be recorded",
		},
	],
	effects: ["read", "local-write", "server-state-write"],
	relationships: [
		{
			method: "GET",
			path: "/api/architecture/model",
			cardinality: "one",
			description: "Read exact retained canonical playback",
		},
	],
	/**
	 * Record one complete retained narrative through the existing recorder.
	 * @param input The checkpoint and local output paths.
	 * @param context The invocation capabilities.
	 * @returns The recording receipt or a structured refusal.
	 */
	async handler(input, context) {
		const file = context.resolvePath(input.out);
		requireWritableDirectory(input.out, file);
		await context.require("server", "model record");
		const architecture = await readArchitectureModelOnServer(
			undefined,
			input.checkpoint,
			undefined,
			{ walkthrough: input.walkthrough, shared: true },
		);
		if (!architecture.success)
			return {
				result: architecture,
				outcome: "unavailable",
				diagnostics: architecture.diagnostics.map(
					(item) => `${item.code}: ${item.message} ${item.recovery}`,
				),
			};
		const playback = recordingPlayback(architecture);
		const walkthrough = { id: playback.walkthrough.id, name: playback.walkthrough.name };
		const made = await recordWalkthrough(recordingRequest(input, context, architecture));
		return {
			result: {
				success: true as const,
				model: architecture.manifest.id,
				state: architecture.selectedState?.id ?? null,
				checkpoint: architecture.checkpoint!.id,
				revision: architecture.revision,
				walkthrough,
				steps: made.steps,
				file: made.file,
				bytes: made.bytes,
				mimeType: made.mimeType,
				durationMs: made.durationMs,
				frames: made.frames,
				theme: input.theme,
				layout: input.layout,
				talk: made.talk,
			},
		};
	},
});
export { modelRecordContract };

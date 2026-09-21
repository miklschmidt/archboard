/** Independent reviewed snapshots: this file intentionally does not import the catalogue. */
const WORKHORSE_MANIFEST_SNAPSHOT = {
	type: "namespace",
	name: "archboard_workhorse",
	description:
		"Inspect and steer the one workhorse bound by the host to this coordinator; no caller selects a target.",
	tools: [
		{
			type: "function",
			name: "inspect_workhorse",
			description:
				"Read the linked workhorse identity, state, queue, and bounded recent progress without waiting.",
			inputSchema: {
				type: "object",
				properties: {},
				required: [],
				additionalProperties: false,
			},
			deferLoading: false,
		},
		{
			type: "function",
			name: "delegate_to_workhorse",
			description:
				"Delegate one sustained request and bounded realtime transcript context to the linked workhorse.",
			inputSchema: {
				type: "object",
				properties: {
					input: { type: "string", minLength: 1, maxLength: 4096 },
					transcriptDelta: { type: "string", minLength: 0, maxLength: 4096 },
				},
				required: ["input", "transcriptDelta"],
				additionalProperties: false,
			},
			deferLoading: false,
		},
		{
			type: "function",
			name: "manage_workhorse_queue",
			description:
				"Inspect or mutate the linked created-workhorse queue through the host's serialized queue policy.",
			inputSchema: {
				type: "object",
				properties: {
					operation: {
						type: "string",
						enum: ["list", "add", "update", "delete", "reorder", "start"],
					},
					submissionId: { type: "string", minLength: 1, maxLength: 128 },
					prompt: { type: "string", minLength: 1, maxLength: 16_384 },
					orderedSubmissionIds: {
						type: "array",
						minItems: 1,
						maxItems: 100,
						uniqueItems: true,
						items: { type: "string", minLength: 1, maxLength: 128 },
					},
				},
				required: ["operation"],
				additionalProperties: false,
			},
			deferLoading: false,
		},
		{
			type: "function",
			name: "steer_workhorse",
			description:
				"Append one bounded instruction to the host-proven active workhorse turn; the host supplies expectedTurnId.",
			inputSchema: {
				type: "object",
				properties: { input: { type: "string", minLength: 1, maxLength: 4096 } },
				required: ["input"],
				additionalProperties: false,
			},
			deferLoading: false,
		},
	],
} as const;

const VOICE_MANIFEST_SNAPSHOT = {
	type: "namespace",
	name: "archboard_voice",
	description:
		"Voice-session tools the host validates: resolve the sole spoken binary approval from a later ordinary coordinator turn, and present a walkthrough step in the voice-linked pane.",
	tools: [
		{
			type: "function",
			name: "resolve_spoken_approval",
			description:
				"Return accept or decline for the sole still-current spoken approval; the host supplies and validates every request identity.",
			inputSchema: {
				type: "object",
				properties: { verdict: { type: "string", enum: ["accept", "decline"] } },
				required: ["verdict"],
				additionalProperties: false,
			},
			deferLoading: false,
		},
		{
			type: "function",
			name: "present_step",
			description:
				"Present a step of the walkthrough in the voice-linked pane and answer only once that step has finished arriving on screen, with the step's heading, body and subjects to hand to the voice model as speakable prose. Call it with no step to present the next step: the host knows which step was presented last, or which one the person moved to by hand, and the first call of a narration presents step 1. Pass step only when the person asked for a particular step. The host supplies the pane, board and variant. Name the walkthrough by id or name on the first call unless voice started in presentation mode; omit it afterwards. A refusal says why no step is on screen, including that the walkthrough is complete.",
			inputSchema: {
				type: "object",
				properties: {
					step: { type: "integer", minimum: 1, maximum: 1000 },
					walkthrough: { type: "string", minLength: 1, maxLength: 120 },
				},
				required: [],
				additionalProperties: false,
			},
			deferLoading: false,
		},
	],
} as const;

const QUEUE_OPERATION_SNAPSHOT = ["list", "add", "update", "delete", "reorder", "start"] as const;

export { QUEUE_OPERATION_SNAPSHOT, VOICE_MANIFEST_SNAPSHOT, WORKHORSE_MANIFEST_SNAPSHOT };

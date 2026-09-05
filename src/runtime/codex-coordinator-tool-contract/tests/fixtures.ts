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
		"Resolve the sole host-validated spoken binary approval from a later ordinary coordinator turn.",
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
	],
} as const;

const QUEUE_OPERATION_SNAPSHOT = ["list", "add", "update", "delete", "reorder", "start"] as const;

export { QUEUE_OPERATION_SNAPSHOT, VOICE_MANIFEST_SNAPSHOT, WORKHORSE_MANIFEST_SNAPSHOT };

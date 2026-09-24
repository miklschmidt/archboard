/** Independent reviewed snapshots: this file intentionally does not import the catalogue. */
const WORKHORSE_MANIFEST_SNAPSHOT = {
	type: "namespace",
	name: "archboard_workhorse",
	description:
		"Work with your workhorse, the agent that does sustained work for this Archboard server. Called from a script, a tool resolves to one string of JSON holding its whole result: print it with text(result). It is not an object, and it has no content array.",
	tools: [
		{
			type: "function",
			name: "inspect_workhorse",
			description:
				"Read what the workhorse is doing now: whether a turn is running, what is waiting for it, and its recent progress. Returns at once.",
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
				"Give the workhorse one piece of sustained work, written in English with the conversation context it needs.",
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
				"See or change the requests waiting for the workhorse to finish what it is doing.",
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
				"Add one short instruction, such as a correction, to the turn the workhorse is running now. Works only while a turn is running.",
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
		"Settle an approval the user answered by voice. Called from a script, a tool resolves to one string of JSON holding its whole result: print it with text(result). It is not an object, and it has no content array.",
	tools: [
		{
			type: "function",
			name: "resolve_spoken_approval",
			description: "Accept or decline the one approval the user answered aloud.",
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

/** Independent reviewed snapshots: this file intentionally does not import the catalogue. */
const WORKHORSE_MANIFEST_SNAPSHOT = {
	type: "namespace",
	name: "archboard_workhorse",
	description:
		"Work with your workhorses, the agents that do sustained work for this workbench. There is one workhorse for each checkout, and it works in that checkout. Every tool but stop_workhorses takes checkout: the directory where that workhorse runs. Called from a script, a tool resolves to one string of JSON holding its whole result: print it with text(result). It is not an object, and it has no content array.",
	tools: [
		{
			type: "function",
			name: "inspect_workhorse",
			description:
				"Read what the workhorse of one checkout is doing now: whether a turn is running, what is waiting for it, and its recent progress. Returns at once.",
			inputSchema: {
				type: "object",
				properties: {
					checkout: {
						type: "string",
						minLength: 1,
						maxLength: 4096,
					},
				},
				required: ["checkout"],
				additionalProperties: false,
			},
			deferLoading: false,
		},
		{
			type: "function",
			name: "delegate_to_workhorse",
			description:
				"Give the workhorse of one checkout one piece of sustained work, written in English with the conversation context it needs. If that checkout has no workhorse yet, this starts one.",
			inputSchema: {
				type: "object",
				properties: {
					checkout: {
						type: "string",
						minLength: 1,
						maxLength: 4096,
					},
					input: {
						type: "string",
						minLength: 1,
						maxLength: 4096,
					},
					transcriptDelta: {
						type: "string",
						minLength: 0,
						maxLength: 4096,
					},
				},
				required: ["checkout", "input", "transcriptDelta"],
				additionalProperties: false,
			},
			deferLoading: false,
		},
		{
			type: "function",
			name: "manage_workhorse_queue",
			description:
				"See or change the requests waiting for the workhorse of one checkout to finish what it is doing.",
			inputSchema: {
				type: "object",
				properties: {
					checkout: {
						type: "string",
						minLength: 1,
						maxLength: 4096,
					},
					operation: {
						type: "string",
						enum: ["list", "add", "update", "delete", "reorder", "start"],
					},
					submissionId: {
						type: "string",
						minLength: 1,
						maxLength: 128,
					},
					prompt: {
						type: "string",
						minLength: 1,
						maxLength: 16384,
					},
					orderedSubmissionIds: {
						type: "array",
						minItems: 1,
						maxItems: 100,
						uniqueItems: true,
						items: {
							type: "string",
							minLength: 1,
							maxLength: 128,
						},
					},
				},
				required: ["checkout", "operation"],
				additionalProperties: false,
			},
			deferLoading: false,
		},
		{
			type: "function",
			name: "steer_workhorse",
			description:
				"Add one short instruction, such as a correction, to the turn the workhorse of one checkout is running now. Works only while a turn is running.",
			inputSchema: {
				type: "object",
				properties: {
					checkout: {
						type: "string",
						minLength: 1,
						maxLength: 4096,
					},
					input: {
						type: "string",
						minLength: 1,
						maxLength: 4096,
					},
				},
				required: ["checkout", "input"],
				additionalProperties: false,
			},
			deferLoading: false,
		},
		{
			type: "function",
			name: "stop_workhorses",
			description:
				"Stop every running workhorse of this conversation, in every checkout, when the person asks to stop. Returns at once with one entry for each workhorse: interrupt_sent when a stop was sent to its running turn, idle when it had none. A sent interrupt is not proof that work stopped: the work has stopped only once workhorse news says its turn ended.",
			inputSchema: { type: "object", properties: {}, additionalProperties: false },
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

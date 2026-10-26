import { z } from "zod";
import {
	ExplanationActionRequestSchema,
	ExplanationActionResultSchema,
} from "@archboard/workbench/browser-contract";
import { explainArchitectureOnServer } from "#cli/clients/server/architecture-model.ts";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";
import { statedJson } from "#cli/operations/semantic/input/semantic-input.ts";

const modelExplainContract = defineCommand({
	path: ["model", "explain"],
	shared: ["url", "directory"],
	summary: "Explain a captured architecture reading through the local agent",
	description:
		"Reads an invocation with its tab session, exact revision, subjects, and reading intent. Read, retry, and cancel actions use the original action identity. Answers stay temporary.",
	examples: ["archboard model explain --input explanation.json -C /tmp/shop"],
	parameters: [
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
			placeholder: "file.json",
			description: "Read the action from JSON or standard input when absent",
		},
	],
	input: { ingress: z.object({ input: z.string().optional() }) },
	result: ExplanationActionResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The captured request, progress, answer, or refusal",
			},
		],
		/**
		 * Select the machine-readable action result.
		 * @returns The JSON output case.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["local-read", "server-state-write"],
	refusals: [serverRefusal],
	outcomes: [
		{
			id: "unavailable",
			exit: 2,
			stream: "stdout-and-stderr",
			presentation: ["diagnostics", "result"],
			description: "The action is unavailable or refused",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/explanations",
			cardinality: "one",
			description: "The same local action used by browser and voice",
		},
	],
	/**
	 * Send one stated action through the shared local contract.
	 * @param input The JSON input path.
	 * @param context The invocation prerequisites.
	 * @returns The temporary result or refusal.
	 */
	async handler(input, context) {
		await context.require("server", "model explain");
		const raw = await statedJson(input, context);
		const request = ExplanationActionRequestSchema.parse({
			type: "invoke",
			...z.record(z.string(), z.unknown()).parse(raw),
		});
		const result = await explainArchitectureOnServer(request);
		return {
			result,
			...(result.success ? {} : { outcome: "unavailable", diagnostics: [result.error] }),
		};
	},
});
export { modelExplainContract };

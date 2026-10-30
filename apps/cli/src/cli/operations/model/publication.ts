import { z } from "zod";
import {
	ArchitecturePublicationSchema,
	ArchitecturePublicationRequestSchema,
	ArchitecturePublicationDestinationSchema,
} from "@archboard/board/model";
import {
	readArchitecturePublicationOnServer,
	configureArchitecturePublicationOnServer,
	publishArchitectureHistoryOnServer,
	fetchArchitectureHistoryOnServer,
} from "#cli/clients/server/architecture-model.ts";
import { defineCommand, type TokenParameter } from "#cli/protocol/contract/contract.ts";
import { serverRefusal } from "#cli/protocol/contract/refusals.ts";

const checkpointParameter = {
	kind: "positional",
	key: "checkpoint",
	name: "checkpoint",
	required: true,
	description: "A complete immutable checkpoint identity",
} as const;
const destinationParameters: TokenParameter[] = [
	{
		kind: "option",
		key: "remote",
		spellings: ["--remote"],
		value: "required",
		placeholder: "name",
		required: true,
		description: "The explicitly configured Git remote name",
	},
	{
		kind: "option",
		key: "ref",
		spellings: ["--ref"],
		value: "required",
		placeholder: "refs/heads/archive",
		required: true,
		description: "The complete independent archive branch ref",
	},
];

/**
 * Preserve structured refusals and their recovery actions.
 * @param result The shared runtime outcome.
 * @returns The declared JSON result and failure outcome.
 */
function presented(result: z.infer<typeof ArchitecturePublicationSchema>) {
	return {
		result,
		...(result.success
			? {}
			: {
					outcome: "unavailable",
					diagnostics: result.diagnostics.map(
						(diagnostic) => `${diagnostic.code}: ${diagnostic.message} ${diagnostic.recovery}`,
					),
				}),
	};
}

const publicationOutput = {
	cases: [
		{
			id: "json",
			when: {},
			mode: "json",
			description: "Publication status or structured recovery diagnostics",
		},
	],
	/**
	 * Select JSON output.
	 * @returns The machine-readable outcome case.
	 */
	select: () => "json" as const,
} as const;

const modelPublicationContract = defineCommand({
	path: ["model", "publication"],
	shared: ["url", "directory"],
	summary: "Read explicit archive publication status",
	description:
		"Reads durable local evidence for one exact checkpoint without contacting a remote. Ordinary source pushes never establish archive publication.",
	examples: ["archboard model publication <checkpoint> -C /tmp/shop"],
	parameters: [checkpointParameter],
	input: { ingress: ArchitecturePublicationRequestSchema.pick({ checkpoint: true }) },
	result: ArchitecturePublicationSchema,
	output: publicationOutput,
	prerequisites: ["server"],
	effects: ["read"],
	refusals: [serverRefusal],
	outcomes: [
		{
			id: "unavailable",
			exit: 2,
			stream: "stdout-and-stderr",
			presentation: ["diagnostics", "result"],
			description: "The requested history operation cannot complete",
		},
	],
	relationships: [
		{
			method: "GET",
			path: "/api/architecture/publication",
			cardinality: "one",
			description: "Read local publication evidence",
		},
	],
	/**
	 * Read publication evidence for the exact checkpoint.
	 * @param input The checkpoint selector.
	 * @param context The invocation prerequisites.
	 * @returns The shared result.
	 */
	async handler(input, context) {
		await context.require("server", "model publication");
		return presented(await readArchitecturePublicationOnServer(input.checkpoint));
	},
});

const modelPublicationConfigureContract = defineCommand({
	...modelPublicationContract,
	output: publicationOutput,
	path: ["model", "publication-configure"],
	summary: "Configure an explicit archive publication destination",
	description:
		"Saves an existing named Git remote and a full archive ref privately. Reports the remote retention-policy limitation without publishing architecture.",
	examples: [
		"archboard model publication-configure --remote archive --ref refs/heads/archboard-history -C /tmp/shop",
	],
	parameters: destinationParameters,
	input: { ingress: ArchitecturePublicationDestinationSchema },
	effects: ["server-state-write"],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/publication/configure",
			cardinality: "one",
			description: "Save the explicit archive destination",
		},
	],
	/**
	 * Save the owner's deliberate destination.
	 * @param input The named remote and archive ref.
	 * @param context The invocation prerequisites.
	 * @returns The shared result.
	 */
	async handler(input, context) {
		await context.require("server", "model publication-configure");
		return presented(await configureArchitecturePublicationOnServer(input));
	},
});

const modelPublishContract = defineCommand({
	...modelPublicationContract,
	output: publicationOutput,
	path: ["model", "publish"],
	summary: "Publish complete retained architecture history",
	description:
		"Publishes the configured archive closure without force-pushing. A stale push fetches and joins signed archive ancestry without merging architectural content. Network failure leaves durable local work intact.",
	examples: [
		"archboard model publish <checkpoint> --remote archive --ref refs/heads/archboard-history -C /tmp/shop",
	],
	parameters: [checkpointParameter, ...destinationParameters],
	input: { ingress: ArchitecturePublicationRequestSchema },
	effects: ["server-state-write"],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/publication/publish",
			cardinality: "one",
			description: "Publish retained architecture to the configured ref",
		},
	],
	/**
	 * Publish the exact retained closure.
	 * @param input The explicit destination and checkpoint.
	 * @param context The invocation prerequisites.
	 * @returns The shared result.
	 */
	async handler(input, context) {
		await context.require("server", "model publish");
		return presented(await publishArchitectureHistoryOnServer(input));
	},
});

const modelFetchContract = defineCommand({
	...modelPublishContract,
	path: ["model", "fetch"],
	summary: "Fetch complete archive history for a missing reading",
	description:
		"Fetches the configured named archive ref and its complete ancestry, including shallow-clone dependencies. Current architecture, index and source HEAD remain unchanged.",
	examples: [
		"archboard model fetch <checkpoint> --remote archive --ref refs/heads/archboard-history -C /tmp/shop",
	],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/publication/fetch",
			cardinality: "one",
			description: "Restore the requested exact history closure",
		},
	],
	/**
	 * Fetch complete referenced archive history.
	 * @param input The explicit destination and checkpoint.
	 * @param context The invocation prerequisites.
	 * @returns The shared result.
	 */
	async handler(input, context) {
		await context.require("server", "model fetch");
		return presented(await fetchArchitectureHistoryOnServer(input));
	},
});

export {
	modelPublicationContract,
	modelPublicationConfigureContract,
	modelPublishContract,
	modelFetchContract,
};

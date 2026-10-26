import { z } from "zod";
import {
	ArchitectureModuleEditSchema,
	ArchitectureModuleEditResultSchema,
	ArchitectureClaimRequestSchema,
	ArchitectureClaimResultSchema,
	ArchitectureClaimReleaseSchema,
	ArchitectureClaimListSchema,
	ArchitectureRecoveryResultSchema,
	type ArchitectureModelRead,
} from "@archboard/board/model";
import {
	editArchitectureModuleOnServer,
	claimArchitectureSubjectsOnServer,
	readArchitectureClaimsOnServer,
	releaseArchitectureClaimOnServer,
	recoverArchitectureModelOnServer,
} from "#cli/clients/server/architecture-model.ts";
import { statedInvocation } from "@archboard/server-lifecycle/server-client";
import { defineCommand } from "#cli/protocol/contract/contract.ts";
import { serverRefusal, doingRefusal } from "#cli/protocol/contract/refusals.ts";
import { statedJson } from "#cli/operations/semantic/input/semantic-input.ts";

/**
 * Keep runtime refusals intact through CLI output and exit status.
 * @param result The result derived from the signed record.
 * @returns The CLI result and declared refusal outcome.
 */
function presented<
	T extends { success: true } | Extract<ArchitectureModelRead, { success: false }>,
>(result: T) {
	return {
		result,
		...(result.success
			? {}
			: {
					outcome: "unavailable",
					diagnostics: result.diagnostics.map(
						(diagnostic) =>
							`${diagnostic.code} ${diagnostic.file}: ${diagnostic.message} ${diagnostic.recovery}`,
					),
				}),
	};
}
const modelClaimContract = defineCommand({
	path: ["model", "claim"],
	shared: ["url", "directory"],
	summary: "Claim explicit canonical module identities",
	description:
		"Reads target, writer, reason and subjects from JSON. A standing subject claim leaves the installation lock free between operations.",
	examples: ["archboard model claim --input claim.json -C /tmp/shop"],
	parameters: [
		{
			kind: "option",
			key: "input",
			spellings: ["--input"],
			value: "required",
			placeholder: "file.json",
			description: "Read a JSON request from this file, or from standard input when absent",
		},
	],
	input: { ingress: z.object({ input: z.string().optional() }) },
	result: ArchitectureClaimResultSchema,
	output: {
		cases: [
			{
				id: "json",
				when: {},
				mode: "json",
				description: "The shared operation result or recovery diagnostics",
			},
		],
		/**
		 * Select the structured result.
		 * @returns The JSON result case.
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
			description: "The runtime refused the operation and supplies recovery instructions",
		},
	],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/claims",
			cardinality: "one",
			description: "Claim the explicit module scope",
		},
	],
	/**
	 * Claim the requested module identities.
	 * @param input The complete caller input.
	 * @param context The caller checkout or invocation context.
	 * @returns The shared runtime result and CLI outcome.
	 */
	async handler(input, context) {
		await context.require("server", "model claim");
		return presented(
			await claimArchitectureSubjectsOnServer(
				context.parse(ArchitectureClaimRequestSchema, await statedJson(input, context)),
			),
		);
	},
});
const modelEditContract = defineCommand({
	...modelClaimContract,
	path: ["model", "edit"],
	shared: ["url", "directory", "doing"],
	summary: "Change one canonical module description durably",
	description:
		"Reads target, subject, complete expectedRevision, operationId, writer, claim and description from JSON. The doing line comes from --doing. A lost response uses the same request and operation identity.",
	examples: [
		'archboard model edit --input edit.json --doing "explaining request routing" -C /tmp/shop',
	],
	result: ArchitectureModuleEditResultSchema,
	prerequisites: ["server", "doing"],
	refusals: [serverRefusal, doingRefusal],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/module",
			cardinality: "one",
			description: "Apply or recover one durable description edit",
		},
	],
	/**
	 * Apply one explicit description edit without interpreting the transaction in the CLI.
	 * @param input The complete caller input.
	 * @param context The caller checkout or invocation context.
	 * @returns The shared runtime result and CLI outcome.
	 */
	async handler(input, context) {
		await context.require("server", "model edit");
		const request = context.parse(
			ArchitectureModuleEditSchema.omit({ doing: true }),
			await statedJson(input, context),
		);
		return presented(
			await editArchitectureModuleOnServer(
				context.parse(ArchitectureModuleEditSchema, {
					...request,
					doing: statedInvocation().doing,
				}),
			),
		);
	},
});
const modelReleaseContract = defineCommand({
	...modelClaimContract,
	path: ["model", "release"],
	summary: "Release a canonical subject claim",
	description:
		"Reads claim and writer from JSON. A reader can take a claim back through the browser control.",
	examples: ["archboard model release --input release.json -C /tmp/shop"],
	result: ArchitectureClaimListSchema,
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/claims/release",
			cardinality: "one",
			description: "Release the caller's explicit scope",
		},
	],
	/**
	 * Release a claim owned by this writer.
	 * @param input The complete caller input.
	 * @param context The caller checkout or invocation context.
	 * @returns The shared runtime result and CLI outcome.
	 */
	async handler(input, context) {
		await context.require("server", "model release");
		return presented(
			await releaseArchitectureClaimOnServer(
				context.parse(ArchitectureClaimReleaseSchema, await statedJson(input, context)),
			),
		);
	},
});
const modelClaimsContract = defineCommand({
	...modelClaimContract,
	path: ["model", "claims"],
	summary: "Read canonical subject claims",
	description:
		"Returns the active claims of this checkout, including their writer, reason and start time.",
	examples: ["archboard model claims -C /tmp/shop"],
	parameters: [],
	input: { ingress: z.object({}) },
	result: ArchitectureClaimListSchema,
	effects: ["read"],
	relationships: [
		{
			method: "GET",
			path: "/api/architecture/claims",
			cardinality: "one",
			description: "Read visible canonical claims",
		},
	],
	/**
	 * Read standing scopes without changing architecture.
	 * @param _input The empty command input.
	 * @param context The caller checkout or invocation context.
	 * @returns The shared runtime result and CLI outcome.
	 */
	async handler(_input, context) {
		await context.require("server", "model claims");
		return presented(await readArchitectureClaimsOnServer());
	},
});
const modelRecoverContract = defineCommand({
	...modelClaimsContract,
	path: ["model", "recover"],
	summary: "Recover the checkout's durable canonical edit",
	description:
		"Resumes the recorded operation without creating another intent. Foreign inputs and a changed branch block replay. Keep those bytes and restore the logged context before retrying.",
	examples: ["archboard model recover -C /tmp/shop"],
	result: ArchitectureRecoveryResultSchema,
	effects: ["server-state-write"],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/recover",
			cardinality: "one",
			description: "Resume or finish the one pending journal",
		},
	],
	/**
	 * Finish the durable operation recorded in this checkout.
	 * @param _input The empty command input.
	 * @param context The caller checkout or invocation context.
	 * @returns The shared runtime result and CLI outcome.
	 */
	async handler(_input, context) {
		await context.require("server", "model recover");
		return presented(await recoverArchitectureModelOnServer());
	},
});
export {
	modelClaimContract,
	modelEditContract,
	modelReleaseContract,
	modelClaimsContract,
	modelRecoverContract,
};

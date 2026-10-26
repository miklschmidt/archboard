import type { z } from "zod";
import {
	ArchitectureModuleEditSchema,
	ArchitectureModuleEditResultSchema,
	ArchitectureRecoveryResultSchema,
	ArchitectureClaimRequestSchema,
	ArchitectureClaimResultSchema,
	ArchitectureClaimListSchema,
	ArchitectureClaimReleaseSchema,
	ArchitectureModelReadSchema,
	ArchitectureCheckpointRetainSchema,
	ArchitectureCheckpointListSchema,
	type ArchitectureCheckpointRequest,
} from "@archboard/board/model";
import { isRecord } from "@archboard/diagnostics/unknown-record";
import { requestJson } from "@archboard/server-lifecycle/server-client";

/**
 * Preserve structured architecture refusals across unsuccessful HTTP responses.
 * @param schema The shared outcome schema.
 * @param path The API route and selectors.
 * @param init The optional request body and method.
 * @returns The complete public outcome.
 */
async function architectureResult<T>(
	schema: z.ZodType<T>,
	path: string,
	init?: RequestInit,
): Promise<T> {
	try {
		return schema.parse(await requestJson<unknown>(path, init));
	} catch (error) {
		const parsed = schema.safeParse(isRecord(error) ? error["answer"] : undefined);
		if (parsed.success && isRecord(parsed.data) && parsed.data["success"] === false)
			return parsed.data;
		throw error;
	}
}

/**
 * Read current inputs or one immutable checkpoint.
 * @param module The optional module selector.
 * @param checkpoint The complete immutable checkpoint identity.
 * @returns The coherent reading or structured refusal.
 */
function readArchitectureModelOnServer(module?: string, checkpoint?: string) {
	const query = new URLSearchParams({
		...(module === undefined ? {} : { module }),
		...(checkpoint === undefined ? {} : { checkpoint }),
	});
	return architectureResult(ArchitectureModelReadSchema, `/api/architecture/model?${query}`);
}

/**
 * Retain exact current inputs through the shared architecture runtime.
 * @param input The revision, dependencies and writer intent.
 * @returns The retained checkpoint or structured refusal.
 */
function retainArchitectureCheckpointOnServer(input: ArchitectureCheckpointRequest) {
	return architectureResult(ArchitectureCheckpointRetainSchema, "/api/architecture/checkpoints", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
}

/**
 * List local checkpoints independently of current content.
 * @returns The retained metadata or structured refusal.
 */
function listArchitectureCheckpointsOnServer() {
	return architectureResult(ArchitectureCheckpointListSchema, "/api/architecture/checkpoints");
}

/**
 * Send one fully stated description edit through the shared server operation.
 * @param input The complete caller input.
 * @returns The shared edit result or structured refusal.
 */
function editArchitectureModuleOnServer(input: z.infer<typeof ArchitectureModuleEditSchema>) {
	return architectureResult(
		ArchitectureModuleEditResultSchema,
		"/api/architecture/module",
		jsonPost(input),
	);
}
/**
 * Claim explicit modules without holding the installation lease.
 * @param input The complete caller input.
 * @returns The shared claim result or structured refusal.
 */
function claimArchitectureSubjectsOnServer(input: z.infer<typeof ArchitectureClaimRequestSchema>) {
	return architectureResult(
		ArchitectureClaimResultSchema,
		"/api/architecture/claims",
		jsonPost(input),
	);
}
/**
 * List the current subject claims.
 * @returns The shared claim list or refusal.
 */
function readArchitectureClaimsOnServer() {
	return architectureResult(ArchitectureClaimListSchema, "/api/architecture/claims");
}
/**
 * Release a standing claim owned by the caller.
 * @param input The complete caller input.
 * @returns The remaining claims or a structured refusal.
 */
function releaseArchitectureClaimOnServer(input: z.infer<typeof ArchitectureClaimReleaseSchema>) {
	return architectureResult(
		ArchitectureClaimListSchema,
		"/api/architecture/claims/release",
		jsonPost(input),
	);
}
/**
 * Resume the checkout's pending durable journal.
 * @returns The shared recovery result or refusal.
 */
function recoverArchitectureModelOnServer() {
	return architectureResult(
		ArchitectureRecoveryResultSchema,
		"/api/architecture/recover",
		jsonPost({}),
	);
}
/**
 * Encode one complete operation body.
 * @param input The complete caller input.
 * @returns The encoded POST request.
 */
function jsonPost(input: unknown): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	};
}

export {
	editArchitectureModuleOnServer,
	claimArchitectureSubjectsOnServer,
	readArchitectureClaimsOnServer,
	releaseArchitectureClaimOnServer,
	recoverArchitectureModelOnServer,
	readArchitectureModelOnServer,
	retainArchitectureCheckpointOnServer,
	listArchitectureCheckpointsOnServer,
};

import type { z } from "zod";
import {
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

export {
	readArchitectureModelOnServer,
	retainArchitectureCheckpointOnServer,
	listArchitectureCheckpointsOnServer,
};

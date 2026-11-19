import {
	readModelReply,
	type ModelReply,
	type ModelRequestInput,
	type ReplyDelivery,
	type ReplyOperation,
} from "@archboard/model-contract";
import {
	explanationActionResultSchema,
	type ExplanationActionRequest,
} from "@archboard/workbench/browser-contract";
import type { z } from "zod";
import type { readArchitectureModel } from "@archboard/model-store";
import { isRecord } from "@archboard/diagnostics/unknown-record";
import { requestJson } from "@archboard/server-lifecycle/server-client";

/** How an answer is read: its data, or why the body is not one. */
type Reading<T> = (
	body: unknown,
	delivery: ReplyDelivery,
) =>
	| { readonly success: true; readonly data: T }
	| { readonly success: false; readonly error: unknown };

/**
 * Preserve structured refusals across unsuccessful HTTP responses.
 * @param read How the body is read as the operation's answer.
 * @param path The API route and selectors.
 * @param init The optional request body and method.
 * @returns The complete public outcome.
 * @throws {Error} The failure of the request, unless its body is a structured refusal.
 */
async function answeredBy<T>(read: Reading<T>, path: string, init?: RequestInit): Promise<T> {
	try {
		const answer = read(await requestJson<unknown>(path, init), "answered");
		if (!answer.success) throw answer.error;
		return answer.data;
	} catch (error) {
		const refusal = read(isRecord(error) ? error["answer"] : undefined, "failed");
		if (refusal.success) return refusal.data;
		throw error;
	}
}

/**
 * The answer of a model operation, its refusals kept across unsuccessful HTTP responses.
 * @param operation The operation the server answers.
 * @param path The API route and selectors.
 * @param init The optional request body and method.
 * @returns The complete public outcome.
 */
function architectureResult<O extends ReplyOperation>(
	operation: O,
	path: string,
	init?: RequestInit,
): Promise<ModelReply<O>> {
	return answeredBy((body, delivery) => readModelReply(operation, body, delivery), path, init);
}

/**
 * The answer of an analysis that is not a model operation, read by its own schema; only a
 * structured refusal is kept across an unsuccessful HTTP response.
 * @param schema The shared outcome schema.
 * @param path The API route and selectors.
 * @param init The optional request body and method.
 * @returns The complete public outcome.
 */
function schemaResult<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
	return answeredBy(
		(body, delivery) => {
			const parsed = schema.safeParse(body);
			if (!parsed.success || delivery === "answered") return parsed;
			return isRecord(parsed.data) && parsed.data["success"] === false
				? parsed
				: { success: false, error: new Error("Only a refusal answers a failed request.") };
		},
		path,
		init,
	);
}

/**
 * Read current inputs or one immutable checkpoint.
 * @param module The optional module selector.
 * @param checkpoint The complete immutable checkpoint identity.
 * @param flow The optional explicit flow selector.
 * @param selection The optional state and comparison selectors.
 * @returns The coherent reading or structured refusal.
 */
function readArchitectureModelOnServer(
	module?: string,
	checkpoint?: string,
	flow?: string,
	selection?: Parameters<typeof readArchitectureModel>[3],
) {
	const { explain: _explain, ...reading } = selection ?? {};
	const values = { module, checkpoint, flow, ...reading };
	const query = new URLSearchParams(
		Object.entries(values)
			.filter(([, value]) => value !== undefined)
			.flatMap(([key, value]) => [value].flat().map((entry) => [key, String(entry)])),
	);
	return architectureResult("read", `/api/architecture/model?${query}`);
}

/**
 * Retain exact current inputs through the shared architecture runtime.
 * @param input The revision, dependencies and writer intent.
 * @returns The retained checkpoint or structured refusal.
 */
function retainArchitectureCheckpointOnServer(input: ModelRequestInput<"retainCheckpoint">) {
	return architectureResult("retainCheckpoint", "/api/architecture/checkpoints", {
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
	return architectureResult("listCheckpoints", "/api/architecture/checkpoints");
}

/**
 * Send one complete architecture intent through the shared server operation.
 * @param input The complete caller input.
 * @returns The shared edit result or structured refusal.
 */
function editArchitectureModuleOnServer(input: ModelRequestInput<"edit">) {
	return architectureResult("edit", "/api/architecture/module", jsonPost(input));
}
/**
 * Claim explicit structure and subject scopes without holding the installation lease.
 * @param input The complete caller input.
 * @returns The shared claim result or structured refusal.
 */
function claimArchitectureSubjectsOnServer(input: ModelRequestInput<"claim">) {
	return architectureResult("claim", "/api/architecture/claims", jsonPost(input));
}
/**
 * List the current subject claims.
 * @returns The shared claim list or refusal.
 */
function readArchitectureClaimsOnServer() {
	return architectureResult("readClaims", "/api/architecture/claims");
}
/**
 * Release a standing claim owned by the caller.
 * @param input The complete caller input.
 * @returns The remaining claims or a structured refusal.
 */
function releaseArchitectureClaimOnServer(input: ModelRequestInput<"releaseClaim">) {
	return architectureResult("releaseClaim", "/api/architecture/claims/release", jsonPost(input));
}
/**
 * Resume the checkout's pending durable journal.
 * @returns The shared recovery result or refusal.
 */
function recoverArchitectureModelOnServer() {
	return architectureResult("recover", "/api/architecture/recover", jsonPost({}));
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

/**
 * Read one checkpoint's durable publication evidence.
 * @param checkpoint The exact checkpoint identity.
 * @returns The shared publication outcome.
 */
function readArchitecturePublicationOnServer(checkpoint: string) {
	return architectureResult(
		"readPublication",
		`/api/architecture/publication?${new URLSearchParams({ checkpoint })}`,
	);
}

/**
 * Configure an explicit archive destination.
 * @param input The named remote and complete archive ref.
 * @returns The destination and retention limitation.
 */
function configureArchitecturePublicationOnServer(
	input: ModelRequestInput<"configurePublication">,
) {
	return architectureResult(
		"configurePublication",
		"/api/architecture/publication/configure",
		jsonPost(input),
	);
}

/**
 * Publish retained history through the common runtime.
 * @param input The configured destination and exact checkpoint.
 * @returns The shared publication outcome.
 */
function publishArchitectureHistoryOnServer(input: ModelRequestInput<"publish">) {
	return architectureResult("publish", "/api/architecture/publication/publish", jsonPost(input));
}

/**
 * Restore the requested archive closure through the common runtime.
 * @param input The configured destination and exact checkpoint.
 * @returns The shared recovery outcome.
 */
function fetchArchitectureHistoryOnServer(input: ModelRequestInput<"fetch">) {
	return architectureResult("fetch", "/api/architecture/publication/fetch", jsonPost(input));
}

export {
	readArchitecturePublicationOnServer,
	configureArchitecturePublicationOnServer,
	publishArchitectureHistoryOnServer,
	fetchArchitectureHistoryOnServer,
};

/**
 * Explicitly initialize local history for an untracked vault.
 * @returns The shared setup outcome and local archive directory.
 */
function initializeArchitectureArchiveOnServer() {
	return architectureResult("initializeArchive", "/api/architecture/archive/init", jsonPost({}));
}
export { initializeArchitectureArchiveOnServer };

/**
 * Ask the server for an explicitly selected flow picture.
 * @param input The explicit reading and standalone theme.
 * @param vault The optional explicit source vault for reproducible embeds.
 * @returns The SVG receipt or structured diagnostics.
 */
function renderArchitectureFlowOnServer(input: ModelRequestInput<"render">, vault?: string) {
	const query = new URLSearchParams(vault === undefined ? undefined : { vault });
	for (const [key, value] of Object.entries(input)) {
		if (value === undefined) continue;
		for (const entry of Array.isArray(value) ? value : [value]) query.append(key, entry);
	}
	return architectureResult("render", `/api/architecture/render?${query}`);
}
export { renderArchitectureFlowOnServer };

/**
 * Route one local action without interpreting its captured architecture.
 * @param input The shared action request.
 * @returns Its temporary answer or refusal.
 */
function explainArchitectureOnServer(input: ExplanationActionRequest) {
	const { type, ...body } = input;
	const base = "/api/architecture/explanations";
	if (type === "invoke") return schemaResult(explanationActionResultSchema(), base, jsonPost(body));
	if (input.type === "latest")
		return schemaResult(
			explanationActionResultSchema(),
			`${base}?${new URLSearchParams({ tabSessionId: input.tabSessionId })}`,
		);
	const path = `${base}/${encodeURIComponent(input.actionId)}`;
	return type === "read"
		? schemaResult(
				explanationActionResultSchema(),
				`${path}?${new URLSearchParams({ tabSessionId: input.tabSessionId })}`,
			)
		: schemaResult(
				explanationActionResultSchema(),
				`${path}/${type}`,
				jsonPost({ tabSessionId: input.tabSessionId }),
			);
}
export { explainArchitectureOnServer };

/**
 * Export complete canonical inputs and history through the shared runtime.
 * @returns The portable envelope or refusal.
 */
function exportArchitectureModelOnServer() {
	return architectureResult("export", "/api/architecture/export", jsonPost({}));
}
/**
 * Install a portable model through the shared runtime.
 * @param input The complete installation request.
 * @returns The durable installation receipt or refusal.
 */
function importArchitectureModelOnServer(input: ModelRequestInput<"import">) {
	return architectureResult("import", "/api/architecture/import", jsonPost(input));
}
export { exportArchitectureModelOnServer, importArchitectureModelOnServer };

/**
 * Submit the explicit owner migration intent through the shared runtime.
 * @param input The complete input.
 * @returns The shared migration receipt or refusal.
 */
function migrateArchitectureModelOnServer(input: ModelRequestInput<"migrate">) {
	return architectureResult("migrate", "/api/architecture/migration/apply", jsonPost(input));
}
export { migrateArchitectureModelOnServer };

/**
 * Initialize an empty canonical model through the public runtime adapter.
 * @param input The stable initialization intent.
 * @returns The durable installation receipt.
 */
function initializeArchitectureModelOnServer(input: ModelRequestInput<"initialize">) {
	return architectureResult("initialize", "/api/architecture/init", jsonPost(input));
}
export { initializeArchitectureModelOnServer };

export { architectureResult, schemaResult };

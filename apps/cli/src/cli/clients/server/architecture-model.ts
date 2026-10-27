import {
	ArchitectureExportResultSchema,
	ArchitectureImportRequestSchema,
	ArchitectureInitializationRequestSchema,
	ArchitectureMigrationRequestSchema,
} from "@archboard/board/model";
import {
	ExplanationActionRequestSchema,
	ExplanationActionResultSchema,
} from "@archboard/workbench/browser-contract";
import type { z } from "zod";
import type { readArchitectureModel } from "@archboard/board/store-read";
import {
	ArchitectureArchiveInitializationSchema,
	ArchitectureModuleEditSchema,
	ArchitectureModuleEditResultSchema,
	ArchitectureRecoveryResultSchema,
	ArchitectureClaimRequestSchema,
	ArchitectureClaimResultSchema,
	ArchitectureClaimListSchema,
	ArchitectureClaimReleaseSchema,
	ArchitectureModelReadSchema,
	ArchitectureRenderRequestSchema,
	ArchitectureRenderResultSchema,
	ArchitecturePublicationSchema,
	ArchitecturePublicationDestinationSchema,
	ArchitecturePublicationRequestSchema,
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
			.map(([key, value]) => [key, String(value)]),
	);
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
 * Send one complete architecture intent through the shared server operation.
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
 * Claim explicit structure and subject scopes without holding the installation lease.
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

/**
 * Read one checkpoint's durable publication evidence.
 * @param checkpoint The exact checkpoint identity.
 * @returns The shared publication outcome.
 */
function readArchitecturePublicationOnServer(checkpoint: string) {
	return architectureResult(
		ArchitecturePublicationSchema,
		`/api/architecture/publication?${new URLSearchParams({ checkpoint })}`,
	);
}

/**
 * Configure an explicit archive destination.
 * @param input The named remote and complete archive ref.
 * @returns The destination and retention limitation.
 */
function configureArchitecturePublicationOnServer(
	input: z.infer<typeof ArchitecturePublicationDestinationSchema>,
) {
	return architectureResult(
		ArchitecturePublicationSchema,
		"/api/architecture/publication/configure",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		},
	);
}

/**
 * Publish retained history through the common runtime.
 * @param input The configured destination and exact checkpoint.
 * @returns The shared publication outcome.
 */
function publishArchitectureHistoryOnServer(
	input: z.infer<typeof ArchitecturePublicationRequestSchema>,
) {
	return architectureResult(
		ArchitecturePublicationSchema,
		"/api/architecture/publication/publish",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		},
	);
}

/**
 * Restore the requested archive closure through the common runtime.
 * @param input The configured destination and exact checkpoint.
 * @returns The shared recovery outcome.
 */
function fetchArchitectureHistoryOnServer(
	input: z.infer<typeof ArchitecturePublicationRequestSchema>,
) {
	return architectureResult(ArchitecturePublicationSchema, "/api/architecture/publication/fetch", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
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
	return architectureResult(
		ArchitectureArchiveInitializationSchema,
		"/api/architecture/archive/init",
		jsonPost({}),
	);
}
export { initializeArchitectureArchiveOnServer };

/**
 * Ask the server for an explicitly selected flow picture.
 * @param input The explicit reading and standalone theme.
 * @param vault The optional explicit source vault for reproducible embeds.
 * @returns The SVG receipt or structured diagnostics.
 */
function renderArchitectureFlowOnServer(
	input: z.infer<typeof ArchitectureRenderRequestSchema>,
	vault?: string,
) {
	const query = new URLSearchParams(vault === undefined ? undefined : { vault });
	for (const [key, value] of Object.entries(input)) {
		if (value === undefined) continue;
		for (const entry of Array.isArray(value) ? value : [value]) query.append(key, entry);
	}
	return architectureResult(ArchitectureRenderResultSchema, `/api/architecture/render?${query}`);
}
export { renderArchitectureFlowOnServer };

/**
 * Route one local action without interpreting its captured architecture.
 * @param input The shared action request.
 * @returns Its temporary answer or refusal.
 */
function explainArchitectureOnServer(input: z.infer<typeof ExplanationActionRequestSchema>) {
	const { type, ...body } = input;
	const base = "/api/architecture/explanations";
	if (type === "invoke")
		return architectureResult(ExplanationActionResultSchema, base, jsonPost(body));
	if (input.type === "latest")
		return architectureResult(
			ExplanationActionResultSchema,
			`${base}?${new URLSearchParams({ tabSessionId: input.tabSessionId })}`,
		);
	const path = `${base}/${encodeURIComponent(input.actionId)}`;
	return type === "read"
		? architectureResult(
				ExplanationActionResultSchema,
				`${path}?${new URLSearchParams({ tabSessionId: input.tabSessionId })}`,
			)
		: architectureResult(
				ExplanationActionResultSchema,
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
	return architectureResult(
		ArchitectureExportResultSchema,
		"/api/architecture/export",
		jsonPost({}),
	);
}
/**
 * Install a portable model through the shared runtime.
 * @param input The complete installation request.
 * @returns The durable installation receipt or refusal.
 */
function importArchitectureModelOnServer(input: z.infer<typeof ArchitectureImportRequestSchema>) {
	return architectureResult(
		ArchitectureModuleEditResultSchema,
		"/api/architecture/import",
		jsonPost(input),
	);
}
export { exportArchitectureModelOnServer, importArchitectureModelOnServer };

/**
 * Submit the explicit owner migration intent through the shared runtime.
 * @param input The complete input.
 * @returns The shared migration receipt or refusal.
 */
function migrateArchitectureModelOnServer(
	input: z.infer<typeof ArchitectureMigrationRequestSchema>,
) {
	return architectureResult(
		ArchitectureModuleEditResultSchema,
		"/api/architecture/migration/apply",
		jsonPost(input),
	);
}
export { migrateArchitectureModelOnServer };

/**
 * Initialize an empty canonical model through the public runtime adapter.
 * @param input The stable initialization intent.
 * @returns The durable installation receipt.
 */
function initializeArchitectureModelOnServer(
	input: z.infer<typeof ArchitectureInitializationRequestSchema>,
) {
	return architectureResult(
		ArchitectureModuleEditResultSchema,
		"/api/architecture/init",
		jsonPost(input),
	);
}
export { initializeArchitectureModelOnServer };

export { architectureResult };

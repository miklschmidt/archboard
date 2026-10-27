import { queryOptions } from "@tanstack/react-query";
import {
	ExplanationActionRequestSchema,
	ExplanationActionResultSchema,
} from "@archboard/workbench/browser-contract";
import { inVault } from "@archboard/server-requests";
import type { z } from "zod";

type ExplanationRequest = z.infer<typeof ExplanationActionRequestSchema>;
type ExplanationResult = z.infer<typeof ExplanationActionResultSchema>;
type ExplanationAction = Extract<ExplanationResult, { success: true }>["action"];
type ExplanationInvocation = Omit<
	Extract<ExplanationRequest, { type: "invoke" }>,
	"type" | "tabSessionId"
>;

/**
 * Keep one temporary answer query per browser tab, across repository navigation.
 * @param tab The existing tab session identity.
 * @returns The query identity.
 */
function explanationKey(tab: string) {
	return ["architecture-explanations", tab] as const;
}

/**
 * Read the latest deliberate action without copying answers into presentation state.
 * @param vault The pane's admitted vault.
 * @param tab The existing tab session identity.
 * @returns The shared query and explicit recovery policy.
 */
function explanationQuery(vault: string, tab: string) {
	return queryOptions({
		queryKey: explanationKey(tab),
		/**
		 * Read one tab answer through the existing action endpoint.
		 * @param context The query cancellation context.
		 * @param context.signal Abort an obsolete read.
		 * @returns The latest action snapshot or refusal.
		 */
		queryFn: ({ signal }) =>
			explanationRequest(vault, { type: "latest", tabSessionId: tab }, signal),
		staleTime: Infinity,
		retry: false,
		refetchOnWindowFocus: false,
		refetchOnMount: "always",
	});
}

/**
 * Use the same local action contract for visible controls and agent commands.
 * @param vault The action's actual vault, or the admitted vault for discovery.
 * @param input The exact intent.
 * @param signal Cancellation for reads only.
 * @returns The shared action snapshot or refusal.
 */
async function explanationRequest(
	vault: string,
	input: ExplanationRequest,
	signal?: AbortSignal,
): Promise<ExplanationResult> {
	const base = "/api/architecture/explanations";
	const { type, ...body } = input;
	let path = base;
	let init: RequestInit;
	if (type === "latest" || type === "read") {
		if (input.type === "read") path += `/${encodeURIComponent(input.actionId)}`;
		path += `?${new URLSearchParams({ tabSessionId: input.tabSessionId })}`;
		init = { signal: signal ?? null };
	} else {
		if (input.type !== "invoke") path += `/${encodeURIComponent(input.actionId)}/${type}`;
		init = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ vault, ...body }),
		};
	}
	const response = await fetch(inVault(path, vault), init);
	return ExplanationActionResultSchema.parse(await response.json());
}

export { explanationKey, explanationQuery, explanationRequest };
export type { ExplanationAction, ExplanationInvocation, ExplanationRequest };

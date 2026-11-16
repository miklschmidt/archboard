// The code pass that the code view of Measures starts over the reading on screen when no
// remembered pass read it (ADR 0046, amendment of 2026-11-08, TASK-590.13).

import { useCallback } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { codeCheckQuery } from "#ui/architecture-drawing/canvas/picture/reads/clients/queries.ts";
import type { CodeCheckReading } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import type { CodeReadingName } from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";
import { readsVaultOnDisk } from "#ui/architecture-drawing/model-reader/rules/vault-on-disk.ts";

/** How the code pass over the reading on screen stands, while no remembered pass read it. */
type CodeCheckProgress =
	| { readonly status: "checking" }
	| { readonly status: "failed"; readonly error: string; readonly retry: () => void }
	| { readonly status: "unread"; readonly retry: () => void }
	| { readonly status: "unavailable" };

/**
 * Start one code pass over the reading on screen, once the remembered findings are read and none
 * of them read this version of it, and say how it stands. A migration preview is no reading of the
 * vault, so no pass reads it.
 * @param vault The vault.
 * @param model The reading on screen.
 * @param remembered How the read of the remembered findings stands, and whether one matched.
 * @param remembered.read The status of that read.
 * @param remembered.matched Whether a remembered pass read this version of the reading.
 * @returns How the pass stands.
 */
function useCodeCheck(
	vault: string,
	model: CodeReadingName,
	remembered: { readonly read: "pending" | "error" | "success"; readonly matched: boolean },
): CodeCheckProgress {
	const preview = !readsVaultOnDisk(model);
	const query = useQuery({
		...codeCheckQuery(vault, checkedReading(model)),
		/**
		 * A failed query stays stale even with an infinite stale time. Only a pass with no
		 * outcome starts automatically. Refetch still permits Try again.
		 * @param pass The cached pass.
		 * @returns Whether the view can start its first attempt.
		 */
		enabled: (pass) =>
			!preview &&
			remembered.read === "success" &&
			!remembered.matched &&
			pass.state.status === "pending",
	});
	const { refetch } = query;
	const retry = useCallback((): void => {
		void refetch();
	}, [refetch]);
	return preview ? { status: "unavailable" } : progressOf(query, remembered.read, retry);
}

/**
 * The reading a pass is asked to read, as the pass names what it read.
 * @param model The reading on screen.
 * @returns Its model, its state, whether that is Current, and the digest of its version.
 */
function checkedReading(model: CodeReadingName): CodeCheckReading {
	const state = model.selectedState ?? null;
	return {
		model: model.manifest.id,
		state: state === null ? null : state.id,
		current: state?.lifecycle === "current",
		revision: model.revision.digest,
	};
}

/**
 * The words of a failure.
 * @param error The failure.
 * @returns Its message, or nothing.
 */
function messageOf(error: Error | null): string {
	return error?.message ?? "";
}

/**
 * How a pass stands, from its query and the read of the remembered findings.
 * @param query The pass.
 * @param read How the read of the remembered findings stands.
 * @param retry Run the pass again.
 * @returns How the pass stands.
 */
function progressOf(
	query: Pick<UseQueryResult, "isFetching" | "isError" | "isSuccess" | "error">,
	read: "pending" | "error" | "success",
	retry: () => void,
): CodeCheckProgress {
	if (query.isFetching) return { status: "checking" };
	if (query.isError) return { status: "failed", error: messageOf(query.error), retry };
	if (query.isSuccess) return { status: "unread", retry };
	if (read === "error")
		return { status: "failed", error: "The Archboard server did not answer.", retry };
	return { status: "checking" };
}

export { useCodeCheck, type CodeCheckProgress };

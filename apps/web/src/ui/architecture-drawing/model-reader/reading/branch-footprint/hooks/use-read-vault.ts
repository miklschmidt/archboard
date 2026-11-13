import { useQuery } from "@tanstack/react-query";
import {
	architectureModelQuery,
	ArchitectureReadError,
} from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";

/**
 * The vault that a footprint reads: the vault at the head, through a branch reading, when the
 * vault's repository resolves the head, else the vault on disk. The server decides the same way.
 * @param vault The explicitly addressed vault.
 * @param head The head, or null for the head of each checkout.
 * @returns Its states, read status, failure, and an explicit retry.
 */
function useReadVault(vault: string, head: string | null) {
	const disk = useQuery(architectureModelQuery(vault));
	const atRef = useQuery({
		...architectureModelQuery(vault, null, { ref: head ?? undefined }),
		enabled: head !== null,
	});
	const selected = head !== null && !missingRef(atRef.error) ? atRef : disk;
	return {
		states: selected.data,
		error: selected.error,
		isFetching: selected.isFetching || atRef.isFetching,
		/**
		 * Retry the head and, when the vault still lacks it, the model on disk.
		 * @returns The reading that supplies the footprint's states and failure.
		 */
		refetch: async () => {
			const next = await (head === null ? disk.refetch() : atRef.refetch());
			return head !== null && missingRef(next.error) ? disk.refetch() : next;
		},
	};
}

/**
 * Whether a read failed because the vault's repository does not hold the ref.
 * @param error The failure of the read.
 * @returns Whether the ref is missing.
 */
function missingRef(error: Error | null): boolean {
	return error instanceof ArchitectureReadError && error.failure.code === "SOURCE_REF_NOT_FOUND";
}

export { useReadVault };

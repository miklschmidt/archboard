import { useQuery } from "@tanstack/react-query";
import {
	architectureModelQuery,
	ArchitectureReadError,
} from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import type { VaultStates } from "#ui/architecture-drawing/model-reader/reading/branch-footprint/rules/against.ts";

/** The vault a footprint reads, as far as the browser knows it before the footprint answers. */
interface ReadVault {
	/** Its states, or undefined while they are read or when they could not be read. */
	readonly states: VaultStates | undefined;
	/** Whether it is the vault at the head, or the vault on disk. */
	readonly atHead: boolean;
}

/**
 * The vault that a footprint reads: the vault at the head, through a branch reading, when the
 * vault's repository resolves the head, else the vault on disk. The server decides the same way.
 * @param vault The explicitly addressed vault.
 * @param head The head, or null for the head of each checkout.
 * @returns Its states, and which vault it is.
 */
function useReadVault(vault: string, head: string | null): ReadVault {
	const disk = useQuery(architectureModelQuery(vault));
	const atRef = useQuery({
		...architectureModelQuery(vault, null, { ref: head ?? undefined }),
		enabled: head !== null,
	});
	if (head !== null && !missingRef(atRef.error)) return { states: atRef.data, atHead: true };
	return { states: disk.data, atHead: false };
}

/**
 * Whether a read failed because the vault's repository does not hold the ref.
 * @param error The failure of the read.
 * @returns Whether the ref is missing.
 */
function missingRef(error: Error | null): boolean {
	return error instanceof ArchitectureReadError && error.failure.code === "SOURCE_REF_NOT_FOUND";
}

export { useReadVault, type ReadVault };

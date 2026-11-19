import { useMemo } from "react";
import {
	useModelCodeFindings,
	type CodeReadingName,
	type ModelCodeReading,
} from "#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts";
import {
	codeByModule,
	missingServers,
	type MissingServers,
	type ModuleCode,
} from "#ui/architecture-drawing/model-reader/reading/rules/module-code.ts";
import { readsVaultOnDisk } from "#ui/architecture-drawing/model-reader/rules/vault-on-disk.ts";

/** What the last code pass says of the modules of the reading on screen, for a table of Measures. */
interface ModuleCodeRead {
	/** The pass that read this version of the reading, or null when none did. */
	readonly reading: ModelCodeReading | null;
	/** What it says of each module it names, or nothing while no pass read the reading. */
	readonly modules: ReadonlyMap<string, ModuleCode> | undefined;
	/** The checkouts of the pass that miss the server of a language. */
	readonly missing: readonly MissingServers[];
	/** How the read of the remembered passes stands, or that the reading is not in the vault. */
	readonly read: "pending" | "error" | "success" | "elsewhere";
}

/**
 * Read what the last code pass said of each module of the reading on screen, from the server's
 * memory. It never starts a pass (ADR 0046).
 * @param vault The vault.
 * @param model The reading on screen, by its name.
 * @param wanted Whether the table has code columns; a table without reads nothing.
 * @returns The pass, what it says of each module, and how the read stands.
 */
function useModuleCode(vault: string, model: CodeReadingName, wanted: boolean): ModuleCodeRead {
	const { reading, read } = useModelCodeFindings(vault, model, wanted);
	const modules = useMemo(() => (reading === null ? undefined : codeByModule(reading)), [reading]);
	const missing = useMemo(() => (reading === null ? [] : missingServers(reading)), [reading]);
	return { reading, modules, missing, read: readsVaultOnDisk(model) ? read : "elsewhere" };
}

export { useModuleCode, type ModuleCodeRead };

import fs from "node:fs";
import path from "node:path";
import { requireVaultRoot } from "@/runtime/engine/board";
import { errorMessage } from "@/shared/thrown-error/index";
import type { VaultCheck, VaultDiagnostic } from "@/shared/semantic-policy/index";
import { readSemanticBoardConfiguration } from "@/runtime/semantic-board-store/lib/configuration";
import {
	semanticBoardAddress,
	type SemanticBoardLocation,
	SEMANTIC_BOARD_FILE_SUFFIX,
} from "@/runtime/semantic-board-store/lib/location";
import { readSemanticBoardAt } from "@/runtime/semantic-board-store/lib/read";

/**
 * Check every board family and report traversal/read failures rather than hiding them.
 * @param root The vault root.
 * @returns Current policy and all diagnostics.
 */
function checkSemanticVault(root = requireVaultRoot()): VaultCheck {
	const configured = readSemanticBoardConfiguration(root);
	const diagnostics = [...configured.diagnostics];
	const addresses = new Map<string, string>();
	for (const file of boardFiles(root, diagnostics)) {
		try {
			const name = path
				.relative(root, file)
				.split(path.sep)
				.join("/")
				.slice(0, -SEMANTIC_BOARD_FILE_SUFFIX.length);
			const location = { ...semanticBoardAddress(name), file };
			recordAddress(location, addresses, diagnostics);
			const read = readSemanticBoardAt(location, configured);
			if (read.ok)
				diagnostics.push(...read.warnings.filter((warning) => warning.code !== "INVALID_CONFIG"));
			else
				diagnostics.push({
					severity: "error",
					code: read.code,
					file,
					board: name,
					message: read.problem,
				});
		} catch (error) {
			diagnostics.push({
				severity: "error",
				code: "BOARD_UNREADABLE",
				file,
				message: errorMessage(error),
			});
		}
	}
	return {
		policy: configured.configuration,
		configurationValid: configured.ok,
		configurationFile: configured.file,
		fingerprint: configured.fingerprint,
		diagnostics,
	};
}
/**
 * Enumerate authored board files without silently dropping invalid names or inaccessible folders.
 * @param directory The directory to inspect.
 * @param diagnostics Collected traversal failures.
 * @returns Every authored board path.
 */
function boardFiles(directory: string, diagnostics: VaultDiagnostic[]): string[] {
	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(directory, { withFileTypes: true });
	} catch (error) {
		diagnostics.push({
			severity: "error",
			code: "VAULT_UNREADABLE",
			file: directory,
			message: `Cannot check this directory: ${errorMessage(error)}`,
		});
		return [];
	}
	const files: string[] = [];
	for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith(".")) continue;
		const file = path.join(directory, entry.name);
		files.push(...filesIn(entry, file, diagnostics));
	}
	return files;
}
export { checkSemanticVault };

/**
 * Inspect an entry without following links outside the vault.
 * @param entry Directory entry.
 * @param file Its full path.
 * @param diagnostics Traversal failures.
 * @returns Board paths inside this entry.
 */
function filesIn(entry: fs.Dirent, file: string, diagnostics: VaultDiagnostic[]): string[] {
	if (entry.isDirectory()) return boardFiles(file, diagnostics);
	if (!entry.name.endsWith(SEMANTIC_BOARD_FILE_SUFFIX)) return [];
	if (entry.isSymbolicLink()) {
		diagnostics.push({
			severity: "error",
			code: "BOARD_UNREADABLE",
			file,
			message: "Board file is a symbolic link. Store the authored board inside the vault.",
		});
		return [];
	}
	return entry.isFile() ? [file] : [];
}

/**
 * Report distinct files that share the case-insensitive board identity.
 * @param location The actual scanned file and its normalized identity.
 * @param addresses The first file seen at every identity.
 * @param diagnostics Collected vault problems.
 */
function recordAddress(
	location: SemanticBoardLocation,
	addresses: Map<string, string>,
	diagnostics: VaultDiagnostic[],
): void {
	const prior = addresses.get(location.key);
	if (prior === undefined) {
		addresses.set(location.key, location.file);
		return;
	}
	diagnostics.push({
		severity: "error",
		code: "DUPLICATE_BOARD",
		file: location.file,
		board: location.key,
		message: `${prior} and ${location.file} both identify board ${JSON.stringify(location.key)}. Rename or remove one file so every board has one unambiguous identity.`,
	});
}

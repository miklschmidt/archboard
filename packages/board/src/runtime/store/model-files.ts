import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { errorMessage } from "@archboard/diagnostics/errno";
import type { ArchitectureModel, ModelDiagnostic } from "#shared/schemas/model.ts";

/**
 * Identify required architecture inputs independently of unrelated vault files.
 * @param file A normalized relative path.
 * @returns Whether this is an authored architecture input.
 */
function isModelInput(file: string): boolean {
	return (
		file === "model.json" ||
		file === "migration.json" ||
		file === ".archboard/config.yaml" ||
		/\.(?:module|semantic|flows|proposal|walkthrough)\.json$/u.test(file)
	);
}

/**
 * Walk recognized authored inputs without following links.
 * @param vault The vault directory.
 * @param found Receives each input path with its directory entry.
 * @param linked Receives each symbolic link.
 */
function walkInputs(
	vault: string,
	found: (file: string, entry: Dirent) => void,
	linked: (file: string) => void,
): void {
	/**
	 * Discover files relative to the vault.
	 * @param directory The normalized relative directory.
	 */
	function visit(directory: string): void {
		const entries = readdirSync(join(vault, directory), { withFileTypes: true }).toSorted(
			(one, other) => one.name.localeCompare(other.name, "en"),
		);
		for (const entry of entries) {
			const file = directory === "" ? entry.name : `${directory}/${entry.name}`;
			if (entry.isSymbolicLink()) linked(file);
			else if (isModelInput(file)) found(file, entry);
			else if (entry.isDirectory()) visit(file);
		}
	}
	visit("");
}

/**
 * Capture recognized authored inputs without following links or changing files.
 * @param vault The addressed vault directory.
 * @returns Exact bytes, the revision and discovery diagnostics.
 */
function readModelFiles(vault: string): {
	inputs: Map<string, Buffer>;
	revision: ArchitectureModel["revision"];
	diagnostics: ModelDiagnostic[];
} {
	const inputs = new Map<string, Buffer>();
	const diagnostics: ModelDiagnostic[] = [];
	try {
		walkInputs(
			vault,
			(file, entry) => {
				if (entry.isFile()) inputs.set(file, readFileSync(join(vault, file)));
				else
					diagnostics.push({
						code: "INVALID_FILE",
						file,
						message: "A model input is not a regular file.",
						recovery: "Replace the input with a regular authored file.",
					});
			},
			(file) =>
				diagnostics.push({
					code: "UNSAFE_PATH",
					file,
					message: "A model input path is a symbolic link.",
					recovery: "Keep authored inputs inside the vault without symbolic links.",
				}),
		);
	} catch (error) {
		diagnostics.push({
			code: "INPUT_UNREADABLE",
			file: ".",
			message: errorMessage(error),
			recovery: "Restore access to the vault and read the model again.",
		});
	}
	return { inputs, diagnostics, revision: modelRevision(inputs) };
}

/**
 * Identify the input set from file metadata alone, so an idle observer reads no bytes.
 * Every write replaces a file or changes its size or time, so a new token only means "read again".
 * @param vault The addressed vault directory.
 * @returns A token that stays equal while no input changed.
 */
function modelFilesToken(vault: string): string {
	const parts: string[] = [];
	try {
		walkInputs(
			vault,
			(file) => {
				const { ino, size, mtimeMs } = lstatSync(join(vault, file));
				parts.push(`${file}:${ino}:${size}:${mtimeMs}`);
			},
			(file) => parts.push(`${file}:link`),
		);
	} catch (error) {
		parts.push(errorMessage(error));
	}
	return parts.join("\n");
}

/**
 * Fingerprint exact recognized paths and bytes.
 * @param inputs The captured authored input files.
 * @returns The complete input revision.
 */
function modelRevision(inputs: Map<string, Buffer>): ArchitectureModel["revision"] {
	const files = [...inputs]
		.toSorted(([one], [other]) => (one < other ? -1 : Number(one > other)))
		.map(([path, bytes]) => ({ path, sha256: createHash("sha256").update(bytes).digest("hex") }));
	return { files, digest: createHash("sha256").update(JSON.stringify(files)).digest("hex") };
}

export { readModelFiles, modelFilesToken, modelRevision };

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, type Dirent } from "node:fs";
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
		file === ".archboard/config.yaml" ||
		/\.(?:module|semantic|flows|proposal|walkthrough)\.json$/u.test(file)
	);
}

/**
 * Capture a recognized input only when it is a regular file.
 * @param vault The vault directory.
 * @param file The normalized input path.
 * @param entry The discovered directory entry.
 * @param inputs The captured bytes.
 * @param diagnostics Discovery failures.
 */
function captureFile(
	vault: string,
	file: string,
	entry: Dirent,
	inputs: Map<string, Buffer>,
	diagnostics: ModelDiagnostic[],
): void {
	if (!entry.isFile()) {
		diagnostics.push({
			code: "INVALID_FILE",
			file,
			message: "A model input is not a regular file.",
			recovery: "Replace the input with a regular authored file.",
		});
		return;
	}
	inputs.set(file, readFileSync(join(vault, file)));
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
			if (file === ".archboard/runtime" && entry.isDirectory()) continue;
			if (entry.isSymbolicLink()) {
				diagnostics.push({
					code: "UNSAFE_PATH",
					file,
					message: "A model input path is a symbolic link.",
					recovery: "Keep authored inputs inside the vault without symbolic links.",
				});
			} else if (isModelInput(file)) captureFile(vault, file, entry, inputs, diagnostics);
			else if (entry.isDirectory()) visit(file);
		}
	}
	try {
		visit("");
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

export { readModelFiles, modelRevision };

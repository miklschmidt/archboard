import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { boardHoldSeen } from "@/runtime/engine/canvas-client";
import { writeFileAtomicExclusive } from "@/runtime/engine/atomic-write";
import type { PendingArtifact } from "@/cli/command-contract/contract";

/**
 * Writes a directory artifact: every declared file, then the manifest, each
 * created exclusively. The directory is checked for anything unexpected first,
 * so a commit never lands beside files another writer left there.
 * @param artifact - The pending artifact, in its files encoding.
 * @throws {Error} When the directory holds a file the artifact does not declare.
 */
function writeFileSetArtifact(artifact: Extract<PendingArtifact, { encoding: "files" }>): void {
	const expected = new Set([...artifact.files.map((file) => file.name), artifact.manifest.name]);
	const unexpected = fs.readdirSync(artifact.path).filter((name) => !expected.has(name));
	if (unexpected.length > 0) {
		throw new Error(`Artifact directory changed before commit: ${unexpected.join(", ")}`);
	}
	for (const file of artifact.files) {
		writeFileAtomicExclusive(path.join(artifact.path, file.name), Buffer.from(file.content));
	}
	writeFileAtomicExclusive(
		path.join(artifact.path, artifact.manifest.name),
		artifact.manifest.content,
	);
}

/** The one place a command touches the process: its streams, files, and terminal. */
export const processCommandHost = {
	/**
	 * Reads all of standard input.
	 * @returns The input as text, empty when standard input is a terminal.
	 * @throws {TypeError} When standard input yields something other than bytes.
	 */
	async readStdin(): Promise<string> {
		if (process.stdin.isTTY) {
			return "";
		}
		const chunks: Uint8Array[] = [];
		for await (const chunk of process.stdin) {
			if (!(chunk instanceof Uint8Array)) {
				throw new TypeError("Standard input produced a chunk that is not bytes.");
			}
			chunks.push(chunk);
		}
		return Buffer.concat(chunks).toString("utf8");
	},
	/**
	 * Reads a text file the command was pointed at.
	 * @param file - The path to read.
	 * @returns The file's contents.
	 */
	readTextFile(file: string): string {
		return fs.readFileSync(file, "utf8");
	},
	/**
	 * Reads a text file that may not exist.
	 * @param file - The path to read.
	 * @returns The contents, or undefined when the file cannot be read.
	 */
	readOptionalTextFile(file: string): string | undefined {
		try {
			return fs.readFileSync(file, "utf8");
		} catch {
			return undefined;
		}
	},
	/**
	 * Resolves a path against the working directory.
	 * @param file - The path as the person wrote it.
	 * @returns The absolute path.
	 */
	resolvePath(file: string): string {
		return path.resolve(file);
	},
	/**
	 * Asks the person a question on stderr so stdout stays the command's result.
	 * @param question - What to ask.
	 * @param fallback - The answer to use when nothing is typed, or when nobody is at a terminal.
	 * @returns The answer.
	 */
	async prompt(question: string, fallback: string): Promise<string> {
		if (!process.stdin.isTTY) {
			return fallback;
		}
		const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
		try {
			const answer = (await rl.question(`${question}\n  [${fallback}]: `)).trim();
			return answer || fallback;
		} finally {
			rl.close();
		}
	},
	/**
	 * Commits a validated artifact to disk, in whichever encoding it declared.
	 * @param artifact - The pending artifact.
	 */
	writeArtifact(artifact: PendingArtifact): void {
		if (artifact.encoding === "files") {
			writeFileSetArtifact(artifact);
			return;
		}
		if (artifact.encoding === "binary") {
			fs.writeFileSync(artifact.path, artifact.content);
			return;
		}
		fs.writeFileSync(artifact.path, artifact.content, "utf8");
	},
	/**
	 * Writes the command's result to stdout.
	 * @param value - The text or bytes to write.
	 */
	writeStdout(value: string | Uint8Array): void {
		process.stdout.write(value);
	},
	/**
	 * Writes a diagnostic to stderr.
	 * @param value - The text to write, newline included.
	 */
	writeStderr(value: string): void {
		process.stderr.write(value);
	},
	/**
	 * Sets the exit code a declared outcome calls for.
	 * @param value - The nonzero exit code.
	 */
	setExitCode(value: number): void {
		process.exitCode = value;
	},
	/**
	 * The hold this process observed while the command ran.
	 * @returns The hold report, or null when no board was held.
	 */
	held(): ReturnType<typeof boardHoldSeen> {
		return boardHoldSeen();
	},
};

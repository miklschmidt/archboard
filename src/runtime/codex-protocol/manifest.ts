import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CODEX_PROTOCOL_VERSION = "0.151.0" as const;
export const CODEX_PROTOCOL_BINARY_VERSION = "codex-cli 0.151.0" as const;
export const CODEX_PROTOCOL_GENERATION_COMMAND =
	"codex app-server generate-ts --experimental --out <temporary-directory>" as const;
export const CODEX_PROTOCOL_GENERATED_FILE_COUNT = 820 as const;
export const CODEX_PROTOCOL_GENERATED_TREE_SHA256 =
	"cdd893570801b36e404a20e7842c71312abc6bc716960ddaa53dde92bfa6f273" as const;

/**
 * The digest is over sorted `.ts` entries. Each entry is
 * `relative-posix-path<TAB>sha256(file-bytes)<LF>`, encoded as UTF-8, and the
 * resulting bytes are hashed once more with SHA-256.
 */
export const CODEX_PROTOCOL_GENERATED_TREE_DIGEST_ALGORITHM =
	"sha256(sorted relative-posix-path<TAB>sha256(file-bytes)<LF> entries)" as const;

export const CODEX_PROTOCOL_MANIFEST = Object.freeze({
	protocol: "codex-app-server",
	version: CODEX_PROTOCOL_VERSION,
	binaryVersion: CODEX_PROTOCOL_BINARY_VERSION,
	generationCommand: CODEX_PROTOCOL_GENERATION_COMMAND,
	generatedFileCount: CODEX_PROTOCOL_GENERATED_FILE_COUNT,
	generatedTreeSha256: CODEX_PROTOCOL_GENERATED_TREE_SHA256,
	digestAlgorithm: CODEX_PROTOCOL_GENERATED_TREE_DIGEST_ALGORITHM,
});

export interface GeneratedTreeDigest {
	readonly fileCount: number;
	readonly sha256: string;
}

function generatedTypeScriptFiles(root: string, prefix = ""): string[] {
	return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
		const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) return generatedTypeScriptFiles(root, relativePath);
		return entry.isFile() && entry.name.endsWith(".ts") ? [relativePath] : [];
	});
}

/**
 * Recomputes the checked-in manifest value from a freshly generated tree.
 * This helper is intentionally outside the decoder so runtime consumers never
 * need filesystem access just to validate a protocol message.
 */
export function digestGeneratedTree(root: string): GeneratedTreeDigest {
	const files = generatedTypeScriptFiles(root).toSorted();
	const entries = files
		.map((relativePath) => {
			const fileSha256 = createHash("sha256")
				.update(readFileSync(join(root, relativePath)))
				.digest("hex");
			return `${relativePath}\t${fileSha256}\n`;
		})
		.join("");
	return {
		fileCount: files.length,
		sha256: createHash("sha256").update(entries, "utf8").digest("hex"),
	};
}

export function isSupportedCodexUserAgent(userAgent: string): boolean {
	return new RegExp(`(^|[^0-9.])${CODEX_PROTOCOL_VERSION.replaceAll(".", "\\.")}($|[^0-9.])`).test(
		userAgent,
	);
}

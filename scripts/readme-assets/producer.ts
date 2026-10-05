// What makes one README asset: the files it writes, what it needs, the steps it takes, and the
// code that takes them. The manifest says the same kind, files and Codex need, and the kit
// refuses to run when the two disagree.

import { join } from "node:path";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import type { ReadmeAsset } from "./manifest.ts";
// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
import { ROOT } from "./tools.ts";

/** A tool an asset is made with. */
type Need = "chromium" | "ffmpeg" | "pyftsubset" | "codex";

/** What a producer is given while it makes its asset. */
interface MakeContext {
	/**
	 * Say what is happening, on a line of its own.
	 * @param line The sentence.
	 */
	readonly say: (line: string) => void;
}

/** One asset's maker. */
interface Producer {
	readonly kind: ReadmeAsset["kind"];
	/** Whether it needs the Archboard Codex sign-in, and so spends the account's usage. */
	readonly codex: boolean;
	/** The files it writes, from the repository root. */
	readonly files: readonly string[];
	readonly needs: readonly Need[];
	/** What it does, one sentence a step; the dry run prints these and does nothing else. */
	readonly plan: readonly string[];
	/**
	 * Make the asset's files.
	 * @param context What it is given.
	 */
	readonly make: (context: MakeContext) => Promise<void>;
}

/**
 * A README file's path from the repository root.
 * @param name The file's name in docs/readme.
 * @returns The path.
 */
function readmeFile(name: string): string {
	return `docs/readme/${name}`;
}

/**
 * Where a file of the repository is on disk.
 * @param path The file, from the repository root.
 * @returns Its absolute path.
 */
function inRepository(path: string): string {
	return join(ROOT, path);
}

/**
 * Why a manifest entry and its producer disagree; empty when they agree.
 * @param asset The manifest entry.
 * @param producer The producer, or undefined when the kit has none.
 * @returns The disagreements.
 */
function disagreements(asset: ReadmeAsset, producer: Producer | undefined): readonly string[] {
	if (producer === undefined) return [`${asset.name}: the kit has no producer for it.`];
	const said: string[] = [];
	if (asset.kind !== producer.kind) said.push(`kind ${asset.kind}, the kit makes ${producer.kind}`);
	if (asset.codex !== producer.codex)
		said.push(`codex ${asset.codex}, the kit says ${producer.codex}`);
	if (asset.files.join("\n") !== producer.files.join("\n")) {
		said.push(`files ${asset.files.join(", ")}, the kit writes ${producer.files.join(", ")}`);
	}
	return said.length === 0 ? [] : [`${asset.name}: the manifest says ${said.join("; ")}.`];
}

export { disagreements, inRepository, readmeFile, type MakeContext, type Need, type Producer };

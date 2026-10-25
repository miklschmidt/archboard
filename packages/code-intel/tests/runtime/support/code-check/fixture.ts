// What the code check's owners build for themselves: files, a Git checkout
// with its own identity and configuration, and boards in a vault.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import type { LanguageServersSchema } from "@archboard/workspace/checkouts";
import { SEMANTIC_BOARD_SCHEMA_VERSION } from "@archboard/board/document";

/**
 * Run Git in a checkout with an owner's identity and no configuration of the machine.
 * @param scratch The owner's scratch directory, which holds its Git configuration.
 * @param cwd The checkout.
 * @param args Git's arguments.
 */
function git(scratch: string, cwd: string, ...args: string[]): void {
	const run = Bun.spawnSync(["git", ...args], {
		cwd,
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: join(scratch, "gitconfig"),
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_AUTHOR_NAME: "Owner",
			GIT_AUTHOR_EMAIL: "owner@example.com",
			GIT_COMMITTER_NAME: "Owner",
			GIT_COMMITTER_EMAIL: "owner@example.com",
		},
	});
	if (run.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr.toString()}`);
}

/**
 * Write files under a directory.
 * @param root The directory.
 * @param files Each path and its text.
 */
function write(root: string, files: Record<string, string>): void {
	for (const [file, text] of Object.entries(files)) {
		mkdirSync(join(root, file, ".."), { recursive: true });
		writeFileSync(join(root, file), text);
	}
}

/** One variant of a fixture board: its name, lifecycle and content. */
interface FixtureVariant {
	readonly id: string;
	readonly name: string;
	readonly lifecycle: "current" | "draft" | "historical" | "shelved";
	/** The variant it was branched from, if any. */
	readonly parent?: string;
	/** The repository documents it draws (ADR 0054). */
	readonly documents?: readonly Readonly<Record<string, string>>[];
	readonly content: Record<string, unknown>;
}

/**
 * Write a board into a vault.
 * @param vault The vault.
 * @param name The board's name.
 * @param variants Its variants; the current one, if any, is the one so marked.
 */
function board(vault: string, name: string, variants: readonly FixtureVariant[]): void {
	const current = variants.find((variant) => variant.lifecycle === "current");
	write(vault, {
		[`${name}.semantic.json`]: JSON.stringify({
			schemaVersion: SEMANTIC_BOARD_SCHEMA_VERSION,
			kind: "semantic-board",
			id: name.slice(0, 8).replaceAll(" ", ""),
			name,
			level: "system",
			version: 1,
			createdAt: "2026-10-06T00:00:00.000Z",
			updatedAt: "2026-10-06T00:00:00.000Z",
			...(current === undefined ? {} : { current: current.id }),
			variants,
		}),
	});
}

/**
 * Register checkouts in an owner's own registry.
 * @param scratch The scratch directory that holds `repos.json`.
 * @param checkouts Each repository and its checkout.
 * @param servers The language servers configured for every checkout.
 */
function register(
	scratch: string,
	checkouts: Readonly<Record<string, string>>,
	servers: z.infer<typeof LanguageServersSchema> = {},
): void {
	write(scratch, {
		"repos.json": JSON.stringify(
			Object.entries(checkouts).map(([repo, root]) => ({
				repo,
				root,
				source: "declared",
				addedAt: "2026-10-06T00:00:00.000Z",
				servers,
			})),
		),
	});
}

export { type FixtureVariant, board, git, register, write };

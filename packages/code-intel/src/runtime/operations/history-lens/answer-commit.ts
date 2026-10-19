// A walked commit as every answer of the history lens carries it: behind,
// hotspots and a footprint. Hotspots leave large commits out, so their commits
// say nothing about size; behind and a footprint keep large commits and mark
// them (ADR 0045).

import { isLargeCommit, type WalkedCommit } from "#runtime/operations/history-lens/commits.ts";
import type { BehindCommit } from "#shared/protocol/code-check.ts";

/**
 * A time in seconds as the answers write it.
 * @param seconds Seconds since the epoch.
 * @returns The ISO time.
 */
function isoTime(seconds: number): string {
	return new Date(seconds * 1000).toISOString();
}

/**
 * One commit as an answer carries it: its subject, and how many files it changed.
 * @param repo Its repository.
 * @param commit The walked commit.
 * @returns The answer's commit.
 */
function answerCommit(repo: string, commit: WalkedCommit): Omit<BehindCommit, "large"> {
	return {
		repo,
		commit: commit.commit,
		committedAt: isoTime(commit.committedAt),
		subject: commit.subject,
		files: commit.changes.length,
	};
}

/**
 * One commit as an answer that keeps large commits carries it: also whether
 * it is large.
 * @param repo Its repository.
 * @param commit The walked commit.
 * @returns The answer's commit.
 */
function markedCommit(repo: string, commit: WalkedCommit): BehindCommit {
	return { ...answerCommit(repo, commit), large: isLargeCommit(commit) };
}

export { answerCommit, isoTime, markedCommit };

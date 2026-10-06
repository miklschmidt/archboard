// A walked commit as an answer of the history lens carries it.

import { isLargeCommit, type WalkedCommit } from "@/runtime/history-lens/lib/commits";
import type { BehindCommit } from "@/shared/code-check/index";

/**
 * A time in seconds as the answers write it.
 * @param seconds Seconds since the epoch.
 * @returns The ISO time.
 */
function isoTime(seconds: number): string {
	return new Date(seconds * 1000).toISOString();
}

/**
 * One commit as an answer carries it: its subject, how many files it changed
 * and whether that makes it large.
 * @param repo Its repository.
 * @param commit The walked commit.
 * @returns The answer's commit.
 */
function answerCommit(repo: string, commit: WalkedCommit): BehindCommit {
	return {
		repo,
		commit: commit.commit,
		committedAt: isoTime(commit.committedAt),
		subject: commit.subject,
		files: commit.changes.length,
		large: isLargeCommit(commit),
	};
}

export { answerCommit, isoTime };

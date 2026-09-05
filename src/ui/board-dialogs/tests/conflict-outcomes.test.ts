import { describe, expect, test } from "bun:test";

import {
	describeConflictOutcomes,
	describeConflictReason,
	describeElsewhereOutcomes,
	describeVersionMove,
	formatVersion,
	isBusyOutcome,
} from "@/ui/board-dialogs";
import type { BoardWriteConflict, NoteWrittenElsewhere } from "@/ui/types";

const CONFLICT: BoardWriteConflict = {
	board: "payments",
	file: "/vault/payments.md",
	reason: "changed",
	lastReadAt: "2026-09-05T10:00:00.000Z",
	fileModifiedAt: "2026-09-05T10:05:00.000Z",
	outcomes: {
		reload: "browser show payments --pane <spec> --reload",
		overwrite: "board save --board payments --force",
		saveAs: "board save --as payments@from-canvas",
	},
	message: "Refusing to save",
};

const ELSEWHERE: NoteWrittenElsewhere = {
	board: "payments",
	file: "/vault/payments.md",
	reason: "changed",
	writtenAt: "2026-09-05T10:05:00.000Z",
	versionMove: "ahead",
	version: 12,
	ourVersion: 10,
	message: "written elsewhere",
};

describe("conflict outcomes", () => {
	test("offers exactly the conflict's three outcomes with its own commands", () => {
		const choices = describeConflictOutcomes(CONFLICT);
		expect(choices.map((choice) => choice.outcome)).toEqual(["reload", "overwrite", "elsewhere"]);
		expect(choices.map((choice) => choice.label)).toEqual([
			"Reload from note",
			"Overwrite",
			"Save elsewhere",
		]);
		expect(choices.map((choice) => choice.command)).toEqual([
			CONFLICT.outcomes.reload,
			CONFLICT.outcomes.overwrite,
			CONFLICT.outcomes.saveAs,
		]);
		expect(choices.map((choice) => choice.destructive)).toEqual([true, true, false]);
	});

	test("explains both refusal reasons", () => {
		expect(describeConflictReason("changed")).toContain("changed on disk");
		expect(describeConflictReason("unseen")).toContain("never read");
	});

	test("a note written elsewhere offers reload, keep mine and save elsewhere", () => {
		expect(describeElsewhereOutcomes().map((choice) => choice.outcome)).toEqual([
			"reload",
			"keep",
			"elsewhere",
		]);
	});

	test("every version move has its own wording and versions format in mono-ready text", () => {
		const moves: NoteWrittenElsewhere["versionMove"][] = [
			"ahead",
			"behind",
			"unchanged",
			"unknown",
		];
		const words = new Set(
			moves.map((versionMove) => describeVersionMove({ ...ELSEWHERE, versionMove })),
		);
		expect(words.size).toBe(4);
		expect(formatVersion(12)).toBe("12");
		expect(formatVersion(null)).toBe("—");
	});

	test("only the outcome in flight is busy", () => {
		expect(isBusyOutcome("reload", "reload")).toBe(true);
		expect(isBusyOutcome("reload", "overwrite")).toBe(false);
		expect(isBusyOutcome(null, "overwrite")).toBe(false);
	});
});

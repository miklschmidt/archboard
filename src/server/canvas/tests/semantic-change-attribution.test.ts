// What a settled change says about itself, from the announcement to the feed.
//
// The announcement and the reading are written in different files and read by
// different people: a write route says what it did, and this feed turns that
// into the stream a thread's context reads. They agreed on nothing but the
// spelling of their fields, and when one of them drifted the other stayed right
// on its own — so the join is what is proved here.
//
// What it carries is deliberately thin. A change says which board moved, what
// version it moved to, and the identity the board was held under, which is
// custody. It does NOT say which pane a write was made for. It used to, and
// that value was read back to decide who should not be told — which made a
// surface a person opens and closes into the thing that chose recipients.

import { afterEach, expect, test } from "bun:test";
import {
	broadcast,
	semanticChangeFeed,
	settledChangeFields,
	type SettledBoardChange,
} from "@/server/canvas/index";

afterEach(() => {
	semanticChangeFeed.dispose();
});

/**
 * What the feed says when one write announces itself.
 * @param announcement What the write states about itself.
 * @returns The changes the feed issued.
 */
function announced(
	announcement: Parameters<typeof settledChangeFields>[0],
): readonly SettledBoardChange[] {
	const changes: SettledBoardChange[] = [];
	const stop = semanticChangeFeed.onChange((change) => {
		changes.push(change);
	});
	try {
		broadcast(
			{ type: "board_note", board: "payments", ...settledChangeFields(announcement) },
			"payments",
		);
	} finally {
		stop();
	}
	return changes;
}

test("a settled write reaches the feed as the board, the version and its custody", () => {
	const changes = announced({ version: 4, by: null, heldAs: "claim-7c40IV7N" });
	expect(changes).toHaveLength(1);
	expect(changes[0]?.board).toBe("payments");
	expect(changes[0]?.text).toContain("version 4");
	// Custody is on the wire and is not authorship: a claim is one identity
	// shared by every write of a campaign, so a reader that took it for the
	// author would call a whole campaign one writer.
	expect(settledChangeFields({ version: 4, by: null, heldAs: "claim-7c40IV7N" }).heldAs).toBe(
		"claim-7c40IV7N",
	);
});

test("a change carries the session that wrote it, or nothing at all", () => {
	// A session, not a surface: what it is for is one session skipping the news
	// it wrote itself. The pane a write said it was for used to ride here, and
	// it was read back to decide who should NOT be told — so what a person had
	// open decided who heard about an architecture.
	const mine = announced({ version: 2, by: "session-mine", heldAs: "claim-7c40IV7N" });
	expect(mine[0]?.by).toBe("session-mine");

	// And a write nobody attributed — a person's terminal, anything outside this
	// canvas — says so rather than borrowing the identity the board was held
	// under. Unattributable is delivered to everybody.
	const outside = announced({ version: 3, by: null, heldAs: "agent-1QZZ4mkP" });
	expect(outside[0]?.by).toBeNull();
	expect(outside[0]?.board).toBe("payments");
});

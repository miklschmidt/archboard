// Who a settled change says wrote it, from the announcement to the feed.
//
// The announcement and the reading are written in different files and read by
// different people: a write route says what it did, and this feed turns that
// into the stream a thread's context reads. They agreed on nothing but the
// spelling of a field, and when the spelling drifted every change arrived
// unattributable — so a thread was told about its own writes, which is the
// noise the attribution exists to stop, and no owner noticed because each half
// was right on its own.
//
// They share a shape now. What is proved here is the join: what the announcer
// builds is what the feed reads, including the difference between authorship
// and custody, which are two fields because they answer two questions.

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

test("the pane a write was for reaches the feed, and custody does not stand in for it", () => {
	const changes = announced({ version: 4, by: "pane-a", heldAs: "claim-7c40IV7N" });
	expect(changes).toHaveLength(1);
	// Authorship. `heldAs` is beside it on the wire and is not this: a claim is
	// one identity shared by every write of a campaign and names no pane, so a
	// reader that took it for the author would call two panes one.
	expect(changes[0]?.by).toBe("pane-a");
	expect(changes[0]?.board).toBe("payments");
	expect(changes[0]?.text).toContain("version 4");
});

test("a write that names no pane is unattributable, which is delivered to everybody", () => {
	const changes = announced({ version: 2, by: null, heldAs: "claim-7c40IV7N" });
	expect(changes).toHaveLength(1);
	// Null rather than a borrowed identity: an agent with no pane has none to
	// state, and saying nothing is what makes its change reach everyone — its own
	// author included, which is redundancy rather than silence.
	expect(changes[0]?.by).toBeNull();
});

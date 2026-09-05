import { z } from "zod";

const boardRequiredRefusal = {
	code: "BOARD_REQUIRED",
	exit: 2,
	stream: "stderr" as const,
	description: "A board-sensitive request did not name a board.",
};
const serverRefusal = {
	code: "CANVAS_UNREACHABLE",
	exit: 3,
	stream: "stderr" as const,
	description: "The canvas server could not be reached or started.",
};
const browserRefusal = {
	code: "BROWSER_REQUIRED",
	exit: 4,
	stream: "stderr" as const,
	description: "The operation needs an open browser pane.",
};
const doingRefusal = {
	code: "DOING_REQUIRED",
	exit: 1,
	stream: "stderr" as const,
	description: "A board write did not declare what it was doing.",
};
const boardHeldRefusal = {
	code: "BOARD_HELD",
	exit: 5,
	stream: "stderr" as const,
	description: "Another writer currently holds the board lease.",
};
const boardConflictRefusal = {
	code: "BOARD_CONFLICT",
	exit: 5,
	stream: "stderr" as const,
	description: "The note changed on disk outside Archboard.",
};
const boardVersionRefusal = {
	code: "BOARD_VERSION_CONFLICT",
	exit: 5,
	stream: "stderr" as const,
	description: "The board advanced past expect-version.",
};
const claimRevokedRefusal = {
	code: "CLAIM_REVOKED",
	exit: 5,
	stream: "stderr" as const,
	description: "The person took back the claim.",
};

const commonRefusals = [boardRequiredRefusal, serverRefusal] as const;
const boardWriteRefusals = [
	boardRequiredRefusal,
	serverRefusal,
	doingRefusal,
	boardHeldRefusal,
	boardConflictRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
] as const;
const claimRefusals = [
	boardRequiredRefusal,
	serverRefusal,
	boardHeldRefusal,
	claimRevokedRefusal,
] as const;
const serverBrowserRefusals = [serverRefusal, browserRefusal] as const;
const tail = z.array(z.string()).default([]);

const WRITE_ANSWER = [
	"  ANSWERS WITH WHAT THE BOARD BECAME: `elements` is every element the write touched in",
	"  its resulting form, including what the server made and you never named — the ids it",
	"  minted, the text element it expanded from a `label`, the arrows it re-routed behind a",
	"  move. `fingerprint` is the board in one line: how many elements, the sha-256 of its",
	"  note, and which edit of that note this write produced. Keep the last one and you can",
	"  tell in a single comparison whether anything you did not do has changed, instead of",
	"  re-reading the board — and pass `fingerprint.version` as --expect-version on your",
	"  next write to have it refused if somebody got there first.",
	"",
	"  --document adds the whole board. OFF BY DEFAULT AND USUALLY WRONG: 300 elements is",
	"  about 60,000 tokens, so a loop that asks for it pulls the board through a context once",
	"  per box. Use `describe` for a summary or `query` for a part.",
].join("\n");

export {
	boardRequiredRefusal,
	serverRefusal,
	browserRefusal,
	doingRefusal,
	boardHeldRefusal,
	boardConflictRefusal,
	boardVersionRefusal,
	claimRevokedRefusal,
	commonRefusals,
	boardWriteRefusals,
	claimRefusals,
	serverBrowserRefusals,
	tail,
	WRITE_ANSWER,
};

import { z } from "zod";

export const commonRefusals = [
	{
		code: "BOARD_REQUIRED",
		exit: 2,
		stream: "stderr" as const,
		description: "A board-sensitive request did not name a board.",
	},
	{
		code: "CANVAS_UNREACHABLE",
		exit: 3,
		stream: "stderr" as const,
		description: "The canvas server could not be reached or started.",
	},
];
export const serverRefusal = commonRefusals[1]!;
export const tail = z.array(z.string()).default([]);

export const WRITE_ANSWER = [
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

// The text a person reads for an answer (TASK-602): a refusal says so first, records with short
// fields form a table, and the colour marks what each value is.

import { expect, test } from "bun:test";
import type { Paint } from "#cli/contract/protocol/contract.ts";
import { answerText } from "#cli/contract/rules/answer-text.ts";

/** Leaves the text as it is. */
const bare: Paint = (_format, text) => text;

/** Marks each painted part with its format, so that a test reads what is coloured how. */
const marked: Paint = (format, text) => `<${[format].flat().join("+")}>${text}</>`;

test("a refusal says so first, with its code and message, then names its other fields in words", () => {
	const refusal = {
		success: false,
		code: "CLAIM_REQUIRED",
		error: "Claim the subjects first.",
		heldBy: "agent",
	};
	expect(answerText(refusal, bare)).toBe(
		["Refused  CLAIM_REQUIRED  Claim the subjects first.", "Held by  agent"].join("\n"),
	);
});

test("records with short fields form a table, and records too wide for one are blocks", () => {
	const repos = [
		{ repo: "shop", chosen: true },
		{ repo: "web", chosen: false },
	];
	expect(answerText({ success: true, repos }, bare)).toBe(
		["Repos", "  Repo  Chosen", "  shop  yes", "  web   no"].join("\n"),
	);
	const long = "x".repeat(120);
	expect(answerText({ success: true, notes: [{ code: "A_B", message: long }] }, bare)).toBe(
		["Notes", "  • Code     A_B", `    Message  ${long}`].join("\n"),
	);
});

test("keyed records keep vocabulary identities for single records and blocks", () => {
	const groups = { "api-team": { name: "API team", color: "sky" } };
	const single = answerText({ policy: { groups } }, bare);
	expect(single).toContain("api-team");
	const longName = "API team ".repeat(20).trim();
	const multiLineName = "Event bus\nOperations team";
	const blocks = answerText(
		{
			policy: {
				groups: {
					"api-team": { name: longName, color: "sky" },
					eventBus: { name: multiLineName, color: "blue" },
				},
			},
		},
		bare,
	);
	expect(blocks).toContain("api-team");
	expect(blocks).toContain("eventBus");
	expect(blocks).toContain(longName);
	expect(blocks).toContain("Event bus\n");
	expect(blocks).toContain("Operations team");
});

test("colour marks places, codes, numbers and yes or no, and an empty answer is done", () => {
	const answer = {
		success: true,
		root: "/work/shop",
		code: "STATE_NOT_FOUND",
		count: 3,
		ms: 31.453_054,
		held: false,
		note: null,
	};
	expect(answerText(answer, marked)).toBe(
		[
			"<bold>Root </>  <cyan>/work/shop</>",
			"<bold>Code </>  <magenta>STATE_NOT_FOUND</>",
			"<bold>Count</>  <yellow>3</>",
			"<bold>Ms   </>  <yellow>31.4531</>",
			"<bold>Held </>  <dim>no</>",
			"<bold>Note </>  <dim>none</>",
		].join("\n"),
	);
	expect(answerText({ success: true }, marked)).toBe("<green>Done.</>");
});

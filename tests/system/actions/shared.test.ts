// Workflow inputs must reach the CLI without losing literal characters in quoted arguments.

import { expect, test } from "bun:test";
import { splitArguments } from "../../../actions/shared/arguments.ts";

test("quoted arguments preserve literal backslashes while honoring their quote's escapes", () => {
	expect(splitArguments(String.raw`--state 'one\two' --plan "a\b\"c\\d" escaped\ word`)).toEqual([
		"--state",
		String.raw`one\two`,
		"--plan",
		String.raw`a\b"c\d`,
		"escaped word",
	]);
});

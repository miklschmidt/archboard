// Workflow inputs must reach the CLI without losing literal characters in quoted arguments.

import { expect, test } from "bun:test";
import { splitArguments } from "../../../actions/shared/arguments.ts";
import { checkoutRoots } from "../../../actions/shared/checkouts.ts";

test("quoted arguments preserve literal backslashes while honoring their quote's escapes", () => {
	expect(splitArguments(String.raw`--state 'one\two' --plan "a\b\"c\\d" escaped\ word`)).toEqual([
		"--state",
		String.raw`one\two`,
		"--plan",
		String.raw`a\b"c\d`,
		"escaped word",
	]);
});

test("evidence uses the checked repository's own root and the chosen root of other repositories", () => {
	const list = {
		repos: [
			{ repo: "app", root: "/previous-app", chosen: true },
			{ repo: "app", root: "/checked-app", chosen: false },
			{ repo: "infra", root: "/previous-infra", chosen: false },
			{ repo: "infra", root: "/chosen-infra", chosen: true },
		],
	};
	expect([...checkoutRoots(list, "/checked-app")]).toEqual([
		["app", "/checked-app"],
		["infra", "/chosen-infra"],
	]);
});

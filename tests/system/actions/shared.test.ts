// Workflow inputs must reach the CLI without losing literal characters in quoted arguments.

import { expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitArguments } from "../../../actions/shared/arguments.ts";
import { checkoutRoots } from "../../../actions/shared/checkouts.ts";
import { scratch } from "./support.ts";

test("without a version, an Action installs the CLI of the release it comes from", () => {
	const folder = scratch();
	const npm = join(folder, "npm");
	writeFileSync(npm, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${folder}/npm.log"\n`);
	chmodSync(npm, 0o755);
	const install = (version: string) =>
		Bun.spawnSync(["bash", join(import.meta.dir, "../../../actions/shared/install-cli.sh")], {
			env: { PATH: `${folder}:${process.env["PATH"] ?? ""}`, ARCHBOARD_VERSION: version },
		}).exitCode;
	expect([install(""), install("0.2.0")]).toEqual([0, 0]);
	const root = JSON.parse(readFileSync(join(import.meta.dir, "../../../package.json"), "utf8"));
	expect(readFileSync(join(folder, "npm.log"), "utf8")).toBe(
		`install --global archboard@${String(root.version)}\ninstall --global archboard@0.2.0\n`,
	);
});

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

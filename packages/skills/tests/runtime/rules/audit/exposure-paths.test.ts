// Which paths count as the harness's source: the old module directory a batch recorded before
// the move names, with or without a trailing slash, and not the package's shipping code.

import { describe, expect, test } from "bun:test";
import { classifyCommands } from "#runtime/protocol/events.ts";

const CHECKOUT = "/checkout";
const BATCH = `${CHECKOUT}/.skill-evals/2026-09-14T13-50-10-617Z`;
const WORLD = `${BATCH}/runs/candidate/S11/3/world`;

/**
 * The exposure of one recorded command.
 * @param command The command as Codex recorded it.
 * @returns The kind of exposure it classified as, or null.
 */
function exposureOf(command: string): string | null {
	const [one] = classifyCommands([{ command, exitCode: 0, status: "completed", output: "" }], {
		skillRoot: `${WORLD}/home/.agents/skills/archboard`,
		checkoutRoot: `${WORLD}/flask`,
		archboardRoot: CHECKOUT,
		vault: `${WORLD}/flask/.archboard/vault`,
		exposure: {
			evaluationInputs: `${CHECKOUT}/evals`,
			harnessSource: `${CHECKOUT}/packages/skills`,
			skillPackages: [`${CHECKOUT}/skills/archboard`],
			batchRoot: BATCH,
			world: WORLD,
			exists: (): boolean => true,
		},
	});
	if (one === undefined) throw new Error("nothing classified");
	return one.exposure;
}

describe("harness source exposure by path", () => {
	test("the old directory counts without a trailing slash", () => {
		expect(
			exposureOf("bash -lc 'cd /checkout/src/runtime/skill-evaluation && cat lib/grader.ts'"),
		).toBe("harness-source");
	});

	test("the shipping code of the package is no exposure", () => {
		for (const file of ["operations/distribution/prepare.ts", "projections/schemas.ts"]) {
			expect(
				exposureOf(`bash -lc 'cat /checkout/packages/skills/src/runtime/${file}'`),
				file,
			).toBeNull();
		}
	});
});

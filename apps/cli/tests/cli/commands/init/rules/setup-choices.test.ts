import { expect, test } from "bun:test";
import { runnersOn } from "#cli/commands/init/rules/setup-choices.ts";

// Which package runner starts the skills CLI. A caller without a terminal gets the first one,
// so the order is the product's preference: bun, then pnpm, then npx.

/**
 * The ids of the runners that a PATH with these programs offers.
 * @param programs The programs on the PATH.
 * @returns The runner ids, in the order that init offers them.
 */
function offered(...programs: string[]): string[] {
	return runnersOn((program) => (programs.includes(program) ? `/bin/${program}` : null)).map(
		({ runner }) => runner.id,
	);
}

test("the runners on the PATH come in the order of preference: bun, pnpm, npx", () => {
	expect(offered("npx", "pnpm", "bun")).toEqual(["bun", "pnpm", "npx"]);
	expect(offered("npx", "pnpm")).toEqual(["pnpm", "npx"]);
	expect(offered()).toEqual([]);
});

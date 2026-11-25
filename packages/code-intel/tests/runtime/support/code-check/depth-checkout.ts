// A checkout `shop` that holds a canonical vault whose modules are each bound
// to a directory, for the tests of what module depth reads from each language.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";
import type { CodeCheckAnswer, ModuleDepth } from "#shared/protocol/code-check.ts";
import { git, register, write } from "#tests/runtime/support/code-check/fixture.ts";

const SHOP = "github.com/test/shop";

/** A checkout ready to check, and how to remove it. */
interface DepthCheckout {
	/** Run the code check over the vault. */
	readonly check: () => Promise<CodeCheckAnswer>;
	readonly remove: () => void;
}

/**
 * Write the checkout, commit it, and register it.
 * @param files The code, by path.
 * @param modules Each module's name and the directory it is bound to.
 * @returns The checkout.
 */
async function depthCheckout(
	files: Record<string, string>,
	modules: Record<string, string>,
): Promise<DepthCheckout> {
	const caller = process.env["ARCHBOARD_REPOS"];
	const scratch = realpathSync(mkdtempSync(join(tmpdir(), "archboard-depth-")));
	const shop = join(scratch, "shop");
	const vault = join(shop, ".archboard", "vault");
	process.env["ARCHBOARD_REPOS"] = join(scratch, "repos.json");
	mkdirSync(shop, { recursive: true });
	writeFileSync(join(scratch, "gitconfig"), "");
	git(scratch, shop, "init", "-q", "-b", "main");
	git(scratch, shop, "remote", "add", "origin", `https://${SHOP}.git`);
	write(shop, files);
	write(vault, {
		"model.json": JSON.stringify({
			schemaVersion: 1,
			id: "Shop",
			name: "Shop",
			current: { id: "Built", name: "Built" },
		}),
		".archboard/config.yaml": Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY),
	});
	for (const [index, [name, path]] of Object.entries(modules).entries()) {
		write(vault, {
			[`${name}.module.json`]: JSON.stringify({
				schemaVersion: 1,
				id: `Shop#${name}`,
				name,
				kind: "module",
				order: (index + 1) * 10,
				binding: { repo: SHOP, path },
				outgoing: [],
			}),
		});
	}
	git(scratch, shop, "add", "-A");
	git(scratch, shop, "commit", "-q", "--no-gpg-sign", "-m", "the code");
	register(scratch, { [SHOP]: shop });
	const codeCheck = (await import("#runtime/api/code-check-run.ts")).createCodeCheck();
	return {
		check: async () => {
			const answer = await codeCheck.run({
				vault,
				variant: undefined,
				everyDraft: false,
				plans: [],
				signal: new AbortController().signal,
			});
			if (!("states" in answer)) throw new Error(answer.error);
			return answer;
		},
		remove: () => {
			if (caller === undefined) delete process.env["ARCHBOARD_REPOS"];
			else process.env["ARCHBOARD_REPOS"] = caller;
			rmSync(scratch, { recursive: true, force: true });
		},
	};
}

/**
 * Each module's depth, by its name.
 * @param answer The answer.
 * @returns The depth records.
 */
function depthByModule(answer: CodeCheckAnswer): Map<string, ModuleDepth> {
	return new Map(answer.depth?.map((each) => [each.subject.name ?? "", each]));
}

/**
 * The module-depth findings on one module's exports, as the export each
 * names, its code and its severity, then its roll-up.
 * @param answer The answer.
 * @param name The module.
 * @returns Each finding.
 */
function depthFindings(answer: CodeCheckAnswer, name: string): string[] {
	const codes = new Set([
		"EXPOSED_VALUE",
		"EXPOSED_VALUE_COMPUTED",
		"CODE_PASS_THROUGH",
		"REEXPORT_PASS_THROUGH",
		"EXPOSED_UNUSED",
		"MODULE_SHALLOW",
	]);
	return answer.findings
		.filter((each) => each.subject?.name === name && codes.has(each.code))
		.map((each) => `${each.export ?? "(module)"} ${each.code} ${each.severity}`);
}

export { depthByModule, depthCheckout, depthFindings };

// A run's vault is the .archboard/vault of the Flask checkout the author works
// in, so a board file sits under the checkout and the author can name it by a
// path relative to the checkout. A direct write to one is still counted, a
// read is not, and a read of a board is not a read of Flask's code.

import { expect, test } from "bun:test";
import { countDirectBoardWrites } from "@/runtime/skill-evaluation/audit";
import { classifyCommands, type ClassifiedCommand } from "@/runtime/skill-evaluation/index";

const FLASK = "/batch/runs/candidate/S11/3/world/flask";
const VAULT = `${FLASK}/.archboard/vault`;
const CONTEXT = {
	skillRoot: "/batch/home/.agents/skills/archboard",
	checkoutRoot: FLASK,
	vault: VAULT,
};

/**
 * One recorded command, classified.
 * @param command The command as Codex recorded it.
 * @returns The classified command.
 */
function classified(command: string): ClassifiedCommand {
	const [one] = classifyCommands(
		[{ command, exitCode: 0, status: "completed", output: "" }],
		CONTEXT,
	);
	if (one === undefined) throw new Error("nothing classified");
	return one;
}

/**
 * How many direct board writes a command makes.
 * @param command The command as recorded.
 * @returns The count.
 */
function directWrites(command: string): number {
	return countDirectBoardWrites({ commands: [classified(command)], fileChanges: [], vault: VAULT });
}

test.each([
	[`bash -lc "cat payload.json > .archboard/vault/Flask\\ JSON.semantic.json"`, 1],
	[`bash -lc "sed -i 's/a/b/' .archboard/vault/Flask\\ JSON.semantic.json"`, 1],
	[`bash -lc "rm '.archboard/vault/Flask JSON.semantic.json'"`, 1],
	[`bash -lc "cd .archboard/vault && sed -i 's/a/b/' 'Flask JSON.semantic.json'"`, 1],
	[`bash -lc "cd ${VAULT} && rm 'Flask JSON.semantic.json'"`, 1],
	[`bash -lc "rm ${VAULT}/Flask\\ JSON.semantic.json"`, 1],
	[`bash -lc "jq empty .archboard/vault/Flask\\ JSON.semantic.json"`, 0],
	[`bash -lc "cd .archboard/vault && jq empty 'Flask JSON.semantic.json'"`, 0],
	[`bash -lc "cd src && rm 'Flask JSON.semantic.json'"`, 0],
])("%s makes %i direct board writes", (command, writes) => {
	expect(directWrites(command)).toBe(writes);
});

test("a board patched with the editing tool by a path relative to the checkout is a direct write", () => {
	const count = (path: string): number =>
		countDirectBoardWrites({
			commands: [],
			fileChanges: [{ path, kind: "update" }],
			vault: VAULT,
		});
	expect(count(".archboard/vault/Flask JSON.semantic.json")).toBe(1);
	expect(count(`${VAULT}/Flask JSON.semantic.json`)).toBe(1);
	expect(count("src/flask/app.py")).toBe(0);
});

test("reading a board is not reading the code, and the vault vocabulary is still discovery", () => {
	for (const script of [`cat ${VAULT}/Flask\\ JSON.semantic.json`, "ls .archboard/vault"]) {
		expect(classified(`bash -lc '${script}'`).class, script).not.toBe("code-investigation");
	}
	for (const script of [
		`cat ${VAULT}/.archboard/config.yaml`,
		"cat .archboard/vault/.archboard/config.yaml",
	]) {
		expect(classified(`bash -lc '${script}'`).class, script).toBe("discovery");
	}
	expect(classified(`bash -lc 'rg -n load_app ${FLASK}/src/flask/cli.py'`).class).toBe(
		"code-investigation",
	);
});

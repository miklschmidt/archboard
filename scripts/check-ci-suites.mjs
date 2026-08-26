#!/usr/bin/env bun

// Does a push run every check, or is the one it skips written down?
//
// The workflow used to name two scripts of its own instead of running the
// package chain, and the suite grew to sixteen around it. Both were
// chosen for a reason worth keeping, and nothing about that choice said the
// other fourteen were optional. They simply never ran on main (TASK-082).
//
// That is the same shape of problem as an invariant nothing enforces, so the
// fix is not a longer workflow. `.github/workflows/ci.yml` runs `bun run check`,
// whose final gate is the complete test chain, and this check is
// what keeps the two honest:
//
//   every `test:*` script is in the chain, or it is named below with a reason
//   the workflow runs the chain whole
//   a suite the workflow runs on its own is one the chain deliberately skips
//
// Adding a check to scripts/ therefore fails this one until somebody decides
// where it runs.

import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = join(repoRoot, ".github", "workflows", "ci.yml");

// --- what the chain is allowed to leave out ---------------------------------
//
// Nothing. `test:browser` was the one entry, because it asserted a baseline of
// 8 of 12 elements changed rather than guarding a property. Stage 5 made that
// zero (TASK-072), so it guards now, and it is in the chain — which means the
// suite needs `agent-browser` and a browser. That is the cost of being able to
// tell whether a board we write is one Excalidraw agrees with; nothing else in
// `scripts/` can, because every other check stands a socket in for a pane.

const SKIPPED = {};

let failures = 0;
const fail = (message) => {
	failures += 1;
	console.error(`FAIL: ${message}`);
};

// --- the two lists ----------------------------------------------------------

const pkg = JSON.parse(fs.readFileSync(join(repoRoot, "package.json"), "utf-8"));
const suites = Object.keys(pkg.scripts).filter((name) => name.startsWith("test:"));
const chain = new Set(pkg.scripts.test.match(/test:[\w-]+/g) ?? []);
const workflow = fs.readFileSync(workflowPath, "utf-8");

for (const suite of suites) {
	if (chain.has(suite) && suite in SKIPPED) {
		fail(`\`${suite}\` is in the \`test\` chain and also listed as skipped here.`);
	} else if (!chain.has(suite) && !(suite in SKIPPED)) {
		fail(
			`\`${suite}\` runs on nobody's push. Add it to the \`test\` script in ` +
				"package.json, or list it in SKIPPED here with the reason it stays out.",
		);
	}
}

for (const suite of Object.keys(SKIPPED)) {
	if (!suites.includes(suite)) {
		fail(`SKIPPED names \`${suite}\`, which is not a script in package.json.`);
	}
}

// --- and what the workflow does with them -----------------------------------

if (!/bun run check\b/.test(workflow)) {
	fail(
		"the workflow does not run `bun run check`, so lint, format, and the suite are not a push gate.",
	);
}

for (const named of workflow.match(/bun run test:[\w-]+/g) ?? []) {
	const suite = named.replace("bun run ", "");
	if (!(suite in SKIPPED)) {
		fail(
			`the workflow runs \`${suite}\` by name, and the chain already runs it. ` +
				"Naming suites one at a time in the workflow is how it fell behind before.",
		);
	}
}

// --- report -----------------------------------------------------------------

if (failures > 0) {
	console.error(
		`\n${failures} problem${failures === 1 ? "" : "s"}. The chain is the ` +
			"`test` script in package.json; the workflow is .github/workflows/ci.yml.",
	);
	process.exit(1);
}

console.log(`ci suites: ${chain.size} of ${suites.length} run on a push.`);
for (const [suite, reason] of Object.entries(SKIPPED)) {
	console.log(`  skipped   ${suite}: ${reason}`);
}

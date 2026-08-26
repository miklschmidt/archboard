#!/usr/bin/env bun

import fs from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const audit = JSON.parse(
	fs.readFileSync(join(root, "docs", "design", "cli-command-audit.json"), "utf8"),
);
const { cliSurface, cliContractRegistry } = await import(
	join(root, "src", "cli", "commands", "run.ts")
);

let failures = 0;
let checks = 0;
const check = (label, condition, detail = "") => {
	checks += 1;
	if (condition) return;
	failures += 1;
	console.error(`FAIL: ${label}${detail ? `: ${detail}` : ""}`);
};

const expectedPaths = [];
for (const { name, subcommands } of cliSurface()) {
	expectedPaths.push(name);
	for (const subcommand of subcommands) expectedPaths.push(`${name} ${subcommand}`);
}
const auditedPaths = audit.entries.map((entry) => entry.path);
check("audit path count", auditedPaths.length === 57, String(auditedPaths.length));
check("audit paths are unique", new Set(auditedPaths).size === auditedPaths.length);
check(
	"canonical audit matches the production registry",
	JSON.stringify(auditedPaths.toSorted((left, right) => left.localeCompare(right))) ===
		JSON.stringify(expectedPaths.toSorted((left, right) => left.localeCompare(right))),
);

const contracts = cliContractRegistry().filter((entry) => entry.contract);
check(
	"the proof migrates exactly four commands",
	contracts.map((entry) => entry.name).join(",") === "update,query,viewport,export",
	contracts.map((entry) => entry.name).join(","),
);

const byName = new Map(contracts.map((entry) => [entry.name, entry.contract]));
const expectedPrerequisites = {
	query: ["server", "board"],
	update: ["server", "board", "doing"],
	viewport: ["server", "browser"],
	export: ["server", "board"],
};
for (const [name, expected] of Object.entries(expectedPrerequisites)) {
	const actual = byName.get(name)?.prerequisites ?? [];
	check(`${name} declares its complete prerequisites`, actual.join(",") === expected.join(","));
}
const updateRefusals = new Map(
	(byName.get("update")?.refusals ?? []).map((refusal) => [refusal.code, refusal.exit]),
);
for (const [code, exit] of [
	["DOING_REQUIRED", 1],
	["BOARD_REQUIRED", 2],
	["CANVAS_UNREACHABLE", 3],
	["BOARD_HELD", 5],
	["BOARD_CONFLICT", 5],
	["BOARD_VERSION_CONFLICT", 5],
	["CLAIM_REVOKED", 5],
]) {
	check(`update declares ${code} exit ${exit}`, updateRefusals.get(code) === exit);
}
check(
	"viewport does not declare a board refusal",
	!(byName.get("viewport")?.refusals ?? []).some((refusal) => refusal.code === "BOARD_REQUIRED"),
);

const sourceFiles = [];
const visit = (directory) => {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) visit(path);
		else if (entry.name.endsWith(".ts")) sourceFiles.push(path);
	}
};
visit(join(root, "src"));
const commanderImports = sourceFiles.filter((file) =>
	/from ["']commander["']/.test(fs.readFileSync(file, "utf8")),
);
check(
	"Commander is confined to its private adapter",
	commanderImports.length === 1 &&
		relative(root, commanderImports[0]) === "src/cli/command-contract/lib/commander-adapter.ts",
	commanderImports.map((file) => relative(root, file)).join(", "),
);

const proofJson = fs.readFileSync(
	join(root, "docs", "design", "command-contract-proof.json"),
	"utf8",
);
for (const privateName of ["pendingArtifact", "artifactSchema", "stdout", "CommanderArgvParser"]) {
	check(`proof omits ${privateName}`, !proofJson.includes(privateName));
}

if (failures > 0) {
	console.error(`\n${failures} of ${checks} command-contract checks failed.`);
	process.exit(1);
}
console.log(
	`command contract: ${contracts.length} proofs, ${auditedPaths.length} audited paths, ${checks} checks passed.`,
);

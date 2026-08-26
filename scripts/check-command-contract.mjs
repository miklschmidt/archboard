#!/usr/bin/env bun

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const audit = JSON.parse(
	fs.readFileSync(join(root, "docs", "design", "cli-command-audit.json"), "utf8"),
);
const compatibility = JSON.parse(
	fs.readFileSync(
		join(root, "src", "cli", "command-contract", "tests", "fixed-base-compatibility.json"),
		"utf8",
	),
);
const { cliSurface, cliContractRegistry } = await import(
	join(root, "src", "cli", "commands", "run.ts")
);
const { runCommand } = await import(join(root, "src", "cli", "command-contract", "runner.ts"));

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
check(
	"fixed-base compatibility names the review base",
	compatibility.fixedBase === "6c42fca6c0d5b9ecaa5ad40fde14ede684722d5a",
	compatibility.fixedBase,
);
check(
	"fixed-base compatibility covers all 57 canonical paths",
	JSON.stringify(compatibility.publicPaths) === JSON.stringify(auditedPaths),
);
for (const path of compatibility.publicPaths) {
	const [command, ...tail] = path.split(" ");
	const result = spawnSync(join(root, "bin", "canvas"), ["help", command, ...tail], {
		cwd: root,
		encoding: "utf8",
		env: { ...process.env, EXCALIDRAW_NO_AUTOSTART: "1" },
	});
	const digest = createHash("sha256").update(result.stdout).digest("hex");
	check(`${path} fixed-base help exits 0`, result.status === 0, String(result.status));
	check(`${path} fixed-base help keeps stderr empty`, result.stderr === "", result.stderr);
	check(
		`${path} fixed-base help bytes`,
		digest === compatibility.helpStdoutSha256ByCommand[command],
		digest,
	);
}

for (const entry of audit.entries) {
	check(
		`${entry.path} handler owner exists`,
		fs.existsSync(join(root, entry.handlerOwner)),
		entry.handlerOwner,
	);
}

const registry = cliContractRegistry();
const contracts = registry.filter((entry) => entry.kind === "contract" && entry.contract);
const legacy = registry.filter((entry) => entry.kind === "legacy");
check("mixed registry has 57 entries", registry.length === 57, String(registry.length));
check("mixed registry paths are unique", new Set(registry.map((entry) => entry.name)).size === 57);
check(
	"mixed registry matches the canonical audit in order",
	JSON.stringify(registry.map((entry) => entry.name)) === JSON.stringify(auditedPaths),
);
check(
	"contract plus legacy remains 57",
	contracts.length + legacy.length === 57,
	`${contracts.length} + ${legacy.length}`,
);
check(
	"the proof migrates exactly four commands",
	contracts.map((entry) => entry.name).join(",") === "update,query,viewport,export",
	contracts.map((entry) => entry.name).join(","),
);

const byName = new Map(contracts.map((entry) => [entry.name, entry.contract]));
const auditByPath = new Map(audit.entries.map((entry) => [entry.path, entry]));
for (const entry of contracts) {
	const audited = auditByPath.get(entry.name);
	const owner = audited?.handlerOwner;
	const definition =
		owner && fs.existsSync(join(root, owner)) ? fs.readFileSync(join(root, owner), "utf8") : "";
	check(
		`${entry.name} owner defines the registered contract`,
		entry.contract?.path.join(" ") === entry.name &&
			definition.includes(`export const ${entry.name}Contract = defineCommand`),
		owner ?? "missing audit entry",
	);
}
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

check(
	"runCommand has exactly two public arguments",
	runCommand.length === 2,
	String(runCommand.length),
);

const contractSource = fs.readFileSync(
	join(root, "src", "cli", "command-contract", "contract.ts"),
	"utf8",
);
for (const publicHandlerType of ["CommandContext", "CommandExecution", "PendingArtifact"]) {
	check(
		`handler interface retains ${publicHandlerType}`,
		new RegExp(`export interface ${publicHandlerType}\\b`).test(contractSource),
	);
}

const proofJson = fs.readFileSync(
	join(root, "docs", "design", "command-contract-proof.json"),
	"utf8",
);
const generatedProof = JSON.parse(proofJson);
check(
	"generated contracts cover every registered contract",
	JSON.stringify(generatedProof.contracts.map((entry) => entry.name)) ===
		JSON.stringify(contracts.map((entry) => entry.name)),
);
check(
	"generated legacy paths cover every registered legacy path",
	JSON.stringify(generatedProof.legacyPaths) === JSON.stringify(legacy.map((entry) => entry.name)),
);
for (const privateName of ["pendingArtifact", "artifactSchema", "CommanderArgvParser"]) {
	check(`proof omits ${privateName}`, !proofJson.includes(privateName));
}
check("proof omits an internal stdout key", !/"stdout"\s*:/.test(proofJson));

const proofMarkdown = fs.readFileSync(
	join(root, "docs", "design", "command-contract-proof.md"),
	"utf8",
);
check("generated usage never uses inline code", !/^Usage: `archboard/m.test(proofMarkdown));
check(
	"every generated usage is a fenced text block",
	(proofMarkdown.match(/^Usage:\n\n```text\narchboard /gm) ?? []).length === contracts.length,
);

if (failures > 0) {
	console.error(`\n${failures} of ${checks} command-contract checks failed.`);
	process.exit(1);
}
console.log(
	`command contract: ${contracts.length} proofs, ${auditedPaths.length} audited paths, ${checks} checks passed.`,
);

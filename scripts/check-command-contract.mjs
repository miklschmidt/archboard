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
const { childDiscoveryOptions } = await import(
	join(root, "src", "cli", "command-contract", "route-options.ts")
);
const { SNAPSHOT_FLAG_SPEC } = await import(join(root, "src", "cli", "commands", "snapshot.ts"));
const { ARRANGE_FLAG_SPEC } = await import(join(root, "src", "cli", "commands", "arrange.ts"));

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
check(
	"fixed-base compatibility uses executable record schema 2",
	compatibility.schemaVersion === 2,
);
const requiredCompatibilityCases = [
	"status-unavailable",
	"status-foreign-service",
	"board-save-conflict",
	"board-list-here-failure",
	"install-skill-late-failure",
	"promote-binding-resolution-failure",
	"snapshot-save-missing-name",
	"snapshot-restore-missing-name",
	"snapshot-option-leading-restore",
	"arrange-option-leading-align",
];
check(
	"fixed-base compatibility records every approved focused scenario",
	JSON.stringify(compatibility.orderedCases.map((record) => record.name).toSorted()) ===
		JSON.stringify(requiredCompatibilityCases.toSorted()),
);
for (const record of compatibility.orderedCases) {
	check(
		`${record.name} records immutable argv`,
		Array.isArray(record.argv) && record.argv.length > 0,
	);
	check(
		`${record.name} records exact stream bytes`,
		typeof record.stdout === "string" && typeof record.stderr === "string",
	);
	check(
		`${record.name} records deliberate normalizations`,
		record.normalizations.every(
			(rule) =>
				typeof rule.value === "string" &&
				typeof rule.token === "string" &&
				typeof rule.reason === "string" &&
				rule.reason.length > 0,
		),
	);
	check(
		`${record.name} records merged events ending in its exit`,
		Array.isArray(record.mergedEvents) &&
			record.mergedEvents.at(-1)?.kind === "exit" &&
			record.mergedEvents.at(-1)?.value === record.exit,
	);
	for (const field of ["prerequisiteContacts", "restEffects", "localEffects", "artifactCommits"]) {
		check(`${record.name} records ${field}`, Array.isArray(record[field]));
	}
}
const cliCheckerSource = fs.readFileSync(join(root, "scripts", "check-cli-surface.mjs"), "utf8");
check(
	"the package CLI checker replays the ordered fixed-base records",
	cliCheckerSource.includes("for (const record of compatibility.orderedCases)") &&
		cliCheckerSource.includes("exerciseCompatibilityRecord(record)"),
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
check(
	"all-contract registry has exactly 57 entries",
	registry.length === 57,
	String(registry.length),
);
check(
	"all-contract registry paths are unique",
	new Set(registry.map((entry) => entry.name)).size === 57,
);
check(
	"all-contract registry matches the canonical audit in order",
	JSON.stringify(registry.map((entry) => entry.name)) === JSON.stringify(auditedPaths),
);
check("all 57 routes are contracts", contracts.length === 57, String(contracts.length));
check(
	"no legacy routes remain",
	registry.every((entry) => entry.kind === "contract"),
);
check(
	"every route has one executable contract owner",
	registry.every(
		(entry) =>
			typeof entry.handlerOwner === "string" &&
			entry.kind === "contract" &&
			entry.contract?.path.join(" ") === entry.name,
	),
);
check(
	"contract identity does not pretend to be a handler name",
	contracts.every((entry) => !("handlerName" in entry)),
);
for (const [family, spec] of [
	["snapshot", SNAPSHOT_FLAG_SPEC],
	["arrange", ARRANGE_FLAG_SPEC],
]) {
	const route = registry.find((entry) => entry.name === family);
	const derived = childDiscoveryOptions(spec);
	check(
		`${family} discovery arity is derived from its parser flag spec`,
		JSON.stringify(route?.childDiscovery?.options) === JSON.stringify(derived),
	);
	check(
		`${family} discovery covers every declared parser option`,
		Object.keys(route?.childDiscovery?.options ?? {}).length === Object.keys(spec).length &&
			Object.entries(spec).every(
				([name, option]) =>
					route?.childDiscovery?.options[name] === (option.takesValue ? "value" : "flag"),
			),
	);
}
for (const entry of registry.filter((candidate) => candidate.bare?.kind === "default")) {
	check(
		`${entry.name} default alias names a child route`,
		registry.some(
			(candidate) =>
				candidate.parent === entry.name && candidate.name === `${entry.name} ${entry.bare.child}`,
		),
	);
}

const byName = new Map(contracts.map((entry) => [entry.name, entry.contract]));
const auditByPath = new Map(audit.entries.map((entry) => [entry.path, entry]));
for (const entry of registry) {
	const audited = auditByPath.get(entry.name);
	const auditedPath = audited?.path ?? "";
	const expectedParent = auditedPath.includes(" ")
		? auditedPath.slice(0, auditedPath.lastIndexOf(" "))
		: null;
	check(
		`${entry.name} parent matches its canonical path`,
		entry.parent === expectedParent,
		String(entry.parent),
	);
	check(
		`${entry.name} handler owner matches the canonical audit`,
		entry.handlerOwner === audited?.handlerOwner,
		`${entry.handlerOwner} / ${audited?.handlerOwner ?? "missing"}`,
	);
	check(
		`${entry.name} parser owner matches the canonical audit`,
		entry.parserOwner === audited?.parserOwner,
		`${entry.parserOwner} / ${audited?.parserOwner ?? "missing"}`,
	);
	check(
		`${entry.name} kind matches the canonical audit`,
		entry.kind === (audited?.parserOwner.startsWith("CommandContract") ? "contract" : "legacy"),
	);
}
for (const entry of contracts) {
	const expected = auditByPath.get(entry.name)?.prerequisites ?? [];
	const actual = entry.contract?.prerequisites ?? [];
	check(
		`${entry.name} declares its canonical prerequisites`,
		actual.join(",") === expected.join(","),
	);
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
const familyCommandSources = sourceFiles
	.filter(
		(file) =>
			relative(root, file).startsWith("src/cli/commands/") &&
			relative(root, file) !== "src/cli/commands/run.ts",
	)
	.map((file) => [relative(root, file), fs.readFileSync(file, "utf8")]);
const duplicateSubcommandCatalogues = familyCommandSources
	.filter(([, source]) => /switch\s*\(\s*(?:action|op|command|subcommand)\s*\)/.test(source))
	.map(([file]) => file);
check(
	"family modules contain no duplicate subcommand catalogues",
	duplicateSubcommandCatalogues.length === 0,
	duplicateSubcommandCatalogues.join(", "),
);
for (const deleted of [
	"src/cli/commands/args.ts",
	"src/cli/commands/util.ts",
	"src/cli/command-contract/lib/command-definitions.ts",
]) {
	check(`${deleted} stays deleted`, !fs.existsSync(join(root, deleted)));
}
const commandModuleViolations = familyCommandSources
	.filter(([, source]) =>
		/\b(?:parseArgs|printJson|requireBrowserClient)\s*\(|process\.(?:stdout|stderr)|argv\s*:\s*string\[\]/.test(
			source,
		),
	)
	.map(([file]) => file);
check(
	"command handlers receive validated input and own no streams or raw argv",
	commandModuleViolations.length === 0,
	commandModuleViolations.join(", "),
);
const obsoleteInfrastructureReferences = sourceFiles
	.filter((file) =>
		/LegacyCommand|command-definitions|commands\/(?:args|util)\.js/.test(
			fs.readFileSync(file, "utf8"),
		),
	)
	.map((file) => relative(root, file));
check(
	"source contains no obsolete CLI infrastructure references",
	obsoleteInfrastructureReferences.length === 0,
	obsoleteInfrastructureReferences.join(", "),
);
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
check(
	"public contract declares nonzero outcomes",
	/export interface CommandOutcomeDeclaration\b/.test(contractSource),
);
const executionBody =
	contractSource.match(/export interface CommandExecution[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? "";
for (const forbidden of ["exit:", "stream:", "presentation:", "description:", "held:"]) {
	check(`private execution cannot carry ${forbidden}`, !executionBody.includes(forbidden));
}
const sharedSchemas = fs.readFileSync(
	join(root, "src", "cli", "command-contract", "schemas.ts"),
	"utf8",
);
for (const schema of [
	"ElementIdSchema",
	"ServerElementSchema",
	"BoardAddressSchema",
	"BoardFingerprintSchema",
	"BoardRefusalSchema",
	"HoldReportSchema",
	"BoardWriteConflictSchema",
	"PaneRefSchema",
	"RepositoryIdentitySchema",
	"CodeBindingSchema",
	"SnapshotNameSchema",
	"ChangeCursorSchema",
	"LibraryItemIdSchema",
	"ServerStateSchema",
	"ClaimSchema",
	"AffectedElementsSchema",
	"BoardDocumentSchema",
	"GeneratedHandlesSchema",
	"WriteReceiptSchema",
	"PendingArtifactSchema",
]) {
	check(`shared schemas export ${schema}`, sharedSchemas.includes(`export const ${schema}`));
}
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
const expectedGeneratedRoutes = registry.map(
	({ name, parent, kind, handlerOwner, parserOwner, bare, childDiscovery }) => {
		const route = { name, parent, kind, handlerOwner, parserOwner };
		if (bare) route.bare = bare;
		if (childDiscovery) route.childDiscovery = childDiscovery;
		return route;
	},
);
check(
	"generated contracts cover every registered contract",
	JSON.stringify(generatedProof.contracts.map((entry) => entry.name)) ===
		JSON.stringify(contracts.map((entry) => entry.name)),
);
check("generated proof omits legacy paths", !("legacyPaths" in generatedProof));
check(
	"generated routes cover every owner and parent in the mixed tree",
	JSON.stringify(generatedProof.routes) === JSON.stringify(expectedGeneratedRoutes),
);
check(
	"generated contract routes omit synthetic handler names",
	generatedProof.routes
		.filter((entry) => entry.kind === "contract")
		.every((entry) => !("handlerName" in entry)),
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

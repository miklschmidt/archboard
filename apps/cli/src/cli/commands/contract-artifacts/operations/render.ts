import { join } from "node:path";
import { cliContractRegistry } from "#cli/routing/operations/run.ts";
import { introspectAnswerFields, introspectContracts } from "#cli/contract/rules/introspection.ts";

const CLI_CONTRACT_ARTIFACT_NAMES = [
	"command-contract-proof.json",
	"command-contract-proof.md",
] as const;

/**
 * Formats generated content the way the repository formats its own files, so
 * a generated artifact never differs from a committed one by whitespace alone.
 * @param root - The repository root.
 * @param name - The generated file's name, which decides how it is formatted.
 * @param content - The content to format.
 * @returns The formatted content.
 * @throws {Error} When the formatter refuses the content.
 */
function format(root: string, name: string, content: string): string {
	const formatted = Bun.spawnSync(
		[
			join(root, "node_modules/.bin/vp"),
			"fmt",
			"--config",
			join(root, "vite.config.ts"),
			"--stdin-filepath",
			join(root, "docs", "design", "generated", name),
		],
		{
			cwd: root,
			stdin: new TextEncoder().encode(content),
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	if (formatted.exitCode !== 0) {
		throw new Error(`Could not format ${name}: ${formatted.stderr.toString()}`);
	}
	return formatted.stdout.toString();
}

/**
 * Renders every generated CLI contract artifact from the live command registry
 * and the public metadata its contracts declare.
 * @param root - The repository root.
 * @returns The formatted artifacts by file name.
 */
async function renderCliContractArtifacts(root: string) {
	const registry = cliContractRegistry();
	const proof = introspectContracts(registry);
	const answerFields = introspectAnswerFields();
	const routes = registry.map(
		({ name, parent, classification, handlerOwner, parserOwner, bare, childDiscovery }) => ({
			name,
			parent,
			classification,
			handlerOwner,
			parserOwner,
			...(bare ? { bare } : {}),
			...(childDiscovery ? { childDiscovery } : {}),
		}),
	);

	const proofJson = `${JSON.stringify(
		{
			schemaVersion: 7,
			generatedFrom: "apps/cli/src/cli/routing/operations/run.ts",
			routes,
			answerFields,
			contracts: proof,
		},
		null,
		2,
	)}\n`;

	const proofMarkdown = [
		"<!-- Generated from the run.ts registry and public CommandContract metadata. -->",
		"# Command contract proof reference",
		"",
		"## Answer fields",
		"",
		...Object.entries(answerFields).flatMap(([field, { when, schema }]) => [
			`\`${field}\`: ${when}.`,
			"",
			"```json",
			JSON.stringify(schema, null, 2),
			"```",
			"",
		]),
	];
	for (const contract of proof) {
		proofMarkdown.push(
			`## ${contract.path.join(" ")}`,
			"",
			contract.description,
			"",
			`Classification: ${contract.classification}.`,
			"",
			"Usage:",
			"",
			"```text",
			`archboard ${contract.usage}`,
			"```",
			"",
			`Output: ${contract.output.map((output) => `${output.mode} (${output.description})`).join("; ")}.`,
			"",
			`Prerequisites: ${contract.prerequisites.join(", ") || "none"}. Effects: ${contract.effects.join(", ") || "none"}.`,
			"",
			...(contract.runsWithoutVault
				? [
						"Runs without a vault in a Git checkout that holds none, and its answer then names no vault.",
						"",
					]
				: []),
			"REST relationships:",
			"",
			...contract.relationships.map(
				(relationship) =>
					`- ${relationship.method} \`${relationship.path}\`, ${relationship.cardinality}. ${relationship.description}`,
			),
			"",
			"Public result JSON Schema:",
			"",
			"```json",
			JSON.stringify(contract.result, null, 2),
			"```",
			"",
		);
	}

	const rawArtifacts = new Map<string, string>([
		["command-contract-proof.json", proofJson],
		["command-contract-proof.md", `${proofMarkdown.join("\n")}\n`],
	]);
	const artifacts = new Map(
		[...rawArtifacts].map(([name, content]) => [name, format(root, name, content)]),
	);
	return { artifacts };
}

export { CLI_CONTRACT_ARTIFACT_NAMES, renderCliContractArtifacts };

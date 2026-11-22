import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
	architectureUpgradeResultSchema,
	upgradeInventoryReadSchema,
	upgradeInventorySchema,
	type UpgradeInventory,
} from "@archboard/model/contract";
import {
	readUpgradeInventoryOnServer,
	upgradeArchitectureModelOnServer,
} from "#cli/server-access/clients/upgrade.ts";
import { CliUsageError, defineCommand } from "#cli/contract/protocol/contract.ts";
import { refusal } from "#cli/contract/protocol/refusals.ts";

const unavailable = {
	id: "unavailable",
	exit: 2,
	stream: "stdout-and-stderr",
	presentation: ["diagnostics", "result"],
	description: "The upgrade was refused. The answer names what to repair.",
} as const;

/**
 * The diagnostics of a refusal, one line each.
 * @param diagnostics The refusal's diagnostics.
 * @returns The lines.
 */
function refusalLines(
	diagnostics: readonly { code: string; message: string; recovery: string }[],
): string[] {
	return diagnostics.map((d) => `${d.code}: ${d.message} ${d.recovery}`);
}

/**
 * The file one root module's inventory is written to: its name, then its id.
 * @param inventory The inventory.
 * @returns The file name.
 */
function inventoryFile(inventory: UpgradeInventory): string {
	const slug = inventory.root.name
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/gu, "-")
		.replaceAll(/^-|-$/gu, "");
	return `${slug === "" ? "root" : slug}-${inventory.root.id.split("#")[1]}.json`;
}

const NAMESPACE_USAGE = "upgrade needs a subcommand: inventory or install";
const upgradeContract = defineCommand({
	path: ["upgrade"],
	shared: [],
	summary: "Upgrade a vault written in an older format to the current one",
	description:
		"Routes the upgrade subcommands. `archboard upgrade inventory` writes what to classify, and `archboard upgrade install` installs it filled.",
	examples: ["archboard upgrade inventory --out upgrade/"],
	parameters: [
		{
			kind: "positional",
			key: "tokens",
			name: "arguments",
			repeatable: true,
			route: "pass-through",
			hidden: true,
			description: "Namespace arguments",
		},
	],
	input: { ingress: z.object({ tokens: z.array(z.string()).default([]) }) },
	result: z.never(),
	output: {
		cases: [{ id: "json", when: {}, mode: "json", description: "Namespace refusal" }],
		/**
		 * Selects the only output case.
		 * @returns The json case id.
		 */
		select: () => "json",
	},
	prerequisites: [],
	effects: [],
	refusals: [],
	relationships: [],
	/**
	 * Refuses the bare namespace with its subcommand usage line.
	 * @returns Never; the usage error is the whole behaviour.
	 */
	async handler() {
		throw new CliUsageError(NAMESPACE_USAGE);
	},
});

const upgradeInventoryContract = defineCommand({
	path: ["upgrade", "inventory"],
	shared: ["url", "directory"],
	summary: "Write the inventory of a vault in the old format, one file per root module",
	description:
		"Lists every relationship of the current state, and each one a draft adds or gives another kind, under the root module of its source. Each entry carries the old kind, both ends with their bindings, the label and the anchor.\n\nFill `kind` and `effect` of each entry from the code, and `gap` where a side effect cannot be ruled out, then run `archboard upgrade install`. The directory must hold no inventory yet. The vault does not change.",
	examples: ["archboard upgrade inventory --out upgrade/"],
	parameters: [
		{
			kind: "option",
			key: "out",
			spellings: ["--out"],
			value: "required",
			placeholder: "dir",
			description: "Write one inventory file for each root module into this directory",
		},
	],
	input: { ingress: z.strictObject({ out: z.string() }) },
	result: z.union([
		z.strictObject({
			success: z.literal(true),
			directory: z.string(),
			files: z.array(
				z.strictObject({ file: z.string(), root: z.string(), relationships: z.number() }),
			),
		}),
		upgradeInventoryReadSchema().options[1],
	]),
	output: {
		cases: [
			{ id: "json", when: {}, mode: "json", description: "The files written, or the refusal" },
		],
		/**
		 * Select the JSON answer.
		 * @returns The output case.
		 */
		select: () => "json",
	},
	prerequisites: ["server"],
	effects: ["read", "local-write"],
	refusals: [refusal("server")],
	outcomes: [unavailable],
	relationships: [
		{
			method: "GET",
			path: "/api/architecture/upgrade/inventory",
			cardinality: "one",
			description: "Read the inventory of the old vault",
		},
	],
	/**
	 * Read the inventory and write one file per root module.
	 * @param input The output directory.
	 * @param context The invocation capabilities.
	 * @returns The files written, or the refusal.
	 */
	async handler(input, context) {
		await context.require("server", "upgrade inventory");
		const directory = context.resolvePath(input.out);
		if (fs.existsSync(directory) && fs.readdirSync(directory).some((f) => f.endsWith(".json")))
			throw new CliUsageError(
				`${directory} already holds an inventory. Choose an empty directory, so that no filled inventory is overwritten.`,
			);
		const read = await readUpgradeInventoryOnServer();
		if (!read.success)
			return { result: read, outcome: "unavailable", diagnostics: refusalLines(read.diagnostics) };
		fs.mkdirSync(directory, { recursive: true });
		const files = read.inventories.map((inventory) => {
			const file = path.join(directory, inventoryFile(inventory));
			fs.writeFileSync(file, `${JSON.stringify(inventory, null, 2)}\n`);
			return { file, root: inventory.root.name, relationships: inventory.relationships.length };
		});
		return { result: { success: true as const, directory, files } };
	},
});

const upgradeInstallContract = defineCommand({
	path: ["upgrade", "install"],
	shared: ["url", "directory", "doing"],
	summary: "Upgrade the vault to the current format through its filled inventory",
	description:
		"Reads every `.json` file of the inventory directory and installs them as one upgrade: each relationship gets the kind and effect its entry states, keeps its id, and each draft moves onto the upgraded state. The vault configuration loses its dashes, the retired `data` kind and the entries that only restate an old default.\n\nAn inventory that leaves a relationship without a kind or an effect, or that was read from another revision, is refused, and nothing changes. A `dependency` may state no effect. The answer lists each recorded gap for review. Installing the same inventory again answers with the same receipt.",
	examples: [
		'archboard upgrade install --inventory upgrade/ --writer agent --doing "Upgrade the vault to kinds and effects"',
	],
	parameters: [
		{
			kind: "option",
			key: "inventory",
			spellings: ["--inventory"],
			value: "required",
			placeholder: "dir",
			required: true,
			description: "The directory of filled inventory files",
		},
		{
			kind: "option",
			key: "writer",
			spellings: ["--writer"],
			value: "required",
			placeholder: "name",
			required: true,
			description: "Who installs the upgrade, as its checkpoint records it",
		},
	],
	input: { ingress: z.strictObject({ inventory: z.string(), writer: z.string() }) },
	result: architectureUpgradeResultSchema(),
	output: {
		cases: [{ id: "json", when: {}, mode: "json", description: "The receipt, or the refusal" }],
		/**
		 * Select the JSON answer.
		 * @returns The output case.
		 */
		select: () => "json",
	},
	prerequisites: ["server", "doing"],
	effects: ["local-read", "write"],
	refusals: [refusal("server"), refusal("doing")],
	outcomes: [unavailable],
	relationships: [
		{
			method: "POST",
			path: "/api/architecture/upgrade",
			cardinality: "one",
			description: "Install the filled inventory",
		},
	],
	/**
	 * Read every inventory file and install them as one upgrade.
	 * @param input The inventory directory and the writer.
	 * @param context The invocation capabilities.
	 * @returns The receipt, or the refusal.
	 */
	async handler(input, context) {
		await context.require("server", "upgrade install");
		const directory = context.resolvePath(input.inventory);
		const files = fs.existsSync(directory)
			? fs.readdirSync(directory).filter((file) => file.endsWith(".json"))
			: [];
		if (files.length === 0)
			throw new CliUsageError(
				`${directory} holds no inventory. Write one with archboard upgrade inventory --out ${input.inventory}.`,
			);
		const inventories = files.toSorted().map((file) => {
			const parsed = upgradeInventorySchema().safeParse(
				JSON.parse(context.readTextFile(path.join(directory, file))),
			);
			if (!parsed.success)
				throw new CliUsageError(`${file} is not an inventory: ${z.prettifyError(parsed.error)}`);
			return parsed.data;
		});
		const result = await upgradeArchitectureModelOnServer({ inventories, writer: input.writer });
		return result.success
			? { result }
			: { result, outcome: "unavailable", diagnostics: refusalLines(result.diagnostics) };
	},
});

export { NAMESPACE_USAGE, upgradeContract, upgradeInstallContract, upgradeInventoryContract };

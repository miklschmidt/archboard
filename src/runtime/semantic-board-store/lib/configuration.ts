import * as RemixIcons from "@remixicon/react";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireVaultRoot } from "@/runtime/engine/board";
import { errnoCode, errorMessage } from "@/shared/thrown-error/index";
import {
	DEFAULT_SEMANTIC_POLICY,
	createSemanticPolicySchema,
	type SemanticPolicy,
	type VaultDiagnostic,
} from "@/shared/semantic-policy/index";

const SEMANTIC_BOARD_CONFIG_PATH = path.join(".archboard", "config.yaml");
const SemanticBoardConfigurationSchema = createSemanticPolicySchema(
	z.enum(
		Object.keys(RemixIcons).filter((name) => /^Ri[A-Za-z0-9]+(?:Line|Fill)$/u.test(name)),
		{ error: "Use an installed RemixIcon export name, for example RiServerLine" },
	),
);
type SemanticBoardConfiguration = SemanticPolicy;
interface SemanticBoardConfigurationRead {
	readonly ok: boolean;
	readonly file: string;
	readonly configuration: SemanticPolicy;
	readonly diagnostics: VaultDiagnostic[];
	readonly fingerprint: string;
	readonly problem?: string;
}

/**
 * Locate the single authored policy for this vault.
 * @param root The vault root.
 * @returns The absolute policy path.
 */
function semanticBoardConfigurationPath(root = requireVaultRoot()): string {
	return path.join(root, SEMANTIC_BOARD_CONFIG_PATH);
}

/**
 * Interpret current bytes, using coherent defaults for every invalid state.
 * @param root The vault root.
 * @returns Current policy, health and fingerprint.
 */
function readSemanticBoardConfiguration(root = requireVaultRoot()): SemanticBoardConfigurationRead {
	const file = semanticBoardConfigurationPath(root);
	let source = "";
	let problem: string | undefined;
	let configuration = DEFAULT_SEMANTIC_POLICY;
	try {
		source = fs.readFileSync(file, "utf8");
		const parsed = parsePolicy(source);
		configuration = parsed.configuration;
		problem = parsed.problem;
	} catch (error) {
		problem =
			errnoCode(error) === "ENOENT"
				? "Configuration is missing. Create .archboard/config.yaml; run archboard semantic config to discover the bundled vocabulary and schema."
				: `Cannot interpret YAML configuration: ${errorMessage(error)}`;
	}
	const diagnostics: VaultDiagnostic[] = configurationWarnings(file, problem);
	return {
		ok: problem === undefined,
		file,
		configuration,
		diagnostics,
		fingerprint: createHash("sha256")
			.update(source)
			.update(problem ?? "")
			.digest("hex"),
		...(problem === undefined ? {} : { problem }),
	};
}
/**
 * Report the currently active fallback.
 * @param file Policy location.
 * @param problem Current failure.
 * @returns Actionable warnings.
 */
function configurationWarnings(file: string, problem: string | undefined): VaultDiagnostic[] {
	return problem === undefined
		? []
		: [
				{
					severity: "warning",
					code: "INVALID_CONFIG",
					file,
					message: `${problem} Bundled defaults are active; structurally valid board writes remain available. Correct this file to restore vocabulary validation.`,
				},
			];
}

/**
 * Seed a new vault without replacing authored configuration.
 * @param root The vault root.
 * @param configuration The initial vocabulary and appearance.
 * @returns Whether a file was created.
 */
function initializeSemanticBoardConfiguration(
	root: string,
	configuration: SemanticPolicy = DEFAULT_SEMANTIC_POLICY,
): boolean {
	const parsed = SemanticBoardConfigurationSchema.parse(configuration);
	const file = semanticBoardConfigurationPath(root);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	try {
		fs.writeFileSync(file, Bun.YAML.stringify(parsed), { encoding: "utf8", flag: "wx" });
		return true;
	} catch (error) {
		if (errnoCode(error) === "EEXIST") return false;
		throw error;
	}
}
export {
	SEMANTIC_BOARD_CONFIG_PATH,
	SemanticBoardConfigurationSchema,
	type SemanticBoardConfiguration,
	type SemanticBoardConfigurationRead,
	semanticBoardConfigurationPath,
	readSemanticBoardConfiguration,
	initializeSemanticBoardConfiguration,
};

/**
 * Validate shape and installed icon vocabulary together.
 * @param source Current YAML bytes.
 * @returns A usable policy and optional failure.
 */
function parsePolicy(source: string): { configuration: SemanticPolicy; problem?: string } {
	const parsed = SemanticBoardConfigurationSchema.safeParse(Bun.YAML.parse(source));
	if (!parsed.success)
		return {
			configuration: DEFAULT_SEMANTIC_POLICY,
			problem: `Invalid semantic policy: ${z.prettifyError(parsed.error)}`,
		};
	return { configuration: parsed.data };
}

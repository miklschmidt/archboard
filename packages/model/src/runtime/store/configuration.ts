import * as RemixIcons from "@remixicon/react";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { errnoCode, errorMessage } from "@archboard/diagnostics/errno";
import {
	DEFAULT_SEMANTIC_POLICY,
	createLegacyVaultConfigurationSchema,
	createVaultConfigurationSchema,
	configurationOf,
	type SemanticPolicy,
	type VaultDiagnostic,
} from "#shared/schemas/semantic-policy.ts";

const VAULT_CONFIGURATION_PATH = path.join(".archboard", "config.yaml");
const InstalledIconSchema = z.enum(
	Object.keys(RemixIcons).filter((name) => /^Ri[A-Za-z0-9]+(?:Line|Fill)$/u.test(name)),
	{ error: "Use an installed RemixIcon export name, for example RiServerLine" },
);
const VaultConfigurationSchema = createVaultConfigurationSchema(InstalledIconSchema);
const LegacyVaultConfigurationSchema = createLegacyVaultConfigurationSchema(InstalledIconSchema);
/**
 * A configuration as the store reads it: the policy in effect, and whether
 * the configuration is in the old format, which only an old vault and its
 * history hold (TASK-663).
 */
type VaultPolicy =
	| { readonly success: true; readonly format: "current" | "old"; readonly policy: SemanticPolicy }
	| { readonly success: false; readonly error: z.ZodError };

/**
 * Read a parsed configuration in the current format, else in the old one. A
 * configuration that is neither is refused with the current format's issues,
 * which say how to write it now.
 * @param value The parsed YAML.
 * @returns The policy in effect and its format, or the current format's refusal.
 */
function parseVaultPolicy(value: unknown): VaultPolicy {
	const current = VaultConfigurationSchema.safeParse(value);
	if (current.success) return { success: true, format: "current", policy: current.data };
	const old = LegacyVaultConfigurationSchema.safeParse(value);
	if (old.success) return { success: true, format: "old", policy: old.data };
	return { success: false, error: current.error };
}
interface VaultConfigurationRead {
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
function vaultConfigurationPath(root: string): string {
	return path.join(root, VAULT_CONFIGURATION_PATH);
}

/**
 * Interpret current bytes, using coherent defaults for every invalid state.
 * @param root The vault root.
 * @returns Current policy, health and fingerprint.
 */
function readVaultConfiguration(root: string): VaultConfigurationRead {
	const file = vaultConfigurationPath(root);
	let source = "";
	let problem: string | undefined;
	let at: string | undefined;
	let configuration = DEFAULT_SEMANTIC_POLICY;
	try {
		source = fs.readFileSync(file, "utf8");
		const parsed = parsePolicy(source);
		configuration = parsed.configuration;
		problem = parsed.problem;
		at = parsed.path;
	} catch (error) {
		problem =
			errnoCode(error) === "ENOENT"
				? "Configuration is missing. Create .archboard/config.yaml; run archboard model config to discover the bundled vocabulary and schema."
				: `Cannot interpret YAML configuration: ${errorMessage(error)}`;
	}
	const diagnostics: VaultDiagnostic[] = configurationWarnings(file, problem, at);
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
 * @param at The first key the schema refused, dotted, which is where a repair starts.
 * @returns Actionable warnings.
 */
function configurationWarnings(
	file: string,
	problem: string | undefined,
	at: string | undefined,
): VaultDiagnostic[] {
	return problem === undefined
		? []
		: [
				{
					severity: "warning",
					code: "INVALID_CONFIG",
					file,
					...(at === undefined ? {} : { path: at }),
					message: `${problem} Bundled defaults are active; structurally valid model writes remain available. Correct this file to restore vocabulary validation.`,
				},
			];
}

/**
 * The configuration file that reads back as a policy in effect, in its own format.
 * @param policy The policy in effect.
 * @returns The bytes of `.archboard/config.yaml`.
 */
function configurationFile(policy: SemanticPolicy): Buffer {
	return Buffer.from(Bun.YAML.stringify(configurationOf(policy)));
}

export { VaultConfigurationSchema, configurationFile, parseVaultPolicy, readVaultConfiguration };

/**
 * The key a schema issue refuses, as a path. An unknown key is refused at the object that holds
 * it, so its name ends the path.
 * @param issue The first issue, if any.
 * @returns The path.
 */
function refusedKey(issue: z.core.$ZodIssue | undefined): PropertyKey[] {
	if (issue === undefined) return [];
	if (issue.code !== "unrecognized_keys") return issue.path;
	const retired =
		issue.path.join(".") === "codeCheck.rules" && issue.keys.includes("INTERFACE_WIDE");
	return [...issue.path, ...(retired ? ["INTERFACE_WIDE"] : issue.keys.slice(0, 1))];
}

/**
 * Validate shape and installed icon vocabulary together.
 * @param source Current YAML bytes.
 * @returns A usable policy, and the failure and the first key it refused, if any.
 */
function parsePolicy(source: string): {
	configuration: SemanticPolicy;
	problem?: string;
	path?: string;
} {
	const parsed = parseVaultPolicy(Bun.YAML.parse(source));
	if (!parsed.success) {
		const refused = refusedKey(parsed.error.issues[0]);
		return {
			configuration: DEFAULT_SEMANTIC_POLICY,
			problem: `Invalid semantic policy: ${z.prettifyError(parsed.error)}`,
			...(refused.length === 0 ? {} : { path: refused.map(String).join(".") }),
		};
	}
	return { configuration: parsed.policy };
}

/**
 * The schema `VaultConfigurationSchema`, for callers that parse it or build on it.
 * @returns The schema.
 */
export function vaultConfigurationSchema(): typeof VaultConfigurationSchema {
	return VaultConfigurationSchema;
}

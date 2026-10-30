import { createHash } from "node:crypto";
import { readFileSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { errnoCode, errorMessage } from "@archboard/diagnostics/errno";
import { LegacyMappingPlanSchema, type LegacyMappingPlan } from "#shared/schemas/migration.ts";

const MIGRATION_PLAN_PATH = ".archboard/migration-plan.json";

/**
 * Read the separate authored planning record without creating it.
 * @param vault The explicitly addressed vault.
 * @param origin The expected stable import namespace.
 * @returns Its parsed plan and exact byte revision, or an absent record.
 */
function readMigrationPlan(
	vault: string,
	origin: string,
): { plan?: LegacyMappingPlan; revision: string | null; problem?: string } {
	const file = join(vault, MIGRATION_PLAN_PATH);
	try {
		if (!lstatSync(file).isFile()) throw new Error("The migration plan must be a regular file.");
		const bytes = readFileSync(file);
		const plan = LegacyMappingPlanSchema.parse(
			JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
		);
		if (plan.origin !== origin)
			return { revision: null, problem: "Use the saved origin namespace for this migration plan." };
		return {
			plan,
			revision: createHash("sha256").update(bytes).digest("hex"),
		};
	} catch (error) {
		if (errnoCode(error) === "ENOENT") return { revision: null };
		return { revision: null, problem: errorMessage(error) };
	}
}
export { MIGRATION_PLAN_PATH, readMigrationPlan };

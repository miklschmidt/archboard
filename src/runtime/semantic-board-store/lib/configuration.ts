// The vocabulary a vault uses for board levels.
//
// A level is required on every semantic board, but which levels exist belongs
// to the people who own the vault. The configuration is therefore a persisted
// input beside the boards, read on demand like the boards themselves. There is
// deliberately no fallback: inventing `system`, `service`, and `module` at
// runtime would make a missing configuration look like an authored decision.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { requireVaultRoot } from "@/runtime/engine/board";
import { errnoCode, errorMessage } from "@/shared/thrown-error/index";
import {
	SemanticBoardLevelSchema,
	type SemanticBoardLevel,
} from "@/shared/semantic-board/index";

const SEMANTIC_BOARD_CONFIG_PATH = path.join(".archboard", "config.json");

/** The consumer-authored semantic configuration stored in one vault. */
const SemanticBoardConfigurationSchema = z
	.object({ levels: z.array(SemanticBoardLevelSchema).min(1) })
	.strict()
	.superRefine((configuration, context) => {
		const firstAt = new Map<string, number>();
		for (const [index, level] of configuration.levels.entries()) {
			const prior = firstAt.get(level);
			if (prior !== undefined) {
				context.addIssue({
					code: "custom",
					path: ["levels", index],
					message: `duplicates levels[${prior}] (${JSON.stringify(level)})`,
				});
				continue;
			}
			firstAt.set(level, index);
		}
	});
type SemanticBoardConfiguration = z.infer<typeof SemanticBoardConfigurationSchema>;

/** A usable configuration, or why the vault does not have one. */
type SemanticBoardConfigurationRead =
	| {
			readonly ok: true;
			readonly file: string;
			readonly configuration: SemanticBoardConfiguration;
	  }
	| { readonly ok: false; readonly file: string; readonly problem: string };

/**
 * Where a vault keeps its semantic configuration.
 * @param root The vault root.
 * @returns The absolute configuration path.
 */
function semanticBoardConfigurationPath(root = requireVaultRoot()): string {
	return path.join(root, SEMANTIC_BOARD_CONFIG_PATH);
}

/**
 * Read and validate the vocabulary configured by the vault owner.
 * @param root The vault root.
 * @returns The configuration or an actionable refusal carrying its path.
 */
function readSemanticBoardConfiguration(
	root = requireVaultRoot(),
): SemanticBoardConfigurationRead {
	const file = semanticBoardConfigurationPath(root);
	let text: string;
	try {
		text = fs.readFileSync(file, "utf-8");
	} catch (error) {
		return {
			ok: false,
			file,
			problem:
				errnoCode(error) === "ENOENT"
					? `Semantic board configuration is missing at ${file}. Create it with a non-empty ` +
						'level vocabulary, for example {"levels":["system","service","module"]}.'
					: `Cannot read semantic board configuration at ${file}: ${errorMessage(error)}`,
		};
	}
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return { ok: false, file, problem: `${file} is not JSON: ${errorMessage(error)}` };
	}
	const parsed = SemanticBoardConfigurationSchema.safeParse(value);
	return parsed.success
		? { ok: true, file, configuration: parsed.data }
		: {
				ok: false,
				file,
				problem: `${file} is not a semantic board configuration: ${z.prettifyError(parsed.error)}`,
			};
}

/**
 * Whether a board level belongs to this vault's authored vocabulary.
 * @param level The level a board states.
 * @param root The vault root.
 * @returns Nothing when accepted, or an actionable refusal.
 */
function configuredSemanticBoardLevelProblem(
	level: SemanticBoardLevel,
	root = requireVaultRoot(),
): string | null {
	const read = readSemanticBoardConfiguration(root);
	if (!read.ok) {
		return read.problem;
	}
	if (read.configuration.levels.includes(level)) {
		return null;
	}
	return (
		`Board level ${JSON.stringify(level)} is not configured in ${read.file}. ` +
		`Choose one of: ${read.configuration.levels.join(", ")}.`
	);
}

/**
 * Seed a newly-created vault with an explicit vocabulary without overwriting
 * an authored file.
 * @param root The vault root.
 * @param configuration The values the setup command explicitly chose.
 * @returns True when the file was created.
 */
function initializeSemanticBoardConfiguration(
	root: string,
	configuration: SemanticBoardConfiguration,
): boolean {
	const parsed = SemanticBoardConfigurationSchema.parse(configuration);
	const file = semanticBoardConfigurationPath(root);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	try {
		fs.writeFileSync(file, `${JSON.stringify(parsed, null, "\t")}\n`, {
			encoding: "utf-8",
			flag: "wx",
		});
		return true;
	} catch (error) {
		if (errnoCode(error) === "EEXIST") {
			return false;
		}
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
	configuredSemanticBoardLevelProblem,
	initializeSemanticBoardConfiguration,
};

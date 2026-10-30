import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { mintId } from "@archboard/board/ids";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
/** Canonical input and bound module for opener integration fixtures. */
interface BoundBoard {
	readonly key: string;
	readonly node: string;
	readonly file: string;
}
/**
 * Seed one real canonical module for the opener's existing public route.
 * @param vault The fixture vault.
 * @param repository The binding repository.
 * @param path The bound path.
 * @returns The canonical model, module, and authored input path.
 */
async function boundBoard(vault: string, repository: string, path: string): Promise<BoundBoard> {
	mkdirSync(vault, { recursive: true });
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(DEFAULT_SEMANTIC_POLICY));
	const key = mintId(),
		node = `${key}#Payments`,
		file = join(vault, "payments.module.json");
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: key,
			name: "Payments",
			current: { id: "Now", name: "Current" },
		}),
	);
	writeFileSync(
		file,
		JSON.stringify({
			schemaVersion: 1,
			id: node,
			name: "Payments",
			kind: "service",
			order: 0,
			binding: { repo: repository, path },
			outgoing: [],
		}),
	);
	return { key, node, file };
}
export { type BoundBoard, boundBoard };

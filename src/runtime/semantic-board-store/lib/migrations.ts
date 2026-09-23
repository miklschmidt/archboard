// Upgrade persisted board documents before the current contract validates them.
// Each step names the exact version it understands and the version it produces.
// A step only changes a decoded value; the read boundary validates and persists
// the completed document before returning it to a caller.

import { SEMANTIC_BOARD_SCHEMA_VERSION } from "@/shared/semantic-board/index";

interface Migration {
	readonly from: string;
	readonly to: string;
	readonly apply: (document: Record<string, unknown>) => void;
}

interface MigratedDocument {
	readonly ok: true;
	readonly value: unknown;
	readonly changed: boolean;
}

interface UnsupportedMigration {
	readonly ok: false;
	readonly problem: string;
}

type MigrationResult = MigratedDocument | UnsupportedMigration;

/**
 * Persist the former array order as explicit author order. Nodes and edges
 * each have their own sequence in every variant. Existing order values stay
 * untouched, including invalid ones that the canonical parser must refuse.
 * @param document The decoded board.
 */
function addSubjectOrder(document: Record<string, unknown>): void {
	const variants = document["variants"];
	if (!Array.isArray(variants)) return;
	for (const variant of variants) {
		const content = isRecord(variant) ? variant["content"] : undefined;
		if (!isRecord(content)) continue;
		addOrderToSubjects(content["nodes"]);
		addOrderToSubjects(content["edges"]);
	}
}

/**
 * Add order from array position where the field is absent.
 * @param value One subject array.
 */
function addOrderToSubjects(value: unknown): void {
	if (!Array.isArray(value)) return;
	for (const [index, subject] of value.entries()) {
		if (isRecord(subject) && !("order" in subject)) {
			subject["order"] = (index + 1) * 1000;
		}
	}
}

const migrations: readonly Migration[] = [
	// These contracts already parse under the current shape when they did not
	// use retired fields. The read boundary refuses old singular `group` first.
	{ from: "2.0.0", to: "2.1.0", apply: keepContent },
	{ from: "2.1.0", to: "2.2.0", apply: keepContent },
	{ from: "2.2.0", to: "2.3.0", apply: addSubjectOrder },
	// Only loosens: `current` became optional, so a 2.3.0 document already parses.
	{ from: "2.3.0", to: "2.4.0", apply: keepContent },
];
const byVersion = new Map(migrations.map((migration) => [migration.from, migration]));

/**
 * Advance a compatible old schema without changing its authored content.
 */
function keepContent(): void {
	// The boundary's canonical validation is the compatibility check.
}

/**
 * A schema version in a document, when it can be ordered numerically.
 * @param version The written version.
 * @returns Its parts or null.
 */
function versionParts(version: string): number[] | null {
	if (!/^\d+\.\d+\.\d+$/u.test(version)) return null;
	return version.split(".").map(Number);
}

/**
 * Whether one valid version precedes another.
 * @param version The written version.
 * @param target The current version.
 * @returns Whether it precedes the target.
 */
function before(version: string, target: string): boolean {
	const left = versionParts(version);
	const right = versionParts(target);
	if (left === null || right === null) return false;
	for (let part = 0; part < 3; part += 1) {
		if (left[part] !== right[part]) return left[part]! < right[part]!;
	}
	return false;
}

/**
 * Apply every registered step up to this build's contract. Unknown older
 * versions are refused rather than guessed at. A future version is left for
 * the canonical parser to accept or refuse according to its own contract.
 * @param value The decoded document.
 * @returns The upgraded document or a missing-path refusal.
 */
function migrateSemanticBoardDocument(value: unknown): MigrationResult {
	if (!isRecord(value) || typeof value["schemaVersion"] !== "string") {
		return { ok: true, value, changed: false };
	}
	let version = value["schemaVersion"];
	if (!before(version, SEMANTIC_BOARD_SCHEMA_VERSION)) {
		return { ok: true, value, changed: false };
	}
	const visited = new Set<string>();
	while (before(version, SEMANTIC_BOARD_SCHEMA_VERSION)) {
		const step = nextStep(version, visited);
		if (step === null) {
			return {
				ok: false,
				problem: `no safe migration from semantic board schema ${version} to ${SEMANTIC_BOARD_SCHEMA_VERSION}`,
			};
		}
		visited.add(version);
		step.apply(value);
		value["schemaVersion"] = step.to;
		version = step.to;
	}
	return { ok: true, value, changed: true };
}

/**
 * The next safe migration step, if one exists.
 * @param version The current document version.
 * @param visited Versions already migrated in this run.
 * @returns The next step or null.
 */
function nextStep(version: string, visited: ReadonlySet<string>): Migration | null {
	const step = byVersion.get(version);
	return step !== undefined && !visited.has(version) && before(version, step.to) ? step : null;
}

/**
 * Whether a decoded value is a non-array object.
 * @param value The decoded value.
 * @returns Whether it is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export { migrateSemanticBoardDocument };

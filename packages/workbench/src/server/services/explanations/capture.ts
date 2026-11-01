import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "@archboard/diagnostics/logger";
import type { Entry, Reading } from "#server/services/explanations/contract.ts";

/**
 * Release a delivery file once no consumer can need it.
 * @param entry The action that owns the temporary file.
 */
function releaseCapture(entry: Entry): void {
	if (entry.captureDirectory === undefined) return;
	try {
		rmSync(entry.captureDirectory, { recursive: true, force: true });
		delete entry.captureDirectory;
	} catch (error) {
		logger.error("Cannot remove a temporary explanation capture:", error);
	}
}

/**
 * Refuse a pending delivery after its tab or generation ends.
 * @param entry The captured action.
 */
function requireActiveCapture(entry: Entry): void {
	if (entry.retired === true) throw new Error("The explanation session ended.");
}

/** How many names an action says before it counts the rest. */
const NAMES_SHOWN = 2;

/**
 * What an action is about, in the words of the model.
 * @param model The captured reading.
 * @returns The subjects by name, its flow, or else the reading as a whole.
 */
function aboutOf(model: Reading): string {
	const { request } = model.explanation!;
	const flows = model.collections.flatMap((collection) => collection.flows);
	const named = new Map([...model.modules, ...flows].map(({ id, name }) => [id, name]));
	const words = request.subjects.map((id) => {
		const line = model.relationships.find((relationship) => relationship.id === id);
		const ends = line === undefined ? [id] : [line.from, line.to];
		return ends.map((end) => named.get(end) ?? "one subject").join(" to ");
	});
	if (words.length > NAMES_SHOWN)
		return `${words.slice(0, NAMES_SHOWN).join(", ")} and ${words.length - NAMES_SHOWN} more`;
	if (words.length > 0) return words.join(" and ");
	return named.get(request.reading.flow ?? "") ?? "this reading";
}

/**
 * Materialize the complete captured reading before its existing queue admits a bounded reference.
 * @param entry The immutable action capture.
 * @returns The prompt for the existing workhorse.
 */
function capturePrompt(entry: Entry): string {
	requireActiveCapture(entry);
	entry.captureDirectory ??= mkdtempSync(join(tmpdir(), "archboard-explanation-"));
	const captureFile = join(entry.captureDirectory, "capture.json");
	try {
		writeFileSync(captureFile, JSON.stringify({ vault: entry.vault, ...entry.model }), {
			flag: "wx",
			mode: 0o600,
		});
	} catch (error) {
		releaseCapture(entry);
		throw error;
	}
	return `Explain ${entry.action.about} from the captured reading.\n${JSON.stringify({ captureFile })}`;
}

/**
 * Retire a temporary action and prevent late materialization by pending delivery.
 * @param entry The action whose tab or generation ended.
 */
function retireCapture(entry: Entry): void {
	entry.retired = true;
	releaseCapture(entry);
}

export { aboutOf, capturePrompt, releaseCapture, requireActiveCapture, retireCapture };

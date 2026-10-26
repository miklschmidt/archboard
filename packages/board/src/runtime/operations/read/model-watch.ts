import { LOCK_WATCH_MS } from "@archboard/timing";
import type { ArchitectureModelRead, ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureEvent } from "#shared/schemas/model-operations.ts";
import { readArchitectureModel } from "#runtime/operations/read/model-read.ts";
import { readArchitectureClaims } from "#runtime/operations/model-edit/claims.ts";
import { onArchitectureNews, type Completion } from "#runtime/store/model-news.ts";

/**
 * Identify completed subjects, or the full set affected by external observation.
 * @param latest The latest value.
 * @param previous The previous value.
 * @param completion The durable edit result, when locally known.
 * @returns The operation result.
 */
function changedSubjects(
	latest: ArchitectureModel,
	previous: ArchitectureModelRead,
	completion?: Completion,
) {
	if (completion !== undefined && completion.after.digest === latest.revision.digest)
		return { subjects: completion.subjects, reason: "completed" as const, operation: completion };
	const prior = previous.success ? previous.modules.map((module) => module.id) : [];
	return {
		subjects: [...new Set([...prior, ...latest.modules.map((module) => module.id)])],
		reason: "external" as const,
	};
}
/**
 * Translate one coherent observation without interpreting external edits as adoption.
 * @param vault The explicitly addressed vault.
 * @param latest The latest value.
 * @param previous The previous value.
 * @param completion The durable edit result, when locally known.
 * @returns The operation result.
 */
function readingEvent(
	vault: string,
	latest: ArchitectureModelRead,
	previous: ArchitectureModelRead,
	completion?: Completion,
): ArchitectureEvent {
	if (!latest.success) return { type: "architecture_status", vault, reading: latest };
	return {
		type: "architecture_changed",
		vault,
		model: latest.manifest.id,
		state: latest.manifest.current?.id ?? null,
		revision: latest.revision,
		...changedSubjects(latest, previous, completion),
	};
}
/**
 * Send a fresh coherent snapshot and subsequent durable or stable external changes.
 * @param vault The explicitly addressed vault.
 * @param listener The consumer of fresh readings and news.
 * @returns The function that closes the subscription.
 */
function watchArchitectureModel(
	vault: string,
	listener: (event: ArchitectureEvent) => void,
): () => void {
	let reading = readArchitectureModel(vault);
	let claims = readArchitectureClaims(vault);
	listener({ type: "architecture_snapshot", vault, reading, claims });
	/**
	 * Observe current files and claims after a local completion or disk poll.
	 * @param completion The durable edit result, when locally known.
	 */
	function refresh(completion?: Completion): void {
		const latest = readArchitectureModel(vault);
		const latestClaims = readArchitectureClaims(vault);
		if (JSON.stringify(claims) !== JSON.stringify(latestClaims)) {
			claims = latestClaims;
			listener({ type: "architecture_claims", vault, claims });
		}
		if (JSON.stringify(latest) === JSON.stringify(reading)) return;
		const previous = reading;
		reading = latest;
		listener(readingEvent(vault, latest, previous, completion));
	}
	const unsubscribe = onArchitectureNews(vault, refresh);
	// Claims and foreign inputs share the existing disk-observation cadence.
	const timer = setInterval(refresh, LOCK_WATCH_MS);
	timer.unref();
	return () => {
		clearInterval(timer);
		unsubscribe();
	};
}
export { watchArchitectureModel };

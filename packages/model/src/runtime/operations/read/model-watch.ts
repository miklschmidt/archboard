import { MODEL_LOCK_MS } from "@archboard/timing";
import { logger } from "@archboard/diagnostics/logger";
import type {
	ArchitectureModelRead,
	ArchitectureModel,
	ArchitectureSummary,
} from "#shared/schemas/model.ts";
import type { ArchitectureEvent } from "#shared/schemas/model-operations.ts";
import { readArchitectureModel } from "#runtime/operations/read/model-read.ts";
import { readArchitectureClaims } from "#runtime/operations/model-edit/claims.ts";
import { modelFilesToken } from "#runtime/store/model-files.ts";
import { modelBoundaryFailure } from "#runtime/store/model-state.ts";
import { onArchitectureNews, type Completion } from "#runtime/store/model-news.ts";
import { observeArchitectureHistory } from "#runtime/store/model-history-news.ts";

type Listener = (event: ArchitectureEvent) => void;

/** The one observation of a vault, shared by every socket, the activity tracker and agent context. */
const observations = new Map<string, ReturnType<typeof observeVault>>();

/**
 * Reduce a reading to what a follower decides from: readers fetch content over HTTP.
 * @param reading The coherent reading or its refusal.
 * @returns Its identity, or the refusal.
 */
function summaryOf(reading: ArchitectureModelRead): ArchitectureSummary {
	if (!reading.success) return reading;
	const { id, name } = reading.manifest;
	return { success: true, manifest: { id, name }, digest: reading.revision.digest };
}

/**
 * Identify completed subjects, or the full set affected by external observation.
 * @param latest The latest value.
 * @param previous The module identities of the previous reading.
 * @param completion The durable edit result, when locally known.
 * @returns The operation result.
 */
function changedSubjects(
	latest: ArchitectureModel,
	previous: readonly string[],
	completion?: Completion,
) {
	if (completion !== undefined && completion.after.digest === latest.revision.digest)
		return { subjects: completion.subjects, reason: "completed" as const, operation: completion };
	return {
		subjects: [...new Set([...previous, ...latest.modules.map((module) => module.id)])],
		reason: "external" as const,
	};
}
/**
 * Translate one coherent observation without interpreting external edits as adoption.
 * @param vault The explicitly addressed vault.
 * @param latest The latest value.
 * @param previous The module identities of the previous reading.
 * @param completion The durable edit result, when locally known.
 * @returns The operation result.
 */
function readingEvent(
	vault: string,
	latest: ArchitectureModelRead,
	previous: readonly string[],
	completion?: Completion,
): ArchitectureEvent {
	if (!latest.success) return { type: "architecture_status", vault, reading: latest };
	return {
		type: "architecture_changed",
		vault,
		model: latest.manifest.id,
		name: latest.manifest.name,
		state:
			completion === undefined ? (latest.manifest.current?.id ?? null) : completion.target.state,
		revision: latest.revision,
		...changedSubjects(latest, previous, completion),
	};
}

/**
 * Keep incomplete installations pending and announce each observed checkpoint once.
 * @returns The reader of the next durable completion, and whether one still waits.
 */
function completionReader() {
	const announced = new Set<string>();
	let pending: Completion | undefined;
	return {
		/**
		 * Whether a completion still waits for a coherent reading.
		 * @returns True while one waits.
		 */
		waiting: () => pending !== undefined,
		/**
		 * Take the next completion that a coherent reading can announce.
		 * @param latest The latest reading.
		 * @param completion The durable edit result, when locally known.
		 * @returns The completion to announce, when one exists.
		 */
		next(latest: ArchitectureModelRead, completion?: Completion) {
			if (completion !== undefined) pending = completion;
			if (!latest.success) return undefined;
			if (pending === undefined) return undefined;
			const candidate = pending;
			pending = undefined;
			if (announced.has(candidate.checkpoint.id)) return undefined;
			announced.add(candidate.checkpoint.id);
			return candidate;
		},
	};
}

/**
 * Identify what a current reading depends on without reading any input bytes.
 * Taken before a read, so a write that lands during the read yields a new token.
 * @param vault The explicitly addressed vault.
 * @returns A token that stays equal while a read would return the same answer.
 */
function observationToken(vault: string): string {
	return `${JSON.stringify(modelBoundaryFailure(vault) ?? null)}\n${modelFilesToken(vault)}`;
}

/**
 * Read a vault once, then compare metadata each poll and read again only after a change.
 * @param vault The explicitly addressed vault.
 * @returns The running observation of the vault.
 */
function observeVault(vault: string) {
	const listeners = new Set<Listener>();
	let token = observationToken(vault);
	const first = readArchitectureModel(vault);
	let summary = summaryOf(first);
	let modules = first.success ? first.modules.map((module) => module.id) : [];
	let claims = readArchitectureClaims(vault);
	const completedNews = completionReader();
	const retained = observeArchitectureHistory(vault, (completion) => refresh(completion));
	/**
	 * Tell every follower, so that one failing follower never silences the others.
	 * @param event The event.
	 */
	function announce(event: ArchitectureEvent): void {
		for (const listener of listeners) {
			try {
				listener(event);
			} catch (error) {
				logger.warn("Architecture follower failed.", { error });
			}
		}
	}
	/** Announce claims that moved, which includes a claim that ran out. */
	function refreshClaims(): void {
		const latest = readArchitectureClaims(vault);
		if (JSON.stringify(claims) === JSON.stringify(latest)) return;
		claims = latest;
		announce({ type: "architecture_claims", vault, claims });
	}
	/**
	 * Read the model and announce what moved.
	 * @param completion The durable edit result, when locally known.
	 */
	function refreshReading(completion?: Completion): void {
		const latest = readArchitectureModel(vault);
		const completed = completedNews.next(latest, completion);
		const latestSummary = summaryOf(latest);
		if (JSON.stringify(latestSummary) === JSON.stringify(summary) && completed === undefined)
			return;
		const previous = modules;
		summary = latestSummary;
		modules = latest.success ? latest.modules.map((module) => module.id) : modules;
		announce(readingEvent(vault, latest, previous, completed));
	}
	/**
	 * Observe current files and claims after a local completion or disk poll.
	 * @param completion The durable edit result, when locally known.
	 */
	function refresh(completion?: Completion): void {
		retained.poll();
		refreshClaims();
		const observed = observationToken(vault);
		if (completion === undefined && observed === token && !completedNews.waiting()) return;
		token = observed;
		refreshReading(completion);
	}
	const unsubscribe = onArchitectureNews(vault, refresh);
	retained.poll();
	// Claims and foreign inputs share the existing disk-observation cadence.
	const timer = setInterval(refresh, MODEL_LOCK_MS.watch);
	timer.unref();
	return {
		/**
		 * Add a follower, which hears the latest observation first.
		 * @param listener The consumer of fresh readings and news.
		 * @returns The function that removes it, and stops the observation with the last one.
		 */
		follow(listener: Listener): () => void {
			refresh();
			listeners.add(listener);
			listener({ type: "architecture_snapshot", vault, reading: summary, claims });
			return () => {
				listeners.delete(listener);
				if (listeners.size > 0) return;
				clearInterval(timer);
				unsubscribe();
				retained.stop();
				observations.delete(vault);
			};
		},
	};
}

/**
 * Follow a vault through its one shared observation: a summary, then durable or stable external changes.
 * @param vault The explicitly addressed vault.
 * @param listener The consumer of fresh readings and news.
 * @returns The function that closes the subscription.
 */
function watchArchitectureModel(vault: string, listener: Listener): () => void {
	let observation = observations.get(vault);
	if (observation === undefined) {
		observation = observeVault(vault);
		observations.set(vault, observation);
	}
	return observation.follow(listener);
}
export { watchArchitectureModel };

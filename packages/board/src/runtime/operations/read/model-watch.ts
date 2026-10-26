import { LOCK_WATCH_MS } from "@archboard/timing";
import type { ArchitectureEvent } from "#shared/schemas/model-operations.ts";
import { readArchitectureModel } from "#runtime/operations/read/model-read.ts";
import { readArchitectureClaims } from "#runtime/operations/model-edit/claims.ts";
import { onArchitectureNews, type Completion } from "#runtime/store/model-news.ts";

/** Send fresh coherent inputs on connection, then invalidations after durable or stable external changes. */
function watchArchitectureModel(
	vault: string,
	listener: (event: ArchitectureEvent) => void,
): () => void {
	let reading = readArchitectureModel(vault);
	let claims = readArchitectureClaims(vault);
	listener({ type: "architecture_snapshot", vault, reading, claims });
	/** Observe the complete current input set without interpreting archive order as adoption. */
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
		if (!latest.success) {
			listener({ type: "architecture_status", vault, reading: latest });
			return;
		}
		const completed = completion?.after.digest === latest.revision.digest;
		listener({
			type: "architecture_changed",
			vault,
			model: latest.manifest.id,
			state: latest.manifest.current?.id ?? null,
			revision: latest.revision,
			subjects: completed
				? completion.subjects
				: [
						...new Set([
							...(previous.success ? previous.modules.map((module) => module.id) : []),
							...latest.modules.map((module) => module.id),
						]),
					],
			reason: completed ? "completed" : "external",
		});
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

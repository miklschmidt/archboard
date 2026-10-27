// One replaceable activity snapshot per vault, shared by every pane.
// Canonical claims permit several writers on separate subjects of one model.
// Only the ordinary model feed can supply claims and durable doing attribution.
import { watchArchitectureModel } from "@archboard/board/store-read";
import type { ArchitectureEvent, ArchitectureClaim } from "@archboard/board/model";
import type { AgentActivityMessage } from "@archboard/server-lifecycle/pane-messages";
import { CLAIM_MS } from "@archboard/timing";

type AgentActivity = AgentActivityMessage["activity"][number];

interface Entry {
	activity: AgentActivity;
	linger: ReturnType<typeof setTimeout> | null;
}

/**
 * Own activity snapshots, canonical subscriptions, and idle cleanup for one server.
 * @param send Sends a complete vault snapshot to every pane.
 * @returns The server-owned tracker.
 */
function createAgentActivity(send: (message: AgentActivityMessage) => void) {
	const entries = new Map<string, Entry>();
	const watched = new Map<string, () => void>();
	let stopped = false;

	/**
	 * Replace one vault's public snapshot, including an empty cleanup message.
	 * @param vault The explicitly addressed vault.
	 */
	function publish(vault: string): void {
		const entry = entries.get(vault);
		const message: AgentActivityMessage = {
			type: "agent_activity",
			vault,
			activity: entry === undefined ? [] : [entry.activity],
		};
		send(message);
	}
	/**
	 * Cancel the idle timer before replacing or removing an entry.
	 * @param entry The owned entry.
	 */
	function clearLinger(entry: Entry): void {
		if (entry.linger !== null) clearTimeout(entry.linger);
		entry.linger = null;
	}
	/**
	 * Remove idle activity or replace a previous model identity.
	 * @param vault The explicitly addressed vault.
	 */
	function forget(vault: string): void {
		const entry = entries.get(vault);
		if (entry === undefined) return;
		clearLinger(entry);
		entries.delete(vault);
		publish(vault);
	}
	/**
	 * Keep the last durable line visible briefly after all claims end.
	 * @param vault The explicitly addressed vault.
	 * @param entry The idle entry.
	 */
	function linger(vault: string, entry: Entry): void {
		entry.linger = setTimeout(() => forget(vault), CLAIM_MS.activityLinger);
		entry.linger.unref();
	}
	/**
	 * Read or create a snapshot for this exact canonical model.
	 * @param vault The explicitly addressed vault.
	 * @param model The stable model identity.
	 * @returns The entry.
	 */
	function entryFor(vault: string, model: string): Entry {
		const previous = entries.get(vault);
		if (previous?.activity.model === model) return previous;
		forget(vault);
		const entry: Entry = {
			activity: { board: `model:${model}`, model, claims: [], doing: null },
			linger: null,
		};
		entries.set(vault, entry);
		return entry;
	}
	/**
	 * Publish current work or begin idle cleanup after its last claim ends.
	 * @param vault The explicitly addressed vault.
	 * @param entry The latest activity.
	 */
	function updated(vault: string, entry: Entry): void {
		clearLinger(entry);
		if (entry.activity.claims.length === 0) {
			if (entry.activity.doing === null) {
				forget(vault);
				return;
			}
			linger(vault, entry);
		}
		publish(vault);
	}
	/**
	 * Preserve each live subject claim without inventing exclusive model ownership.
	 * @param vault The explicitly addressed vault.
	 * @param claims The ordinary runtime's complete live claim list.
	 */
	function claimsChanged(vault: string, claims: ArchitectureClaim[]): void {
		const model = claims[0]?.target.model ?? entries.get(vault)?.activity.model;
		if (model === undefined) return;
		const entry = entryFor(vault, model);
		entry.activity = { ...entry.activity, claims };
		updated(vault, entry);
	}
	/**
	 * Attribute a line only after the runtime announces durable completion.
	 * @param event The ordinary model change.
	 */
	function doingLanded(event: Extract<ArchitectureEvent, { type: "architecture_changed" }>): void {
		if (event.operation === undefined) return;
		const entry = entryFor(event.vault, event.model);
		const { request, createdAt } = event.operation.checkpoint;
		entry.activity = {
			...entry.activity,
			doing: { writer: request.writer, doing: request.doing, at: createdAt },
		};
		updated(event.vault, entry);
	}
	/**
	 * Consume canonical claims and durable operations. Temporary read failures end neither.
	 * @param event The runtime event.
	 */
	function receive(event: ArchitectureEvent): void {
		switch (event.type) {
			case "architecture_snapshot":
			case "architecture_claims":
				if (event.claims.success) claimsChanged(event.vault, event.claims.claims);
				break;
			case "architecture_changed":
				doingLanded(event);
				break;
			case "architecture_status":
				break;
		}
	}
	return {
		/**
		 * Follow an explicitly addressed or registered vault once.
		 * @param vault The canonical vault path.
		 */
		follow(vault: string): void {
			if (stopped || watched.has(vault)) return;
			watched.set(vault, watchArchitectureModel(vault, receive));
		},
		/**
		 * Fresh complete activity for a newly admitted or returning pane.
		 * @returns Every active vault snapshot.
		 */
		snapshots: (): AgentActivityMessage[] =>
			[...entries].map(([vault, entry]) => ({
				type: "agent_activity",
				vault,
				activity: [entry.activity],
			})),
		/** Stop every owned subscription and timer when the server stops. */
		dispose(): void {
			stopped = true;
			for (const stop of watched.values()) stop();
			for (const entry of entries.values()) clearLinger(entry);
			watched.clear();
			entries.clear();
		},
	};
}
export { createAgentActivity };

import { resolve } from "node:path";
import { logger } from "@archboard/diagnostics/logger";
import type { ArchitectureModuleEditResult } from "#shared/schemas/model-operations.ts";
type Completion = Extract<ArchitectureModuleEditResult, { success: true }>;
const observers = new Map<string, Set<(completion?: Completion) => void>>();
/**
 * Subscribe to local durable news while disk observation covers other processes.
 * @param vault The explicitly addressed vault.
 * @param listener The consumer of fresh readings and news.
 * @returns The function that removes the subscription.
 */
function onArchitectureNews(
	vault: string,
	listener: (completion?: Completion) => void,
): () => void {
	const key = resolve(vault);
	const listeners = observers.get(key) ?? new Set();
	listeners.add(listener);
	observers.set(key, listeners);
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0) observers.delete(key);
	};
}
/**
 * Notify only after the installation lease releases its durable outcome.
 * @param vault The explicitly addressed vault.
 * @param completion The durable edit result, when locally known.
 */
function notifyArchitecture(vault: string, completion?: Completion): void {
	for (const listener of observers.get(resolve(vault)) ?? []) {
		try {
			listener(completion);
		} catch (error) {
			logger.warn("Architecture observer failed after durable completion.", { error });
		}
	}
}
export { onArchitectureNews, notifyArchitecture, type Completion };

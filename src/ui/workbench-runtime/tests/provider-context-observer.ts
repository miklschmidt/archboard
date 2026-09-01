import { useAui } from "@assistant-ui/react";
import { createElement, useSyncExternalStore } from "react";

export interface ProviderContextObservation {
	readonly client: ReturnType<typeof useAui>;
	readonly thread: ReturnType<ReturnType<typeof useAui>["thread"]["getState"]>;
}

export function ProviderContextObserver({
	onObserve,
	status,
}: {
	readonly onObserve: (observation: ProviderContextObservation) => void;
	readonly status: string;
}) {
	const client = useAui();
	const thread = useSyncExternalStore(
		(listener) => client.subscribe(listener),
		() => client.thread.getState(),
		() => client.thread.getState(),
	);
	onObserve({ client, thread });
	return createElement("span", { "data-observer": "provider-context" }, status);
}

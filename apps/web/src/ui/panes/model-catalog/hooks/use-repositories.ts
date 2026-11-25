// The repositories of this machine, for a component that lists or resolves them.

import { useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

import {
	repositoryMirror,
	type Repositories,
} from "#ui/panes/model-catalog/clients/repositories.ts";

/**
 * The repositories of this machine, kept current by the server while anything reads them.
 * @returns The repositories once the server sent them, why there are none, and whether it has
 * answered yet.
 */
function useRepositories(): Repositories {
	const mirror = repositoryMirror(useQueryClient());
	return useSyncExternalStore(mirror.subscribe, mirror.read);
}

export { useRepositories };

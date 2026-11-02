import type { JSX } from "react";
import { shownRepository } from "@archboard/ui-kit/components";
import { ArchitectureReadError } from "#ui/clients/architecture-model/queries.ts";
import { ModelError, type ModelErrorProps } from "#ui/components/architecture-model/ModelFrame.tsx";
import { ModelState } from "#ui/components/architecture-model/ModelState.tsx";
import { useSlowWait } from "#ui/hooks/architecture-model/use-slow-wait.ts";

/**
 * Which refusal says that a repository has no model to read, as a state and not a fault.
 * @param error The selected request failure.
 * @returns Its code, or null.
 */
function unreadRefusal(error: Error | null): "LEGACY_AUTHORITY" | "MODEL_NOT_FOUND" | null {
	if (!(error instanceof ArchitectureReadError)) return null;
	const { code } = error.failure;
	return code === "LEGACY_AUTHORITY" || code === "MODEL_NOT_FOUND" ? code : null;
}

/**
 * Whether a failure is a state of the repository.
 * @param error The selected request failure.
 * @returns True when the repository has no model to read.
 */
function isUnread(error: Error | null): boolean {
	return unreadRefusal(error) !== null;
}

/**
 * What a read that left no model says: the state of the repository, or the failure.
 * @param props The failure.
 * @param props.error The selected request failure.
 * @param props.problem The visible problem.
 * @returns The state, or nothing while no answer has come.
 */
function ModelUnanswered(props: {
	readonly error: Error | null;
	readonly problem: ModelErrorProps | null;
}): JSX.Element | null {
	const { problem } = props;
	if (problem === null) return null;
	const unread = unreadRefusal(props.error);
	if (unread === "LEGACY_AUTHORITY") return <ModelMigrationRequired />;
	if (unread === "MODEL_NOT_FOUND") return <ModelAbsent />;
	return <ModelError {...problem} />;
}

/**
 * Say so when a first read lasts, and name what it reads.
 * @param props The read.
 * @param props.pending Whether it has no answer yet.
 * @param props.destination The repository or model it reads.
 * @returns The message, once the wait is long enough to name.
 */
function SlowRead(props: {
	readonly pending: boolean;
	readonly destination: string | null | undefined;
}): JSX.Element | null {
	const destination = props.destination ?? "architecture";
	const slow = useSlowWait(props.pending ? destination : null);
	if (!slow) return null;
	return <ModelState.Waiting>Reading {shownRepository(destination).name}…</ModelState.Waiting>;
}

/**
 * A repository that stores models keeps them until an owner approves a migration.
 * @returns What it needs and the way to its preview.
 */
function ModelMigrationRequired(): JSX.Element {
	return (
		<ModelState slot="model-migration-required">
			<ModelState.Title>Migration required</ModelState.Title>
			<ModelState.Line>
				This repository stores its architecture as boards. A migration opens it as modules, and its
				files stay unchanged until you apply it.
			</ModelState.Line>
			<ModelState.Ask
				label="Ask the agent for a migration preview"
				draft="Prepare a migration preview of this repository's boards. Do not apply the migration."
			/>
		</ModelState>
	);
}

/**
 * A repository with a vault that holds no model yet.
 * @returns What it lacks and the way to its first model.
 */
function ModelAbsent(): JSX.Element {
	return (
		<ModelState slot="model-absent">
			<ModelState.Title>No model yet</ModelState.Title>
			<ModelState.Line>
				An agent can read this repository and write its first model.
			</ModelState.Line>
			<ModelState.Ask
				label="Ask the agent to write it"
				draft="Read this repository and write its first architecture model."
			/>
		</ModelState>
	);
}

export { isUnread, ModelUnanswered, SlowRead };

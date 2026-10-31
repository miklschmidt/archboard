import type { JSX } from "react";
import { ModelState } from "#ui/components/architecture-model/ModelState.tsx";

/**
 * A repository that stores boards keeps them until an owner approves a migration.
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
			<ModelState.Line>An agent can read this repository and write its first model.</ModelState.Line>
			<ModelState.Ask
				label="Ask the agent to write it"
				draft="Read this repository and write its first architecture model."
			/>
		</ModelState>
	);
}

export { ModelAbsent, ModelMigrationRequired };

import type { JSX } from "react";

/**
 * Keep the old format unchanged until an owner approves its explicit migration.
 * @returns A read-only route to migration preview and review.
 */
function ModelMigrationRequired(): JSX.Element {
	return (
		<section data-slot="model-migration-required" className="text-body max-w-prose space-y-4 p-10">
			<h3 className="text-title font-semibold">Migration required</h3>
			<p>
				This repository stores architecture as boards. Prepare a migration preview with your local
				agent to open it as modules.
			</p>
			<p>
				Review the proposed module identities and relationships. Apply the approved preview when you
				are ready.
			</p>
			<p className="text-muted-foreground">
				The current files stay unchanged until you apply the migration. Existing history remains
				available afterward.
			</p>
		</section>
	);
}

export { ModelMigrationRequired };

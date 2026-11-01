import type { JSX } from "react";
import type { Publication } from "#ui/clients/architecture-model/publication.ts";

/**
 * Keep remote retention limits and actionable exchange failures visible.
 * @param props The locally read status and latest explicit attempt.
 * @param props.status The current publication evidence.
 * @param props.attempt The last action's outcome.
 * @returns The retention limitation and any failed action.
 */
function PublicationDetails(props: {
	status: Publication;
	attempt: Publication | undefined;
}): JSX.Element {
	const { retention } = props.status;
	const failure = props.attempt?.success === false ? props.attempt : undefined;
	return (
		<>
			{retention !== undefined && (
				<details
					data-slot="publication-retention"
					data-protected={retention.protected}
					className="text-body text-muted-foreground mt-2 max-w-prose"
				>
					<summary>Remote history protection is not established</summary>
					<p className="mt-2">{retention.limitation}</p>
					<p className="mt-2">{retention.recovery}</p>
				</details>
			)}
			{failure !== undefined && (
				<div
					role="alert"
					data-slot="publication-failure"
					data-code={failure.code}
					className="text-body mt-3 max-w-prose space-y-2"
				>
					<p>{failure.error}</p>
					{[...new Set(failure.diagnostics.map((entry) => entry.recovery))].map((recovery) => (
						<p key={recovery}>{recovery}</p>
					))}
				</div>
			)}
		</>
	);
}

const publicationLabel = {
	"saved-locally": "Saved locally",
	"publication-pending": "Publication pending",
	published: "Published",
	unavailable: "History unavailable locally",
} satisfies Record<Extract<Publication, { success: true }>["publication"], string>;

export { PublicationDetails, publicationLabel };

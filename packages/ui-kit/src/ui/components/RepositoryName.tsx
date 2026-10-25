import { RiGithubLine } from "@remixicon/react";
import type { ComponentProps, JSX } from "react";

import { cn } from "#ui/rules/class-names.ts";
import { shownRepository } from "#ui/rules/shown-name.ts";

/** GitHub's mark, which stands in for the host of a repository on GitHub. */
const GitHubMark = RiGithubLine;

/** Inputs for a repository's name: its identity, and the span's own attributes. */
type RepositoryNameProps = Omit<ComponentProps<"span">, "children"> & {
	/** The repository's identity, or an untracked vault's registry name. */
	readonly identity: string;
};

/**
 * A repository's name: GitHub's mark and the owner and name for a repository on
 * GitHub, else the whole identity. The whole identity shows on hover, and
 * assistive technology reads it whole, the host included.
 * @param props The identity, and the span's own attributes.
 * @returns The name.
 */
function RepositoryNameRoot(props: RepositoryNameProps): JSX.Element {
	const { identity, className, ...rest } = props;
	const shown = shownRepository(identity);
	return (
		<span
			data-slot="repository-name"
			title={identity}
			{...rest}
			className={cn("truncate", className)}
		>
			{shown.onGitHub && (
				<>
					<GitHubMark aria-hidden="true" className="mr-1.5 inline size-3.5 align-[-0.125em]" />
					<span className="sr-only">{identity.slice(0, identity.length - shown.name.length)}</span>
				</>
			)}
			{shown.name}
		</span>
	);
}

/** A repository's name, with GitHub's mark, which stands in for the host on GitHub, as its part. */
const RepositoryName = Object.assign(RepositoryNameRoot, { GitHubMark });

export { RepositoryName };

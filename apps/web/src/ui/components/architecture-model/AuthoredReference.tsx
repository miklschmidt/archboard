import type { JSX } from "react";
import type { Model } from "@archboard/board/content";

interface ReferenceProps {
	reference: NonNullable<Model["modules"][number]["binding"]>;
}

/**
 * Show the authored repository evidence without resolving another architecture reading.
 * @param props An authored binding or document reference.
 * @returns Its repository, path, and any pinned revision.
 */
function AuthoredReference(props: ReferenceProps): JSX.Element {
	const { reference } = props;
	const revision = reference.commit ?? reference.branch;
	return (
		<span className="block space-y-1">
			<span className="text-muted-foreground block break-all">{reference.repo}</span>
			<code className="block break-all">
				{reference.path}
				{reference.symbol && <> · {reference.symbol}</>}
			</code>
			{revision && <code className="text-muted-foreground block break-all">{revision}</code>}
		</span>
	);
}

export { AuthoredReference };

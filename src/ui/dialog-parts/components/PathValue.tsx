// A long path, shown by the name a person knows it by and then in full.

import type { JSX } from "react";

/** Inputs for a path value. */
interface PathValueProps {
	path: string;
}

/**
 * A long path: its folder or file name first, then the whole path in the
 * mono face, clamped to three lines with the full text as a title.
 * @param props The path.
 * @returns The named path.
 */
function PathValue(props: PathValueProps): JSX.Element {
	const { path } = props;
	return (
		<span title={path} className="text-technical inline-flex min-w-0 flex-col font-mono">
			<span className="text-foreground font-medium">{pathName(path)}</span>
			<span className="text-muted-foreground line-clamp-3 break-all">{path}</span>
		</span>
	);
}

/**
 * The last segment of a path: the folder or file a person knows it by.
 * @param path An absolute path, with either separator.
 * @returns The final non-empty segment, or the path itself.
 */
function pathName(path: string): string {
	const segments = path.split(/[\\/]/u).filter((segment) => segment !== "");
	return segments.at(-1) ?? path;
}

export { PathValue, type PathValueProps };

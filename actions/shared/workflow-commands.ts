// GitHub workflow commands: the `::error::` family that puts a message on a pull request's
// diff, and the files that carry an action's outputs and job summary. Pure: callers write.

/** The severities a workflow command annotates with. */
type AnnotationLevel = "error" | "warning" | "notice";

/** Where and under what title an annotation shows. A file with no line anchors at the file. */
interface AnnotationProperties {
	/** The path relative to the repository root, so that it lands on the pull request's diff. */
	readonly file?: string | undefined;
	readonly line?: number | undefined;
	readonly title?: string | undefined;
}

/** GitHub drops annotations of one level beyond this many in a step. */
const ANNOTATION_LIMIT_PER_LEVEL = 10;

/**
 * Escape the message of a workflow command.
 * @param value The text.
 * @returns The text with `%`, carriage returns and newlines percent-encoded.
 */
function escapeData(value: string): string {
	return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

/**
 * Escape a property of a workflow command, which also ends at `:` and `,`.
 * @param value The text.
 * @returns The text, percent-encoded.
 */
function escapeProperty(value: string): string {
	return escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

/**
 * One workflow command line.
 * @param level The command: error, warning or notice.
 * @param properties The file, line and title.
 * @param message The annotation's text.
 * @returns The line to print on standard output.
 */
function annotationLine(
	level: AnnotationLevel,
	properties: AnnotationProperties,
	message: string,
): string {
	const named: [string, string | undefined][] = [
		["file", properties.file],
		["line", properties.line === undefined ? undefined : String(properties.line)],
		["title", properties.title],
	];
	const list = named
		.flatMap(([key, value]) => (value === undefined ? [] : [`${key}=${escapeProperty(value)}`]))
		.join(",");
	return `::${level}${list === "" ? "" : ` ${list}`}::${escapeData(message)}`;
}

/** One annotation before it is written. */
interface Annotation {
	readonly level: AnnotationLevel;
	readonly properties: AnnotationProperties;
	readonly message: string;
}

/**
 * Keep the first annotations of each level that GitHub will show, and count the rest.
 * @param annotations The annotations in the order they should win.
 * @returns The kept annotations and how many were over the limit.
 */
function withinLimit(annotations: readonly Annotation[]): { kept: Annotation[]; dropped: number } {
	const seen = new Map<AnnotationLevel, number>();
	const kept = annotations.filter((annotation) => {
		const count = (seen.get(annotation.level) ?? 0) + 1;
		seen.set(annotation.level, count);
		return count <= ANNOTATION_LIMIT_PER_LEVEL;
	});
	return { kept, dropped: annotations.length - kept.length };
}

/**
 * The lines of a `GITHUB_OUTPUT` file for some outputs.
 * @param outputs The output names and their one-line values.
 * @returns The text to append.
 */
function outputLines(outputs: Readonly<Record<string, string>>): string {
	return Object.entries(outputs)
		.map(([name, value]) => `${name}=${value.replaceAll("\n", " ")}\n`)
		.join("");
}

export {
	ANNOTATION_LIMIT_PER_LEVEL,
	annotationLine,
	escapeData,
	escapeProperty,
	outputLines,
	withinLimit,
	type Annotation,
	type AnnotationLevel,
	type AnnotationProperties,
};

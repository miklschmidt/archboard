// The directory whose code a compose service runs (ADR 0046, TASK-367.23):
// the directory it builds its image from. The code check joins what the code
// there reads with the environment the service sets.
//
// That is the build context (`build: ./api`, `build: { context: ./api }`,
// and `.` when the mapping names none). Where the context is the compose
// file's own directory, it is the directory of the Dockerfile inside it, as a
// monorepo builds each service from its root with `dockerfile:
// api/Dockerfile`. A context that is a Git URL or an absolute path names no
// directory of the checkout. The service's mapping comes interpolated, as
// everywhere in a compose file: an interpolation takes the default the file
// writes, and a context that only an interpolation with no default writes is
// empty, which names no directory the check can read.

import { posix } from "node:path";

/** A context that names no directory of the checkout: a URL, a Git address, an absolute path. */
const ELSEWHERE = /^[a-z][\w+.-]*:\/\/|^git@|^\//iu;

/**
 * Whether a value is a mapping.
 * @param value The value.
 * @returns True for a plain object.
 */
function isMapping(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The build context a service writes.
 * @param build Its `build` value, interpolated.
 * @returns The context, normalized, or undefined when it names no directory here.
 */
function contextOf(build: unknown): string | undefined {
	const written = isMapping(build) ? (build["context"] ?? ".") : build;
	if (typeof written !== "string" || written === "") return undefined;
	const context = posix.normalize(written);
	return ELSEWHERE.test(context) ? undefined : context;
}

/**
 * The directory whose code a service runs, relative to its compose file.
 * @param body The service's mapping, interpolated.
 * @returns The directory, or undefined for a service that builds nothing here.
 */
function runsOf(body: Record<string, unknown>): string | undefined {
	const { build } = body;
	const context = contextOf(build);
	const dockerfile = isMapping(build) ? build["dockerfile"] : undefined;
	if (context !== "." || typeof dockerfile !== "string") return context;
	const directory = posix.dirname(posix.normalize(dockerfile));
	return directory.startsWith("..") || directory.startsWith("/") ? context : directory;
}

export { runsOf };

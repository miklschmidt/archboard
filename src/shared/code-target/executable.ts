/**
 * Tells whether an opener executable is spelled in a form the shell resolves
 * on its own: a bare command name looked up on PATH, or an absolute path on
 * either platform. A relative path with separators is neither and is refused.
 * @param value - The executable as written in the opener settings.
 * @returns True for a bare name or an absolute POSIX or Windows path.
 */
export function isAbsoluteOrBareOpenerExecutable(value: string): boolean {
	const hasSeparator = value.includes("/") || value.includes("\\");
	return (
		!hasSeparator ||
		value.startsWith("/") ||
		value.startsWith("\\") ||
		/^[A-Za-z]:[\\/]/u.test(value)
	);
}

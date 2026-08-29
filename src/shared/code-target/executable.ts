export function isAbsoluteOrBareOpenerExecutable(value: string): boolean {
	const hasSeparator = value.includes("/") || value.includes("\\");
	return (
		!hasSeparator ||
		value.startsWith("/") ||
		value.startsWith("\\") ||
		/^[A-Za-z]:[\\/]/.test(value)
	);
}

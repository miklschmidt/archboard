// The one flag that has to be read before anything else: `--url` names the
// canvas, and the modules that talk to the canvas read its address from the
// environment as they load. So the flag is taken out of the arguments first,
// in either spelling, and put into the environment — except for a help
// request, which contacts nothing and must leave the environment alone.

/** What the bootstrap took out of the arguments. */
interface CliBootstrap {
	/** The canvas address the person named, or null when they named none. */
	readonly url: string | null;
	/** Whether the invocation asks for help, which contacts no canvas. */
	readonly help: boolean;
}

/**
 * Whether one argument is a help flag.
 * @param token - An argument.
 * @returns True for `--help` or `-h`.
 */
function isHelpFlag(token: string): boolean {
	return token === "--help" || token === "-h";
}

/**
 * Whether an invocation asks for help: nothing at all, `help` first, or a help
 * flag anywhere. Decided on the whole argument list, before any of it is
 * parsed, because help must win over every other reading of the arguments.
 * @param argv - The arguments after the executable name.
 * @returns True when help is what the person asked for.
 */
function isHelpInvocation(argv: readonly string[]): boolean {
	return argv.length === 0 || argv[0] === "help" || argv.some(isHelpFlag);
}

/**
 * Removes `--url <address>` or `--url=<address>` from the arguments, in place.
 * @param argv - The arguments, edited in place.
 * @returns The address, or null when the flag was absent.
 */
function takeUrl(argv: string[]): string | null {
	for (let index = 0; index < argv.length; index++) {
		const token = argv[index]!;
		const following = argv[index + 1];
		if (token === "--url" && usableUrlValue(following)) {
			const [, url] = argv.splice(index, 2);
			return url ?? null;
		}
		if (token.startsWith("--url=")) {
			argv.splice(index, 1);
			return token.slice("--url=".length);
		}
	}
	return null;
}

/**
 * Whether a separated URL value is present and is not the controlling help flag.
 * @param value - The token after `--url`.
 * @returns True when bootstrap may consume it as the URL.
 */
function usableUrlValue(value: string | undefined): value is string {
	return value !== undefined && !isHelpFlag(value);
}

/**
 * Moves a `--url` out of the arguments and, for anything but a help request,
 * into the environment. It must run before anything reads runtime
 * configuration, which is why it is a separate step from ordinary argument
 * parsing; a help request reads no configuration and so records nothing.
 * @param argv - The process arguments, edited in place to remove the flag.
 * @param environment - Where the URL is recorded; the process environment by default.
 * @returns What was taken, for the command that runs to check it applies.
 */
function applyCliBootstrap(
	argv: string[],
	environment: Record<string, string | undefined> = process.env,
): CliBootstrap {
	const help = isHelpInvocation(argv);
	const url = takeUrl(argv);
	if (url !== null && !help) {
		environment["EXPRESS_SERVER_URL"] = url;
	}
	return { url, help };
}

export { applyCliBootstrap, isHelpInvocation, type CliBootstrap };

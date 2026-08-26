export function applyCliBootstrap(
	argv: string[],
	environment: Record<string, string | undefined> = process.env,
): void {
	for (let index = 0; index < argv.length; index++) {
		const token = argv[index]!;
		if (token === "--url" && argv[index + 1]) {
			environment.EXPRESS_SERVER_URL = argv[index + 1];
			argv.splice(index, 2);
			return;
		}
		if (token.startsWith("--url=")) {
			environment.EXPRESS_SERVER_URL = token.slice("--url=".length);
			argv.splice(index, 1);
			return;
		}
	}
}

import { exampleOptions } from "#server/rules/startup/options.ts";
import { startExample } from "#server/wiring/application/application.ts";

/** Start the CLI host and release its private process on shutdown or fatal failure. */
export async function runExample(): Promise<void> {
	const options = exampleOptions(process.argv);
	let application: Awaited<ReturnType<typeof startExample>> | undefined;
	const state = { ending: false };
	/** Release the application when startup settles. */
	const stop = async (): Promise<void> => {
		state.ending = true;
		await application?.shutdown();
	};
	/** Request shutdown without interrupting resource cleanup. */
	const signal = (): void => {
		void stop().catch((error: unknown) => {
			console.error(error);
			process.exitCode = 1;
		});
	};
	/**
	 * Report a fatal factory failure and release the application.
	 * @param error The factory failure.
	 */
	const fatal = (error: unknown): void => {
		console.error(error);
		process.exitCode = 1;
		signal();
	};
	process.on("SIGINT", signal);
	process.on("SIGTERM", signal);
	try {
		application = await startExample(options, fatal);
		if (state.ending) await application.shutdown();
		else
			console.log(
				JSON.stringify({
					type: "workbench_example_ready",
					url: application.url,
					checkout: options.checkout,
				}),
			);
	} catch (error) {
		process.off("SIGINT", signal);
		process.off("SIGTERM", signal);
		throw error;
	}
}

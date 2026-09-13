import { expect, spyOn, test } from "bun:test";
import { cliContractRegistry, runCli } from "@/cli/commands/run";

test("help flags anywhere print successfully before validating arguments", async () => {
	const exitCode = process.exitCode;
	const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
	const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
	try {
		for (const topic of [[], ...cliContractRegistry().map(({ contract }) => contract.path)]) {
			const args = [...topic, "--unknown-option"];
			for (const flag of ["--help", "-h"]) {
				for (let index = 0; index <= args.length; index++) {
					stdout.mockClear();
					process.exitCode = 0;
					await runCli([...args.slice(0, index), flag, ...args.slice(index)]);
					expect(stdout).toHaveBeenCalled();
					expect(process.exitCode).toBe(0);
					expect(stderr).not.toHaveBeenCalled();
				}
			}
		}
	} finally {
		stdout.mockRestore();
		stderr.mockRestore();
		process.exitCode = exitCode;
	}
});

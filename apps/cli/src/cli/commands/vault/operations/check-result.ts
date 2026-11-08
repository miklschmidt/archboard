// What the check commands answer and when they exit 1. The checks differ in the parts that
// their answer names, so each command words its own output and outcome.

/**
 * What a check command answers and when it exits 1: the checks differ in the parts they name.
 * @param answers What the JSON answer holds.
 * @param issues What makes the command exit 1, and what never does.
 * @returns The output and the outcomes of the contract.
 */
function checkResult(answers: string, issues: string) {
	return {
		output: {
			cases: [
				{
					id: "json",
					when: {},
					mode: "json" as const,
					description: answers,
					presentation: ["diagnostics", "result"] as const,
				},
			],
			/**
			 * Select JSON output.
			 * @returns The output case.
			 */
			select: () => "json",
		},
		outcomes: [
			{
				id: "issues",
				exit: 1,
				description: issues,
				stream: "stdout-and-stderr",
				presentation: ["diagnostics", "result"],
			},
		],
	} as const;
}

export { checkResult };

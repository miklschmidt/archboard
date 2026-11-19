// Why the code check of `archboard check`, `check all` and `check code` refuses, beside an
// unreachable server: a draft that `--state` names no or several states of, a plan it does not
// read, and the shallow-module gate's refusals (TASK-646.04, TASK-650).

const stateNotFoundRefusal = {
	code: "STATE_NOT_FOUND",
	exit: 2,
	stream: "stderr" as const,
	description:
		"--state names no state of the model. Name one by its identity or exact name. `archboard model proposals` lists the drafts.",
};

const stateAmbiguousRefusal = {
	code: "STATE_AMBIGUOUS",
	exit: 2,
	stream: "stderr" as const,
	description:
		"--state names several states of the model. Name one by its identity, which `archboard model proposals` lists.",
};

const planRefusal = {
	code: "PLAN_REFUSED",
	exit: 2,
	stream: "stderr" as const,
	description:
		"--plan names a file outside the checkout that holds the vault and the chosen checkout of every other repository, Terraform state, a variable file or a file under `.terraform`, or a file that is not a plan JSON. The refusal names the plan and why.",
};

const baseRefusal = {
	code: "BASE_UNRESOLVED",
	exit: 2,
	stream: "stderr" as const,
	description:
		"The base that `--base` names, or the default base, does not resolve, so the check cannot tell which modules the branch touched. Also a module that the gate judges whose range the check could not read. A gate never passes because it read nothing.",
};

const ruleRefusal = {
	code: "SHALLOW_RULE_CONFLICT",
	exit: 2,
	stream: "stderr" as const,
	description:
		"`--fail-shallow-modules` fails the check on MODULE_SHALLOW and INTERFACE_WIDE in a touched module, and the vault policy's `codeCheck.rules` turns one of them off. Leave out the flag, or set the rule to information.",
};

/** The code check's refusals, in the order the help lists them. */
const codeCheckRefusals = [
	stateNotFoundRefusal,
	stateAmbiguousRefusal,
	planRefusal,
	baseRefusal,
	ruleRefusal,
];

export { codeCheckRefusals };

const serverPath = process.env.ARCHBOARD_TEST_SERVER_ENTRY;
if (!serverPath) throw new Error("ARCHBOARD_TEST_SERVER_ENTRY is required.");
const environment = { ...process.env };
delete environment.ARCHBOARD_TEST_SERVER_ENTRY;
switch (environment.ARCHBOARD_TEST_BIND_MODE) {
	case "default":
		delete environment.HOST;
		break;
	case "broad":
		environment.HOST = "::";
		break;
	case "no-vault":
		delete environment.ARCHBOARD_VAULT;
		break;
}
delete environment.ARCHBOARD_TEST_BIND_MODE;
if (!process.execve) throw new Error("This runtime does not provide process.execve.");
process.execve(
	process.execPath,
	[process.execPath, "--preserve-symlinks", "--preserve-symlinks-main", serverPath],
	environment,
);

import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

type OwnedChild = ChildProcessByStdio<null, null, Readable>;

interface Exit {
	readonly code: number | null;
	readonly signal: NodeJS.Signals | null;
	readonly expected: boolean;
}

interface Generation {
	number: number;
	child: Readonly<OwnedChild>;
	pid: number;
	port: number;
	base: string;
	stop: Readonly<{ expected: () => boolean; markExpected: () => void }>;
	exit: Exit | null;
	exitPromise: Readonly<Promise<Exit>>;
	stderr: string;
}

interface AttemptRecord {
	readonly port: number;
	readonly pid: number;
	readonly exit: string;
	readonly foreignPid?: number;
	readonly stderr: string;
	readonly cleanup: string;
}

type DeathGeneration = Readonly<Pick<Generation, "exit" | "pid">> & {
	readonly child: Readonly<Pick<OwnedChild, "exitCode" | "signalCode">>;
};

type StoppableGeneration = Omit<DeathGeneration, "child"> &
	Readonly<Pick<Generation, "exitPromise" | "number" | "stop">> & {
		readonly child: Readonly<Pick<OwnedChild, "exitCode" | "kill" | "signalCode">>;
	};

export type { AttemptRecord, DeathGeneration, Exit, Generation, StoppableGeneration };

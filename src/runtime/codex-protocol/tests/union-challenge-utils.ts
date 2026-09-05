import {
	arrayMember,
	generatedBranch,
	isRecord,
	nullableMember,
	optionalMember,
} from "./union-challenge-fixtures.js";

export interface NotificationUnionChallenge {
	readonly name: string;
	readonly targetPath: readonly string[];
	readonly prepare: (params: unknown) => unknown;
	readonly mutate: (params: unknown) => NotificationUnionChallengeMutation;
}

export interface NotificationUnionChallengeMutation {
	readonly params: unknown;
	readonly targetPath: readonly string[];
	readonly allowedContainingUnionPaths: readonly (readonly string[])[];
}

interface ReplacementResult {
	readonly value: unknown;
	readonly targetPath: readonly string[];
	readonly allowedContainingUnionPaths: readonly (readonly string[])[];
}

function replaceGeneratedAt(
	value: unknown,
	path: readonly string[],
	fieldName?: string,
	actualPath: readonly string[] = [],
	containingUnionPath?: readonly string[],
): ReplacementResult {
	if (!path.length) {
		if (fieldName === "output" || fieldName === "requestId") {
			return { value: false, targetPath: actualPath, allowedContainingUnionPaths: [] };
		}
		if (Array.isArray(value)) {
			const entries = value.length ? value : [arrayMember(fieldName ?? "", "")];
			return {
				value: entries.map((entry, index) => (index === 0 ? "futureUnionMember" : entry)),
				targetPath: [...actualPath, "0"],
				allowedContainingUnionPaths: [],
			};
		}
		return {
			value: "futureUnionMember",
			targetPath: actualPath,
			allowedContainingUnionPaths: containingUnionPath ? [containingUnionPath] : [],
		};
	}
	const [head, ...tail] = path;
	if (Array.isArray(value)) {
		const entries = value.length ? value : [arrayMember(fieldName ?? "", head!)];
		const replacement = replaceGeneratedAt(
			entries[0],
			path,
			fieldName,
			[...actualPath, "0"],
			containingUnionPath,
		);
		return {
			value: entries.map((entry, index) => (index === 0 ? replacement.value : entry)),
			targetPath: replacement.targetPath,
			allowedContainingUnionPaths: replacement.allowedContainingUnionPaths,
		};
	}
	if (isRecord(value)) {
		if (value["type"] === head) {
			return replaceGeneratedAt(value, tail, fieldName, actualPath, containingUnionPath);
		}
		if (Object.hasOwn(value, head!)) {
			const nextContainingUnionPath =
				tail.length && head === "output" ? [...actualPath, head] : containingUnionPath;
			const replacement = replaceGeneratedAt(
				value[head!],
				tail,
				head,
				[...actualPath, head!],
				nextContainingUnionPath,
			);
			return {
				value: { ...value, [head!]: replacement.value },
				targetPath: replacement.targetPath,
				allowedContainingUnionPaths: replacement.allowedContainingUnionPaths,
			};
		}
		const branch = generatedBranch(head!);
		if (branch) {
			return replaceGeneratedAt(branch, path, fieldName, actualPath, containingUnionPath);
		}
		if (fieldName === "agentsStates") {
			const states = Object.keys(value).length
				? value
				: { "agent-1": { status: "pendingInit", message: null } };
			const firstKey = Object.keys(states)[0]!;
			const replacement = replaceGeneratedAt(
				states[firstKey],
				path,
				fieldName,
				[...actualPath, firstKey],
				containingUnionPath,
			);
			return {
				value: { ...states, [firstKey]: replacement.value },
				targetPath: replacement.targetPath,
				allowedContainingUnionPaths: replacement.allowedContainingUnionPaths,
			};
		}
	}
	if (value === null || !isRecord(value)) {
		const prepared = nullableMember(fieldName ?? "");
		if (isRecord(prepared) && Object.keys(prepared).length) {
			return replaceGeneratedAt(prepared, path, fieldName, actualPath, containingUnionPath);
		}
	}
	throw new Error(`Generated union challenge path could not reach ${path.join(".")}`);
}

function prepareGeneratedAt(value: unknown, path: readonly string[], fieldName?: string): unknown {
	if (!path.length) {
		if (Array.isArray(value) && value.length === 0 && fieldName !== "output") {
			return [arrayMember(fieldName ?? "", "")];
		}
		return value;
	}
	const [head, ...tail] = path;
	if (Array.isArray(value)) {
		const entries = value.length ? value : [arrayMember(fieldName ?? "", head!)];
		return entries.map((entry, index) =>
			index === 0 ? prepareGeneratedAt(entry, path, fieldName) : entry,
		);
	}
	if (isRecord(value)) {
		if (value["type"] === head) {
			return prepareGeneratedAt(value, tail, fieldName);
		}
		if (Object.hasOwn(value, head!)) {
			const current = value[head!];
			const prepared = current === null && tail.length ? nullableMember(head!) : current;
			return { ...value, [head!]: prepareGeneratedAt(prepared, tail, head!) };
		}
		const branch = generatedBranch(head!);
		if (branch) {
			return prepareGeneratedAt(branch, path, fieldName);
		}
		const optional = optionalMember(head!);
		if (optional !== undefined) {
			return prepareGeneratedAt({ ...value, [head!]: optional }, path, fieldName);
		}
		if (fieldName === "agentsStates") {
			const states = Object.keys(value).length
				? value
				: { "agent-1": { status: "pendingInit", message: null } };
			const firstKey = Object.keys(states)[0]!;
			return {
				...states,
				[firstKey]: prepareGeneratedAt(states[firstKey], path, fieldName),
			};
		}
	}
	if (value === null || !isRecord(value)) {
		const prepared = nullableMember(fieldName ?? "");
		if (isRecord(prepared) && Object.keys(prepared).length) {
			return prepareGeneratedAt(prepared, path, fieldName);
		}
	}
	throw new Error(`Generated union challenge path could not reach ${path.join(".")}`);
}

export function generated(name: string): NotificationUnionChallenge {
	const targetPath = name.split(".");
	return {
		name,
		targetPath,
		prepare: (params) => prepareGeneratedAt(params, targetPath),
		mutate: (params) => {
			const replacement = replaceGeneratedAt(params, targetPath);
			return {
				params: replacement.value,
				targetPath: replacement.targetPath,
				allowedContainingUnionPaths: replacement.allowedContainingUnionPaths,
			};
		},
	};
}

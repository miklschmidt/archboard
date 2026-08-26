const familyHandler = async () => {};
const sharedChildHandler = async () => {};

export const duplicateSiblingRegistry = [
	{
		name: "fixture",
		parent: null,
		kind: "legacy",
		handler: familyHandler,
		handlerName: familyHandler.name,
		legacyArgv: "root-tail",
	},
	{
		name: "fixture first",
		parent: "fixture",
		kind: "legacy",
		handler: sharedChildHandler,
		handlerName: sharedChildHandler.name,
		legacyArgv: "route-tail",
	},
	{
		name: "fixture second",
		parent: "fixture",
		kind: "legacy",
		handler: sharedChildHandler,
		handlerName: sharedChildHandler.name,
		legacyArgv: "route-tail",
	},
];

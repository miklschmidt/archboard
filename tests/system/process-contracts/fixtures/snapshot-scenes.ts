export const snapshotElements = [
	{
		id: "snap-node",
		type: "rectangle",
		x: 20,
		y: 30,
		width: 160,
		height: 90,
		customData: {
			archboard: {
				node: "snapshot-node",
				kind: "service",
				binding: { repository: "archboard", path: "src/snapshot/original.ts" },
			},
		},
	},
	{
		id: "snap-image",
		type: "image",
		x: 220,
		y: 30,
		width: 64,
		height: 64,
		fileId: "snapshot-file",
	},
];

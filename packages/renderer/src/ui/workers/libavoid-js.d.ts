// libavoid-js 0.5.0-beta.5 points its package export at a missing declaration
// and its available declaration does not match the runtime ABI. Keep only the
// loader's actual contract here; the renderer adapter narrows the ABI it uses.
declare module "libavoid-js" {
	export const AvoidLib: {
		load(filePath?: string): Promise<void>;
		getInstance(): unknown;
	};
}

export type VendoredCoveAuthFile = {
  path: string;
  mode: "create";
  content: string;
};

/** Returns the complete 1.0.0 runtime package as an in-memory file map. No filesystem or network access is used. */
export function buildVendoredCoveAuthPackageFiles(options?: { targetRoot?: string }): VendoredCoveAuthFile[];

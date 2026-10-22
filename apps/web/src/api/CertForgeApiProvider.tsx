import type { PropsWithChildren } from "react";

import { CertForgeApiContext } from "./CertForgeApiContext";
import type { CertForgeApi } from "./port";

export type CertForgeApiProviderProps = PropsWithChildren<{
  api: CertForgeApi;
}>;

export function CertForgeApiProvider({ api, children }: CertForgeApiProviderProps) {
  return (
    <CertForgeApiContext.Provider value={api}>{children}</CertForgeApiContext.Provider>
  );
}

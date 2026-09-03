import type { PropsWithChildren } from "react";

import { CertQuizApiContext } from "./CertQuizApiContext";
import type { CertQuizApi } from "./port";

export type CertQuizApiProviderProps = PropsWithChildren<{
  api: CertQuizApi;
}>;

export function CertQuizApiProvider({ api, children }: CertQuizApiProviderProps) {
  return (
    <CertQuizApiContext.Provider value={api}>{children}</CertQuizApiContext.Provider>
  );
}

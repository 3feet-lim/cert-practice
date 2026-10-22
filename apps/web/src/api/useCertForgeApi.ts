import { useContext } from "react";

import { CertForgeApiContext } from "./CertForgeApiContext";
import type { CertForgeApi } from "./port";

export function useCertForgeApi(): CertForgeApi {
  const api = useContext(CertForgeApiContext);

  if (!api) {
    throw new Error("useCertForgeApi must be used within CertForgeApiProvider");
  }

  return api;
}

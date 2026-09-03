import { useContext } from "react";

import { CertQuizApiContext } from "./CertQuizApiContext";
import type { CertQuizApi } from "./port";

export function useCertQuizApi(): CertQuizApi {
  const api = useContext(CertQuizApiContext);

  if (!api) {
    throw new Error("useCertQuizApi must be used within CertQuizApiProvider");
  }

  return api;
}

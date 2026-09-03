import { createContext } from "react";

import type { CertQuizApi } from "./port";

export const CertQuizApiContext = createContext<CertQuizApi | undefined>(undefined);

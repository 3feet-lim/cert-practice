import { createContext } from "react";

import type { CertForgeApi } from "./port";

export const CertForgeApiContext = createContext<CertForgeApi | undefined>(undefined);

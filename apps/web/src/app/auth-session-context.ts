import type { CurrentUserDto } from "@cert-forge/contracts";
import { createContext, useContext } from "react";

import type { CertForgeApiError } from "../api/port";

export type AuthSessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "pending" }
  | { status: "approved"; user: CurrentUserDto }
  | { status: "error"; error: CertForgeApiError };

export interface AuthSessionContextValue {
  state: AuthSessionState;
  refresh(): Promise<void>;
  logout(): Promise<void>;
}

export const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);
  if (context === null) {
    throw new Error("useAuthSession must be used within AuthSessionProvider");
  }
  return context;
}

export function createAdminRequiredError(): CertForgeApiError {
  return {
    code: "admin-required",
    message: "관리자만 볼 수 있는 페이지입니다.",
    requestId: "frontend-route-guard",
    retryable: false,
    nextAction: "학습 홈으로 돌아가 학습을 계속하세요.",
  };
}

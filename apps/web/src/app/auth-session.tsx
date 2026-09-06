import type { CurrentUserDto } from "@cert-quiz/contracts";
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CertQuizApiError, CertQuizApiResult } from "../api/port";
import { useCertQuizApi } from "../api/useCertQuizApi";
import { useLogoutStatePurge } from "../api/queries";
import { AuthSessionContext, type AuthSessionState } from "./auth-session-context";
const AUTHENTICATION_ERROR_CODES = new Set([
  "authentication-invalid",
  "google-identity-missing",
]);
function normalizeAuthFailure(error: CertQuizApiError): AuthSessionState {
  if (AUTHENTICATION_ERROR_CODES.has(error.code)) {
    return { status: "unauthenticated" };
  }
  if (error.code === "approval-required") {
    return { status: "pending" };
  }
  return { status: "error", error };
}
async function resolveAuthSession(
  getApprovalStatus: () => Promise<
    CertQuizApiResult<{ approvalStatus: "pending" | "approved" }>
  >,
  getCurrentUser: () => Promise<CertQuizApiResult<CurrentUserDto>>,
): Promise<AuthSessionState> {
  const approval = await getApprovalStatus();
  if (!approval.ok) {
    return normalizeAuthFailure(approval.error);
  }
  if (approval.data.approvalStatus === "pending") {
    return { status: "pending" };
  }
  const currentUser = await getCurrentUser();
  if (!currentUser.ok) {
    return normalizeAuthFailure(currentUser.error);
  }
  if (currentUser.data.approvalStatus === "pending") {
    return { status: "pending" };
  }
  return { status: "approved", user: currentUser.data };
}
export function AuthSessionProvider({ children }: PropsWithChildren) {
  const api = useCertQuizApi();
  const purgeSession = useLogoutStatePurge();
  const requestGeneration = useRef(0);
  const [state, setState] = useState<AuthSessionState>({ status: "loading" });
  const refresh = useCallback(async () => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    setState({ status: "loading" });
    const nextState = await resolveAuthSession(
      api.getApprovalStatus,
      api.getCurrentUser,
    );
    if (requestGeneration.current === generation) {
      setState(nextState);
    }
  }, [api]);
  useEffect(() => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    void resolveAuthSession(api.getApprovalStatus, api.getCurrentUser).then(
      (nextState) => {
        if (requestGeneration.current === generation) {
          setState(nextState);
        }
      },
    );
  }, [api]);
  const logout = useCallback(async () => {
    requestGeneration.current += 1;
    await purgeSession();
    setState({ status: "unauthenticated" });
  }, [purgeSession]);
  const value = useMemo(() => ({ state, refresh, logout }), [logout, refresh, state]);
  return (
    <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>
  );
}

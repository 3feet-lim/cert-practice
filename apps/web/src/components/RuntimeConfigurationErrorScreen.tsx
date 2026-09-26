import { FullPageState } from "./FullPageState";

/** Shown when the deployed runtime configuration cannot be resolved. */
export function RuntimeConfigurationErrorScreen({ message }: { message: string }) {
  return (
    <FullPageState
      eyebrow="CONFIGURATION ERROR"
      title="웹 런타임 구성이 올바르지 않습니다."
      titleId="runtime-configuration-error-title"
    >
      <div
        className="grid gap-1 rounded-xl border border-danger/20 bg-danger-soft p-4 text-sm"
        role="alert"
      >
        <strong className="text-danger">{message}</strong>
        <span>배포 설정을 확인한 후 페이지를 새로고침하세요.</span>
      </div>
    </FullPageState>
  );
}

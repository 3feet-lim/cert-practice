import { useEffect } from "react";

const PRODUCT_NAME = "CertForge";

/** Sets a per-page browser tab title such as "연습 · AIF-C01 — CertForge". */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (!title) return;
    const previousTitle = document.title;
    document.title = `${title} — ${PRODUCT_NAME}`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}

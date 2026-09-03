import { useState, type ImgHTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";

import { cn } from "../lib/cn";
import { isSafeUrl } from "../lib/safe-url";

function SafeImage({ src, alt = "", title }: ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);

  if (!isSafeUrl(src)) {
    return (
      <span role="img" aria-label={alt || "차단된 이미지"} className="my-3 block rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        {alt || "이미지"} — 안전하지 않은 이미지 주소가 차단되었습니다.
      </span>
    );
  }

  if (failed) {
    return (
      <span role="img" aria-label={`${alt || "이미지"} 로드 실패`} className="my-3 block rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
        {alt || "이미지"} — 이미지를 불러오지 못했습니다.
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="my-4 max-w-full rounded-lg border border-slate-200"
      onError={() => setFailed(true)}
    />
  );
}

export interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Renders the supported Markdown subset without parsing raw HTML.
 * Only same-origin relative and HTTPS links/images can become network-capable elements.
 */
export function SafeMarkdown({ content, className }: SafeMarkdownProps) {
  return (
    <div className={cn("safe-markdown text-slate-800", className)}>
      <ReactMarkdown
        skipHtml={false}
        urlTransform={(url) => url}
        components={{
          a({ href, children, title }) {
            if (!isSafeUrl(href)) {
              return (
                <span className="text-slate-700 underline decoration-dotted" title="안전하지 않은 링크 주소가 차단되었습니다.">
                  {children}
                </span>
              );
            }

            return (
              <a
                href={href}
                title={title}
                rel="noopener noreferrer"
                className="font-medium text-indigo-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                {children}
              </a>
            );
          },
          img({ src, alt, title }) {
            return <SafeImage src={src} alt={alt} title={title} />;
          },
          code({ className: codeClassName, children }) {
            return (
              <code className={cn("rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em]", codeClassName)}>
                {children}
              </code>
            );
          },
          pre({ children }) {
            return <pre className="my-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-50">{children}</pre>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

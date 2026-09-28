/**
 * Minimal remark plugin that turns bare `https://` URLs in text into links.
 *
 * Only HTTPS is linkified; the rendered anchor still passes through the
 * SafeMarkdown `isSafeUrl` guard. Trailing sentence punctuation and unmatched
 * closing brackets are left outside the link.
 */

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const URL_PATTERN = /https:\/\/[^\s<>"'`]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?'"]+$/;

/** Node types whose text must not be rewritten into links. */
const SKIPPED_PARENTS = new Set(["link", "linkReference", "code", "inlineCode"]);

function trimUrl(raw: string): string {
  let url = raw.replace(TRAILING_PUNCTUATION, "");
  // Drop closing brackets that are not balanced inside the URL, e.g. "(see https://x)".
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
  ] as const) {
    while (url.endsWith(close) && url.split(close).length > url.split(open).length) {
      url = url.slice(0, -1).replace(TRAILING_PUNCTUATION, "");
    }
  }
  return url;
}

export function splitTextWithUrls(value: string): MdNode[] {
  const nodes: MdNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(URL_PATTERN)) {
    const start = match.index;
    const url = trimUrl(match[0]);
    if (url.length <= "https://".length) continue;
    if (start > cursor) nodes.push({ type: "text", value: value.slice(cursor, start) });
    nodes.push({ type: "link", url, children: [{ type: "text", value: url }] });
    cursor = start + url.length;
  }
  if (nodes.length === 0) return [{ type: "text", value }];
  if (cursor < value.length) nodes.push({ type: "text", value: value.slice(cursor) });
  return nodes;
}

function linkify(node: MdNode): void {
  if (!node.children || SKIPPED_PARENTS.has(node.type)) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === "text" && typeof child.value === "string") {
      return splitTextWithUrls(child.value);
    }
    linkify(child);
    return [child];
  });
}

export function remarkAutolink() {
  return (tree: MdNode) => {
    linkify(tree);
  };
}

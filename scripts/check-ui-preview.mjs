import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = path.join(repositoryRoot, "artifacts", "ui-preview");
const entryPath = path.join(artifactRoot, "index.html");
const localResourceAttributes = /<(?:a|link|script|img|source|video|audio|object|embed|iframe)\b[^>]*?\b(?:href|src)=(['"])(.*?)\1/gi;
const tagPattern = /<([a-z][\w:-]*)(\s[^>]*?)?>/gi;
const hexPattern = /#[0-9a-f]{6}\b/gi;

function failure(message) {
  throw new Error(`UI preview check failed: ${message}`);
}

function attributes(source) {
  return Object.fromEntries(
    [...source.matchAll(/([\w:-]+)(?:=(['"])(.*?)\2)?/g)].map(([, key, , value]) => [
      key.toLowerCase(),
      value ?? "",
    ]),
  );
}

function elements(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b([^>]*)>`, "gi"))].map((match) => ({
    attributes: attributes(match[1]),
    source: match[0],
  }));
}

function hasClass(element, className) {
  return element.attributes.class?.split(/\s+/).includes(className) ?? false;
}

function isExternalOrAbsolute(reference) {
  return /^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(reference) || reference.startsWith("//");
}

function resolveLocalReference(documentPath, reference) {
  const pathname = reference.split(/[?#]/, 1)[0];
  if (!pathname) return null;
  const resolved = path.resolve(path.dirname(documentPath), pathname);
  if (resolved !== artifactRoot && !resolved.startsWith(`${artifactRoot}${path.sep}`)) {
    failure(`${display(documentPath)} escapes the artifact root with ${reference}`);
  }
  return resolved;
}

function display(filePath) {
  return path.relative(repositoryRoot, filePath);
}

async function allFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await allFiles(entryPath)));
    else if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function ids(html) {
  return new Set([...html.matchAll(/\bid=(['"])(.*?)\1/gi)].map((match) => match[2]));
}

function contrastRatio(foreground, background) {
  const toLinear = (value) => {
    const channel = Number.parseInt(value, 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (color) => {
    const [, red, green, blue] = /^#(..)(..)(..)$/.exec(color) ?? [];
    return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
  };
  const [first, second] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (first + 0.05) / (second + 0.05);
}

function cssVariable(css, name) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, "i"));
  assert.ok(match, `missing --${name} color token`);
  return match[1];
}

function checkColorContrast(css) {
  const pairs = [
    ["ink", "bg"],
    ["muted", "bg"],
    ["primary", "surface"],
    ["success", "success-soft"],
    ["warning", "warning-soft"],
    ["danger", "danger-soft"],
    ["info", "info-soft"],
  ];
  for (const [foreground, background] of pairs) {
    const ratio = contrastRatio(cssVariable(css, foreground), cssVariable(css, background));
    assert.ok(ratio >= 4.5, `${foreground}/${background} contrast is ${ratio.toFixed(2)}:1`);
  }
  assert.ok(css.match(hexPattern)?.length, "CSS must retain explicit color tokens for contrast checks");
}

function checkCssLayoutAndFocus(css) {
  for (const requirement of [
    /\*\s*\{\s*box-sizing:\s*border-box;/,
    /html\s*\{[^}]*min-width:\s*1024px;/,
    /h1, h2, h3, p\s*\{[^}]*overflow-wrap:\s*break-word;/,
    /minmax\(0,\s*1fr\)/,
    /\.jumpbar nav\s*\{[^}]*overflow-x:\s*auto;/,
    /a:focus-visible, button:focus-visible, input:focus-visible, summary:focus-visible\s*\{[^}]*outline:/,
    /\.skip-link:focus\s*\{[^}]*top:/,
  ]) {
    assert.match(css, requirement, `missing layout or keyboard-focus safeguard ${requirement}`);
  }
}

function checkDocumentSemantics(documentPath, html) {
  const relative = display(documentPath);
  assert.match(html, /<!doctype html>/i, `${relative} is missing a doctype`);
  assert.match(html, /<html\b[^>]*\blang=(['"])[^'"]+\1/i, `${relative} has no document language`);
  assert.match(html, /<meta\b[^>]*\bname=(['"])viewport\1/i, `${relative} has no viewport metadata`);
  assert.match(html, /<title>[^<]+<\/title>/i, `${relative} has no title`);
  assert.equal(elements(html, "main").length, 1, `${relative} must have exactly one main landmark`);
  assert.equal(elements(html, "h1").length, 1, `${relative} must have exactly one h1`);
  assert.ok(elements(html, "header").length >= 1, `${relative} has no header landmark`);
  assert.ok(elements(html, "footer").length >= 1, `${relative} has no footer landmark`);

  const skipLinks = elements(html, "a").filter((element) => hasClass(element, "skip-link"));
  assert.equal(skipLinks.length, 1, `${relative} must expose one keyboard skip link`);
  assert.equal(skipLinks[0].attributes.href, "#main-content", `${relative} skip link must target main content`);
  assert.match(html, /<main\b[^>]*\bid=(['"])main-content\1/i, `${relative} main landmark must receive skip-link focus`);

  const availableIds = ids(html);
  for (const element of [...elements(html, "input"), ...elements(html, "select"), ...elements(html, "textarea")]) {
    const labelled = Boolean(element.attributes["aria-label"] || element.attributes["aria-labelledby"] || element.attributes.id && new RegExp(`<label\\b[^>]*\\bfor=(['"])${element.attributes.id}\\1`, "i").test(html));
    assert.ok(labelled || /<label\b[^>]*>[\s\S]*?<input\b/i.test(html), `${relative} has an unlabelled form control`);
  }

  for (const table of elements(html, "table")) {
    assert.match(html, /<table\b[^>]*>[\s\S]*?<caption>/i, `${relative} table requires a caption`);
    assert.match(html, /<thead>[\s\S]*?<th\b[^>]*\bscope=(['"])col\1/i, `${relative} table requires column headers`);
    assert.match(html, /<tbody>[\s\S]*?<th\b[^>]*\bscope=(['"])row\1/i, `${relative} table requires row headers`);
    void table;
  }

  for (const dialog of [...html.matchAll(/<([\w:-]+)\b([^>]*\brole=(['"])dialog\3[^>]*)>/gi)]) {
    const dialogAttributes = attributes(dialog[2]);
    assert.ok(dialogAttributes["aria-labelledby"], `${relative} dialog needs aria-labelledby`);
    assert.ok(dialogAttributes["aria-describedby"], `${relative} dialog needs aria-describedby`);
    assert.ok(availableIds.has(dialogAttributes["aria-labelledby"]), `${relative} dialog label target is missing`);
    assert.ok(availableIds.has(dialogAttributes["aria-describedby"]), `${relative} dialog description target is missing`);
    assert.ok(dialogAttributes["aria-modal"] === "true" || dialogAttributes["aria-modal"] === "false", `${relative} dialog must declare modal state`);
  }

  if (html.includes('class="progress"')) {
    assert.match(html, /<table\b[\s\S]*?<caption>[^<]*(?:대체|alternative)/i, `${relative} chart-like progress display needs an alternative data table`);
  }

  assert.doesNotMatch(html, /<script\b/i, `${relative} must not contain executable script markup`);
  assert.doesNotMatch(html, /\bon\w+\s*=/i, `${relative} must not contain inline event handlers`);
  assert.doesNotMatch(html, /(?:href|src)=(['"])(?:javascript:|data:)/i, `${relative} must not contain unsafe Markdown URLs`);
}

async function checkDocumentReferences(documentPath, html, queue, visited, assets) {
  for (const match of html.matchAll(localResourceAttributes)) {
    const reference = match[2].trim();
    if (!reference || reference.startsWith("#")) continue;
    assert.ok(!isExternalOrAbsolute(reference), `${display(documentPath)} uses forbidden external or absolute URL ${reference}`);
    const resolved = resolveLocalReference(documentPath, reference);
    if (!resolved) continue;
    assert.ok(await fileExists(resolved), `${display(documentPath)} references missing ${reference}`);
    if (resolved.endsWith(".html")) {
      if (!visited.has(resolved)) queue.push(resolved);
    } else {
      assets.add(resolved);
    }
  }
}

async function checkCssReferences(cssPath, css) {
  for (const match of css.matchAll(/url\((['"]?)(.*?)\1\)/gi)) {
    const reference = match[2].trim();
    assert.ok(!isExternalOrAbsolute(reference), `${display(cssPath)} uses forbidden external or absolute CSS URL ${reference}`);
    const resolved = resolveLocalReference(cssPath, reference);
    if (resolved) assert.ok(await fileExists(resolved), `${display(cssPath)} references missing ${reference}`);
  }
}

export async function runUiPreviewChecks() {
  assert.ok(await fileExists(entryPath), `missing entry artifact ${display(entryPath)}`);
  const queue = [entryPath];
  const visited = new Set();
  const assets = new Set();

  while (queue.length) {
    const documentPath = queue.shift();
    if (visited.has(documentPath)) continue;
    visited.add(documentPath);
    const html = await readFile(documentPath, "utf8");
    checkDocumentSemantics(documentPath, html);
    await checkDocumentReferences(documentPath, html, queue, visited, assets);
  }

  const allArtifactFiles = await allFiles(artifactRoot);
  const allHtml = allArtifactFiles.filter((file) => file.endsWith(".html"));
  const unreachable = allHtml.filter((file) => !visited.has(file));
  assert.deepEqual(unreachable, [], `orphan HTML variants are not reachable from index.html: ${unreachable.map(display).join(", ")}`);
  assert.equal(visited.size, 44, "index traversal must reach the gallery and all 43 exported screen variants");

  const cssFiles = [...assets].filter((file) => file.endsWith(".css"));
  assert.ok(cssFiles.length > 0, "export must reference a local stylesheet");
  for (const cssPath of cssFiles) {
    const css = await readFile(cssPath, "utf8");
    checkCssReferences(cssPath, css);
    checkCssLayoutAndFocus(css);
    checkColorContrast(css);
  }

  const markdownFixture = path.join(artifactRoot, "screens", "s4-practice", "submitted.html");
  const markdownHtml = await readFile(markdownFixture, "utf8");
  assert.match(markdownHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, "Markdown raw HTML regression fixture must remain escaped");
  assert.match(markdownHtml, /허용되지 않은 URL은 <span class="muted">비활성 텍스트<\/span>/, "Markdown unsafe URL regression fixture must remain inactive text");

  return { documents: visited.size, assets: assets.size, cssFiles: cssFiles.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runUiPreviewChecks()
    .then(({ documents, assets, cssFiles }) => {
      console.log(`UI preview checks passed: ${documents} HTML documents, ${assets} local assets, ${cssFiles} stylesheet(s).`);
      console.log("Scope: exported artifact layout, presentation, HTML semantics, and accessibility only; not auth, mutations, timers, persistence, backend, or API behavior.");
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

import { Route, Routes, useSearchParams } from "react-router-dom";

import {
  STATIC_PREVIEW_GALLERY_LINKS,
  STATIC_PREVIEW_ROUTE_PATTERNS,
  createStaticArtifactNavigation,
  getStaticPreviewRouteEntries,
  type StaticPreviewExportEntry,
} from "./export-manifest";
import { getStaticPreviewFixture } from "./route-fixtures";

function selectEntry(
  entries: readonly StaticPreviewExportEntry[],
  preview: string | null,
  fixture: string | null,
): StaticPreviewExportEntry {
  const selected = entries.find(
    (candidate) =>
      (preview !== null && candidate.variant === preview) ||
      (fixture !== null && candidate.fixtureKey === fixture),
  );
  const fallback = entries[0];
  if (selected !== undefined) return selected;
  if (fallback !== undefined) return fallback;
  throw new Error("A static preview route must have at least one manifest entry.");
}

function StaticArtifactNavigation({ entry }: { entry: StaticPreviewExportEntry }) {
  const navigation = createStaticArtifactNavigation(entry.id);

  return (
    <>
      <header>
        <a href={navigation.galleryHref}>CERTQUIZ UI gallery</a>
        <nav aria-label="주요 정적 화면">
          {navigation.primary.map((item) => (
            <a href={item.href} key={item.targetId}>
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <aside aria-label="화면 바로가기">
        <nav>
          {navigation.secondary.map((item) => (
            <a href={item.href} key={item.targetId}>
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
    </>
  );
}

function StaticScreenSkeleton({ routePattern }: { routePattern: string }) {
  const [searchParams] = useSearchParams();
  const entry = selectEntry(
    getStaticPreviewRouteEntries(routePattern),
    searchParams.get("preview"),
    searchParams.get("fixture"),
  );
  const fixture = getStaticPreviewFixture(entry.fixtureKey);
  const navigation = createStaticArtifactNavigation(entry.id);
  const fixtureState =
    typeof fixture === "object" && fixture !== null && "state" in fixture
      ? String(fixture.state)
      : "success";

  return (
    <div data-preview-entry={entry.id} data-fixture-key={entry.fixtureKey}>
      <StaticArtifactNavigation entry={entry} />
      <main id="main-content">
        <section aria-labelledby="static-screen-title">
          <p>{entry.screen}</p>
          <h1 id="static-screen-title">{entry.title}</h1>
          <p>
            정적 fixture: <code>{entry.fixtureKey}</code>
          </p>
          <p role="status">표현 상태: {fixtureState}</p>
          <p>Variant: {entry.variant}</p>
        </section>
      </main>
      <footer>
        <nav aria-label="정적 화면 순서">
          <a href={navigation.previous.href}>이전 화면</a>
          <a href={navigation.galleryHref}>Gallery</a>
          <a href={navigation.next.href}>다음 화면</a>
        </nav>
      </footer>
    </div>
  );
}

function StaticPreviewGallery() {
  return (
    <main>
      <section aria-labelledby="preview-gallery-title">
        <p>DETERMINISTIC STATIC REVIEW</p>
        <h1 id="preview-gallery-title">CertQuiz S1-S10 UI gallery</h1>
        <ul>
          {STATIC_PREVIEW_GALLERY_LINKS.map((item) => (
            <li key={item.id}>
              <a href={item.href}>
                {item.screen} · {item.title} · {item.variant}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

/**
 * Fixture-only route skeleton for static review and export. It deliberately has
 * no auth provider/guard, redirect restoration, API port, query/store, Cognito,
 * MSW, timer, or mutation dependency.
 */
export function StaticPreviewRoutes() {
  return (
    <Routes>
      <Route index element={<StaticPreviewGallery />} />
      {STATIC_PREVIEW_ROUTE_PATTERNS.map((routePattern) => (
        <Route
          element={<StaticScreenSkeleton routePattern={routePattern} />}
          key={routePattern}
          path={routePattern}
        />
      ))}
      <Route path="*" element={<StaticPreviewGallery />} />
    </Routes>
  );
}

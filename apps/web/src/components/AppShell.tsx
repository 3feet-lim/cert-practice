import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import { Badge } from "./ui/Badge";
import { Navigation, type NavigationItem } from "./ui/Navigation";
import { PageHeader } from "./ui/PageHeader";

export interface AppShellNavigationItem extends NavigationItem {
  href: string;
}

interface ShellBrandProps {
  productName: string;
  productHref: string;
  eyebrow?: string;
}

function ShellBrand({ productName, productHref, eyebrow }: ShellBrandProps) {
  return (
    <a
      href={productHref}
      className="inline-flex items-center gap-3 rounded-md text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30"
    >
      <span
        aria-hidden="true"
        className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground shadow-sm"
      >
        CQ
      </span>
      <span className="grid leading-tight">
        <span className="text-base font-extrabold tracking-tight">{productName}</span>
        {eyebrow ? (
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </span>
        ) : null}
      </span>
    </a>
  );
}

function SkipLink() {
  return (
    <a
      href="#main-content"
      className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-card focus:translate-y-0 focus:outline-none focus:ring-3 focus:ring-focus/30"
    >
      본문으로 건너뛰기
    </a>
  );
}

export interface PublicShellProps {
  children: ReactNode;
  aside?: ReactNode;
  productName?: string;
  productHref?: string;
  footer?: ReactNode;
  className?: string;
}

/** Minimal public layout for login and callback review screens. */
export function PublicShell({
  children,
  aside,
  productName = "CertQuiz",
  productHref = "./index.html",
  footer,
  className,
}: PublicShellProps) {
  return (
    <div className={cn("min-h-screen bg-background text-foreground", className)}>
      <SkipLink />
      <header className="border-b border-border bg-card" role="banner">
        <div className="mx-auto flex min-h-18 max-w-7xl items-center px-8">
          <ShellBrand productName={productName} productHref={productHref} />
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-7xl items-center gap-12 px-8 py-12",
          aside ? "grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]" : "max-w-3xl",
        )}
      >
        <div className="min-w-0">{children}</div>
        {aside ? (
          <aside
            className="rounded-2xl border border-border bg-muted p-8"
            aria-label="안내"
          >
            {aside}
          </aside>
        ) : null}
      </main>
      {footer ? (
        <footer className="border-t border-border bg-card px-8 py-6">{footer}</footer>
      ) : null}
    </div>
  );
}

export interface PendingShellProps {
  children: ReactNode;
  productName?: string;
  productHref?: string;
  statusLabel?: string;
  className?: string;
}

/** Restricted layout that exposes only approval-status presentation. */
export function PendingShell({
  children,
  productName = "CertQuiz",
  productHref = "./index.html",
  statusLabel = "승인 대기",
  className,
}: PendingShellProps) {
  return (
    <div className={cn("min-h-screen bg-background text-foreground", className)}>
      <SkipLink />
      <header className="border-b border-border bg-card" role="banner">
        <div className="mx-auto flex min-h-18 max-w-5xl items-center justify-between px-8">
          <ShellBrand productName={productName} productHref={productHref} />
          <Badge tone="warning">{statusLabel}</Badge>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-2xl place-items-center px-8 py-12"
      >
        <div className="w-full rounded-2xl border border-border bg-card p-8 shadow-card">
          {children}
        </div>
      </main>
    </div>
  );
}

export interface AppShellProps {
  children: ReactNode;
  navigation?: AppShellNavigationItem[];
  secondaryNavigation?: AppShellNavigationItem[];
  navigationLabel?: string;
  userActions?: ReactNode;
  sidebarFooter?: ReactNode;
  productName?: string;
  productHref?: string;
  productEyebrow?: string;
  className?: string;
}

/** Shared light-mode desktop shell. Authorization remains outside this component. */
export function AppShell({
  children,
  navigation = [],
  secondaryNavigation = [],
  navigationLabel = "주요 메뉴",
  userActions,
  sidebarFooter,
  productName = "CertQuiz",
  productHref = "./index.html",
  productEyebrow = "Certification practice",
  className,
}: AppShellProps) {
  const hasSidebar = Boolean(
    navigation.length > 0 || secondaryNavigation.length > 0 || sidebarFooter,
  );

  return (
    <div className={cn("min-h-screen bg-background text-foreground", className)}>
      <SkipLink />
      <header className="border-b border-border bg-card" role="banner">
        <div className="mx-auto flex min-h-18 max-w-screen-2xl items-center justify-between gap-8 px-8">
          <ShellBrand
            productName={productName}
            productHref={productHref}
            eyebrow={productEyebrow}
          />
          {userActions ? (
            <div className="flex items-center gap-3">{userActions}</div>
          ) : null}
        </div>
      </header>
      <div
        className={cn(
          "mx-auto grid max-w-screen-2xl",
          hasSidebar && "grid-cols-[16rem_minmax(0,1fr)]",
        )}
      >
        {hasSidebar ? (
          <aside className="flex min-h-[calc(100vh-4.5rem)] flex-col border-r border-border bg-card px-4 py-8">
            {navigation.length > 0 ? (
              <Navigation items={navigation} label={navigationLabel} />
            ) : null}
            {secondaryNavigation.length > 0 ? (
              <div className="mt-auto border-t border-border pt-5">
                <Navigation items={secondaryNavigation} label="보조 메뉴" />
              </div>
            ) : null}
            {sidebarFooter ? <div className="mt-5">{sidebarFooter}</div> : null}
          </aside>
        ) : null}
        <main id="main-content" tabIndex={-1} className="min-w-0 px-10 py-10">
          {children}
        </main>
      </div>
    </div>
  );
}

export interface AdminShellProps {
  children: ReactNode;
  navigation: AppShellNavigationItem[];
  globalNavigation?: AppShellNavigationItem[];
  userActions?: ReactNode;
  title?: string;
  description?: string;
  productHref?: string;
  className?: string;
}

/** Full admin layout with separate global and console navigation landmarks. */
export function AdminShell({
  children,
  navigation,
  globalNavigation = [],
  userActions,
  title = "관리자 콘솔",
  description = "사용자 승인과 문제 은행 정적 검토 화면입니다.",
  productHref = "./index.html",
  className,
}: AdminShellProps) {
  return (
    <AppShell
      className={className}
      navigation={globalNavigation}
      navigationLabel="주요 메뉴"
      userActions={userActions}
      productHref={productHref}
      productEyebrow="Administration"
    >
      <div className="grid grid-cols-[14rem_minmax(0,1fr)] gap-10">
        <aside className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="mb-3 px-3 text-xs font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            Admin
          </p>
          <Navigation items={navigation} label="관리 메뉴" />
        </aside>
        <section className="min-w-0" aria-labelledby="admin-shell-title">
          <PageHeader
            headingId="admin-shell-title"
            eyebrow="Admin"
            title={title}
            description={description}
          />
          <div className="mt-8">{children}</div>
        </section>
      </div>
    </AppShell>
  );
}

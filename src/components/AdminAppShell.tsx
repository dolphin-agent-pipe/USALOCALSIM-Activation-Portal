"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/** Native tooltip only when CSS truncation hides part of the label. */
function TruncateTooltip({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [label]);

  return (
    <span ref={ref} className={className} title={truncated ? label : undefined}>
      {children}
    </span>
  );
}

type NavLink = {
  href: string;
  label: string;
  active: (p: string) => boolean;
  children?: NavLink[];
};

type NavSection = {
  id: string;
  railLabel: string;
  panelTitle: string;
  icon: ReactNode;
  links: NavLink[];
};

const sections: NavSection[] = [
  {
    id: "activation",
    railLabel: "Activate",
    panelTitle: "Activation",
    icon: <QueueIcon />,
    links: [
      { href: "/admin", label: "Queue", active: (p) => p === "/admin" },
      {
        href: "/admin/completed",
        label: "Active",
        active: (p) => p.startsWith("/admin/completed"),
      },
    ],
  },
  {
    id: "catalog",
    railLabel: "Catalog",
    panelTitle: "Catalog",
    icon: <CatalogIcon />,
    links: [
      { href: "/admin/plans", label: "Plans", active: (p) => p.startsWith("/admin/plans") },
      {
        href: "/admin/networks",
        label: "Networks",
        active: (p) => p.startsWith("/admin/networks"),
      },
      {
        href: "/admin/sim-cost",
        label: "Pricing & hardware",
        active: (p) => p.startsWith("/admin/sim-cost"),
      },
      {
        href: "/admin/iccid-validation",
        label: "ICCID validation",
        active: (p) => p.startsWith("/admin/iccid-validation"),
      },
    ],
  },
  {
    id: "vouchers",
    railLabel: "Vouchers",
    panelTitle: "Vouchers",
    icon: <VoucherIcon />,
    links: [
      {
        href: "/admin/vouchers",
        label: "Import vouchers",
        active: (p) => p === "/admin/vouchers",
      },
      {
        href: "#prepaid",
        label: "Prepaid cards",
        active: (p) =>
          p === "/admin/prepaid" ||
          p.startsWith("/admin/prepaid/generate") ||
          p.startsWith("/admin/prepaid/sprint-report"),
        children: [
          {
            href: "/admin/prepaid",
            label: "Import prepaid cards",
            active: (p) => p === "/admin/prepaid",
          },
          {
            href: "/admin/prepaid/generate",
            label: "Generate QR & barcodes",
            active: (p) => p.startsWith("/admin/prepaid/generate"),
          },
          {
            href: "/admin/prepaid/sprint-report",
            label: "Prepaid sprint export",
            active: (p) => p.startsWith("/admin/prepaid/sprint-report"),
          },
        ],
      },
      {
        href: "/admin/vouchers/tracking",
        label: "Voucher tracking",
        active: (p) => p.startsWith("/admin/vouchers/tracking"),
      },
    ],
  },
  {
    id: "administration",
    railLabel: "Admin",
    panelTitle: "Administration",
    icon: <AdminIcon />,
    links: [
      {
        href: "#partners",
        label: "Partners",
        active: (p) => p.startsWith("/admin/partners"),
        children: [
          {
            href: "/admin/partners",
            label: "All partners",
            active: (p) => p === "/admin/partners",
          },
          {
            href: "/admin/partners/assign",
            label: "Assign serials",
            active: (p) => p.startsWith("/admin/partners/assign"),
          },
          {
            href: "/admin/commissions",
            label: "Commission ledger",
            active: (p) => p.startsWith("/admin/commissions"),
          },
          {
            href: "/admin/payouts",
            label: "Payout batches",
            active: (p) => p.startsWith("/admin/payouts"),
          },
        ],
      },
      { href: "/admin/users", label: "Users", active: (p) => p.startsWith("/admin/users") },
      {
        href: "/admin/audit-logs",
        label: "Audit log",
        active: (p) => p.startsWith("/admin/audit-logs"),
      },
      {
        href: "/admin/change-password",
        label: "Change password",
        active: (p) => p.startsWith("/admin/change-password"),
      },
    ],
  },
];

function linkActive(pathname: string, link: NavLink): boolean {
  if (link.active(pathname)) return true;
  return link.children?.some((c) => linkActive(pathname, c)) ?? false;
}

function sectionForPath(pathname: string): NavSection {
  return sections.find((s) => s.links.some((l) => linkActive(pathname, l))) ?? sections[0];
}

function pageLabelForPath(pathname: string): string {
  let label = "Overview";
  let depth = -1;

  function visit(links: NavLink[], level: number) {
    for (const link of links) {
      if (link.href.startsWith("/") && link.active(pathname) && level >= depth) {
        depth = level;
        label = link.label;
      }
      if (link.children?.length) visit(link.children, level + 1);
    }
  }

  for (const section of sections) visit(section.links, 0);
  return label;
}

function emailInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return (local.slice(0, 2) || "AD").toUpperCase();
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-5 w-5"
      aria-hidden
    >
      {open ? (
        <>
          <line x1="18" x2="6" y1="6" y2="18" />
          <line x1="6" x2="18" y1="6" y2="18" />
        </>
      ) : (
        <>
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </>
      )}
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

function CatalogIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  );
}

function VoucherIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" d="M4 8h16v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <path strokeLinecap="round" d="M9 8v8M15 8v8" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path strokeLinecap="round" d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path
        strokeLinecap="round"
        d="M12 3v2m0 14v2M3 12h2m14 0h2m-2.8-6.2-1.4 1.4M7.2 16.8l-1.4 1.4m0-11.2 1.4 1.4m9.6 9.6 1.4 1.4"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden>
      <path strokeLinecap="round" d="M14 5h5v5M10 14 19 5M5 10v9h9" />
    </svg>
  );
}

function NavTree({
  links,
  pathname,
  depth,
  expanded,
  onToggle,
  onNavigate,
}: {
  links: NavLink[];
  pathname: string;
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  onNavigate: () => void;
}) {
  return (
    <ul className={depth === 0 ? "space-y-0.5" : "space-y-0.5"}>
      {links.map((link) => {
        const key = `${depth}:${link.href}:${link.label}`;
        const hasChildren = (link.children?.length ?? 0) > 0;
        const active = link.active(pathname);
        const childActive = hasChildren && linkActive(pathname, link);
        const isOpen = key in expanded ? expanded[key] : childActive;

        if (hasChildren) {
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onToggle(key)}
                className={`admin-nav-group flex w-full items-center gap-2 py-2 pr-2 text-left text-sm transition ${
                  childActive ? "font-semibold text-slate-200" : "text-slate-400 hover:text-slate-200"
                }`}
                style={{ paddingLeft: `${12 + depth * 14}px` }}
                aria-expanded={isOpen}
              >
                <TruncateTooltip label={link.label} className="min-w-0 flex-1 truncate">
                  {link.label}
                </TruncateTooltip>
                <ChevronIcon open={isOpen} />
              </button>
              {isOpen ? (
                <div className="relative">
                  <span
                    className="pointer-events-none absolute bottom-2 left-[18px] top-2 w-px bg-slate-700/80"
                    aria-hidden
                  />
                  <NavTree
                    links={link.children!}
                    pathname={pathname}
                    depth={depth + 1}
                    expanded={expanded}
                    onToggle={onToggle}
                    onNavigate={onNavigate}
                  />
                </div>
              ) : null}
            </li>
          );
        }

        return (
          <li key={key} className="relative">
            {depth > 0 ? (
              <span
                className="pointer-events-none absolute bottom-0 left-[18px] top-0 w-px bg-slate-700/80"
                aria-hidden
              />
            ) : null}
            <Link
              href={link.href}
              className={`admin-nav-link relative block py-2 pr-3 text-sm transition ${
                active
                  ? "font-medium text-brand-purple"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              style={{ paddingLeft: `${12 + depth * 14}px` }}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
            >
              {active ? (
                <span
                  className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r bg-brand-purple"
                  aria-hidden
                />
              ) : null}
              <TruncateTooltip label={link.label} className="relative block truncate">
                {link.label}
              </TruncateTooltip>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminAppShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const pathSection = useMemo(() => sectionForPath(pathname), [pathname]);
  const [activeSectionId, setActiveSectionId] = useState(pathSection.id);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];
  const pageLabel = useMemo(() => pageLabelForPath(pathname), [pathname]);
  const initials = emailInitials(email);

  useEffect(() => {
    setActiveSectionId(pathSection.id);
  }, [pathSection.id]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  function toggleExpanded(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleConfirmSignOut() {
    setSigningOut(true);
    await signOut({ callbackUrl: "/login" });
  }

  const sidebar = (
    <div className="flex h-full">
      <div className="admin-nav-rail flex w-[4.25rem] shrink-0 flex-col border-r border-white/[0.06] bg-[#070b14]">
        <div className="flex justify-center px-2 pb-2 pt-5">
          <Link
            href="/redeem"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-purple/40 bg-brand-purple/15 text-[10px] font-bold text-brand-purple transition hover:bg-brand-purple/25"
            title="USALOCALSIM"
            onClick={() => setMobileNavOpen(false)}
          >
            US
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-2 py-3" aria-label="Admin sections">
          {sections.map((section) => {
            const selected = activeSection.id === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  setActiveSectionId(section.id);
                  setPanelCollapsed(false);
                }}
                className={`group flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2.5 transition ${
                  selected
                    ? "border border-brand-purple/35 bg-brand-purple/10 text-brand-purple shadow-[inset_0_0_20px_rgba(37,99,235,0.12)]"
                    : "border border-transparent text-slate-500 hover:border-white/10 hover:bg-white/[0.03] hover:text-slate-300"
                }`}
                aria-current={selected ? "true" : undefined}
                aria-label={section.panelTitle}
              >
                <span className={selected ? "text-brand-purple" : "text-slate-500 group-hover:text-slate-300"}>
                  {section.icon}
                </span>
                <TruncateTooltip
                  label={section.panelTitle}
                  className="max-w-full truncate text-[9px] font-semibold uppercase tracking-[0.08em]"
                >
                  {section.railLabel}
                </TruncateTooltip>
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-2 border-t border-white/[0.06] px-2 py-4">
          <Link
            href="/redeem"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
            title="View site"
            onClick={() => setMobileNavOpen(false)}
          >
            <ExternalIcon />
          </Link>
          <Link
            href="/admin/change-password"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
            title="Settings"
            onClick={() => setMobileNavOpen(false)}
          >
            <SettingsIcon />
          </Link>
          <button
            type="button"
            onClick={() => setShowSignOutConfirm(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
            title="Sign out"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden>
              <path strokeLinecap="round" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
          <div
            className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-purple/25 text-[10px] font-bold text-brand-purple ring-1 ring-brand-purple/40"
            title={email}
          >
            {initials}
          </div>
        </div>
      </div>

      {!panelCollapsed ? (
        <div className="admin-nav-panel flex w-[15.5rem] shrink-0 flex-col border-r border-white/[0.06] bg-[#0b1220]">
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
              {activeSection.panelTitle}
            </p>
            <button
              type="button"
              className="hidden rounded-md p-1 text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300 lg:inline-flex"
              aria-label="Collapse navigation panel"
              onClick={() => setPanelCollapsed(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
                <path strokeLinecap="round" d="m15 18-6-6 6-6" />
              </svg>
            </button>
          </div>

          <nav className="ui-main-scrollbar flex-1 overflow-y-auto px-2 py-3" aria-label="Admin pages">
            <NavTree
              links={activeSection.links}
              pathname={pathname}
              depth={0}
              expanded={expanded}
              onToggle={toggleExpanded}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </nav>

          <div className="border-t border-white/[0.06] px-4 py-3">
            <p className="truncate text-xs text-slate-400" title={email}>
              {email}
            </p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="hidden w-8 shrink-0 items-center justify-center border-r border-white/[0.06] bg-[#0b1220] text-slate-500 transition hover:text-slate-300 lg:flex"
          aria-label="Expand navigation panel"
          onClick={() => setPanelCollapsed(false)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
            <path strokeLinecap="round" d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <div className="admin-shell relative flex h-screen overflow-hidden bg-[#f8f9fb] text-slate-900">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px] lg:hidden"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        id="admin-sidebar"
        className={
          "fixed inset-y-0 left-0 z-50 flex transition-transform duration-200 ease-out lg:static lg:z-0 lg:shrink-0 lg:translate-x-0 " +
          (mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")
        }
      >
        {sidebar}
      </aside>

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="admin-top-bar relative z-20">
          <div className="admin-top-bar-inner">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="admin-top-bar-icon-btn lg:hidden"
                aria-expanded={mobileNavOpen}
                aria-controls="admin-sidebar"
                aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
                onClick={() => setMobileNavOpen((o) => !o)}
              >
                <MenuIcon open={mobileNavOpen} />
              </button>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 lg:hidden">{pageLabel}</p>
                <nav
                  className="hidden min-w-0 items-center gap-2 text-sm lg:flex"
                  aria-label="Current location"
                >
                  <span className="shrink-0 text-slate-500">{activeSection.panelTitle}</span>
                  <span className="text-slate-300" aria-hidden>
                    /
                  </span>
                  <span className="truncate font-medium text-slate-900">{pageLabel}</span>
                </nav>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 md:gap-3">
              <Link href="/redeem" className="admin-top-bar-link hidden sm:inline-flex">
                <ExternalIcon />
                <span>View site</span>
              </Link>
              <Link
                href="/redeem"
                className="admin-top-bar-icon-btn sm:hidden"
                aria-label="View public site"
              >
                <ExternalIcon />
              </Link>

              <span className="hidden h-6 w-px bg-slate-200 md:block" aria-hidden />

              <div
                className="flex max-w-[min(100%,14rem)] items-center gap-2 rounded-full border border-slate-200/90 bg-white py-1 pl-1 pr-2.5 md:max-w-xs md:pr-3"
                title={email}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-purple/15 text-[10px] font-bold text-brand-purple">
                  {initials}
                </span>
                <span className="hidden truncate text-xs text-slate-600 md:inline">{email}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="ui-main-scrollbar relative min-h-0 w-full flex-1 overflow-y-auto bg-[#f8f9fb]">
          <div className="admin-main-inner admin-main-site">
            {children}
          </div>
        </main>
      </div>

      <ConfirmDialog
        open={showSignOutConfirm}
        title="Sign out?"
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        variant="danger"
        initialFocus="cancel"
        loading={signingOut}
        onCancel={() => {
          if (signingOut) return;
          setShowSignOutConfirm(false);
        }}
        onConfirm={handleConfirmSignOut}
      >
        Are you sure you want to sign out and exit your session?
      </ConfirmDialog>
    </div>
  );
}

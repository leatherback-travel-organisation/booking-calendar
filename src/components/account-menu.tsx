"use client";

import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type AccountMenuProps = {
  displayName: string;
  initials: string;
  subtitle: string;
  mode: "preview" | "clerk" | "unconfigured";
  canManageAccess: boolean;
  canManageSystems: boolean;
  adminHref: string;
  systemsHref: string;
};

function ProfileIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3" /><path d="M5.5 19c.7-4 2.8-6 6.5-6s5.8 2 6.5 6" /></svg>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 9.5h16" /></svg>;
}

function AdminIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function ExitIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M14 8l4 4-4 4M8 12h10" /></svg>;
}

export function AccountMenu({
  displayName,
  initials,
  subtitle,
  mode,
  canManageAccess,
  canManageSystems,
  adminHref,
  systemsHref,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="profile-menu-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="cove-account-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="profile-avatar" aria-hidden="true">{initials}</span>
        <span className="profile-copy"><strong>{displayName}</strong><small>{subtitle}</small></span>
        <span className="profile-chevron" aria-hidden="true">⌄</span>
      </button>

      <div id="cove-account-menu" className={`profile-menu-panel ${open ? "open" : ""}`} role="dialog" aria-label="Account options" hidden={!open}>
        <div className="profile-menu-identity">
          <span className="profile-menu-avatar" aria-hidden="true">{initials}</span>
          <span><strong>{displayName}</strong><small>{subtitle}</small></span>
        </div>

        <nav className="profile-menu-links" aria-label="Account">
          <Link href="/my-details" onClick={() => setOpen(false)}><ProfileIcon /><span><strong>My Details</strong><small>Identity and personal record</small></span></Link>
          <Link href="/leave" onClick={() => setOpen(false)}><CalendarIcon /><span><strong>Leave</strong><small>Time off and balances</small></span></Link>
          {canManageAccess ? <Link href={adminHref} onClick={() => setOpen(false)}><AdminIcon /><span><strong>Cove administration</strong><small>People and application access</small></span></Link> : null}
          {canManageSystems ? <Link href={systemsHref} onClick={() => setOpen(false)}><AdminIcon /><span><strong>SuperPanel</strong><small>GitHub, Vercel, applications and websites</small></span></Link> : null}
        </nav>

        <div className="profile-menu-exit">
          {mode === "clerk" ? (
            <SignOutButton redirectUrl="/sign-in">
              <button type="button" className="profile-signout"><ExitIcon /><span>Sign out</span></button>
            </SignOutButton>
          ) : (
            <Link className="profile-signout" href="/sign-in?leftDemo=true" onClick={() => setOpen(false)}><ExitIcon /><span>Leave demonstration</span></Link>
          )}
          <small>{mode === "clerk" ? "Ends your Cove session on this device." : "Demonstration mode does not use a personal account."}</small>
        </div>
      </div>
    </div>
  );
}

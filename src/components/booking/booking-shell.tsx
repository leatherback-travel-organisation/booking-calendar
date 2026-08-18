import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import styles from "./booking-shell.module.css";

export type BookingSection =
  | "dashboard"
  | "availability"
  | "routing"
  | "communications"
  | "team"
  | "integrations";

const SECTIONS: Array<{ key: BookingSection; label: string; href: string }> = [
  { key: "dashboard", label: "Dashboard", href: "/booking" },
  { key: "availability", label: "Availability", href: "/booking/availability" },
  { key: "routing", label: "Routing", href: "/booking/routing" },
  { key: "communications", label: "Guest Communications", href: "/booking/communications" },
  { key: "team", label: "Team", href: "/booking/team" },
  { key: "integrations", label: "Integrations", href: "/booking/integrations" },
];

type BookingShellProps = {
  active: BookingSection;
  /** Pod Leads see every section; Booking Managers a working subset. */
  canManage: boolean;
  children: React.ReactNode;
};

export async function BookingShell({ active, canManage, children }: BookingShellProps) {
  const visible = canManage
    ? SECTIONS
    : SECTIONS.filter((section) => section.key !== "integrations");

  return (
    <AppShell active="booking">
      <div className={styles.workspace}>
        <header className={styles.header}>
          <h1 className={styles.title}>Calltime</h1>
          <nav className={styles.nav} aria-label="Booking sections">
            {visible.map((section) => (
              <Link
                key={section.key}
                href={section.href}
                aria-current={active === section.key ? "page" : undefined}
                className={`${styles.navLink} ${active === section.key ? styles.navLinkActive : ""}`}
              >
                {section.label}
              </Link>
            ))}
          </nav>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </AppShell>
  );
}

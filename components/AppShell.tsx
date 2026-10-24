"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  BellIcon,
  CalendarIcon,
  ChartIcon,
  DumbbellIcon,
  GridIcon,
  HomeIcon,
  UserIcon,
  UtensilsIcon,
} from "./icons";
import "./app-shell.css";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: HomeIcon },
  { href: "/calendar", label: "Calendario", icon: CalendarIcon },
  { href: "/plan", label: "Programmi", icon: GridIcon },
  { href: "/workouts", label: "Allenamenti", icon: DumbbellIcon },
  { href: "/nutrition", label: "Alimentazione", icon: UtensilsIcon },
  { href: "/progress", label: "Progressi", icon: ChartIcon },
  { href: "/profile", label: "Profilo", icon: UserIcon },
];

function initialsFrom(email: string): string {
  const name = email.split("@")[0] ?? "";
  const parts = name.split(/[.\-_]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "U";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setEmail(data.session?.user.email ?? "");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setEmail(session?.user.email ?? "");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <Link href="/dashboard" className="shell-brand">
          <span className="shell-brand-mark" aria-hidden="true">
            ▲
          </span>
          AllenAI
        </Link>

        <nav className="shell-nav">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shell-nav-item${active ? " shell-nav-item--active" : ""}`}
              >
                <Icon size={19} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="shell-tagline">
          <p>Il progresso inizia dalle tue scelte quotidiane.</p>
          <span className="shell-tagline-bar" aria-hidden="true" />
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-topbar">
          <span />

          <div className="shell-topbar-actions">
            <button type="button" className="shell-icon-button" aria-label="Notifiche">
              <BellIcon size={18} />
            </button>

            <div className="shell-account">
              <button
                type="button"
                className="shell-account-trigger"
                onClick={() => setMenuOpen((open) => !open)}
                aria-expanded={menuOpen}
              >
                <span className="shell-avatar">{email ? initialsFrom(email) : "?"}</span>
                <span className="shell-account-name">
                  {email ? email.split("@")[0] : "Account"}
                </span>
              </button>

              {menuOpen && (
                <div className="shell-account-menu" role="menu">
                  <p className="shell-account-email">{email}</p>
                  <Link href="/profile" className="shell-account-menu-item" onClick={() => setMenuOpen(false)}>
                    Profilo
                  </Link>
                  <button
                    type="button"
                    className="shell-account-menu-item shell-account-menu-item--danger"
                    onClick={() => void handleSignOut()}
                  >
                    Esci
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}

import { supabase } from "@/lib/supabase";

export type Theme = "dark" | "light";

const STORAGE_KEY = "allenai-theme";

export function applyTheme(theme: Theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage non disponibile (es. navigazione privata): il tema resta solo per questa sessione.
  }
}

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Legge il tema salvato sul profilo e lo applica, riconciliando con eventuali differenze locali. */
export async function syncThemeFromProfile(userId: string) {
  const { data } = await supabase.from("profiles").select("theme").eq("id", userId).maybeSingle();

  const remoteTheme: Theme = data?.theme === "dark" ? "dark" : "light";
  applyTheme(remoteTheme);
}

export async function saveTheme(userId: string, theme: Theme) {
  applyTheme(theme);
  await supabase.from("profiles").update({ theme }).eq("id", userId);
}

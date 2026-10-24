import { createClient } from "@supabase/supabase-js";

/**
 * Client con la service role key, usato SOLO in codice server-side che deve
 * bypassare la RLS (es. l'endpoint /api/health/steps, autenticato via token
 * personale invece che via sessione Supabase).
 */
export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY non configurata: aggiungila a .env.local (Supabase → Project Settings → API → service_role key).",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

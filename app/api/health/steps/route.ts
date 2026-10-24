import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type StepsRequest = {
  date?: string;
  steps?: number;
};

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return NextResponse.json(
      { error: "missing_token", message: "Header Authorization: Bearer <token> mancante." },
      { status: 401 },
    );
  }

  let body: StepsRequest;

  try {
    body = (await request.json()) as StepsRequest;
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Richiesta non valida." },
      { status: 400 },
    );
  }

  const date = body.date;
  const steps = body.steps;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "invalid_request", message: "Campo 'date' mancante o non in formato YYYY-MM-DD." },
      { status: 400 },
    );
  }

  if (typeof steps !== "number" || !Number.isFinite(steps) || steps < 0) {
    return NextResponse.json(
      { error: "invalid_request", message: "Campo 'steps' mancante o non valido." },
      { status: 400 },
    );
  }

  try {
    const admin = getSupabaseAdmin();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("step_sync_token", token)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "invalid_token", message: "Token non valido." },
        { status: 401 },
      );
    }

    const { error: upsertError } = await admin.from("step_counts").upsert(
      {
        user_id: profile.id,
        date,
        steps: Math.round(steps),
        source: "shortcuts",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    );

    if (upsertError) throw upsertError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Errore salvataggio passi:", error);
    return NextResponse.json(
      {
        error: "server_error",
        message: error instanceof Error ? error.message : "Errore durante il salvataggio.",
      },
      { status: 500 },
    );
  }
}

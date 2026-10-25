import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { estimateSessionCalories } from "@/lib/activity";

type ActivityRequest = {
  date?: string;
  activityType?: string;
  durationMinutes?: number | string;
  distanceKm?: number | string;
  intensity?: string;
  calories?: number | string;
};

const KNOWN_TYPES = new Set(["swimming", "running", "cycling", "cardio", "gym", "other"]);

const TYPE_ALIASES: Record<string, string> = {
  swim: "swimming",
  nuoto: "swimming",
  run: "running",
  corsa: "running",
  bike: "cycling",
  bici: "cycling",
  cyclingsport: "cycling",
  functionalstrengthtraining: "gym",
  traditionalstrengthtraining: "gym",
};

function parseNumber(value: number | string | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = value.replace(/[^\d.]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeType(raw: string | undefined): string {
  const key = (raw ?? "").trim().toLowerCase();
  if (!key) return "other";
  if (KNOWN_TYPES.has(key)) return key;
  return TYPE_ALIASES[key] ?? "other";
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return NextResponse.json(
      { error: "missing_token", message: "Header Authorization: Bearer <token> mancante." },
      { status: 401 },
    );
  }

  let body: ActivityRequest;

  try {
    body = (await request.json()) as ActivityRequest;
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Richiesta non valida." },
      { status: 400 },
    );
  }

  const dateMatch = typeof body.date === "string" ? body.date.match(/^\d{4}-\d{2}-\d{2}/) : null;
  const date = dateMatch?.[0];

  if (!date) {
    return NextResponse.json(
      { error: "invalid_request", message: "Campo 'date' mancante o non in formato YYYY-MM-DD." },
      { status: 400 },
    );
  }

  const durationMinutes = parseNumber(body.durationMinutes);

  if (durationMinutes === null || durationMinutes <= 0) {
    return NextResponse.json(
      { error: "invalid_request", message: "Campo 'durationMinutes' mancante o non valido." },
      { status: 400 },
    );
  }

  const activityType = normalizeType(body.activityType);
  const distanceKm = parseNumber(body.distanceKm);
  const intensity =
    body.intensity === "low" || body.intensity === "high" ? body.intensity : "moderate";
  const suppliedCalories = parseNumber(body.calories);

  try {
    const admin = getSupabaseAdmin();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id,current_weight_kg")
      .eq("step_sync_token", token)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "invalid_token", message: "Token non valido." },
        { status: 401 },
      );
    }

    const calories =
      suppliedCalories ??
      (profile.current_weight_kg
        ? estimateSessionCalories(activityType, durationMinutes, intensity, profile.current_weight_kg)
        : null);

    // Se esiste già una sessione per lo stesso giorno (es. creata manualmente
    // o dalla generazione AI), la completiamo invece di duplicarla.
    const { data: existing } = await admin
      .from("workout_sessions")
      .select("id")
      .eq("user_id", profile.id)
      .eq("performed_at", date)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await admin
        .from("workout_sessions")
        .update({
          actual_duration_minutes: durationMinutes,
          actual_distance_km: distanceKm,
          actual_intensity: intensity,
          actual_calories: calories,
          status: "completed",
          finished_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("user_id", profile.id);

      if (updateError) throw updateError;

      return NextResponse.json({ ok: true, sessionId: existing.id, matched: true });
    }

    const ACTIVITY_LABEL: Record<string, string> = {
      swimming: "Nuoto",
      running: "Corsa",
      cycling: "Bici",
      cardio: "Cardio",
      gym: "Palestra",
      other: "Attività",
    };

    const { data: created, error: insertError } = await admin
      .from("workout_sessions")
      .insert({
        user_id: profile.id,
        mesocycle_day_id: null,
        title: ACTIVITY_LABEL[activityType] ?? "Attività",
        performed_at: date,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        status: "completed",
        actual_duration_minutes: durationMinutes,
        actual_distance_km: distanceKm,
        actual_intensity: intensity,
        actual_calories: calories,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      throw new Error(insertError?.message ?? "Impossibile salvare la sessione.");
    }

    return NextResponse.json({ ok: true, sessionId: created.id, matched: false });
  } catch (error) {
    console.error("Errore salvataggio attività:", error);
    return NextResponse.json(
      {
        error: "server_error",
        message: error instanceof Error ? error.message : "Errore durante il salvataggio.",
      },
      { status: 500 },
    );
  }
}

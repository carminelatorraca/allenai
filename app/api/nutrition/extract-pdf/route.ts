import { NextRequest, NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai";

const EXTRACTION_PROMPT = `Questo PDF contiene un piano alimentare (es. di un nutrizionista), che può coprire uno o più giorni della settimana. Estrai i pasti e i relativi alimenti in formato strutturato, per popolare un piano alimentare SETTIMANALE (un pasto per ogni giorno della settimana, se presente).

Regole di raggruppamento (molto importante):
- Un "meal" deve corrispondere a un pasto reale (es. "Colazione", "Pranzo"), NON a un singolo alimento. Se il documento elenca più alimenti sotto lo stesso pasto (es. "Pranzo: 80g pasta, 150g pollo, insalata"), devi restituire UN SOLO oggetto meal con tutti quegli alimenti dentro "items" — non un meal per ciascun alimento.
- meal_type deve essere uno tra: breakfast (colazione), lunch (pranzo), snack (spuntino), dinner (cena), other.

Regola sul campo "weekday" (fondamentale):
- Cerca nel documento qualsiasi indicazione del giorno a cui un pasto appartiene: nomi dei giorni della settimana (Lunedì, Martedì... anche abbreviati o in altre lingue), oppure etichette generiche come "Giorno 1", "Day 2", "Settimana 1 - Giorno 3".
- Se trovi un nome di giorno della settimana esplicito, mappalo così: 0=Lunedì, 1=Martedì, 2=Mercoledì, 3=Giovedì, 4=Venerdì, 5=Sabato, 6=Domenica.
- Se trovi solo etichette sequenziali generiche ("Giorno 1", "Day 2", ecc. senza nome del giorno), mappale in sequenza a partire da Lunedì: Giorno/Day 1 → 0, Giorno/Day 2 → 1, e così via (ricomincia da 0 se superi 6).
- Se il documento non indica alcun giorno (es. un piano generico valido per un solo giorno tipo), usa weekday: -1 per ogni pasto.
- Se lo stesso pasto (es. "Colazione") si ripete identico per più giorni dichiarati equivalenti (es. "tutti i giorni feriali"), crea una voce meal per ciascun giorno indicato con lo stesso contenuto.

Regole sui valori:
- Se un valore nutrizionale (calorie, proteine, carboidrati, grassi) non è indicato esplicitamente, stimalo in modo ragionevole in base all'alimento e alla quantità.
- Se la quantità non è indicata, stima una porzione standard per quell'alimento.
- Non inventare pasti che non sono nel documento.

"instructions" può contenere note di preparazione o restare vuoto.`;

export async function POST(request: NextRequest) {
  let file: File;

  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");

    if (!(uploaded instanceof File)) {
      return NextResponse.json(
        { error: "invalid_request", message: "Nessun file PDF ricevuto." },
        { status: 400 },
      );
    }

    file = uploaded;
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Richiesta non valida." },
      { status: 400 },
    );
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "invalid_request", message: "Il file deve essere un PDF." },
      { status: 400 },
    );
  }

  if (file.size > 32 * 1024 * 1024) {
    return NextResponse.json(
      { error: "invalid_request", message: "Il PDF supera i 32 MB consentiti." },
      { status: 400 },
    );
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await getAiProvider().extractMealPlanFromPdf(base64, EXTRACTION_PROMPT);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.code, message: result.message },
        { status: result.status },
      );
    }

    return NextResponse.json({ meals: result.meals });
  } catch (error) {
    console.error("Errore estrazione PDF:", error);
    return NextResponse.json(
      {
        error: "ai_error",
        message:
          error instanceof Error
            ? error.message
            : "Errore durante l'estrazione del piano dal PDF.",
      },
      { status: 502 },
    );
  }
}

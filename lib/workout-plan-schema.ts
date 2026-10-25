export const WORKOUT_PLAN_SCHEMA = {
  type: "object",
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          day_code: { type: "string", description: "Lettera del giorno: A, B, C, D..." },
          title: { type: "string", description: "Es. 'Spinta', 'Tirata', 'Gambe', 'Full body'." },
          exercises: {
            type: "array",
            items: {
              type: "object",
              properties: {
                exercise_name: { type: "string" },
                sets: { type: "integer" },
                reps_min: { type: "integer" },
                reps_max: { type: "integer" },
                rest_seconds: { type: "integer" },
                tut: { type: "string", description: "Tempo sotto tensione, es. '3-1-1'." },
                notes: { type: "string", description: "Note tecniche brevi, o stringa vuota." },
              },
              required: [
                "exercise_name",
                "sets",
                "reps_min",
                "reps_max",
                "rest_seconds",
                "tut",
                "notes",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["day_code", "title", "exercises"],
        additionalProperties: false,
      },
    },
  },
  required: ["days"],
  additionalProperties: false,
} as const;

export type GeneratedExercise = {
  exercise_name: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  rest_seconds: number;
  tut: string;
  notes: string;
};

export type GeneratedWorkoutDay = {
  day_code: string;
  title: string;
  exercises: GeneratedExercise[];
};

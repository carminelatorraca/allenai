export const MEAL_PLAN_SCHEMA = {
  type: "object",
  properties: {
    meals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          meal_type: {
            type: "string",
            enum: ["breakfast", "lunch", "snack", "dinner", "other"],
          },
          title: { type: "string" },
          instructions: { type: "string" },
          weekday: {
            type: "integer",
            description:
              "0=Lunedì, 1=Martedì, 2=Mercoledì, 3=Giovedì, 4=Venerdì, 5=Sabato, 6=Domenica. -1 se il giorno non è determinabile.",
          },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                food_name: { type: "string" },
                quantity_g: { type: "number" },
                calories: { type: "number" },
                protein_g: { type: "number" },
                carbs_g: { type: "number" },
                fat_g: { type: "number" },
              },
              required: [
                "food_name",
                "quantity_g",
                "calories",
                "protein_g",
                "carbs_g",
                "fat_g",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["meal_type", "title", "instructions", "weekday", "items"],
        additionalProperties: false,
      },
    },
  },
  required: ["meals"],
  additionalProperties: false,
} as const;

export type ExtractedMealItem = {
  food_name: string;
  quantity_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type ExtractedMeal = {
  meal_type: "breakfast" | "lunch" | "snack" | "dinner" | "other";
  title: string;
  instructions: string;
  /** 0=Lunedì...6=Domenica, -1 se sconosciuto. */
  weekday: number;
  items: ExtractedMealItem[];
};

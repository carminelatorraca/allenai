export const MEAL_ALTERNATIVES_SCHEMA = {
  type: "object",
  properties: {
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Nome breve del pasto alternativo." },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                food_name: { type: "string" },
                kind: {
                  type: "string",
                  enum: ["generic", "branded"],
                  description:
                    "'generic' per un alimento generico (es. 'petto di pollo', 'riso basmati'); 'branded' solo se intendi un prodotto specifico di marca (es. 'Pasta Barilla n°5').",
                },
                quantity_g: { type: "number", description: "Quantità indicativa in grammi." },
              },
              required: ["food_name", "kind", "quantity_g"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "items"],
        additionalProperties: false,
      },
    },
  },
  required: ["alternatives"],
  additionalProperties: false,
} as const;

export type MealAlternativeItemDraft = {
  food_name: string;
  kind: "generic" | "branded";
  quantity_g: number;
};

export type MealAlternativeDraft = {
  title: string;
  items: MealAlternativeItemDraft[];
};

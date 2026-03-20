import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY,
});

interface GeneratedIngredient {
  ingredientName: string;
  quantity?: number | null;
  unit?: string | null;
}

interface GeneratedRecipe {
  title: string;
  description?: string;
  instructions: string;
  servings?: number;
  prepTime?: number;
  cookTime?: number;
  tags?: string[];
  requiredCookware?: string[];
  ingredients: GeneratedIngredient[];
}

export async function generateRecipes(
  ingredients: { name: string; quantity: number | null; unit: string | null }[],
  cookware: { name: string }[],
): Promise<GeneratedRecipe[]> {
  const ingredientList = ingredients
    .map((i) => {
      const qty = i.quantity != null ? `${i.quantity} ${i.unit ?? ''}`.trim() : '';
      return qty ? `${i.name} (${qty})` : i.name;
    })
    .join(', ');

  const cookwareList = cookware.map((c) => c.name).join(', ') || 'standard kitchen equipment';

  const prompt = `You are a helpful home chef.

Available ingredients: ${ingredientList || 'none listed'}
Available cookware: ${cookwareList}

Generate 3 practical family recipes using primarily these ingredients. Favor cookware the family owns. Default to 2 servings unless ingredients clearly suggest more.

Respond with ONLY a valid JSON array — no markdown, no explanation — matching this schema:
[
  {
    "title": "string",
    "description": "string",
    "instructions": "string (full step-by-step, each step on a new line starting with a number)",
    "servings": number,
    "prepTime": number (minutes),
    "cookTime": number (minutes),
    "tags": ["string"],
    "requiredCookware": ["string"],
    "ingredients": [
      { "ingredientName": "string", "quantity": number | null, "unit": "string | null" }
    ]
  }
]`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  // Strip any accidental markdown code fences
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

  const parsed: GeneratedRecipe[] = JSON.parse(cleaned);
  return parsed;
}

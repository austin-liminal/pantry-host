export interface Kitchen {
  id: string;
  slug: string;
  name: string;
  created_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  always_on_hand: boolean;
  tags: string[];
  created_at: string;
}

export interface Recipe {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  instructions: string;
  servings: number | null;
  prep_time: number | null;
  cook_time: number | null;
  tags: string[];
  required_cookware: string[];
  source: string;
  source_url: string | null;
  photo_url: string | null;
  last_made_at: string | null;
  queued: boolean;
  created_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
  source_recipe_id: string | null;
  sort_order: number;
}

export interface Cookware {
  id: string;
  name: string;
  brand: string | null;
  tags: string[];
  created_at: string;
}

export interface Menu {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  active: boolean;
  category: string | null;
  kitchen_id: string;
  created_at: string;
}

export interface MenuRecipe {
  id: string;
  menu_id: string;
  recipe_id: string;
  course: string | null;
  sort_order: number;
}

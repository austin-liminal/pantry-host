import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { gql } from '../graphql-client.js';

const MENU_SUMMARY = `id slug title description active category`;
const MENU_FULL = `${MENU_SUMMARY} recipes { id course sortOrder recipe { id slug title tags } }`;

const menuRecipeInput = z.object({
  recipeId: z.string().describe('Recipe ID'),
  course: z.string().optional().describe('Course (e.g. appetizer, main, dessert, drink)'),
  sortOrder: z.number().int().optional().describe('Display order'),
});

export function registerMenuTools(server: McpServer) {
  server.tool(
    'list_menus',
    'List all menus in a kitchen.',
    {
      kitchenSlug: z.string().optional().describe('Kitchen slug (default: home)'),
    },
    async ({ kitchenSlug }) => {
      const data = await gql<{ menus: unknown[] }>(
        `query($kitchenSlug: String) { menus(kitchenSlug: $kitchenSlug) { ${MENU_SUMMARY} } }`,
        { kitchenSlug },
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.menus, null, 2) }] };
    },
  );

  server.tool(
    'get_menu',
    'Get a menu by ID or slug, including its recipes.',
    { id: z.string().describe('Menu ID (UUID) or slug') },
    async ({ id }) => {
      const data = await gql<{ menu: unknown }>(
        `query($id: String!) { menu(id: $id) { ${MENU_FULL} } }`,
        { id },
      );
      if (!data.menu) return { content: [{ type: 'text' as const, text: 'Menu not found' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.menu, null, 2) }] };
    },
  );

  server.tool(
    'create_menu',
    'Create a new menu with recipe assignments.',
    {
      title: z.string().describe('Menu title'),
      recipes: z.array(menuRecipeInput).describe('Recipes in the menu'),
      description: z.string().optional(),
      active: z.boolean().optional().describe('Whether menu is active (default: true)'),
      category: z.string().optional().describe('Menu category'),
      kitchenSlug: z.string().optional().describe('Kitchen slug (default: home)'),
    },
    async (args) => {
      const data = await gql<{ createMenu: unknown }>(
        `mutation($title: String!, $recipes: [MenuRecipeInput!]!, $description: String, $active: Boolean, $category: String, $kitchenSlug: String) {
          createMenu(title: $title, recipes: $recipes, description: $description, active: $active, category: $category, kitchenSlug: $kitchenSlug) { ${MENU_SUMMARY} }
        }`,
        args,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.createMenu, null, 2) }] };
    },
  );

  server.tool(
    'update_menu',
    'Update a menu. Only provide fields you want to change.',
    {
      id: z.string().describe('Menu ID'),
      title: z.string().optional(),
      description: z.string().optional(),
      active: z.boolean().optional(),
      category: z.string().optional(),
      recipes: z.array(menuRecipeInput).optional().describe('Full replacement recipe list'),
    },
    async (args) => {
      const data = await gql<{ updateMenu: unknown }>(
        `mutation($id: String!, $title: String, $description: String, $active: Boolean, $category: String, $recipes: [MenuRecipeInput!]) {
          updateMenu(id: $id, title: $title, description: $description, active: $active, category: $category, recipes: $recipes) { ${MENU_SUMMARY} }
        }`,
        args,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.updateMenu, null, 2) }] };
    },
  );

  server.tool(
    'toggle_recipe_in_menu',
    'Add or remove a recipe from a menu. If the recipe is already in the menu, it is removed. If not, it is added with an auto-classified course based on recipe tags.',
    {
      menuId: z.string().describe('Menu ID'),
      recipeId: z.string().describe('Recipe ID'),
      course: z.string().optional().describe('Course override (e.g. appetizer, breakfast, main-course, side, beverage, dessert). Auto-classified from recipe tags if omitted.'),
    },
    async ({ menuId, recipeId, course }) => {
      const data = await gql<{ toggleRecipeInMenu: unknown }>(
        `mutation($menuId: String!, $recipeId: String!, $course: String) {
          toggleRecipeInMenu(menuId: $menuId, recipeId: $recipeId, course: $course) { ${MENU_FULL} }
        }`,
        { menuId, recipeId, course },
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.toggleRecipeInMenu, null, 2) }] };
    },
  );

  server.tool(
    'delete_menu',
    'Delete a menu.',
    { id: z.string().describe('Menu ID') },
    async ({ id }) => {
      await gql(`mutation($id: String!) { deleteMenu(id: $id) }`, { id });
      return { content: [{ type: 'text' as const, text: `Deleted menu ${id}` }] };
    },
  );
}

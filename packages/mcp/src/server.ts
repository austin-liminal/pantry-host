import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerIngredientTools } from './tools/ingredients.js';
import { registerRecipeTools } from './tools/recipes.js';
import { registerCookwareTools } from './tools/cookware.js';
import { registerMenuTools } from './tools/menus.js';
import { registerKitchenTools } from './tools/kitchens.js';
import { registerGenerateTools } from './tools/generate.js';
import { registerResources } from './resources/pantry.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'pantry-host',
    version: '0.1.0',
  });

  registerIngredientTools(server);
  registerRecipeTools(server);
  registerCookwareTools(server);
  registerMenuTools(server);
  registerKitchenTools(server);
  registerGenerateTools(server);
  registerResources(server);

  return server;
}

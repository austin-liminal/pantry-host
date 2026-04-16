import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { gql } from '../graphql-client.js';

export function registerGenerateTools(server: McpServer) {
  // Only register AI tool if the GraphQL server has an AI key configured.
  // The tool itself doesn't need the key — the GraphQL server handles that.
  // We register it unconditionally and let the server return a clear error if no key is set.
  server.tool(
    'generate_recipes',
    'Use AI to generate 3 recipes based on current pantry ingredients and cookware. Requires AI_API_KEY to be configured on the PantryHost server. May take 15-30 seconds. Recipes without a photoUrl fall back to Pixabay on card grids when the user has enabled it in Settings.',
    {},
    async () => {
      const data = await gql<{ generateRecipes: Array<{ id: string; title: string; tags: string[] }> }>(
        `mutation { generateRecipes { id slug title description tags servings prepTime cookTime } }`,
      );
      return {
        content: [{
          type: 'text' as const,
          text: `Generated ${data.generateRecipes.length} recipes:\n${data.generateRecipes.map((r) => `- ${r.title} (${r.tags.join(', ')})`).join('\n')}`,
        }],
      };
    },
  );
}

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { gql } from '../graphql-client.js';

const COOKWARE_FIELDS = `id name brand tags`;

export function registerCookwareTools(server: McpServer) {
  server.tool(
    'list_cookware',
    'List all cookware in a kitchen.',
    {
      kitchenSlug: z.string().optional().describe('Kitchen slug (default: home)'),
    },
    async ({ kitchenSlug }) => {
      const data = await gql<{ cookware: unknown[] }>(
        `query($kitchenSlug: String) { cookware(kitchenSlug: $kitchenSlug) { ${COOKWARE_FIELDS} } }`,
        { kitchenSlug },
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.cookware, null, 2) }] };
    },
  );

  server.tool(
    'get_cookware',
    'Get a single cookware item with its associated recipes.',
    { id: z.string().describe('Cookware ID') },
    async ({ id }) => {
      const data = await gql<{ cookwareItem: unknown }>(
        `query($id: String!) { cookwareItem(id: $id) { ${COOKWARE_FIELDS} recipes { id slug title tags } } }`,
        { id },
      );
      if (!data.cookwareItem) return { content: [{ type: 'text' as const, text: 'Cookware not found' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.cookwareItem, null, 2) }] };
    },
  );

  server.tool(
    'add_cookware',
    'Add a cookware item to a kitchen.',
    {
      name: z.string().describe('Cookware name (e.g. Cast Iron Skillet)'),
      brand: z.string().optional().describe('Brand name'),
      tags: z.array(z.string()).optional().describe('Tags'),
      kitchenSlug: z.string().optional().describe('Kitchen slug (default: home)'),
    },
    async (args) => {
      const data = await gql<{ addCookware: unknown }>(
        `mutation($name: String!, $brand: String, $tags: [String!], $kitchenSlug: String) {
          addCookware(name: $name, brand: $brand, tags: $tags, kitchenSlug: $kitchenSlug) { ${COOKWARE_FIELDS} }
        }`,
        args,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.addCookware, null, 2) }] };
    },
  );

  server.tool(
    'update_cookware',
    'Update a cookware item.',
    {
      id: z.string().describe('Cookware ID'),
      name: z.string().optional(),
      brand: z.string().optional(),
      tags: z.array(z.string()).optional(),
    },
    async (args) => {
      const data = await gql<{ updateCookware: unknown }>(
        `mutation($id: String!, $name: String, $brand: String, $tags: [String!]) {
          updateCookware(id: $id, name: $name, brand: $brand, tags: $tags) { ${COOKWARE_FIELDS} }
        }`,
        args,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.updateCookware, null, 2) }] };
    },
  );

  server.tool(
    'delete_cookware',
    'Delete a cookware item.',
    { id: z.string().describe('Cookware ID') },
    async ({ id }) => {
      await gql(`mutation($id: String!) { deleteCookware(id: $id) }`, { id });
      return { content: [{ type: 'text' as const, text: `Deleted cookware ${id}` }] };
    },
  );
}

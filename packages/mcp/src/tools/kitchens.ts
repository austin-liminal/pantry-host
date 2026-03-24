import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { gql } from '../graphql-client.js';

const KITCHEN_FIELDS = `id slug name createdAt`;

export function registerKitchenTools(server: McpServer) {
  server.tool(
    'list_kitchens',
    'List all kitchens.',
    {},
    async () => {
      const data = await gql<{ kitchens: unknown[] }>(
        `{ kitchens { ${KITCHEN_FIELDS} } }`,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.kitchens, null, 2) }] };
    },
  );

  server.tool(
    'get_kitchen',
    'Get a kitchen by slug.',
    { slug: z.string().describe('Kitchen slug (e.g. home)') },
    async ({ slug }) => {
      const data = await gql<{ kitchen: unknown }>(
        `query($slug: String!) { kitchen(slug: $slug) { ${KITCHEN_FIELDS} } }`,
        { slug },
      );
      if (!data.kitchen) return { content: [{ type: 'text' as const, text: 'Kitchen not found' }] };
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.kitchen, null, 2) }] };
    },
  );

  server.tool(
    'create_kitchen',
    'Create a new kitchen.',
    {
      slug: z.string().describe('URL-friendly slug (lowercase, hyphens, no spaces)'),
      name: z.string().describe('Display name'),
    },
    async (args) => {
      const data = await gql<{ createKitchen: unknown }>(
        `mutation($slug: String!, $name: String!) { createKitchen(slug: $slug, name: $name) { ${KITCHEN_FIELDS} } }`,
        args,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.createKitchen, null, 2) }] };
    },
  );

  server.tool(
    'update_kitchen',
    'Rename a kitchen (cannot rename the home kitchen).',
    {
      id: z.string().describe('Kitchen ID'),
      name: z.string().describe('New display name'),
    },
    async (args) => {
      const data = await gql<{ updateKitchen: unknown }>(
        `mutation($id: String!, $name: String!) { updateKitchen(id: $id, name: $name) { ${KITCHEN_FIELDS} } }`,
        args,
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(data.updateKitchen, null, 2) }] };
    },
  );

  server.tool(
    'delete_kitchen',
    'Delete a kitchen and all its data (cannot delete the home kitchen).',
    { id: z.string().describe('Kitchen ID') },
    async ({ id }) => {
      await gql(`mutation($id: String!) { deleteKitchen(id: $id) }`, { id });
      return { content: [{ type: 'text' as const, text: `Deleted kitchen ${id}` }] };
    },
  );
}

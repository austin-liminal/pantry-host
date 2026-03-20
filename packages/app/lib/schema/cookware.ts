import { builder } from './builder';
import sql from '../db';

const CookwareType = builder.objectType('Cookware', {
  fields: (t) => ({
    id: t.exposeString('id'),
    name: t.exposeString('name'),
    brand: t.string({ nullable: true, resolve: (r) => r.brand }),
    tags: t.stringList({ resolve: (r) => r.tags ?? [] }),
    createdAt: t.string({ resolve: (r) => r.created_at?.toISOString() ?? '' }),
  }),
});

builder.queryField('cookware', (t) =>
  t.field({
    type: [CookwareType],
    resolve: async () => sql`SELECT * FROM cookware ORDER BY name`,
  }),
);

builder.mutationField('addCookware', (t) =>
  t.field({
    type: CookwareType,
    args: {
      name: t.arg.string({ required: true }),
      brand: t.arg.string(),
      tags: t.arg.stringList(),
    },
    resolve: async (_, args) => {
      const [row] = await sql`
        INSERT INTO cookware (name, brand, tags)
        VALUES (${args.name}, ${args.brand ?? null}, ${sql.array(args.tags ?? [])})
        RETURNING *
      `;
      return row;
    },
  }),
);

builder.mutationField('updateCookware', (t) =>
  t.field({
    type: CookwareType,
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      brand: t.arg.string(),
      tags: t.arg.stringList(),
    },
    resolve: async (_, args) => {
      const [row] = await sql`
        UPDATE cookware SET
          name = COALESCE(${args.name ?? null}, name),
          brand = COALESCE(${args.brand ?? null}, brand),
          tags = COALESCE(${args.tags ? sql.array(args.tags) : null}, tags)
        WHERE id = ${args.id}
        RETURNING *
      `;
      return row;
    },
  }),
);

builder.mutationField('deleteCookware', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (_, { id }) => {
      await sql`DELETE FROM cookware WHERE id = ${id}`;
      return true;
    },
  }),
);

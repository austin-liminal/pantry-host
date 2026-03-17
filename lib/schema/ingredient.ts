import { builder } from './builder';
import sql from '../db';

const IngredientType = builder.objectType('Ingredient', {
  fields: (t) => ({
    id: t.exposeString('id'),
    name: t.exposeString('name'),
    category: t.string({ nullable: true, resolve: (r) => r.category }),
    quantity: t.float({ nullable: true, resolve: (r) => r.quantity }),
    unit: t.string({ nullable: true, resolve: (r) => r.unit }),
    alwaysOnHand: t.boolean({ resolve: (r) => r.always_on_hand ?? false }),
    tags: t.stringList({ resolve: (r) => r.tags ?? [] }),
    createdAt: t.string({ resolve: (r) => r.created_at?.toISOString() ?? '' }),
  }),
});

const IngredientInputType = builder.inputType('IngredientInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    category: t.string(),
    quantity: t.float(),
    unit: t.string(),
    alwaysOnHand: t.boolean(),
    tags: t.stringList(),
  }),
});

builder.queryField('ingredients', (t) =>
  t.field({
    type: [IngredientType],
    args: {
      tags: t.arg.stringList(),
    },
    resolve: async (_, { tags }) => {
      if (tags && tags.length > 0) {
        return sql`SELECT * FROM ingredients WHERE tags @> ${sql.array(tags)} ORDER BY name`;
      }
      return sql`SELECT * FROM ingredients ORDER BY name`;
    },
  }),
);

builder.mutationField('addIngredient', (t) =>
  t.field({
    type: IngredientType,
    args: {
      name: t.arg.string({ required: true }),
      category: t.arg.string(),
      quantity: t.arg.float(),
      unit: t.arg.string(),
      alwaysOnHand: t.arg.boolean(),
      tags: t.arg.stringList(),
    },
    resolve: async (_, args) => {
      const [row] = await sql`
        INSERT INTO ingredients (name, category, quantity, unit, always_on_hand, tags)
        VALUES (
          ${args.name},
          ${args.category ?? null},
          ${args.quantity ?? null},
          ${args.unit ?? null},
          ${args.alwaysOnHand ?? false},
          ${sql.array(args.tags ?? [])}
        )
        RETURNING *
      `;
      return row;
    },
  }),
);

builder.mutationField('addIngredients', (t) =>
  t.field({
    type: [IngredientType],
    args: {
      inputs: t.arg({ type: [IngredientInputType], required: true }),
    },
    resolve: async (_, { inputs }) => {
      if (inputs.length === 0) return [];
      const rows = await sql`
        INSERT INTO ingredients ${sql(
          inputs.map((i) => ({
            name: i.name,
            category: i.category ?? null,
            quantity: i.quantity ?? null,
            unit: i.unit ?? null,
            always_on_hand: i.alwaysOnHand ?? false,
            tags: i.tags ?? [],
          })),
          'name',
          'category',
          'quantity',
          'unit',
          'always_on_hand',
          'tags',
        )}
        RETURNING *
      `;
      return rows;
    },
  }),
);

builder.mutationField('updateIngredient', (t) =>
  t.field({
    type: IngredientType,
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      category: t.arg.string(),
      quantity: t.arg.float(),
      unit: t.arg.string(),
      alwaysOnHand: t.arg.boolean(),
      tags: t.arg.stringList(),
    },
    resolve: async (_, args) => {
      const [row] = await sql`
        UPDATE ingredients SET
          name = COALESCE(${args.name ?? null}, name),
          category = COALESCE(${args.category ?? null}, category),
          always_on_hand = COALESCE(${args.alwaysOnHand ?? null}, always_on_hand),
          quantity = CASE WHEN ${args.alwaysOnHand ?? null} = true THEN NULL ELSE ${args.quantity ?? null}::numeric END,
          unit = CASE WHEN ${args.alwaysOnHand ?? null} = true THEN NULL ELSE ${args.unit ?? null}::text END,
          tags = COALESCE(${args.tags ? sql.array(args.tags) : null}, tags),
          updated_at = NOW()
        WHERE id = ${args.id}
        RETURNING *
      `;
      return row;
    },
  }),
);

builder.mutationField('deleteIngredient', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      id: t.arg.string({ required: true }),
    },
    resolve: async (_, { id }) => {
      await sql`DELETE FROM ingredients WHERE id = ${id}`;
      return true;
    },
  }),
);

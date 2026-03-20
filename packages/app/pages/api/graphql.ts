import { execute, parse, validate } from 'graphql';
import type { NextApiRequest, NextApiResponse } from 'next';
import { schema } from '@/lib/schema';

export const config = {
  api: { bodyParser: true },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ errors: [{ message: 'Method not allowed' }] });
    return;
  }

  const { query, variables } = req.body as { query: string; variables?: Record<string, unknown> };

  if (!query) {
    res.status(400).json({ errors: [{ message: 'Missing query' }] });
    return;
  }

  try {
    const document = parse(query);
    const errors = validate(schema, document);
    if (errors.length) {
      res.status(200).json({ errors: errors.map((e) => ({ message: e.message })) });
      return;
    }
    const result = await execute({ schema, document, variableValues: variables ?? {} });
    res.status(200).json(result);
  } catch (err) {
    res.status(200).json({ errors: [{ message: (err as Error).message }] });
  }
}

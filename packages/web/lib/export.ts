/**
 * Data export — SQL dump + images zip.
 *
 * Generates a downloadable backup of the user's PGlite data:
 * - backup.sql with INSERT statements for all tables
 * - images/ directory with OPFS files
 */

import { getRawDB } from '@/lib/db';
import { listFiles, opfsStorage } from '@/lib/storage-opfs';

const TABLES = [
  'kitchens',
  'ingredients',
  'recipes',
  'recipe_ingredients',
  'cookware',
  'menus',
  'menu_recipes',
] as const;

/** Generate SQL INSERT statements for all data */
export async function generateSQLDump(): Promise<string> {
  const db = await getRawDB();
  const lines: string[] = [
    '-- Pantry Host data export',
    `-- Generated: ${new Date().toISOString()}`,
    '',
  ];

  for (const table of TABLES) {
    const result = await db.query(`SELECT * FROM ${table}`);
    if (result.rows.length === 0) continue;

    lines.push(`-- ${table}`);

    for (const row of result.rows as Record<string, unknown>[]) {
      const cols = Object.keys(row);
      const vals = cols.map((col) => {
        const v = row[col];
        if (v === null || v === undefined) return 'NULL';
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        if (typeof v === 'number') return String(v);
        if (v instanceof Date) return `'${v.toISOString()}'`;
        if (Array.isArray(v)) {
          const items = v.map((i) => `'${String(i).replace(/'/g, "''")}'`).join(', ');
          return `ARRAY[${items}]`;
        }
        return `'${String(v).replace(/'/g, "''")}'`;
      });
      lines.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Download SQL dump as a file */
export async function downloadSQLDump(): Promise<void> {
  const sql = await generateSQLDump();
  const blob = new Blob([sql], { type: 'text/sql' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pantryhost-backup-${new Date().toISOString().split('T')[0]}.sql`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Download full backup (SQL + images) as zip — requires JSZip or similar */
export async function downloadFullBackup(): Promise<void> {
  // For now, just download the SQL dump
  // TODO: Add JSZip for images when needed
  await downloadSQLDump();
}

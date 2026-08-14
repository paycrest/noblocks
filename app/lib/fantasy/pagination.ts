import "server-only";

/** PostgREST / Supabase client page size (hard cap per response). */
export const DB_PAGE = 1000;

/** Max values per `.in(...)` filter — keeps PostgREST URL length safe. */
export const IN_CHUNK = 100;

/** Page through a supabase query (the client caps responses at DB_PAGE rows). */
export async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += DB_PAGE) {
    const { data, error } = await query(from, from + DB_PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < DB_PAGE) break;
  }
  return rows;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Paginated fetch with `.in(column, chunk)` — one full paginated scan per chunk.
 */
export async function fetchAllIn<T>(
  values: string[],
  chunkSize: number,
  queryForChunk: (
    chunk: string[],
  ) => {
    range: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: unknown }>;
  },
): Promise<T[]> {
  if (values.length === 0) return [];
  const unique = [...new Set(values)];
  const rows: T[] = [];
  for (const chunk of chunkArray(unique, chunkSize)) {
    const part = await fetchAll<T>((from, to) => queryForChunk(chunk).range(from, to));
    rows.push(...part);
  }
  return rows;
}

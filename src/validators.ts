/**
 * SQL query validators for MySQL MCP server
 * Ensures that only read-only queries are allowed
 */

// List of allowed SQL commands (read-only operations)
const ALLOWED_COMMANDS = [
  'SELECT',
  'SHOW',
  'DESCRIBE',
  'DESC',
  'EXPLAIN'
];

/**
 * Validates if a SQL query is read-only based on its opening keyword.
 * The actual read-only enforcement is done at the session level via
 * `SET SESSION TRANSACTION READ ONLY` in connection.ts.
 */
export function isReadOnlyQuery(query: string): boolean {
  const normalizedQuery = query
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const startsWithAllowed = ALLOWED_COMMANDS.some(cmd =>
    normalizedQuery.startsWith(cmd + ' ') || normalizedQuery === cmd
  );

  return startsWithAllowed;
}

/**
 * Validates if a SQL query is safe to execute
 */
export function validateQuery(query: string): void {
  console.error('[Validator] Validating query:', query);

  if (!query || typeof query !== 'string') {
    throw new Error('Query must be a non-empty string');
  }

  if (!isReadOnlyQuery(query)) {
    console.error('[Validator] Query rejected: not read-only');
    throw new Error('Only read-only queries are allowed (SELECT, SHOW, DESCRIBE, EXPLAIN)');
  }

  console.error('[Validator] Query validated as read-only');
}

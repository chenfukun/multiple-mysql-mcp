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
  'EXPLAIN',
];

// List of disallowed SQL commands (write operations)
const DISALLOWED_COMMANDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'CREATE',
  'ALTER',
  'TRUNCATE',
  'RENAME',
  'REPLACE',
  'GRANT',
  'REVOKE',
  'LOCK',
  'UNLOCK',
  'CALL',
  'EXEC',
  'EXECUTE',
  'SET',
  'START',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
];

/**
 * Validates if a SQL query is read-only
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

  const containsDisallowed = DISALLOWED_COMMANDS.some(cmd => {
    const regex = new RegExp(`(^|\\s)${cmd}(\\s|$)`);
    return regex.test(normalizedQuery);
  });

  const hasMultipleStatements = normalizedQuery.includes(';') &&
    !normalizedQuery.endsWith(';');

  return startsWithAllowed && !containsDisallowed && !hasMultipleStatements;
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

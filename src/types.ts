/**
 * Type definitions for Multiple MySQL MCP server
 */

// Single MySQL instance configuration
export interface MySQLInstanceConfig {
  name: string;
  description?: string;
  host: string;
  port: number;
  user: string;
  password?: string;
  database?: string;

  // Connection pool options
  connectionLimit?: number;
  queueLimit?: number;
  connectTimeout?: number;
  idleTimeout?: number;
  maxIdle?: number;
}

// Top-level configuration file structure
export interface MultiMySQLConfig {
  instances: MySQLInstanceConfig[];
}

// Database information
export interface DatabaseInfo {
  name: string;
}

// Table information
export interface TableInfo {
  name: string;
  type: string;
}

// Column information
export interface ColumnInfo {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
}

// Query result
export interface QueryResult {
  rows: any[];
  fields: any[];
}

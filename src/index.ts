#!/usr/bin/env node

/**
 * Multiple MySQL Database Access MCP Server
 *
 * This MCP server provides read-only access to multiple MySQL instances
 * through a single MCP connection. Instances are configured via an external
 * JSON config file referenced by the MYSQL_CONFIG_FILE environment variable.
 *
 * Tools:
 * - list_instances: List all configured MySQL instances
 * - list_databases: List databases on a specific instance
 * - list_tables: List tables in a database on a specific instance
 * - describe_table: Show table schema on a specific instance
 * - execute_query: Execute read-only SQL on a specific instance
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { loadConfig } from './config.js';
import { initializePools, getPool, closeAllPools, executeQuery, isPoolAvailable } from './connection.js';
import { validateQuery } from './validators.js';
import { MySQLInstanceConfig } from './types.js';

// Load config and initialize pools
let instances: MySQLInstanceConfig[];

try {
  instances = loadConfig();
  initializePools(instances);
} catch (error) {
  console.error('[Fatal] Failed to initialize:', error);
  process.exit(1);
}

/**
 * Create an MCP server with tools for multiple MySQL database access
 */
const server = new Server(
  {
    name: "multiple-mysql-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler that lists available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_instances",
        description: "List all configured MySQL instances",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "list_databases",
        description: "List all accessible databases on a MySQL instance",
        inputSchema: {
          type: "object",
          properties: {
            instance: {
              type: "string",
              description: "MySQL instance name (required, use list_instances to see available instances)"
            }
          },
          required: ["instance"]
        }
      },
      {
        name: "list_tables",
        description: "List all tables in a specified database",
        inputSchema: {
          type: "object",
          properties: {
            instance: {
              type: "string",
              description: "MySQL instance name (required, use list_instances to see available instances)"
            },
            database: {
              type: "string",
              description: "Database name (optional, uses default if not specified)"
            }
          },
          required: ["instance"]
        }
      },
      {
        name: "describe_table",
        description: "Show the schema for a specific table",
        inputSchema: {
          type: "object",
          properties: {
            instance: {
              type: "string",
              description: "MySQL instance name (required, use list_instances to see available instances)"
            },
            database: {
              type: "string",
              description: "Database name (optional, uses default if not specified)"
            },
            table: {
              type: "string",
              description: "Table name"
            }
          },
          required: ["instance", "table"]
        }
      },
      {
        name: "execute_query",
        description: "Execute a read-only SQL query",
        inputSchema: {
          type: "object",
          properties: {
            instance: {
              type: "string",
              description: "MySQL instance name (required, use list_instances to see available instances)"
            },
            query: {
              type: "string",
              description: "SQL query (only SELECT, SHOW, DESCRIBE, and EXPLAIN statements are allowed)"
            },
            database: {
              type: "string",
              description: "Database name (optional, uses default if not specified)"
            },
            timezone: {
              type: "string",
              description: "Session timezone for this query (e.g. '+08:00', '+00:00'). Affects TIMESTAMP display and NOW(). Does not affect DATETIME columns."
            }
          },
          required: ["instance", "query"]
        }
      }
    ]
  };
});

/**
 * Handler for tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "list_instances": {
        console.error('[Tool] Executing list_instances');

        const instanceList = await Promise.all(
          instances.map(async (inst) => {
            let available = false;
            try {
              const pool = getPool(inst.name);
              available = await isPoolAvailable(pool);
            } catch {
              available = false;
            }
            return {
              name: inst.name,
              description: inst.description || '',
              available,
            };
          })
        );

        return {
          content: [{
            type: "text",
            text: JSON.stringify(instanceList, null, 2)
          }]
        };
      }

      case "list_databases": {
        console.error('[Tool] Executing list_databases');

        const instanceName = request.params.arguments?.instance as string;
        if (!instanceName) {
          throw new McpError(ErrorCode.InvalidParams, "instance is required");
        }

        const pool = getPool(instanceName);
        const { rows } = await executeQuery(pool, 'SHOW DATABASES');

        return {
          content: [{
            type: "text",
            text: JSON.stringify(rows, null, 2)
          }]
        };
      }

      case "list_tables": {
        console.error('[Tool] Executing list_tables');

        const instanceName = request.params.arguments?.instance as string;
        if (!instanceName) {
          throw new McpError(ErrorCode.InvalidParams, "instance is required");
        }

        const database = request.params.arguments?.database as string | undefined;
        const pool = getPool(instanceName);
        const { rows } = await executeQuery(pool, 'SHOW FULL TABLES', [], database);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(rows, null, 2)
          }]
        };
      }

      case "describe_table": {
        console.error('[Tool] Executing describe_table');

        const instanceName = request.params.arguments?.instance as string;
        if (!instanceName) {
          throw new McpError(ErrorCode.InvalidParams, "instance is required");
        }

        const database = request.params.arguments?.database as string | undefined;
        const table = request.params.arguments?.table as string;

        if (!table) {
          throw new McpError(ErrorCode.InvalidParams, "Table name is required");
        }

        const pool = getPool(instanceName);
        const { rows } = await executeQuery(pool, `DESCRIBE \`${table}\``, [], database);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(rows, null, 2)
          }]
        };
      }

      case "execute_query": {
        console.error('[Tool] Executing execute_query');

        const instanceName = request.params.arguments?.instance as string;
        if (!instanceName) {
          throw new McpError(ErrorCode.InvalidParams, "instance is required");
        }

        const query = request.params.arguments?.query as string;
        const database = request.params.arguments?.database as string | undefined;
        const timezone = request.params.arguments?.timezone as string | undefined;

        if (!query) {
          throw new McpError(ErrorCode.InvalidParams, "Query is required");
        }

        // Validate that the query is read-only
        validateQuery(query);

        const pool = getPool(instanceName);
        const { rows } = await executeQuery(pool, query, [], database, timezone);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(rows, null, 2)
          }]
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    console.error('[Error] Tool execution failed:', error);

    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
});

/**
 * Start the server using stdio transport
 */
async function main() {
  console.error('[Setup] Starting Multiple MySQL MCP server');

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('[Setup] Multiple MySQL MCP server running on stdio');
  } catch (error) {
    console.error('[Fatal] Failed to start server:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.error('[Shutdown] Closing all MySQL connection pools');
  await closeAllPools();
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('[Fatal] Unhandled error:', error);
  process.exit(1);
});

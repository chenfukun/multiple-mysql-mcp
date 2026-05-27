# multiple-mysql-mcp

一个 MCP Server，通过单个 MCP 连接提供对多个 MySQL 实例的**只读**访问。

GitHub: [https://github.com/chenfukun/multiple-mysql-mcp](https://github.com/chenfukun/multiple-mysql-mcp)

## Features

- 一个 MCP Server 同时连接多个 MySQL 实例
- 通过外部 JSON 配置文件管理实例
- 只读访问（仅允许 SELECT、SHOW、DESCRIBE、EXPLAIN）
- 每个实例独立连接池
- 所有工具通过 `instance` 参数指定目标实例
- `list_instances` 实时检测实例可用性

## 配置

### 实例配置文件

创建 JSON 文件配置 MySQL 实例，通过环境变量 `MYSQL_CONFIG_FILE` 指定路径。

完整字段说明见 [config.example.json](./config.example.json)。

```json
{
  "instances": [
    {
      "name": "prod-main",
      "description": "生产环境主库",
      "host": "prod-mysql.example.com",
      "port": 3306,
      "user": "readonly_user",
      "password": "your_password",
      "database": "app_db",
      "connectionLimit": 10,
      "queueLimit": 0,
      "connectTimeout": 10000,
      "idleTimeout": 60000,
      "maxIdle": 3
    }
  ]
}
```

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| name | Yes | - | 实例唯一标识，调用工具时通过此名称指定实例 |
| host | Yes | - | MySQL 主机地址 |
| user | Yes | - | MySQL 用户名 |
| description | No | - | 实例描述，list_instances 时展示 |
| port | No | 3306 | MySQL 端口 |
| password | No | - | MySQL 密码 |
| database | No | - | 默认数据库，工具调用时可省略 database 参数 |
| connectionLimit | No | 10 | 连接池最大连接数 |
| queueLimit | No | 0 | 等待队列最大长度，0 表示无限制 |
| connectTimeout | No | 10000 | 建立连接超时时间(ms) |
| idleTimeout | No | - | 空闲连接超时时间(ms)，超时后自动释放 |
| maxIdle | No | - | 连接池中最大空闲连接数 |

### MCP 客户端配置

在 `.kiro/settings/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "multiple-mysql": {
      "command": "node",
      "args": ["/path/to/multiple-mysql-mcp/build/index.js"],
      "env": {
        "MYSQL_CONFIG_FILE": "/path/to/mysql-instances.json"
      }
    }
  }
}
```

## Tools

### list_instances

列出所有配置的 MySQL 实例及可用性状态。

**Parameters:** 无

**Response:**
```json
[
  { "name": "prod-main", "description": "生产环境主库", "available": true }
]
```

### list_databases

列出指定实例上的所有数据库。

| Parameter | Required | Description |
|-----------|----------|-------------|
| instance | Yes | 实例名称 |

### list_tables

列出指定数据库中的所有表。

| Parameter | Required | Description |
|-----------|----------|-------------|
| instance | Yes | 实例名称 |
| database | No | 数据库名，不填使用实例默认数据库 |

### describe_table

查看表结构。

| Parameter | Required | Description |
|-----------|----------|-------------|
| instance | Yes | 实例名称 |
| table | Yes | 表名 |
| database | No | 数据库名 |

### execute_query

执行只读 SQL 查询。

| Parameter | Required | Description |
|-----------|----------|-------------|
| instance | Yes | 实例名称 |
| query | Yes | SQL 语句（仅 SELECT/SHOW/DESCRIBE/EXPLAIN） |
| database | No | 数据库名 |
| timezone | No | 会话时区，如 `+08:00`、`-07:00` |

## Build

```bash
npm install
npm run build
```

import json
import logging
from datetime import datetime, date
from decimal import Decimal

from flask import Response, request, stream_with_context
from flask_restful import abort

from redash import models, settings
from redash.handlers.base import BaseResource, get_object_or_404
from redash.permissions import require_access, view_only

logger = logging.getLogger(__name__)


def json_serializer(obj):
    """JSON serializer for objects not serializable by default."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")

# Tool definitions for Claude
TOOL_DEFINITIONS = [
    {
        "name": "get_schema",
        "description": "Get schema information (table names and column details) for specific tables. Use this to understand the structure of tables before writing queries.",
        "input_schema": {
            "type": "object",
            "properties": {
                "tables": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of table names to get schema for. If empty, returns all available tables."
                }
            },
            "required": []
        }
    },
    {
        "name": "get_sample_data",
        "description": "Get sample rows from a table to understand the data format and content. Limited to 5 rows.",
        "input_schema": {
            "type": "object",
            "properties": {
                "table_name": {
                    "type": "string",
                    "description": "Name of the table to get sample data from"
                }
            },
            "required": ["table_name"]
        }
    },
    {
        "name": "execute_query",
        "description": "Request to execute a SQL query. IMPORTANT: This requires user approval before execution. The user will review the query and can approve, modify, or reject it. Use this when you want to verify a query's results or explore data. Limited to 100 rows.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "SQL query to execute (requires user approval)"
                },
                "purpose": {
                    "type": "string",
                    "description": "Brief explanation of why you want to run this query"
                }
            },
            "required": ["query"]
        }
    }
]


def get_ai_settings(org):
    """Get AI settings from organization settings."""
    ai_enabled = org.get_setting("ai_query_generation_enabled")
    if ai_enabled is None:
        ai_enabled = settings.AI_QUERY_GENERATION_ENABLED

    ai_api_key = org.get_setting("ai_api_key")
    if not ai_api_key:
        ai_api_key = settings.ANTHROPIC_API_KEY

    return {
        "enabled": ai_enabled,
        "api_key": ai_api_key
    }


def create_sse_event(event_type, data):
    """Format data as SSE event."""
    return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False, default=json_serializer)}\n\n"


def format_schema_for_context(schema):
    """Convert schema data to a concise format for the system prompt."""
    if not schema:
        return "No schema available."

    lines = []
    for table in schema:
        table_name = table.get("name", "unknown")
        columns = table.get("columns", [])

        if isinstance(columns, dict):
            col_list = [f"{col_name} ({col_info.get('type', '?')})"
                        for col_name, col_info in columns.items()]
        elif isinstance(columns, list):
            col_list = []
            for col in columns:
                if isinstance(col, str):
                    col_list.append(col)
                else:
                    col_list.append(f"{col.get('name', '?')} ({col.get('type', '?')})")
        else:
            col_list = []

        lines.append(f"- {table_name}: {', '.join(col_list[:10])}")
        if len(col_list) > 10:
            lines[-1] += f" ... and {len(col_list) - 10} more columns"

    return "\n".join(lines)


def get_system_prompt(schema, data_source_type, ontology=None):
    """Generate system prompt with schema context."""
    schema_summary = format_schema_for_context(schema)

    ontology_section = ""
    if ontology and ontology.strip():
        ontology_section = f"""
## Ontology/Metadata
{ontology}
"""

    return f"""You are an expert SQL assistant for a {data_source_type} database. Help users explore data and write SQL queries through conversation.

## Available Tables
{schema_summary}
{ontology_section}
## Your Capabilities
You have access to tools to help users:
1. **get_schema**: Get detailed schema for specific tables (columns and types)
2. **get_sample_data**: View sample rows from tables (max 5 rows)
3. **execute_query**: Run SQL queries to verify results (max 100 rows)

## Guidelines
- Use tools proactively to understand the data before writing queries
- When suggesting SQL queries, format them in ```sql code blocks
- Explain your reasoning and what the query does
- If a query doesn't work, debug it using the tools
- Keep responses concise but helpful
- Ask clarifying questions if the user's request is ambiguous"""


class AIAssistantExecuteQueryResource(BaseResource):
    """API endpoint to execute approved queries."""

    def post(self):
        """Execute an approved query."""
        ai_settings = get_ai_settings(self.current_org)

        if not ai_settings["enabled"]:
            abort(403, message="AI assistant is not enabled.")

        req = request.get_json(True)
        data_source_id = req.get("data_source_id")
        query = req.get("query", "").strip()

        if not data_source_id:
            abort(400, message="data_source_id is required.")

        if not query:
            abort(400, message="query is required.")

        # Get data source and verify access
        data_source = get_object_or_404(
            models.DataSource.get_by_id_and_org,
            data_source_id,
            self.current_org
        )
        require_access(data_source, self.current_user, view_only)

        # Add safety limit if not present
        query_upper = query.upper()
        if "LIMIT" not in query_upper and query_upper.startswith("SELECT"):
            query = f"{query} LIMIT 100"

        try:
            query_runner = data_source.query_runner
            data, error = query_runner.run_query(query, None)

            if error:
                return {"error": error}

            # Parse data if it's a string
            if isinstance(data, str):
                data = json.loads(data)

            # Limit response size
            if "rows" in data and len(data["rows"]) > 100:
                data["rows"] = data["rows"][:100]
                data["truncated"] = True

            return {"data": data}
        except Exception as e:
            logger.exception("Query execution error")
            return {"error": str(e)}


class AIAssistantChatResource(BaseResource):
    """API endpoint for AI chat with SSE streaming."""

    def post(self):
        # Get AI settings
        ai_settings = get_ai_settings(self.current_org)

        if not ai_settings["enabled"]:
            abort(403, message="AI assistant is not enabled.")

        if not ai_settings["api_key"]:
            abort(503, message="AI assistant is not configured. Please set up the API key.")

        req = request.get_json(True)
        data_source_id = req.get("data_source_id")
        messages = req.get("messages", [])

        if not data_source_id:
            abort(400, message="data_source_id is required.")

        if not messages:
            abort(400, message="messages is required.")

        # Get data source and verify access
        data_source = get_object_or_404(
            models.DataSource.get_by_id_and_org,
            data_source_id,
            self.current_org
        )
        require_access(data_source, self.current_user, view_only)

        # Get cached schema
        schema = data_source.get_cached_schema()
        if not schema:
            abort(400, message="Schema is not available. Please refresh the schema first.")

        api_key = ai_settings["api_key"]
        system_prompt = get_system_prompt(
            schema,
            data_source.type,
            getattr(data_source, 'ontology', None)
        )

        def generate():
            try:
                import anthropic
            except ImportError:
                yield create_sse_event("error", {"message": "anthropic package is not installed."})
                return

            try:
                client = anthropic.Anthropic(api_key=api_key)

                # Convert messages to Anthropic format
                anthropic_messages = []
                for msg in messages:
                    anthropic_messages.append({
                        "role": msg["role"],
                        "content": msg["content"]
                    })

                # Agentic loop: handle tool calls
                while True:
                    # Stream the response
                    with client.messages.stream(
                        model="claude-sonnet-4-20250514",
                        max_tokens=4096,
                        system=system_prompt,
                        tools=TOOL_DEFINITIONS,
                        messages=anthropic_messages
                    ) as stream:
                        collected_content = []
                        current_text = ""

                        for event in stream:
                            if event.type == "content_block_start":
                                if hasattr(event.content_block, 'type'):
                                    if event.content_block.type == "text":
                                        current_text = ""
                                    elif event.content_block.type == "tool_use":
                                        yield create_sse_event("tool_start", {
                                            "tool": event.content_block.name,
                                            "id": event.content_block.id
                                        })

                            elif event.type == "content_block_delta":
                                if hasattr(event.delta, 'text'):
                                    current_text += event.delta.text
                                    yield create_sse_event("text_delta", {
                                        "text": event.delta.text
                                    })

                            elif event.type == "content_block_stop":
                                pass

                        # Get the final message
                        final_message = stream.get_final_message()

                        # Check if there are tool calls to process
                        tool_calls = [
                            block for block in final_message.content
                            if block.type == "tool_use"
                        ]

                        if not tool_calls:
                            # No more tool calls, we're done
                            yield create_sse_event("done", {
                                "usage": {
                                    "input_tokens": final_message.usage.input_tokens,
                                    "output_tokens": final_message.usage.output_tokens
                                }
                            })
                            break

                        # Process tool calls
                        tool_results = []
                        for tool_call in tool_calls:
                            result = self._execute_tool(
                                tool_call.name,
                                tool_call.input,
                                data_source,
                                schema
                            )
                            yield create_sse_event("tool_result", {
                                "tool": tool_call.name,
                                "result": result
                            })
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": tool_call.id,
                                "content": json.dumps(result, default=json_serializer)
                            })

                        # Add assistant message and tool results to continue conversation
                        anthropic_messages.append({
                            "role": "assistant",
                            "content": final_message.content
                        })
                        anthropic_messages.append({
                            "role": "user",
                            "content": tool_results
                        })

            except anthropic.AuthenticationError:
                yield create_sse_event("error", {"message": "Invalid API key."})
            except anthropic.RateLimitError:
                yield create_sse_event("error", {"message": "Rate limit exceeded. Please try again later."})
            except anthropic.APIError as e:
                yield create_sse_event("error", {"message": f"API error: {str(e)}"})
            except Exception as e:
                logger.exception("AI Assistant error")
                yield create_sse_event("error", {"message": f"Error: {str(e)}"})

        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream; charset=utf-8',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive',
                'Content-Type': 'text/event-stream; charset=utf-8'
            }
        )

    def _execute_tool(self, tool_name, tool_input, data_source, schema, pending_approvals=None):
        """Execute a tool and return the result."""
        try:
            if tool_name == "get_schema":
                return self._tool_get_schema(tool_input, schema)
            elif tool_name == "get_sample_data":
                return self._tool_get_sample_data(tool_input, data_source)
            elif tool_name == "execute_query":
                # Check if this query was pre-approved
                query = tool_input.get("query", "").strip()
                if pending_approvals and query in pending_approvals:
                    approved_query = pending_approvals[query]
                    if approved_query is None:
                        # Query was rejected
                        return {"rejected": True, "message": "User rejected this query execution."}
                    # Execute the approved (possibly modified) query
                    return self._tool_execute_query({"query": approved_query}, data_source)
                else:
                    # Return pending status - frontend will handle approval
                    return {
                        "requires_approval": True,
                        "query": query,
                        "purpose": tool_input.get("purpose", "Verify query results")
                    }
            else:
                return {"error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            logger.exception(f"Tool execution error: {tool_name}")
            return {"error": str(e)}

    def _tool_get_schema(self, tool_input, schema):
        """Get schema for specific tables."""
        requested_tables = tool_input.get("tables", [])

        if not requested_tables:
            # Return all table names
            return {
                "tables": [
                    {"name": t.get("name"), "column_count": len(t.get("columns", []))}
                    for t in schema
                ]
            }

        # Return detailed schema for requested tables
        result = []
        for table in schema:
            if table.get("name") in requested_tables:
                columns = table.get("columns", [])
                if isinstance(columns, dict):
                    col_list = [
                        {"name": name, "type": info.get("type", "unknown")}
                        for name, info in columns.items()
                    ]
                elif isinstance(columns, list):
                    col_list = []
                    for col in columns:
                        if isinstance(col, str):
                            col_list.append({"name": col, "type": "unknown"})
                        else:
                            col_list.append({
                                "name": col.get("name", "unknown"),
                                "type": col.get("type", "unknown")
                            })
                else:
                    col_list = []

                result.append({
                    "name": table.get("name"),
                    "columns": col_list
                })

        return {"tables": result}

    def _tool_get_sample_data(self, tool_input, data_source):
        """Get sample data from a table."""
        table_name = tool_input.get("table_name")
        if not table_name:
            return {"error": "table_name is required"}

        # Sanitize table name (basic protection)
        if not table_name.replace("_", "").replace(".", "").isalnum():
            return {"error": "Invalid table name"}

        query = f"SELECT * FROM {table_name} LIMIT 5"
        return self._run_query(query, data_source)

    def _tool_execute_query(self, tool_input, data_source):
        """Execute a SQL query."""
        query = tool_input.get("query", "").strip()
        if not query:
            return {"error": "query is required"}

        # Add safety limit if not present
        query_upper = query.upper()
        if "LIMIT" not in query_upper and query_upper.startswith("SELECT"):
            query = f"{query} LIMIT 100"

        return self._run_query(query, data_source)

    def _run_query(self, query, data_source):
        """Run a query synchronously."""
        try:
            query_runner = data_source.query_runner
            data, error = query_runner.run_query(query, None)

            if error:
                return {"error": error}

            # Parse data if it's a string
            if isinstance(data, str):
                data = json.loads(data)

            # Limit response size
            if "rows" in data and len(data["rows"]) > 100:
                data["rows"] = data["rows"][:100]
                data["truncated"] = True

            return {"data": data}
        except Exception as e:
            return {"error": str(e)}

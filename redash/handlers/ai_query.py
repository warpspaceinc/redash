import logging

from flask import request
from flask_restful import abort

from redash import models, settings
from redash.handlers.base import BaseResource, get_object_or_404
from redash.permissions import require_access, require_admin, view_only

logger = logging.getLogger(__name__)


def get_ai_settings(org):
    """
    Get AI settings from organization settings.
    Falls back to environment variables if not set in org settings.
    """
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


def format_schema_for_prompt(schema):
    """
    Convert schema data to a readable format for the AI prompt.
    """
    if not schema:
        return "No schema available."

    lines = []
    for table in schema:
        table_name = table.get("name", "unknown")
        columns = table.get("columns", [])

        if isinstance(columns, dict):
            column_list = [f"  - {col_name}: {col_info.get('type', 'unknown')}"
                          for col_name, col_info in columns.items()]
        elif isinstance(columns, list):
            column_list = [f"  - {col}" if isinstance(col, str)
                          else f"  - {col.get('name', 'unknown')}: {col.get('type', 'unknown')}"
                          for col in columns]
        else:
            column_list = []

        lines.append(f"Table: {table_name}")
        lines.extend(column_list)
        lines.append("")

    return "\n".join(lines)


def generate_query_with_claude(schema, requirement, data_source_type, api_key, ontology=None):
    """
    Generate SQL query using Claude API.
    """
    try:
        import anthropic
    except ImportError:
        raise Exception("anthropic package is not installed. Please install it with: pip install anthropic")

    if not api_key:
        raise Exception("Anthropic API key is not configured.")

    client = anthropic.Anthropic(api_key=api_key)

    schema_text = format_schema_for_prompt(schema)

    system_prompt = """You are an expert SQL query writer. Your task is to generate SQL queries based on the given database schema and user requirements.

Rules:
1. Only use tables and columns that exist in the provided schema.
2. Write efficient and optimized queries.
3. Use appropriate JOINs, subqueries, and window functions when needed.
4. Follow SQL best practices.
5. Return ONLY the SQL query without any explanation or markdown formatting.
6. If the requirement is unclear or cannot be fulfilled with the given schema, explain why briefly.
7. If ontology/metadata information is provided, use it to better understand the data relationships and business context."""

    # Build ontology section if available
    ontology_section = ""
    if ontology and ontology.strip():
        ontology_section = f"""
Ontology/Metadata Information:
{ontology}

"""

    user_prompt = f"""Database Type: {data_source_type}

Database Schema:
{schema_text}
{ontology_section}User Requirement:
{requirement}

Please generate the SQL query."""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[
            {"role": "user", "content": user_prompt}
        ],
        system=system_prompt
    )

    response_text = message.content[0].text.strip()

    # Remove markdown code blocks if present
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        # Remove first line (```sql or ```)
        lines = lines[1:]
        # Remove last line if it's ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        response_text = "\n".join(lines)

    return {
        "query": response_text.strip(),
        "model": message.model,
        "usage": {
            "input_tokens": message.usage.input_tokens,
            "output_tokens": message.usage.output_tokens
        }
    }


class AIQueryGenerateResource(BaseResource):
    """
    API endpoint for generating SQL queries using AI.
    """

    def post(self):
        # Get AI settings from organization settings
        ai_settings = get_ai_settings(self.current_org)

        if not ai_settings["enabled"]:
            abort(403, message="AI query generation is not enabled. Enable it in Settings > General > AI Query Generation.")

        if not ai_settings["api_key"]:
            abort(503, message="AI query generation is not configured. Please configure the Anthropic API key in Settings.")

        req = request.get_json(True)

        data_source_id = req.get("data_source_id")
        requirement = req.get("requirement")

        if not data_source_id:
            abort(400, message="data_source_id is required.")

        if not requirement:
            abort(400, message="requirement is required.")

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

        try:
            result = generate_query_with_claude(
                schema=schema,
                requirement=requirement,
                data_source_type=data_source.type,
                api_key=ai_settings["api_key"],
                ontology=data_source.ontology
            )

            self.record_event({
                "action": "generate_ai_query",
                "object_id": data_source_id,
                "object_type": "datasource",
                "requirement_length": len(requirement),
                "success": True
            })

            return {
                "query": result["query"],
                "model": result["model"],
                "usage": result["usage"]
            }

        except Exception as e:
            logger.exception("Failed to generate AI query")

            self.record_event({
                "action": "generate_ai_query",
                "object_id": data_source_id,
                "object_type": "datasource",
                "requirement_length": len(requirement),
                "success": False,
                "error": str(e)
            })

            abort(500, message=f"Failed to generate query: {str(e)}")


class AIQueryStatusResource(BaseResource):
    """
    API endpoint to check if AI query generation is available.
    """

    def get(self):
        ai_settings = get_ai_settings(self.current_org)
        return {
            "enabled": ai_settings["enabled"],
            "configured": bool(ai_settings["api_key"])
        }


class AIApiKeyTestResource(BaseResource):
    """
    API endpoint to test if the Anthropic API key is valid.
    """

    @require_admin
    def post(self):
        req = request.get_json(True)
        api_key = req.get("api_key")

        # If no new key provided, use the existing one from org settings
        if not api_key:
            ai_settings = get_ai_settings(self.current_org)
            api_key = ai_settings["api_key"]

        if not api_key:
            return {"success": False, "message": "No API key provided or configured."}

        try:
            import anthropic
        except ImportError:
            return {"success": False, "message": "anthropic package is not installed."}

        try:
            client = anthropic.Anthropic(api_key=api_key)
            # Make a minimal API call to verify the key works
            message = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=10,
                messages=[{"role": "user", "content": "Hi"}]
            )
            return {
                "success": True,
                "message": "API key is valid.",
                "model": message.model
            }
        except anthropic.AuthenticationError:
            return {"success": False, "message": "Invalid API key. Please check your key and try again."}
        except anthropic.RateLimitError:
            return {"success": False, "message": "Rate limit exceeded. The API key appears valid but is rate limited."}
        except anthropic.APIError as e:
            return {"success": False, "message": f"API error: {str(e)}"}
        except Exception as e:
            logger.exception("Failed to test API key")
            return {"success": False, "message": f"Failed to test API key: {str(e)}"}

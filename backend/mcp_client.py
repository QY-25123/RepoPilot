import os
from typing import Any
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def mcp_tool_to_claude_tool(mcp_tool: Any) -> dict:
    schema = mcp_tool.inputSchema if mcp_tool.inputSchema else {}
    if not isinstance(schema, dict):
        schema = {}
    if not schema.get("type"):
        schema["type"] = "object"
    if "properties" not in schema:
        schema["properties"] = {}

    return {
        "name": mcp_tool.name,
        "description": mcp_tool.description or f"GitHub {mcp_tool.name}",
        "input_schema": schema,
    }


class GitHubMCPClient:
    def __init__(self, github_token: str):
        self.github_token = github_token
        self._session: ClientSession | None = None
        self._session_cm = None
        self._stdio_cm = None

    async def __aenter__(self) -> "GitHubMCPClient":
        server_params = StdioServerParameters(
            command="github-mcp-server",
            args=["stdio"],
            env={**os.environ, "GITHUB_PERSONAL_ACCESS_TOKEN": self.github_token},
        )
        self._stdio_cm = stdio_client(server_params)
        read, write = await self._stdio_cm.__aenter__()
        self._session = ClientSession(read, write)
        self._session_cm = self._session
        await self._session.__aenter__()
        await self._session.initialize()
        return self

    async def __aexit__(self, *args: Any) -> None:
        if self._session:
            await self._session.__aexit__(*args)
        if self._stdio_cm:
            await self._stdio_cm.__aexit__(*args)

    async def list_tools(self) -> list[Any]:
        assert self._session is not None
        result = await self._session.list_tools()
        return result.tools

    async def call_tool(self, name: str, arguments: dict) -> str:
        assert self._session is not None
        try:
            result = await self._session.call_tool(name, arguments)
            is_error = getattr(result, "isError", False)
            parts: list[str] = []
            for item in result.content:
                if hasattr(item, "text") and item.text:
                    parts.append(item.text)
                elif hasattr(item, "resource"):
                    # EmbeddedResource — actual file content lives here
                    resource = item.resource
                    if hasattr(resource, "text") and resource.text:
                        parts.append(resource.text)
                    elif hasattr(resource, "blob") and resource.blob:
                        import base64
                        try:
                            decoded = base64.b64decode(resource.blob).decode("utf-8", errors="replace")
                            parts.append(decoded)
                        except Exception:
                            parts.append(f"[binary blob]")
            content = "\n".join(parts)
            if is_error:
                return f"[Tool error] {content}"
            if len(content) > 12000:
                content = content[:12000] + "\n... [truncated]"
            return content
        except Exception as exc:
            return f"[Tool call failed: {exc}]"

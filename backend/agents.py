import json
from typing import Any, AsyncGenerator
import anthropic

from mcp_client import GitHubMCPClient

_client = anthropic.AsyncAnthropic()
PLANNER_MODEL = "claude-haiku-4-5-20251001"
RESEARCHER_MODEL = "claude-haiku-4-5-20251001"
SYNTHESIZER_MODEL = "claude-opus-4-8"

SELECTED_TOOLS = {
    "get_file_contents",   # read files AND directory listings (pass a dir path)
    "list_commits",
    "list_branches",
    "list_pull_requests",
    "pull_request_read",
    "search_code",
    "list_issues",
    "issue_read",
    "list_tags",
    "search_repositories",
}

MAX_RESEARCHER_ITERATIONS = 8
MAX_RESEARCH_CHARS = 60_000


async def planner_agent(owner: str, repo: str, goal: str) -> str:
    """Agent 1 — produces a focused research plan (no tools, no thinking)."""
    response = await _client.messages.create(
        model=PLANNER_MODEL,
        max_tokens=512,
        system=(
            "You are a GitHub repository analyst. Given a user's goal, write a concise "
            "bullet-point research plan specifying exactly what to fetch from the repository "
            "to answer the question. Be specific about file paths and API calls to make."
        ),
        messages=[
            {
                "role": "user",
                "content": (
                    f"Repository: https://github.com/{owner}/{repo}\n"
                    f"User goal: {goal}\n\n"
                    "List exactly what we need to fetch to answer this."
                ),
            }
        ],
    )
    return "\n".join(b.text for b in response.content if b.type == "text")


async def researcher_agent(
    owner: str,
    repo: str,
    goal: str,
    plan: str,
    claude_tools: list[dict],
    mcp: GitHubMCPClient,
) -> AsyncGenerator[dict, None]:
    """Agent 2 — autonomously calls GitHub MCP tools to gather data."""
    system = (
        "You are a GitHub repository researcher. Use the available tools to gather "
        "information from the repository. Follow the research plan and be thorough."
    )
    messages: list[dict] = [
        {
            "role": "user",
            "content": (
                f"Repository: {owner}/{repo}\n"
                f"User goal: {goal}\n\n"
                f"Research plan:\n{plan}\n\n"
                "Fetch all the relevant data using the tools."
            ),
        }
    ]

    gathered: list[str] = []

    for _ in range(MAX_RESEARCHER_ITERATIONS):
        response = await _client.messages.create(
            model=RESEARCHER_MODEL,
            max_tokens=4096,
            system=system,
            messages=messages,
            tools=claude_tools,
        )

        # Collect any narrative text the researcher writes
        for block in response.content:
            if block.type == "text" and block.text.strip():
                gathered.append(f"[Researcher note]\n{block.text}")

        if response.stop_reason == "end_turn":
            break

        if response.stop_reason != "tool_use":
            break

        # Execute each tool call via MCP
        tool_results: list[dict] = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            yield {
                "type": "tool_call",
                "tool": block.name,
                "input": {k: str(v)[:120] for k, v in block.input.items()},
            }

            result_text = await mcp.call_tool(block.name, block.input)
            gathered.append(f"=== {block.name}({json.dumps(block.input)}) ===\n{result_text}")

            yield {"type": "tool_result", "tool": block.name, "chars": len(result_text)}

            tool_results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": result_text}
            )

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    full_data = "\n\n".join(gathered)
    if len(full_data) > MAX_RESEARCH_CHARS:
        full_data = full_data[:MAX_RESEARCH_CHARS] + "\n\n... [data truncated for length]"

    yield {"type": "research_data", "content": full_data}


async def synthesizer_agent(
    owner: str,
    repo: str,
    goal: str,
    research_data: str,
) -> AsyncGenerator[dict, None]:
    """Agent 3 — streams the final analysis using adaptive thinking."""
    system = (
        "You are an expert at explaining GitHub repositories and their practices. "
        "Based on the data gathered from the repository, provide a clear, comprehensive, "
        "and well-structured answer. Format your response in readable markdown."
    )
    prompt = (
        f"Repository: https://github.com/{owner}/{repo}\n"
        f"User's question: {goal}\n\n"
        f"Gathered repository data:\n{research_data}\n\n"
        "Provide a comprehensive answer to the user's question."
    )

    async with _client.messages.stream(
        model=SYNTHESIZER_MODEL,
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=system,
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        async for text in stream.text_stream:
            yield {"type": "analysis_chunk", "text": text}

        final = await stream.get_final_message()
        yield {
            "type": "analysis_complete",
            "usage": {
                "input_tokens": final.usage.input_tokens,
                "output_tokens": final.usage.output_tokens,
            },
        }

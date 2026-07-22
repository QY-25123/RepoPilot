from typing import AsyncGenerator

from mcp_client import GitHubMCPClient, mcp_tool_to_claude_tool
from agents import SELECTED_TOOLS, planner_agent, researcher_agent, synthesizer_agent


async def run_analysis_pipeline(
    owner: str,
    repo: str,
    goal: str,
    github_token: str,
) -> AsyncGenerator[dict, None]:
    yield {"type": "status", "step": "init", "message": f"Starting analysis of {owner}/{repo}"}

    try:
        async with GitHubMCPClient(github_token) as mcp:
            all_tools = await mcp.list_tools()
            claude_tools = [
                mcp_tool_to_claude_tool(t) for t in all_tools if t.name in SELECTED_TOOLS
            ]
            yield {
                "type": "status",
                "step": "tools_loaded",
                "message": f"Connected to GitHub MCP server ({len(claude_tools)} tools available)",
            }

            # Agent 1: Plan
            yield {"type": "status", "step": "planning", "message": "Agent 1 — planning research approach..."}
            plan = await planner_agent(owner, repo, goal)
            yield {"type": "plan", "content": plan}

            # Agent 2: Research
            yield {"type": "status", "step": "researching", "message": "Agent 2 — fetching repository data..."}
            research_data = ""
            async for event in researcher_agent(owner, repo, goal, plan, claude_tools, mcp):
                yield event
                if event["type"] == "research_data":
                    research_data = event["content"]

            # Agent 3: Synthesize
            yield {"type": "status", "step": "synthesizing", "message": "Agent 3 — generating analysis..."}
            async for event in synthesizer_agent(owner, repo, goal, research_data):
                yield event

            yield {"type": "status", "step": "complete", "message": "Analysis complete"}

    except Exception as exc:
        yield {"type": "error", "message": str(exc)}

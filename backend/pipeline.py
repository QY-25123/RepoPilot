from typing import AsyncGenerator

from mcp_client import GitHubMCPClient, mcp_tool_to_claude_tool
from agents import planner_agent, researcher_agent, synthesizer_agent
from features import FEATURES
from cache import get_cached, set_cached


async def run_analysis_pipeline(
    owner: str,
    repo: str,
    goal: str,
    github_token: str,
    feature_id: str = "custom",
) -> AsyncGenerator[dict, None]:
    feature_cfg = FEATURES.get(feature_id, FEATURES["custom"])

    cached = await get_cached(owner, repo, feature_id, goal)
    if cached is not None:
        yield {"type": "cache_hit"}
        for event in cached:
            yield event
        return

    collected: list[dict] = []
    async for event in _pipeline(owner, repo, goal, github_token, feature_cfg):
        collected.append(event)
        yield event

    ttl = feature_cfg.get("cache_ttl", 3600)
    await set_cached(owner, repo, feature_id, goal, collected, ttl)


async def _pipeline(
    owner: str,
    repo: str,
    goal: str,
    github_token: str,
    feature_cfg: dict,
) -> AsyncGenerator[dict, None]:
    yield {"type": "status", "step": "init", "message": f"Starting analysis of {owner}/{repo}"}

    try:
        async with GitHubMCPClient(github_token) as mcp:
            all_tools = await mcp.list_tools()
            claude_tools = [
                mcp_tool_to_claude_tool(t) for t in all_tools if t.name in feature_cfg["tools"]
            ]
            yield {
                "type": "status",
                "step": "tools_loaded",
                "message": f"Connected to GitHub MCP server ({len(claude_tools)} tools available)",
            }

            yield {"type": "status", "step": "planning", "message": "Agent 1 — planning research approach..."}
            plan = await planner_agent(owner, repo, goal, feature_cfg)
            yield {"type": "plan", "content": plan}

            yield {"type": "status", "step": "researching", "message": "Agent 2 — fetching repository data..."}
            research_data = ""
            async for event in researcher_agent(owner, repo, goal, plan, claude_tools, mcp, feature_cfg):
                yield event
                if event["type"] == "research_data":
                    research_data = event["content"]

            yield {"type": "status", "step": "synthesizing", "message": "Agent 3 — generating analysis..."}
            async for event in synthesizer_agent(owner, repo, goal, research_data, feature_cfg):
                yield event

            yield {"type": "status", "step": "complete", "message": "Analysis complete"}

    except Exception as exc:
        yield {"type": "error", "message": str(exc)}

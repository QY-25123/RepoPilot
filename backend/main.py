import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

from pipeline import run_analysis_pipeline  # noqa: E402 — after dotenv

app = FastAPI(title="GitHub Repo Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    repo_url: str
    goal: str
    github_token: str | None = None


def _parse_github_url(url: str) -> tuple[str, str]:
    url = url.strip().rstrip("/")
    match = re.match(
        r"(?:https?://)?github\.com/([^/]+)/([^/\s?#]+?)(?:\.git)?(?:[/?#].*)?$",
        url,
    )
    if match:
        return match.group(1), match.group(2)
    # Allow bare "owner/repo" shorthand
    parts = url.split("/")
    if len(parts) == 2 and all(parts):
        return parts[0], parts[1]
    raise ValueError(f"Cannot parse GitHub URL: {url!r}")


@app.post("/analyze")
async def analyze(request: AnalyzeRequest) -> StreamingResponse:
    try:
        owner, repo = _parse_github_url(request.repo_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    github_token = request.github_token or os.environ.get("GITHUB_TOKEN", "")
    if not github_token:
        raise HTTPException(
            status_code=400,
            detail="A GitHub token is required. Set GITHUB_TOKEN on the server or pass github_token in the request.",
        )

    async def event_generator():
        try:
            async for event in run_analysis_pipeline(owner, repo, request.goal, github_token):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        finally:
            yield 'data: {"type": "done"}\n\n'

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}

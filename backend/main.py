import asyncio
import json
import os
import re

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

from pipeline import run_analysis_pipeline  # noqa: E402 — after dotenv
from jobs import (  # noqa: E402
    new_job_id,
    create_job,
    append_event,
    set_job_status,
    get_job_status,
    stream_job_events,
    expire_job,
)

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
    feature_id: str = "custom"
    github_token: str | None = None


def _parse_github_url(url: str) -> tuple[str, str]:
    url = url.strip().rstrip("/")
    match = re.match(
        r"(?:https?://)?github\.com/([^/]+)/([^/\s?#]+?)(?:\.git)?(?:[/?#].*)?$",
        url,
    )
    if match:
        return match.group(1), match.group(2)
    parts = url.split("/")
    if len(parts) == 2 and all(parts):
        return parts[0], parts[1]
    raise ValueError(f"Cannot parse GitHub URL: {url!r}")


async def _run_job(
    job_id: str, owner: str, repo: str, goal: str, github_token: str, feature_id: str
) -> None:
    set_job_status(job_id, "running")
    try:
        async for event in run_analysis_pipeline(owner, repo, goal, github_token, feature_id):
            append_event(job_id, event)
        set_job_status(job_id, "complete")
    except Exception as exc:
        append_event(job_id, {"type": "error", "message": str(exc)})
        set_job_status(job_id, "error")
    finally:
        asyncio.create_task(expire_job(job_id, 3600))


@app.post("/analyze")
async def analyze(request: AnalyzeRequest, background_tasks: BackgroundTasks) -> dict:
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

    job_id = new_job_id()
    create_job(job_id)
    background_tasks.add_task(
        _run_job, job_id, owner, repo, request.goal, github_token, request.feature_id
    )
    return {"job_id": job_id}


@app.get("/jobs/{job_id}/stream")
async def job_stream(job_id: str) -> StreamingResponse:
    if get_job_status(job_id) is None:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        async for event in stream_job_events(job_id):
            yield f"data: {json.dumps(event)}\n\n"
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


@app.get("/jobs/{job_id}/status")
async def job_status(job_id: str) -> dict:
    status = get_job_status(job_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job_id, "status": status}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}

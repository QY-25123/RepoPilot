import asyncio
import uuid
from typing import AsyncGenerator, Optional

_jobs: dict[str, dict] = {}

_SSE_POLL_INTERVAL = 0.05  # 50 ms


def new_job_id() -> str:
    return uuid.uuid4().hex


def create_job(job_id: str) -> None:
    _jobs[job_id] = {"status": "pending", "events": []}


def append_event(job_id: str, event: dict) -> None:
    if job_id in _jobs:
        _jobs[job_id]["events"].append(event)


def set_job_status(job_id: str, status: str) -> None:
    if job_id in _jobs:
        _jobs[job_id]["status"] = status


def get_job_status(job_id: str) -> Optional[str]:
    job = _jobs.get(job_id)
    return job["status"] if job else None


async def expire_job(job_id: str, delay: int = 3600) -> None:
    await asyncio.sleep(delay)
    _jobs.pop(job_id, None)


async def stream_job_events(job_id: str) -> AsyncGenerator[dict, None]:
    job = _jobs.get(job_id)
    if not job:
        return
    cursor = 0
    while True:
        events = job["events"]
        while cursor < len(events):
            yield events[cursor]
            cursor += 1
        if job["status"] in ("complete", "error"):
            break
        await asyncio.sleep(_SSE_POLL_INTERVAL)

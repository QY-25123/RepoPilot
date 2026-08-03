import hashlib
import json
import os
from typing import Optional

_redis = None


def _get_redis():
    global _redis
    url = os.getenv("REDIS_URL")
    if not url:
        return None
    if _redis is None:
        try:
            import redis.asyncio as aioredis
            _redis = aioredis.from_url(url, decode_responses=True)
        except Exception:
            return None
    return _redis


def _key(owner: str, repo: str, feature_id: str, goal: str) -> str:
    h = hashlib.sha256(goal.strip().lower().encode()).hexdigest()[:16]
    return f"analysis:{owner.lower()}:{repo.lower()}:{feature_id}:{h}"


async def get_cached(owner: str, repo: str, feature_id: str, goal: str) -> Optional[list]:
    r = _get_redis()
    if r is None:
        return None
    try:
        data = await r.get(_key(owner, repo, feature_id, goal))
        return json.loads(data) if data else None
    except Exception:
        return None


async def set_cached(
    owner: str, repo: str, feature_id: str, goal: str, events: list, ttl: int
) -> None:
    r = _get_redis()
    if r is None:
        return
    try:
        await r.setex(_key(owner, repo, feature_id, goal), ttl, json.dumps(events))
    except Exception:
        pass

import time
import logging
from collections import defaultdict
from typing import Dict, List, Tuple
from fastapi import Request, HTTPException, status

logger = logging.getLogger("app")

class InMemoryRateLimiter:
    """
    Sliding-window IP rate limiter and burst abuse protection.
    Provides protection against aggressive automated hammering and denial of service.
    """
    def __init__(
        self,
        max_requests: int = 60,
        window_seconds: int = 60,
        burst_limit: int = 15,
        burst_window_seconds: int = 3,
        lockout_seconds: int = 60
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.burst_limit = burst_limit
        self.burst_window_seconds = burst_window_seconds
        self.lockout_seconds = lockout_seconds

        # IP -> list of timestamps
        self._requests: Dict[str, List[float]] = defaultdict(list)
        # IP -> lockout expiration timestamp
        self._lockouts: Dict[str, float] = {}

    def _get_client_ip(self, request: Request) -> str:
        # Check X-Forwarded-For if behind reverse proxy / Cloudflare / Render
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()
        return request.client.host if request.client else "127.0.0.1"

    def check(self, request: Request, custom_limit: int = None, custom_window: int = None):
        client_ip = self._get_client_ip(request)
        now = time.time()

        # 1. Check if IP is in lockout penalty
        lockout_until = self._lockouts.get(client_ip, 0)
        if now < lockout_until:
            retry_after = int(lockout_until - now) + 1
            logger.warning(f"RateLimiter: Locked-out IP '{client_ip}' rejected. Retry-After: {retry_after}s")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Abuse protection triggered: Too many rapid requests. Please wait {retry_after} seconds before retrying.",
                headers={"Retry-After": str(retry_after)}
            )

        # 2. Clean up expired timestamps
        win = custom_window or self.window_seconds
        limit = custom_limit or self.max_requests
        cutoff = now - win
        recent = [t for t in self._requests[client_ip] if t > cutoff]
        self._requests[client_ip] = recent

        # 3. Burst hammering check (e.g., > 15 requests in 3 seconds)
        burst_cutoff = now - self.burst_window_seconds
        burst_count = sum(1 for t in recent if t > burst_cutoff)
        if burst_count >= self.burst_limit:
            self._lockouts[client_ip] = now + self.lockout_seconds
            logger.warning(f"RateLimiter: Burst limit exceeded for IP '{client_ip}'. Locking out for {self.lockout_seconds}s.")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Burst hammering detected. Temporary cooldown enforced. Please wait {self.lockout_seconds}s.",
                headers={"Retry-After": str(self.lockout_seconds)}
            )

        # 4. Standard window limit check
        if len(recent) >= limit:
            oldest_time = recent[0]
            retry_after = int(oldest_time + win - now) + 1
            logger.info(f"RateLimiter: IP '{client_ip}' hit rate limit ({len(recent)}/{limit} reqs).")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded: Maximum {limit} requests per {win} seconds. Please wait {retry_after}s.",
                headers={"Retry-After": str(max(1, retry_after))}
            )

        # Record this request
        self._requests[client_ip].append(now)


# Standard rate limiter instance (60 requests per minute)
rate_limiter = InMemoryRateLimiter(
    max_requests=60,
    window_seconds=60,
    burst_limit=15,
    burst_window_seconds=3,
    lockout_seconds=60
)

# AI Generation rate limiter instance (30 heavy queries per minute per IP)
ai_rate_limiter = InMemoryRateLimiter(
    max_requests=30,
    window_seconds=60,
    burst_limit=8,
    burst_window_seconds=3,
    lockout_seconds=45
)

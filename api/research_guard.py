"""Read-only product mode while the proposal's approvals remain outstanding.

This is application-level containment, not a replacement for VM/firewall egress
controls. No environment flag or uploaded attestation constitutes approval.
"""
from starlette.responses import JSONResponse

from research_evaluation.safety import research_mode


def request_allowed(method: str, path: str) -> bool:
    def within(prefix):
        return path == prefix or path.startswith(prefix + "/")
    if within("/auth") or within("/evaluation") or within("/settings"):
        return True
    if method in {"GET", "HEAD", "OPTIONS"}:
        if path in {"/", "/health", "/healthz", "/ready", "/docs", "/openapi.json", "/redoc", "/stats"}:
            return True
        return any(within(prefix) for prefix in ("/investigations", "/entities", "/export", "/monitors", "/synthetic"))
    return False


async def research_guard(request, call_next):
    if research_mode() and not request_allowed(request.method, request.url.path):
        return JSONResponse(status_code=423, content={"detail": "Proposal research mode: live collection, monitoring triggers and legacy AI actions are paused. Use Research readiness for the sanitized study workflow. Existing investigations remain readable."})
    response = await call_next(request)
    if request.url.path.startswith(("/auth", "/evaluation")):
        response.headers["Cache-Control"] = "no-store"
    return response

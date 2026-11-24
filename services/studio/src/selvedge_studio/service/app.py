"""The HTTP API described in docs/API.md (Studio service)."""

from __future__ import annotations

import asyncio
import hmac
import json
import re
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from starlette.concurrency import run_in_threadpool

from selvedge_studio.service.constants import (
    EVENT_POLL_SECONDS,
    INTERNAL_TOKEN_HEADER,
    JOB_WALL_SECONDS,
    MAX_PAYMENT_REFERENCE_LENGTH,
    MAX_REQUEST_TEXT_LENGTH,
    SERVICE_VERSION,
)
from selvedge_studio.service.director import Director, DirectorModel
from selvedge_studio.service.errors import ServiceError, Unauthorized
from selvedge_studio.service.jobs import (
    STATUS_FAILED,
    STATUS_SUCCEEDED,
    TERMINAL_STATUSES,
    JobManager,
)
from selvedge_studio.service.limits import BodyLimitMiddleware, SlidingWindowRateLimiter
from selvedge_studio.service.pricing import Quote, pricing_table
from selvedge_studio.service.settings import Settings
from selvedge_studio.service.studio import Studio, parse_studio_spec

PAYMENT_REFERENCE_PATTERN = re.compile(r"^[A-Za-z0-9._:-]+$")
SSE_GRACE_SECONDS = 60
UNKNOWN_CLIENT = "unknown"


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", alias_generator=to_camel, populate_by_name=True)


class QuoteRequest(ApiModel):
    spec: dict[str, Any]


class DirectRequest(ApiModel):
    request: str = Field(min_length=1, max_length=MAX_REQUEST_TEXT_LENGTH)


class JobRequest(ApiModel):
    spec: dict[str, Any]
    payment_reference: str = Field(min_length=1, max_length=MAX_PAYMENT_REFERENCE_LENGTH)
    paid_micro_usdc: int = Field(ge=0)


def _quote_json(quote: Quote) -> dict[str, Any]:
    return {
        "specHash": quote.spec_hash,
        "totalMicroUsdc": quote.total_micro_usdc,
        "lineItems": [
            {
                "name": item.name,
                "kind": item.kind,
                "quantity": item.quantity,
                "unit": item.unit,
                "microUsdc": item.micro_usdc,
            }
            for item in quote.line_items
        ],
    }


def _job_json(record: dict[str, Any]) -> dict[str, Any]:
    visible = (
        "jobId",
        "specHash",
        "status",
        "progress",
        "priceMicroUsdc",
        "paidMicroUsdc",
        "outputs",
        "checks",
        "error",
        "createdAt",
        "finishedAt",
    )
    return {key: record[key] for key in visible}


def _format_event(event: dict[str, Any]) -> str:
    payload = json.dumps({"kind": event["kind"], "data": event["data"], "at": event["at"]})
    return f"id: {event['sequence']}\nevent: {event['kind']}\ndata: {payload}\n\n"


def create_app(settings: Settings, director_model: DirectorModel | None = None) -> FastAPI:
    studio = Studio(settings.home)
    manager = JobManager(studio, settings.home, settings.worker_threads)
    director = Director(studio, director_model)
    limiter = SlidingWindowRateLimiter(settings.rate_limit_per_minute)

    @asynccontextmanager
    async def lifespan(_application: FastAPI) -> AsyncIterator[None]:
        yield
        manager.shutdown()

    application = FastAPI(title="Selvedge Studio", version=SERVICE_VERSION, lifespan=lifespan)
    application.add_middleware(BodyLimitMiddleware, max_body_bytes=settings.max_body_bytes)

    def enforce_rate_limit(request: Request) -> None:
        limiter.check(request.client.host if request.client else UNKNOWN_CLIENT)

    def require_internal_token(
        supplied: str | None = Header(default=None, alias=INTERNAL_TOKEN_HEADER),
    ) -> None:
        if supplied is None or not hmac.compare_digest(
            supplied.encode("utf-8"), settings.internal_token.encode("utf-8")
        ):
            raise Unauthorized("a valid internal token is required for this endpoint")

    @application.exception_handler(ServiceError)
    async def handle_service_error(_request: Request, error: ServiceError) -> JSONResponse:
        return JSONResponse(error.envelope(), status_code=error.status_code)

    @application.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, error: RequestValidationError
    ) -> JSONResponse:
        problems = [
            {"path": ".".join(str(part) for part in item["loc"]), "message": item["msg"]}
            for item in error.errors()
        ]
        body = {
            "error": {
                "code": "request_invalid",
                "message": "the request body does not match the API",
                "details": {"errors": problems},
            }
        }
        return JSONResponse(body, status_code=422)

    @application.get("/v1/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": SERVICE_VERSION}

    @application.get("/v1/pricing", dependencies=[Depends(enforce_rate_limit)])
    def pricing() -> dict[str, object]:
        return pricing_table(studio.operation_names())

    @application.post("/v1/quote", dependencies=[Depends(enforce_rate_limit)])
    def quote(body: QuoteRequest) -> dict[str, Any]:
        return _quote_json(studio.quote(parse_studio_spec(body.spec)))

    @application.post("/v1/direct", dependencies=[Depends(enforce_rate_limit)])
    def direct(body: DirectRequest) -> dict[str, Any]:
        directed = director.direct(body.request)
        return {
            "spec": directed.prepared.spec.model_dump(mode="json", by_alias=True),
            "quote": _quote_json(directed.prepared.quote),
            "attempts": directed.attempts,
        }

    @application.post(
        "/v1/jobs",
        status_code=202,
        dependencies=[Depends(enforce_rate_limit), Depends(require_internal_token)],
    )
    def create_job(body: JobRequest) -> dict[str, Any]:
        if not PAYMENT_REFERENCE_PATTERN.match(body.payment_reference):
            raise ServiceError(
                "the payment reference may only contain letters, digits, '.', '_', ':' and '-'"
            )
        record = manager.submit(
            parse_studio_spec(body.spec), body.payment_reference, body.paid_micro_usdc
        )
        return {"jobId": record["jobId"], "status": record["status"]}

    @application.get("/v1/jobs/{job_id}", dependencies=[Depends(enforce_rate_limit)])
    def job_status(job_id: str) -> dict[str, Any]:
        return _job_json(manager.status(job_id))

    @application.get("/v1/jobs/{job_id}/events", dependencies=[Depends(enforce_rate_limit)])
    async def job_events(job_id: str, request: Request) -> StreamingResponse:
        await run_in_threadpool(manager.status, job_id)

        async def stream() -> AsyncIterator[str]:
            last_sequence = 0
            deadline = time.monotonic() + JOB_WALL_SECONDS + SSE_GRACE_SECONDS
            while time.monotonic() < deadline and not await request.is_disconnected():
                events = await run_in_threadpool(manager.events_after, job_id, last_sequence)
                for event in events:
                    last_sequence = event["sequence"]
                    yield _format_event(event)
                if any(event["kind"] in (STATUS_SUCCEEDED, STATUS_FAILED) for event in events):
                    return
                record = await run_in_threadpool(manager.status, job_id)
                if record["status"] in TERMINAL_STATUSES and not events:
                    return
                await asyncio.sleep(EVENT_POLL_SECONDS)

        return StreamingResponse(stream(), media_type="text/event-stream")

    @application.get("/v1/jobs/{job_id}/result", dependencies=[Depends(enforce_rate_limit)])
    def job_result(job_id: str, output: str | None = None) -> FileResponse:
        result = manager.result_file(job_id, output)
        return FileResponse(
            result.path, media_type=result.content_type, filename=result.download_name
        )

    return application

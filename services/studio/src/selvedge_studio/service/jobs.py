"""Paid render jobs: idempotent per payment reference, persisted as JSON, run on worker threads."""

from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import os
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from selvedge_studio.engine.runner import JobResult, StepFailed
from selvedge_studio.service.constants import JOB_ID_HEX_LENGTH, JOB_ID_PREFIX
from selvedge_studio.service.errors import (
    JobNotFound,
    JobNotReady,
    PaymentInsufficient,
    PaymentReferenceReused,
)
from selvedge_studio.service.studio import PreparedSpec, Studio
from selvedge_studio.service.studio_spec import StudioSpec

log = logging.getLogger(__name__)

STATUS_QUEUED = "queued"
STATUS_RUNNING = "running"
STATUS_SUCCEEDED = "succeeded"
STATUS_FAILED = "failed"
TERMINAL_STATUSES = frozenset({STATUS_SUCCEEDED, STATUS_FAILED})
UNFINISHED_STATUSES = frozenset({STATUS_QUEUED, STATUS_RUNNING})
DEFAULT_CONTENT_TYPE = "application/octet-stream"
EXTRA_CONTENT_TYPES = {".wav": "audio/wav", ".m4a": "audio/mp4", ".opus": "audio/ogg"}


@dataclass(frozen=True)
class ResultFile:
    path: Path
    content_type: str
    download_name: str


def job_id_for_reference(payment_reference: str) -> str:
    digest = hashlib.sha256(payment_reference.encode("utf-8")).hexdigest()
    return f"{JOB_ID_PREFIX}{digest[:JOB_ID_HEX_LENGTH]}"


def _content_type(extension: str) -> str:
    return (
        EXTRA_CONTENT_TYPES.get(extension)
        or mimetypes.guess_type(f"file{extension}")[0]
        or (DEFAULT_CONTENT_TYPE)
    )


class JobManager:
    def __init__(self, studio: Studio, home: Path, worker_threads: int) -> None:
        self.studio = studio
        self.jobs_directory = home / "jobs"
        self.jobs_directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._executor = ThreadPoolExecutor(
            max_workers=worker_threads, thread_name_prefix="studio-job"
        )
        self._resume_unfinished_jobs()

    def shutdown(self) -> None:
        self._executor.shutdown(wait=True, cancel_futures=False)

    def submit(
        self, spec: StudioSpec, payment_reference: str, paid_micro_usdc: int
    ) -> dict[str, Any]:
        job_id = job_id_for_reference(payment_reference)
        with self._lock:
            existing = self._read_record(job_id)
            if existing is not None:
                return self._resolve_existing(existing, spec, payment_reference)
        prepared = self.studio.prepare(spec)
        if prepared.quote.total_micro_usdc > paid_micro_usdc:
            raise PaymentInsufficient(
                "the paid amount does not cover the price of this spec",
                {
                    "priceMicroUsdc": prepared.quote.total_micro_usdc,
                    "paidMicroUsdc": paid_micro_usdc,
                },
            )
        with self._lock:
            existing = self._read_record(job_id)
            if existing is not None:
                return self._resolve_existing(existing, spec, payment_reference)
            record = {
                "jobId": job_id,
                "specHash": spec.spec_hash,
                "spec": spec.model_dump(mode="json", by_alias=True),
                "priceMicroUsdc": prepared.quote.total_micro_usdc,
                "paidMicroUsdc": paid_micro_usdc,
                "status": STATUS_QUEUED,
                "progress": 0.0,
                "outputs": [],
                "checks": {},
                "error": None,
                "createdAt": time.time(),
                "finishedAt": None,
            }
            self._write_record(record)
            self._append_event(job_id, "queued", {"priceMicroUsdc": record["priceMicroUsdc"]})
        self._executor.submit(self._run_job, job_id)
        return record

    def status(self, job_id: str) -> dict[str, Any]:
        record = self._read_record(job_id)
        if record is None:
            raise JobNotFound("no job with this id", {"jobId": job_id})
        return record

    def events_after(self, job_id: str, after_sequence: int) -> list[dict[str, Any]]:
        self.status(job_id)
        events_path = self._events_path(job_id)
        if not events_path.is_file():
            return []
        with self._lock:
            lines = events_path.read_text(encoding="utf-8").splitlines()
        events = [json.loads(line) for line in lines if line]
        return [event for event in events if event["sequence"] > after_sequence]

    def result_file(self, job_id: str, output_name: str | None) -> ResultFile:
        record = self.status(job_id)
        if record["status"] != STATUS_SUCCEEDED:
            raise JobNotReady("the job has no result yet", {"status": record["status"]})
        outputs = record["outputs"]
        chosen = next((output for output in outputs if output_name in (None, output["name"])), None)
        if chosen is None:
            raise JobNotFound(
                "the job has no output with this name",
                {"jobId": job_id, "outputs": [output["name"] for output in outputs]},
            )
        digest = chosen["handle"].removeprefix("asset:")
        path = self.studio.engine.store.path(digest)
        return ResultFile(path, chosen["contentType"], f"{chosen['name']}{chosen['extension']}")

    def _resolve_existing(
        self, existing: dict[str, Any], spec: StudioSpec, payment_reference: str
    ) -> dict[str, Any]:
        if existing["specHash"] != spec.spec_hash:
            raise PaymentReferenceReused(
                "this payment reference already paid for a different spec",
                {"paymentReferenceHash": hashlib.sha256(payment_reference.encode()).hexdigest()},
            )
        return existing

    def _resume_unfinished_jobs(self) -> None:
        for record_path in sorted(self.jobs_directory.glob(f"{JOB_ID_PREFIX}*.json")):
            record = json.loads(record_path.read_text(encoding="utf-8"))
            if record["status"] in UNFINISHED_STATUSES:
                self._executor.submit(self._run_job, record["jobId"])

    def _run_job(self, job_id: str) -> None:
        record = self.status(job_id)
        self._update(job_id, status=STATUS_RUNNING)
        try:
            prepared = self.studio.prepare(StudioSpec.model_validate(record["spec"]))
            result = self.studio.run(prepared, self._observer_for(job_id))
        except StepFailed as failure:
            self._fail(job_id, "step_failed", str(failure))
        except Exception as failure:
            log.exception("job %s failed unexpectedly", job_id)
            self._fail(job_id, "internal_error", f"{type(failure).__name__} while rendering")
        else:
            self._succeed(job_id, prepared, result)

    def _observer_for(self, job_id: str) -> Any:
        def observe(kind: str, data: dict[str, Any]) -> None:
            if kind == "step_done":
                progress = data["index"] / data["groups"]
                self._update(job_id, progress=round(progress, 4))
            self._append_event(job_id, kind, data)

        return observe

    def _succeed(self, job_id: str, prepared: PreparedSpec, result: JobResult) -> None:
        outputs = [
            {
                "name": name,
                "handle": report.handle,
                "media": report.media.value,
                "extension": report.ext,
                "sizeBytes": report.size,
                "contentType": _content_type(report.ext),
                "summary": report.summary,
            }
            for name, report in result.outputs.items()
        ]
        checks = {
            name: [
                {"name": check.name, "status": check.status.value, "message": check.message}
                for check in output_checks
            ]
            for name, output_checks in result.checks.items()
        }
        self._update(
            job_id,
            status=STATUS_SUCCEEDED,
            progress=1.0,
            outputs=outputs,
            checks=checks,
            finishedAt=time.time(),
        )
        self._append_event(job_id, STATUS_SUCCEEDED, {"outputs": len(outputs)})

    def _fail(self, job_id: str, code: str, message: str) -> None:
        self._update(
            job_id,
            status=STATUS_FAILED,
            error={"code": code, "message": message},
            finishedAt=time.time(),
        )
        self._append_event(job_id, STATUS_FAILED, {"code": code, "message": message})

    def _update(self, job_id: str, **changes: Any) -> None:
        with self._lock:
            record = self.status(job_id)
            record.update(changes)
            self._write_record(record)

    def _append_event(self, job_id: str, kind: str, data: dict[str, Any]) -> None:
        with self._lock:
            events_path = self._events_path(job_id)
            sequence = 1
            if events_path.is_file():
                sequence = len(events_path.read_text(encoding="utf-8").splitlines()) + 1
            event = {"sequence": sequence, "kind": kind, "data": data, "at": time.time()}
            with events_path.open("a", encoding="utf-8") as events_file:
                events_file.write(json.dumps(event, sort_keys=True) + "\n")

    def _record_path(self, job_id: str) -> Path:
        return self.jobs_directory / f"{job_id}.json"

    def _events_path(self, job_id: str) -> Path:
        return self.jobs_directory / f"{job_id}.events.jsonl"

    def _read_record(self, job_id: str) -> dict[str, Any] | None:
        record_path = self._record_path(job_id)
        if not record_path.is_file():
            return None
        record: dict[str, Any] = json.loads(record_path.read_text(encoding="utf-8"))
        return record

    def _write_record(self, record: dict[str, Any]) -> None:
        descriptor, temporary_name = tempfile.mkstemp(
            dir=self.jobs_directory, prefix=".record-", suffix=".tmp"
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as record_file:
            json.dump(record, record_file, sort_keys=True)
        os.replace(temporary_name, self._record_path(record["jobId"]))

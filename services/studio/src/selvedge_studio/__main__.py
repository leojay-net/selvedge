"""Entry point: `python -m selvedge_studio serve` or `python -m selvedge_studio export-schema`."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import uvicorn

from selvedge_studio.service.app import create_app
from selvedge_studio.service.catalog import build_exposed_registry
from selvedge_studio.service.director import build_director_model
from selvedge_studio.service.errors import ConfigurationError
from selvedge_studio.service.settings import load_settings
from selvedge_studio.service.studio_spec import studio_spec_json_schema

EXIT_CONFIGURATION_ERROR = 2


def export_schema(destination: Path) -> None:
    schema = studio_spec_json_schema(build_exposed_registry(with_libreoffice=True).names())
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def serve() -> None:
    settings = load_settings()
    application = create_app(settings, build_director_model(settings.director))
    uvicorn.run(application, host=settings.host, port=settings.port)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="selvedge_studio")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("serve", help="run the HTTP service")
    schema_command = commands.add_parser("export-schema", help="write the studio spec JSON Schema")
    schema_command.add_argument("destination", type=Path)
    arguments = parser.parse_args(argv)
    try:
        if arguments.command == "serve":
            serve()
        else:
            export_schema(arguments.destination)
    except ConfigurationError as problem:
        print(f"configuration error: {problem}", file=sys.stderr)
        return EXIT_CONFIGURATION_ERROR
    return 0


if __name__ == "__main__":
    sys.exit(main())

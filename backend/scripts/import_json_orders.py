import argparse
import asyncio
import json
from pathlib import Path

from app.db.session import SessionFactory
from app.services.importer import import_records, read_records


async def run(directory: Path, dry_run: bool) -> int:
    records, report = read_records(directory)
    async with SessionFactory() as session:
        report = await import_records(session, records, report, dry_run=dry_run)
    print(
        json.dumps(
            {
                "dry_run": dry_run,
                "directory": str(directory),
                "discovered": report.discovered,
                "imported": report.imported,
                "skipped": report.skipped,
                "invalid": report.invalid,
                "errors": report.errors,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 1 if report.invalid else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Import legacy JSON orders into PostgreSQL.")
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not args.directory.is_dir():
        parser.error(f"directory does not exist: {args.directory}")
    return asyncio.run(run(args.directory, args.dry_run))


if __name__ == "__main__":
    raise SystemExit(main())

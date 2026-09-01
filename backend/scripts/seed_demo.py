import argparse
import asyncio
import json
from datetime import date

from app.db.session import SessionFactory
from app.services.demo_factory import DemoOptions
from app.services.demo_seed import seed_demo


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Создать изолированный demo-набор CRM.")
    parser.add_argument("--count", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=20260831)
    parser.add_argument("--as-of", type=date.fromisoformat, required=True)
    return parser.parse_args()


async def run() -> None:
    args = parse_args()
    report = await seed_demo(
        SessionFactory,
        DemoOptions(count=args.count, seed=args.seed, as_of=args.as_of),
    )
    print(
        json.dumps(
            {
                "seed": report.seed,
                "asOf": report.as_of.isoformat(),
                "orders": report.summary["orders"],
                "customers": report.summary["customers"],
                "tasks": report.summary["tasks"],
                "digest": report.digest,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    asyncio.run(run())

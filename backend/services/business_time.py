"""Business dates use Vietnam time; persisted SQL timestamps use configured DB time."""

import os
from datetime import datetime, time, timedelta, timezone

VIETNAM = timezone(timedelta(hours=7))


def business_now():
    return datetime.now(VIETNAM)


def database_day_start(day):
    database_zone = timezone(
        timedelta(
            minutes=int(os.getenv("DATABASE_TIMEZONE_OFFSET_MINUTES", "0"))
        )
    )
    return (
        datetime.combine(day, time.min, tzinfo=VIETNAM)
        .astimezone(database_zone)
        .replace(tzinfo=None)
    )


def database_iso(value, utc=False):
    if value is None:
        return None
    if not isinstance(value, datetime):
        try:
            value = datetime.fromisoformat(str(value))
        except ValueError:
            return str(value)
    if value.tzinfo is None:
        value = value.replace(
            tzinfo=timezone(
                timedelta(
                    minutes=(
                        0
                        if utc
                        else int(
                            os.getenv("DATABASE_TIMEZONE_OFFSET_MINUTES", "0")
                        )
                    )
                )
            )
        )
    return value.astimezone(VIETNAM).isoformat(timespec="seconds")

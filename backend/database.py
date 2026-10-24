
"""SQL Server connection helper shared by auth, fields, booking and UC06.

Load local settings from backend/.env first, then project-root .env as a
fallback. Real process environment variables always take precedence.
"""

from __future__ import annotations

import os
from pathlib import Path

import pyodbc
from dotenv import load_dotenv

_BACKEND_DIR = Path(__file__).resolve().parent
_PROJECT_DIR = _BACKEND_DIR.parent

# Explicit paths avoid depending on the terminal's working directory.
# Do not overwrite environment variables injected by an actual deployment.
load_dotenv(_BACKEND_DIR / ".env", override=False)
load_dotenv(_PROJECT_DIR / ".env", override=False)


def _odbc_value(value: str) -> str:
    """Quote an ODBC connection-string value, including closing braces."""
    return "{" + value.replace("}", "}}") + "}"


def _driver_name() -> str:
    """Select the configured SQL Server ODBC driver when available."""
    wanted = (os.getenv("DB_DRIVER") or "ODBC Driver 18 for SQL Server").strip()
    wanted = wanted.strip("{}")
    available = pyodbc.drivers()

    if wanted in available:
        return wanted

    # The previous code hardcoded Driver 17. Support computers that only
    # have Driver 17 or only Driver 18 installed, without changing .env.
    for candidate in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"):
        if candidate in available:
            print(f"Database notice: {wanted!r} unavailable; using {candidate!r}.")
            return candidate

    raise RuntimeError(
        "Microsoft SQL Server ODBC Driver 17/18 not installed. "
        f"Available drivers: {available!r}"
    )


def get_connection() -> pyodbc.Connection | None:
    """Return a SQL Server connection, or None after logging a safe error."""
    try:
        server = (os.getenv("DB_SERVER") or "").strip()
        database = (os.getenv("DB_NAME") or "").strip()
        if not server or not database:
            raise ValueError(
                "DB_SERVER and DB_NAME must be set in backend/.env "
                "(or the project-root .env)."
            )

        trusted = (os.getenv("DB_TRUSTED_CONNECTION") or "no").lower().strip() \
            in {"yes", "true", "1", "on"}
        encrypt = (os.getenv("DB_ENCRYPT") or "yes").strip()
        trust_cert = (os.getenv("DB_TRUST_SERVER_CERTIFICATE") or "yes").strip()

        parts = [
            f"DRIVER={_odbc_value(_driver_name())}",
            f"SERVER={_odbc_value(server)}",
            f"DATABASE={_odbc_value(database)}",
            f"Encrypt={encrypt}",
            f"TrustServerCertificate={trust_cert}",
        ]

        if trusted:
            parts.append("Trusted_Connection=yes")
        else:
            user = (os.getenv("DB_USER") or "").strip()
            password = os.getenv("DB_PASSWORD") or ""
            if not user or not password:
                raise ValueError(
                    "Set DB_USER and DB_PASSWORD for SQL authentication, "
                    "or use DB_TRUSTED_CONNECTION=yes for Windows authentication."
                )
            parts.extend((f"UID={_odbc_value(user)}", f"PWD={_odbc_value(password)}"))

        return pyodbc.connect(";".join(parts) + ";", timeout=5)

    except (pyodbc.Error, ValueError, RuntimeError) as exc:
        # Avoid printing a connection string or its password.
        print(f"Database connection error: {exc}")
        return None

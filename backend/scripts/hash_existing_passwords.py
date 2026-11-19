"""
T123-72

Chạy MỘT LẦN để migrate PasswordHash cũ
sang bcrypt.

Backup database trước khi chạy.
"""


import os
import sys

import bcrypt


BACKEND_DIR = os.path.dirname(

    os.path.dirname(

        os.path.abspath(
            __file__
        )
    )
)


if (
    BACKEND_DIR
    not in sys.path
):

    sys.path.insert(
        0,
        BACKEND_DIR
    )


from database import get_connection


def is_bcrypt_hash(
    value
):

    text = str(
        value
        or ""
    ).strip()

    return text.startswith(
        (
            "$2a$",
            "$2b$",
            "$2y$"
        )
    )


def main():

    conn = get_connection()


    if conn is None:

        raise SystemExit(
            "Không thể kết nối database"
        )


    cursor = conn.cursor()


    try:

        cursor.execute(

            """
            SELECT
                UserID,
                PasswordHash

            FROM Users

            WHERE PasswordHash IS NOT NULL
            """
        )


        rows = (
            cursor.fetchall()
        )


        migrated = 0

        skipped = 0


        for row in rows:

            current_value = str(

                row.PasswordHash
                or ""

            ).strip()


            if not current_value:

                skipped += 1

                continue


            if is_bcrypt_hash(
                current_value
            ):

                skipped += 1

                continue


            new_hash = bcrypt.hashpw(

                current_value.encode(
                    "utf-8"
                ),

                bcrypt.gensalt(),

            ).decode(
                "utf-8"
            )


            cursor.execute(

                """
                UPDATE Users

                SET PasswordHash = ?

                WHERE UserID = ?
                """,

                new_hash,

                row.UserID,
            )


            migrated += 1


            print(
                f"Migrated UserID={row.UserID}"
            )


        conn.commit()


        print(

            f"Done. Migrated={migrated}, Skipped={skipped}"
        )


    except Exception:

        conn.rollback()

        raise


    finally:

        cursor.close()

        conn.close()


if __name__ == "__main__":

    main()
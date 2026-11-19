"""Run before changing transaction code. Prints counts only, never credentials."""
from otp_sqlserver_support import DisposableSqlServer


def main():
    db = DisposableSqlServer()
    try:
        setup = db.connect(autocommit=True)
        setup.execute("CREATE TABLE dbo.TransactionProbe (ID int NOT NULL PRIMARY KEY)")
        setup.close()
        for label, statement in (("old", "SET XACT_ABORT ON; SET LOCK_TIMEOUT 15000; BEGIN TRANSACTION;"),
                                 ("odbc_only", "SET XACT_ABORT ON; SET LOCK_TIMEOUT 15000;")):
            writer = db.connect()
            reader = db.connect(autocommit=True)
            cursor = writer.cursor()
            cursor.execute(statement)
            before = cursor.execute("SELECT @@TRANCOUNT, XACT_STATE()").fetchone()
            cursor.execute("INSERT dbo.TransactionProbe (ID) VALUES (?)", 1 if label == "old" else 2)
            after_insert = cursor.execute("SELECT @@TRANCOUNT, XACT_STATE()").fetchone()
            writer.commit()
            after_commit = cursor.execute("SELECT @@TRANCOUNT, XACT_STATE()").fetchone()
            writer.close()
            visible = reader.execute("SELECT COUNT(*) FROM dbo.TransactionProbe WHERE ID=?", 1 if label == "old" else 2).fetchone()[0]
            reader.close()
            print(label, "before=", tuple(before), "insert=", tuple(after_insert),
                  "after_commit=", tuple(after_commit), "independent_visible_after_close=", visible)
    finally:
        db.close()


if __name__ == "__main__":
    main()

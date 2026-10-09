import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    try:
        driver = os.getenv("DB_DRIVER")
        server = os.getenv("DB_SERVER")
        database = os.getenv("DB_NAME")
        user = os.getenv("DB_USER")
        password = os.getenv("DB_PASSWORD")
        trusted_certificate = os.getenv(
            "DB_TRUST_SERVER_CERTIFICATE", "yes"
        )

        conn = pyodbc.connect(
            f"DRIVER={{{driver}}};"
            f"SERVER={server};"
            f"DATABASE={database};"
            f"UID={user};"
            f"PWD={password};"
            f"Encrypt=yes;"
            f"TrustServerCertificate={trusted_certificate};"
        )

        return conn

    except pyodbc.Error as e:
        print("Database connection error:")
        print(e)
        return None


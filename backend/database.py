import pyodbc

def get_connection():
    try:
        conn = pyodbc.connect(
            "DRIVER={ODBC Driver 17 for SQL Server};"
            "SERVER=127.0.0.1;"
            "DATABASE=FootballBookingDB;"
            "UID=sa;"
            "PWD=HuyPhu@999;"
            "TrustServerCertificate=yes;"
        )
        return conn
    except Exception as e:
        print("Database connection error:")
        print(e)
        return None
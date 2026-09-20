import pyodbc

def get_connection():
    try:
        return pyodbc.connect(
            "DRIVER={ODBC Driver 17 for SQL Server};"
            "SERVER=THAFIE\\SQLEXPRESS;"
            "DATABASE=FootballBookingDB;"
            "Trusted_Connection=yes;"
            "TrustServerCertificate=yes;"   
        )
    except Exception as e:
        print("Database connection error:", e)
        raise
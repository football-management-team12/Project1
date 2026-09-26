import pyodbc


def get_connection():

    try:

        conn = pyodbc.connect(

            "DRIVER={ODBC Driver 17 for SQL Server};"
            "SERVER=LAPTOP-F7NE9URR\\SQLEXPRESS;"
            "DATABASE=FootballBookingDB;"
            "Trusted_Connection=yes;"
            "TrustServerCertificate=yes;"

        )


        return conn


    except Exception as e:

        print("Database connection error:")
        print(e)

        return None
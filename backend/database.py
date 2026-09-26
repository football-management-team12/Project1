import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()

def get_connection():

    try:
        driver = os.getenv("DB_DRIVER") 
        server = os.getenv("DB_SERVER") 
        database = os.getenv("DB_NAME")
        
        trusted_connection = os.getenv( 
            "DB_TRUSTED_CONNECTION",
            "yes" 
        )

        trust_server_certificate = os.getenv( 
            "DB_TRUST_SERVER_CERTIFICATE", 
            "yes" 
        )

        conn = pyodbc.connect( 
            f"DRIVER={{{driver}}};" 
            f"SERVER={server};" 
            f"DATABASE={database};" 
            f"Trusted_Connection={trusted_connection};" 
            f"TrustServerCertificate={trust_server_certificate};" 
        )

        return conn 


    except Exception as e:

        print("Database connection error:")
        print(e)

        return None
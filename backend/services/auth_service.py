import sys
import os

sys.path.append(
    os.path.dirname(
        os.path.dirname(__file__)
    )
)

from database import get_connection



def login_user(account, password):

    conn = get_connection()

    if conn is None:
        return None


    cursor = conn.cursor()


    sql = """
    SELECT
        UserID,
        FullName,
        Email,
        Phone,
        PasswordHash,
        Role

    FROM Users

    WHERE Email = ?
       OR Phone = ?
    """


    cursor.execute(
        sql,
        account,
        account
    )


    user = cursor.fetchone()


    if user is None:
        print("Không tìm thấy user")
        return None


    print("USER:", user.Email)
    print("DB PASSWORD:", user.PasswordHash)
    print("INPUT:", password)


    if user.PasswordHash.strip() != password.strip():
        print("Sai mật khẩu")
        return None



    return {

        "UserID": user.UserID,

        "FullName": user.FullName,

        "Email": user.Email,

        "Phone": user.Phone,

        "Role": user.Role

    }
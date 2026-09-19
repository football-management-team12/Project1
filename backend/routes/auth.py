from flask import Blueprint, request, jsonify

import sys
import os

sys.path.append(
    os.path.dirname(
        os.path.dirname(__file__)
    )
)


from services.auth_service import login_user



auth_bp = Blueprint(
    "auth",
    __name__
)



@auth_bp.route(
    "/login",
    methods=["POST"]
)

def login():


    data = request.json


    account = data.get("account")

    password = data.get("password")



    user = login_user(
        account,
        password
    )


    if user:

        return jsonify({

            "success":True,

            "user":user

        })


    return jsonify({

        "success":False,

        "message":"Sai tài khoản hoặc mật khẩu"

    }),401
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
from flask import g, jsonify, request
from jwt import ExpiredSignatureError, InvalidTokenError


DEFAULT_EXPIRES_MINUTES = 60


def _jwt_secret():
    secret = str(
        os.getenv("JWT_SECRET")
        or ""
    ).strip()

    if not secret:
        secret = (
            "project1-local-dev-secret-change-me"
        )

    return secret


def _expires_minutes():
    raw_value = str(
        os.getenv("JWT_EXPIRES_MINUTES")
        or DEFAULT_EXPIRES_MINUTES
    ).strip()

    try:
        value = int(raw_value)

    except (TypeError, ValueError):
        value = DEFAULT_EXPIRES_MINUTES

    return max(
        value,
        1
    )


def create_access_token(
    user_id,
    role
):
    now = datetime.now(
        timezone.utc
    )

    expires_at = (
        now +
        timedelta(
            minutes=_expires_minutes()
        )
    )

    payload = {

        "sub":
            str(user_id),

        "role":
            str(
                role
                or ""
            ).strip().upper(),

        "iat":
            now,

        "exp":
            expires_at,
    }

    token = jwt.encode(

        payload,

        _jwt_secret(),

        algorithm="HS256",
    )

    return token


def decode_access_token(
    token
):
    return jwt.decode(

        token,

        _jwt_secret(),

        algorithms=[
            "HS256"
        ],

        options={
            "require": [
                "sub",
                "role",
                "exp"
            ]
        },
    )


def _extract_bearer_token():

    authorization = str(

        request.headers.get(
            "Authorization"
        )

        or ""

    ).strip()


    if not authorization:

        return None


    parts = (
        authorization.split(
            None,
            1
        )
    )


    if len(parts) != 2:

        return None


    scheme, token = parts


    if scheme.lower() != "bearer":

        return None


    token = token.strip()


    return token or None


def jwt_required(
    view_function
):

    @wraps(
        view_function
    )
    def wrapped(
        *args,
        **kwargs
    ):

        token = (
            _extract_bearer_token()
        )


        if not token:

            return jsonify({

                "message":
                    "Thiếu access token"

            }), 401


        try:

            payload = (
                decode_access_token(
                    token
                )
            )


        except ExpiredSignatureError:

            return jsonify({

                "message":
                    "Access token đã hết hạn"

            }), 401


        except InvalidTokenError:

            return jsonify({

                "message":
                    "Access token không hợp lệ"

            }), 401


        try:

            user_id = int(
                payload.get(
                    "sub"
                )
            )

        except (
            TypeError,
            ValueError
        ):

            return jsonify({

                "message":
                    "Access token không hợp lệ"

            }), 401


        role = str(

            payload.get(
                "role"
            )

            or ""

        ).strip().upper()


        if not role:

            return jsonify({

                "message":
                    "Access token không hợp lệ"

            }), 401


        g.auth_user = {

            "UserID":
                user_id,

            "Role":
                role,

            "TokenPayload":
                payload,
        }


        return view_function(
            *args,
            **kwargs
        )


    return wrapped


def role_required(
    *allowed_roles
):

    normalized_roles = {

        str(
            role
            or ""
        ).strip().upper()

        for role
        in allowed_roles

        if str(
            role
            or ""
        ).strip()
    }


    def decorator(
        view_function
    ):

        @wraps(
            view_function
        )
        def wrapped(
            *args,
            **kwargs
        ):

            auth_user = getattr(

                g,

                "auth_user",

                None,
            )


            if not auth_user:

                return jsonify({

                    "message":
                        "Bạn chưa đăng nhập"

                }), 401


            role = str(

                auth_user.get(
                    "Role"
                )

                or ""

            ).strip().upper()


            if (
                role
                not in
                normalized_roles
            ):

                return jsonify({

                    "message":
                        "Bạn không có quyền thực hiện chức năng này"

                }), 403


            return view_function(
                *args,
                **kwargs
            )


        return wrapped


    return decorator


def current_user_id():

    auth_user = getattr(
        g,
        "auth_user",
        {}
    )

    return auth_user.get(
        "UserID"
    )


def current_user_role():

    auth_user = getattr(
        g,
        "auth_user",
        {}
    )

    return str(

        auth_user.get(
            "Role"
        )

        or ""

    ).strip().upper()
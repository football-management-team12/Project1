
# ============================================================
# UC15 - FIELD MANAGEMENT ROUTES
# File: backend/routes/field_management.py
# ============================================================

from flask import Blueprint, jsonify, request, current_app

from database import get_connection

from services.jwt_service import (
    jwt_required,
    role_required,
    current_user_id,
)

from services.field_management_service import (
    FieldManagementError,
    get_admin_fields,
    get_field_details,
    create_field,
    update_field,
    set_field_status,
    archive_field,
    restore_field,
    add_field_price,
    update_field_price,
    require_active_admin,
)


field_management_bp = Blueprint(
    "field_management",
    __name__
)


def execute_service(operation, success_status=200):
    """
    Thuc thi Service trong SQL transaction.
    - Kiem tra ADMIN ACTIVE
    - COMMIT neu thanh cong
    - ROLLBACK neu that bai
    """
    connection = None
    cursor = None

    try:
        connection = get_connection()

        if connection is None:
            return jsonify({
                "message": "Không thể kết nối database"
            }), 500

        cursor = connection.cursor()

        # Tránh xung đột khi nhiều request cùng sửa sân.
        cursor.execute(
            "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"
        )

        require_active_admin(cursor, current_user_id())

        result = operation(cursor)

        connection.commit()

        return jsonify(result), success_status

    except FieldManagementError as error:
        if connection is not None:
            connection.rollback()

        return jsonify({
            "message": error.message,
            "code": error.code,
        }), error.status

    except Exception:
        if connection is not None:
            connection.rollback()

        current_app.logger.exception(
            "UC15 FIELD MANAGEMENT ERROR"
        )

        return jsonify({
            "message": "Có lỗi xảy ra khi quản lý sân"
        }), 500

    finally:
        if cursor is not None:
            cursor.close()

        if connection is not None:
            connection.close()


def json_body():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        raise FieldManagementError(
            "Body phải là JSON object",
            400
        )

    return data


# ============================================================
# GET /api/admin/fields
# ADMIN xem ca san dang hoat dong va san Archive
# ============================================================

@field_management_bp.route(
    "",
    methods=["GET"]
)
@jwt_required
@role_required("ADMIN")
def list_fields():
    archived = request.args.get("archived")

    if archived is not None and archived not in ("0", "1"):
        return jsonify({
            "message": "archived phải bằng 0 hoặc 1"
        }), 400

    archived_value = (
        None if archived is None else int(archived)
    )

    return execute_service(
        lambda cursor: get_admin_fields(
            cursor,
            archived_value
        )
    )


# ============================================================
# GET /api/admin/fields/<field_id>
# ============================================================

@field_management_bp.route(
    "/<int:field_id>",
    methods=["GET"]
)
@jwt_required
@role_required("ADMIN")
def field_detail(field_id):
    return execute_service(
        lambda cursor: get_field_details(
            cursor, field_id
        )
    )


# ============================================================
# POST /api/admin/fields
# THEM SAN MOI
# ============================================================

@field_management_bp.route(
    "",
    methods=["POST"]
)
@jwt_required
@role_required("ADMIN")
def create_new_field():
    return execute_service(
        lambda cursor: {
            "message": "Thêm sân thành công",
            "field": create_field(
                cursor,
                json_body()
            )
        },
        201
    )


# ============================================================
# PUT /api/admin/fields/<field_id>
# SUA THONG TIN SAN
# ============================================================

@field_management_bp.route(
    "/<int:field_id>",
    methods=["PUT"]
)
@jwt_required
@role_required("ADMIN")
def update_existing_field(field_id):
    return execute_service(
        lambda cursor: {
            "message": "Cập nhật sân thành công",
            "field": update_field(
                cursor,
                field_id,
                json_body()
            )
        }
    )


# ============================================================
# PATCH /api/admin/fields/<field_id>/status
# DOI AVAILABLE / MAINTENANCE
# ============================================================

@field_management_bp.route(
    "/<int:field_id>/status",
    methods=["PATCH"]
)
@jwt_required
@role_required("ADMIN")
def change_field_status(field_id):
    return execute_service(
        lambda cursor: {
            "message": "Cập nhật trạng thái thành công",
            "field": set_field_status(
                cursor,
                field_id,
                json_body().get("Status")
            )
        }
    )


# ============================================================
# PATCH /api/admin/fields/<field_id>/archive
# LUU TRU SAN - KHONG XOA DU LIEU
# ============================================================

@field_management_bp.route(
    "/<int:field_id>/archive",
    methods=["PATCH"]
)
@jwt_required
@role_required("ADMIN")
def archive_existing_field(field_id):
    return execute_service(
        lambda cursor: {
            "message": "Lưu trữ sân thành công",
            "field": archive_field(
                cursor,
                field_id,
                current_user_id()
            )
        }
    )


# ============================================================
# PATCH /api/admin/fields/<field_id>/restore
# KHOI PHUC SAN
# ============================================================

@field_management_bp.route(
    "/<int:field_id>/restore",
    methods=["PATCH"]
)
@jwt_required
@role_required("ADMIN")
def restore_existing_field(field_id):
    return execute_service(
        lambda cursor: {
            "message": "Khôi phục sân thành công",
            "field": restore_field(
                cursor,
                field_id
            )
        }
    )


# ============================================================
# POST /api/admin/fields/<field_id>/prices
# THEM KHUNG GIA
# ============================================================

@field_management_bp.route(
    "/<int:field_id>/prices",
    methods=["POST"]
)
@jwt_required
@role_required("ADMIN")
def create_price(field_id):
    return execute_service(
        lambda cursor: {
            "message": "Thêm khung giá thành công",
            "result": add_field_price(
                cursor,
                field_id,
                json_body()
            )
        },
        201
    )


# ============================================================
# PUT /api/admin/fields/<field_id>/prices/<price_id>
# SUA KHUNG GIA
# ============================================================

@field_management_bp.route(
    "/<int:field_id>/prices/<int:price_id>",
    methods=["PUT"]
)
@jwt_required
@role_required("ADMIN")
def edit_price(field_id, price_id):
    return execute_service(
        lambda cursor: {
            "message": "Cập nhật khung giá thành công",
            "field": update_field_price(
                cursor,
                field_id,
                price_id,
                json_body()
            )
        }
    )

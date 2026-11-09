"""ADMIN-only UC12 contract, separate from the existing UC08 endpoints."""
from flask import Blueprint, current_app, jsonify, request
from services import admin_invoice_service as service
from services.jwt_service import current_user_id, jwt_required, role_required
from services.payment_service import PaymentError

admin_invoice_bp = Blueprint("admin_invoice", __name__)


def _call(fn, *args):
    try:
        return jsonify(fn(current_user_id(), *args)), 200
    except PaymentError as error:
        return jsonify(message=error.message, code=error.code), error.status_code
    except Exception:
        current_app.logger.exception("UC12 invoice operation failed")
        return jsonify(message="Không thể xử lý hóa đơn", code="INVOICE_OPERATION_FAILED"), 500


@admin_invoice_bp.get("/admin/invoices")
@jwt_required
@role_required("ADMIN")
def invoice_list():
    return _call(service.list_invoices, request.args)


@admin_invoice_bp.get("/admin/invoices/<int:invoice_id>")
@jwt_required
@role_required("ADMIN")
def invoice_detail(invoice_id):
    return _call(service.invoice_detail, invoice_id)


@admin_invoice_bp.patch("/admin/invoices/<int:invoice_id>/status")
@jwt_required
@role_required("ADMIN")
def invoice_status(invoice_id):
    return _call(service.cancel_invoice, invoice_id, request.get_json(silent=True))

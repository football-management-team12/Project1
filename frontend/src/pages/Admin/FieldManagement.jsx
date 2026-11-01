
import { useCallback, useEffect, useState } from "react";
import { Navigate, useOutletContext } from "react-router-dom";

import {
  getAdminFields,
  getAdminFieldDetail,
  createAdminField,
  updateAdminField,
  updateAdminFieldStatus,
  archiveAdminField,
  restoreAdminField,
  addAdminFieldPrice,
  updateAdminFieldPrice,
} from "../../services/field_admin_service";

import "./FieldManagement.css";

// ============================================================
// UC15 - FIELD MANAGEMENT
// ADMIN / CHỦ SÂN
// ============================================================

const EMPTY_FIELD = {
  FieldName: "",
  FieldType: "5 player",
  Location: "",
  Image: "",
  Status: "AVAILABLE",
};

const EMPTY_PRICE = {
  StartTime: "06:00",
  EndTime: "07:00",
  Price: "",
};

const money = (value) =>
  `${Number(value || 0).toLocaleString("vi-VN")}đ`;

const normalizeTime = (value) =>
  String(value || "").slice(0, 5);

const errorText = (error) => {
  if (error?.code === "ACTIVE_BOOKINGS") {
    return (
      "Sân còn booking đang hiệu lực. " +
      "Hãy xử lý booking trước khi thực hiện thao tác."
    );
  }

  return error?.message || "Có lỗi xảy ra. Vui lòng thử lại.";
};

function FieldManagement() {
  const { isAdmin } = useOutletContext();

  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [notice, setNotice] = useState(null);

  // Modal thêm/sửa sân
  const [fieldModal, setFieldModal] = useState(null);
  const [fieldForm, setFieldForm] = useState(EMPTY_FIELD);

  // Modal quản lý bảng giá
  const [priceField, setPriceField] = useState(null);
  const [priceForm, setPriceForm] = useState(EMPTY_PRICE);
  const [editingPriceId, setEditingPriceId] = useState(null);

  // ============================================================
  // LOAD FIELDS
  // ============================================================

  const loadFields = useCallback(async () => {
    setLoading(true);
    setNotice((previous) => previous?.type === "error" ? null : previous);

    try {
      const data = await getAdminFields();

      setFields(Array.isArray(data) ? data : []);
    } catch (error) {
      setNotice({
        type: "error",
        text: errorText(error),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadFields();
    }
  }, [isAdmin, loadFields]);

  // ============================================================
  // MESSAGES / ACTION HELPER
  // ============================================================

  const showSuccess = (text) =>
    setNotice({ type: "success", text });

  const showError = (error) =>
    setNotice({
      type: "error",
      text: errorText(error),
    });

  const runAction = async (action, successMessage) => {
    setSaving(true);
    setNotice(null);

    try {
      const result = await action();

      showSuccess(
        result?.message || successMessage || "Thành công"
      );

      await loadFields();

      return true;
    } catch (error) {
      showError(error);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // ============================================================
  // FIELD FORM
  // ============================================================

  const openCreateModal = () => {
    setFieldForm({ ...EMPTY_FIELD });
    setFieldModal({ mode: "create" });
    setNotice(null);
  };

  const openEditModal = (field) => {
    setFieldForm({
      FieldName: field.FieldName || "",
      FieldType: field.FieldType || "5 player",
      Location: field.Location || "",
      Image: field.Image || "",
      Status: field.Status || "AVAILABLE",
    });

    setFieldModal({
      mode: "edit",
      id: field.FieldID,
    });

    setNotice(null);
  };

  const handleSaveField = async (event) => {
    event.preventDefault();

    const payload = {
      FieldName: fieldForm.FieldName.trim(),
      FieldType: fieldForm.FieldType.trim(),
      Location: fieldForm.Location.trim(),
      Image: fieldForm.Image.trim(),
    };

    if (
      !payload.FieldName ||
      !payload.FieldType ||
      !payload.Location
    ) {
      showError({
        message: "Tên sân, loại sân và địa điểm là bắt buộc",
      });
      return;
    }

    if (fieldModal.mode === "create") {
      payload.Status = fieldForm.Status;
    }

    const success = await runAction(
      () =>
        fieldModal.mode === "create"
          ? createAdminField(payload)
          : updateAdminField(fieldModal.id, payload),
      fieldModal.mode === "create"
        ? "Thêm sân thành công"
        : "Sửa sân thành công"
    );

    if (success) {
      setFieldModal(null);
    }
  };

  // ============================================================
  // ARCHIVE / RESTORE / MAINTENANCE
  // ============================================================

  const handleArchive = async (field) => {
    const confirmed = window.confirm(
      `Lưu trữ "${field.FieldName}"?\n\n` +
        "Sân sẽ bị ẩn khỏi danh sách đặt sân. " +
        "Booking và lịch sử thanh toán vẫn được giữ nguyên.\n\n" +
        "Không thể lưu trữ nếu còn booking hiệu lực."
    );

    if (!confirmed) return;

    await runAction(
      () => archiveAdminField(field.FieldID),
      "Lưu trữ sân thành công"
    );
  };

  const handleRestore = async (field) => {
    if (
      !window.confirm(
        `Khôi phục sân "${field.FieldName}"?`
      )
    ) {
      return;
    }

    await runAction(
      () => restoreAdminField(field.FieldID),
      "Khôi phục sân thành công"
    );
  };

  const handleStatus = async (field) => {
    const nextStatus =
      field.Status === "AVAILABLE"
        ? "MAINTENANCE"
        : "AVAILABLE";

    const label =
      nextStatus === "MAINTENANCE"
        ? "chuyển sang bảo trì"
        : "mở hoạt động trở lại";

    if (
      !window.confirm(
        `Bạn muốn ${label} cho sân "${field.FieldName}"?`
      )
    ) {
      return;
    }

    await runAction(
      () =>
        updateAdminFieldStatus(field.FieldID, nextStatus),
      "Cập nhật trạng thái thành công"
    );
  };

  // ============================================================
  // PRICE MANAGEMENT
  // ============================================================

  const openPrices = async (field) => {
    setSaving(true);
    setNotice(null);

    try {
      const detail = await getAdminFieldDetail(field.FieldID);

      setPriceField(detail);
      setPriceForm({ ...EMPTY_PRICE });
      setEditingPriceId(null);
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };

  const reloadPriceField = async (fieldId) => {
    const detail = await getAdminFieldDetail(fieldId);
    setPriceField(detail);
  };

  const startEditPrice = (price) => {
    setEditingPriceId(price.PriceID);

    setPriceForm({
      StartTime: normalizeTime(price.StartTime),
      EndTime: normalizeTime(price.EndTime),
      Price: String(price.Price),
    });
  };

  const cancelEditPrice = () => {
    setEditingPriceId(null);
    setPriceForm({ ...EMPTY_PRICE });
  };

  const handleSavePrice = async (event) => {
    event.preventDefault();

    if (!priceField) return;

    const numericPrice = Number(priceForm.Price);

    if (
      priceForm.Price === "" ||
      !Number.isFinite(numericPrice) ||
      numericPrice <= 0
    ) {
      showError({
        message: "Giá sân phải lớn hơn 0",
      });
      return;
    }

    if (priceForm.StartTime >= priceForm.EndTime) {
      showError({
        message: "Giờ kết thúc phải lớn hơn giờ bắt đầu",
      });
      return;
    }

    const fieldId = priceField.FieldID;

    const payload = {
      StartTime: priceForm.StartTime,
      EndTime: priceForm.EndTime,
      Price: numericPrice,
    };

    const success = await runAction(
      () =>
        editingPriceId === null
          ? addAdminFieldPrice(fieldId, payload)
          : updateAdminFieldPrice(
              fieldId,
              editingPriceId,
              payload
            ),
      "Lưu bảng giá thành công"
    );

    if (success) {
      try {
        await reloadPriceField(fieldId);
        cancelEditPrice();
      } catch (error) {
        showError(error);
      }
    }
  };

  // ============================================================
  // FILTER / STATS
  // ============================================================

  const typeOptions = Array.from(
    new Set(fields.map((field) => field.FieldType).filter(Boolean))
  );

  const filteredFields = fields.filter((field) => {
    const matchesName = String(
      field.FieldName || ""
    )
      .toLowerCase()
      .includes(search.trim().toLowerCase());

    const matchesType =
      !typeFilter || field.FieldType === typeFilter;

    let matchesStatus = true;

    if (statusFilter === "ARCHIVED") {
      matchesStatus = Boolean(field.IsArchived);
    } else if (statusFilter === "AVAILABLE") {
      matchesStatus =
        !field.IsArchived && field.Status === "AVAILABLE";
    } else if (statusFilter === "MAINTENANCE") {
      matchesStatus =
        !field.IsArchived && field.Status === "MAINTENANCE";
    } else if (statusFilter === "NOT_ARCHIVED") {
      matchesStatus = !field.IsArchived;
    }

    return matchesName && matchesType && matchesStatus;
  });

  const totalFields = fields.length;

  const activeFields = fields.filter(
    (field) =>
      !field.IsArchived && field.Status === "AVAILABLE"
  ).length;

  const maintenanceFields = fields.filter(
    (field) =>
      !field.IsArchived && field.Status === "MAINTENANCE"
  ).length;

  const archivedFields = fields.filter(
    (field) => field.IsArchived
  ).length;

  // ============================================================
  // AUTHORIZE
  // ============================================================

  if (!isAdmin) {
    return <Navigate to="/admin/bookings" replace />;
  }

  return (
    <div className="fm-page">
      {/* HEADER */}
      <div className="fm-header">
        <div>
          <h1>QUẢN LÝ SÂN BÓNG</h1>
          <p>
            UC15 – Thêm, sửa, quản lý giá, bảo trì,
            lưu trữ và khôi phục sân.
          </p>
        </div>

        <div className="fm-header-actions">
          <button
            type="button"
            className="fm-btn fm-btn-outline"
            onClick={loadFields}
            disabled={loading || saving}
          >
            Làm mới
          </button>

          <button
            type="button"
            className="fm-btn fm-btn-primary"
            onClick={openCreateModal}
            disabled={saving}
          >
            + Thêm sân mới
          </button>
        </div>
      </div>

      {/* THÔNG BÁO */}
      {notice && (
        <div
          className={`fm-notice fm-notice-${notice.type}`}
          role="alert"
        >
          <span>{notice.text}</span>

          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      )}

      {/* THỐNG KÊ */}
      <div className="fm-stats">
        <div className="fm-stat">
          <span>Tổng số sân</span>
          <strong>{totalFields}</strong>
        </div>

        <div className="fm-stat fm-stat-green">
          <span>Đang hoạt động</span>
          <strong>{activeFields}</strong>
        </div>

        <div className="fm-stat fm-stat-orange">
          <span>Đang bảo trì</span>
          <strong>{maintenanceFields}</strong>
        </div>

        <div className="fm-stat fm-stat-gray">
          <span>Đã lưu trữ</span>
          <strong>{archivedFields}</strong>
        </div>
      </div>

      {/* BỘ LỌC */}
      <div className="fm-filters">
        <input
          type="search"
          placeholder="Tìm tên sân..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          <option value="">Tất cả loại sân</option>

          {typeOptions.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="AVAILABLE">Đang hoạt động</option>
          <option value="MAINTENANCE">Đang bảo trì</option>
          <option value="ARCHIVED">Đã lưu trữ</option>
          <option value="NOT_ARCHIVED">Chưa lưu trữ</option>
        </select>
      </div>

      {/* DANH SÁCH SÂN */}
      <div className="fm-table-box">
        <table className="fm-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Tên sân</th>
              <th>Loại sân</th>
              <th>Địa điểm</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="fm-empty">
                  Đang tải danh sách sân...
                </td>
              </tr>
            ) : filteredFields.length === 0 ? (
              <tr>
                <td colSpan={6} className="fm-empty">
                  Không tìm thấy sân phù hợp.
                </td>
              </tr>
            ) : (
              filteredFields.map((field) => (
                <tr key={field.FieldID}>
                  <td>#{field.FieldID}</td>

                  <td>
                    <strong>{field.FieldName}</strong>
                  </td>

                  <td>{field.FieldType}</td>

                  <td>{field.Location}</td>

                  <td>
                    {field.IsArchived ? (
                      <span className="fm-status fm-archived">
                        Đã lưu trữ
                      </span>
                    ) : field.Status === "AVAILABLE" ? (
                      <span className="fm-status fm-available">
                        Hoạt động
                      </span>
                    ) : (
                      <span className="fm-status fm-maintenance">
                        Bảo trì
                      </span>
                    )}
                  </td>

                  <td>
                    <div className="fm-actions">
                      {field.IsArchived ? (
                        <>
                          <button
                            type="button"
                            className="fm-btn fm-btn-outline"
                            disabled={saving}
                            onClick={() => openPrices(field)}
                          >
                            Xem giá
                          </button>

                          <button
                            type="button"
                            className="fm-btn fm-btn-restore"
                            disabled={saving}
                            onClick={() => handleRestore(field)}
                          >
                            Khôi phục
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="fm-btn fm-btn-outline"
                            disabled={saving}
                            onClick={() => openEditModal(field)}
                          >
                            Sửa
                          </button>

                          <button
                            type="button"
                            className="fm-btn fm-btn-outline"
                            disabled={saving}
                            onClick={() => openPrices(field)}
                          >
                            Bảng giá
                          </button>

                          <button
                            type="button"
                            className="fm-btn fm-btn-warning"
                            disabled={saving}
                            onClick={() => handleStatus(field)}
                          >
                            {field.Status === "AVAILABLE"
                              ? "Bảo trì"
                              : "Mở sân"}
                          </button>

                          <button
                            type="button"
                            className="fm-btn fm-btn-archive"
                            disabled={saving}
                            onClick={() => handleArchive(field)}
                          >
                            Lưu trữ
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL THÊM / SỬA SÂN */}
      {fieldModal && (
        <div
          className="fm-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setFieldModal(null);
            }
          }}
        >
          <div
            className="fm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Thông tin sân bóng"
          >
            <div className="fm-modal-header">
              <h2>
                {fieldModal.mode === "create"
                  ? "Thêm sân mới"
                  : "Sửa thông tin sân"}
              </h2>

              <button
                type="button"
                onClick={() => setFieldModal(null)}
                disabled={saving}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSaveField}>
              {notice?.type === "error" && <div className="fm-notice fm-notice-error" role="alert">{notice.text}</div>}
              <label>
                Tên sân *
                <input
                  required
                  maxLength={100}
                  value={fieldForm.FieldName}
                  onChange={(event) =>
                    setFieldForm({
                      ...fieldForm,
                      FieldName: event.target.value,
                    })
                  }
                  placeholder="Ví dụ: Sân bóng số 5"
                />
              </label>

              <label>
                Loại sân *
                <select
                  value={fieldForm.FieldType}
                  onChange={(event) =>
                    setFieldForm({
                      ...fieldForm,
                      FieldType: event.target.value,
                    })
                  }
                >
                  <option value="5 player">5 player</option>
                  <option value="7 player">7 player</option>
                  <option value="11 player">11 player</option>
                </select>
              </label>

              <label>
                Địa điểm *
                <input
                  required
                  maxLength={255}
                  value={fieldForm.Location}
                  onChange={(event) =>
                    setFieldForm({
                      ...fieldForm,
                      Location: event.target.value,
                    })
                  }
                  placeholder="Ví dụ: Hà Nội"
                />
              </label>

              <label>
                URL hình ảnh
                <input
                  maxLength={255}
                  value={fieldForm.Image}
                  onChange={(event) =>
                    setFieldForm({
                      ...fieldForm,
                      Image: event.target.value,
                    })
                  }
                  placeholder="https://..."
                />
              </label>

              {fieldModal.mode === "create" && (
                <label>
                  Trạng thái ban đầu
                  <select
                    value={fieldForm.Status}
                    onChange={(event) =>
                      setFieldForm({
                        ...fieldForm,
                        Status: event.target.value,
                      })
                    }
                  >
                    <option value="AVAILABLE">Hoạt động</option>
                    <option value="MAINTENANCE">Bảo trì</option>
                  </select>
                </label>
              )}

              <div className="fm-modal-actions">
                <button
                  type="button"
                  className="fm-btn fm-btn-outline"
                  onClick={() => setFieldModal(null)}
                  disabled={saving}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="fm-btn fm-btn-primary"
                  disabled={saving}
                >
                  {saving ? "Đang lưu..." : "Lưu thông tin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL BẢNG GIÁ */}
      {priceField && (
        <div className="fm-modal-backdrop">
          <div
            className="fm-modal fm-modal-wide"
            role="dialog"
            aria-modal="true"
            aria-label="Quản lý bảng giá"
          >
            <div className="fm-modal-header">
              <div>
                <h2>Bảng giá – {priceField.FieldName}</h2>
                <p>
                  {priceField.IsArchived
                    ? "Sân đã lưu trữ: chỉ được xem bảng giá."
                    : "Quản lý giá theo từng khung giờ."}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPriceField(null)}
                disabled={saving}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div className="fm-price-list">
              {notice?.type === "error" && <div className="fm-notice fm-notice-error" role="alert">{notice.text}</div>}
              {priceField.Prices?.length ? (
                <table className="fm-table">
                  <thead>
                    <tr>
                      <th>Khung giờ</th>
                      <th>Giá</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>

                  <tbody>
                    {priceField.Prices.map((price) => (
                      <tr key={price.PriceID}>
                        <td>
                          {normalizeTime(price.StartTime)} -{" "}
                          {normalizeTime(price.EndTime)}
                        </td>

                        <td>
                          <strong>{money(price.Price)}</strong>
                        </td>

                        <td>
                          {!priceField.IsArchived ? (
                            <div className="fm-actions">
                              <button
                                type="button"
                                className="fm-btn fm-btn-outline"
                                disabled={saving}
                                onClick={() => startEditPrice(price)}
                              >
                                Sửa giá
                              </button>

                            </div>
                          ) : (
                            <span>Chỉ xem</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>Chưa có khung giá nào.</p>
              )}
            </div>

            {!priceField.IsArchived && (
              <form
                className="fm-price-form"
                onSubmit={handleSavePrice}
              >
                <h3>
                  {editingPriceId === null
                    ? "Thêm khung giá"
                    : "Sửa khung giá"}
                </h3>

                <div className="fm-form-grid">
                  <label>
                    Giờ bắt đầu
                    <input
                      required
                      type="time"
                      value={priceForm.StartTime}
                      onChange={(event) =>
                        setPriceForm({
                          ...priceForm,
                          StartTime: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Giờ kết thúc
                    <input
                      required
                      type="time"
                      value={priceForm.EndTime}
                      onChange={(event) =>
                        setPriceForm({
                          ...priceForm,
                          EndTime: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    Giá tiền (VNĐ)
                    <input
                      required
                      type="number"
                      min="1"
                      step="1"
                      value={priceForm.Price}
                      onChange={(event) =>
                        setPriceForm({
                          ...priceForm,
                          Price: event.target.value,
                        })
                      }
                      placeholder="300000"
                    />
                  </label>
                </div>

                <div className="fm-modal-actions">
                  {editingPriceId !== null && (
                    <button
                      type="button"
                      className="fm-btn fm-btn-outline"
                      onClick={cancelEditPrice}
                      disabled={saving}
                    >
                      Hủy sửa
                    </button>
                  )}

                  <button
                    type="submit"
                    className="fm-btn fm-btn-primary"
                    disabled={saving}
                  >
                    {saving
                      ? "Đang lưu..."
                      : editingPriceId === null
                      ? "Thêm khung giá"
                      : "Lưu giá"}
                  </button>
                </div>
              </form>
            )}

            <div className="fm-modal-actions">
              <button
                type="button"
                className="fm-btn fm-btn-outline"
                onClick={() => setPriceField(null)}
                disabled={saving}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FieldManagement;


import { apiRequest } from "./api";

// ============================================================
// UC15 - FIELD ADMIN SERVICE
// Chỉ dùng cho ADMIN / Chủ sân
// ============================================================

const BASE_URL = "/api/admin/fields";

const fieldUrl = (fieldId) =>
  `${BASE_URL}/${encodeURIComponent(fieldId)}`;

const priceUrl = (fieldId, priceId) =>
  `${fieldUrl(fieldId)}/prices/${encodeURIComponent(priceId)}`;

// ============================================================
// LẤY DANH SÁCH SÂN
//
// archived:
// undefined : Tất cả sân
// false     : Sân chưa lưu trữ
// true      : Sân đã lưu trữ
// ============================================================

export const getAdminFields = async (archived) => {
  let url = BASE_URL;

  if (archived !== undefined && archived !== null) {
    url += `?archived=${archived ? 1 : 0}`;
  }

  return apiRequest(url, {
    method: "GET",
  });
};

// ============================================================
// XEM CHI TIẾT SÂN VÀ BẢNG GIÁ
// ============================================================

export const getAdminFieldDetail = async (fieldId) =>
  apiRequest(fieldUrl(fieldId), {
    method: "GET",
  });

// ============================================================
// THÊM SÂN
// ============================================================

export const createAdminField = async (data) =>
  apiRequest(BASE_URL, {
    method: "POST",
    body: JSON.stringify(data),
  });

// ============================================================
// SỬA THÔNG TIN SÂN
// ============================================================

export const updateAdminField = async (fieldId, data) =>
  apiRequest(fieldUrl(fieldId), {
    method: "PUT",
    body: JSON.stringify(data),
  });

// ============================================================
// AVAILABLE / MAINTENANCE
// ============================================================

export const updateAdminFieldStatus = async (
  fieldId,
  status
) =>
  apiRequest(`${fieldUrl(fieldId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      Status: status,
    }),
  });

// ============================================================
// ARCHIVE - LƯU TRỮ SÂN
// Không xóa dữ liệu
// ============================================================

export const archiveAdminField = async (fieldId) =>
  apiRequest(`${fieldUrl(fieldId)}/archive`, {
    method: "PATCH",
  });

// ============================================================
// RESTORE - KHÔI PHỤC SÂN
// ============================================================

export const restoreAdminField = async (fieldId) =>
  apiRequest(`${fieldUrl(fieldId)}/restore`, {
    method: "PATCH",
  });

// ============================================================
// THÊM KHUNG GIÁ
// ============================================================

export const addAdminFieldPrice = async (fieldId, data) =>
  apiRequest(`${fieldUrl(fieldId)}/prices`, {
    method: "POST",
    body: JSON.stringify(data),
  });

// ============================================================
// SỬA KHUNG GIÁ THEO PriceID
// Tránh ghi đè tất cả khung giờ
// ============================================================

export const updateAdminFieldPrice = async (
  fieldId,
  priceId,
  data
) =>
  apiRequest(priceUrl(fieldId, priceId), {
    method: "PUT",
    body: JSON.stringify(data),
  });

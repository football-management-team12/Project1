const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:5000"
).replace(/\/$/, "");

const FIELDS_API = `${API_BASE_URL}/api/fields`;


const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
};


// ============================================================
// BE-03
// GET ALL FIELDS
// ============================================================

export const getFields = async () => {
  return requestJson(
    `${FIELDS_API}/`
  );
};


// ============================================================
// BE-05
// GET AVAILABILITY OF ONE FIELD
// ============================================================

export const getFieldAvailability = async (
  fieldID,
  date
) => {
  const params = new URLSearchParams({
    date,
  });

  return requestJson(
    `${FIELDS_API}/${fieldID}/availability?${params.toString()}`
  );
};


// ============================================================
// BE-05.1
// GET AVAILABILITY OF ALL FIELDS
// ============================================================

export const getAllFieldsAvailability = async (
  date
) => {
  const params = new URLSearchParams({
    date,
  });

  return requestJson(
    `${FIELDS_API}/availability?${params.toString()}`
  );
};


// ============================================================
// UPDATE FIELD PRICE
// Giữ lại để không phá chức năng cũ
// ============================================================

export const updateFieldPrice = async (
  fieldID,
  data
) => {
  return requestJson(
    `${FIELDS_API}/price/${fieldID}`,
    {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(data),
    }
  );
};
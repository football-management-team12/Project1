const API_URL = "http://127.0.0.1:5000/api/fields";


/* =========================================================
   GET ALL FIELDS
========================================================= */

export const getFields = async () => {

  const response = await fetch(
    `${API_URL}/`
  );

  const result = await response.json();

  if (!response.ok) {

    throw new Error(
      result.message ||
      "Không thể lấy danh sách sân"
    );
  }

  return result;
};


/* =========================================================
   GET ONE FIELD
========================================================= */

export const getFieldById = async (
  fieldID
) => {

  const response = await fetch(
    `${API_URL}/${fieldID}`
  );

  const result = await response.json();

  if (!response.ok) {

    throw new Error(
      result.message ||
      "Không thể lấy thông tin sân"
    );
  }

  return result;
};


/* =========================================================
   GET FIELD AVAILABILITY
   BE-05
========================================================= */

export const getFieldAvailability = async (
  fieldID,
  date
) => {

  const response = await fetch(
    `${API_URL}/${fieldID}/availability?date=${date}`
  );

  const result = await response.json();

  if (!response.ok) {

    throw new Error(
      result.message ||
      "Không thể kiểm tra lịch sân"
    );
  }

  return result;
};


/* =========================================================
   CREATE FIELD
========================================================= */

export const createField = async (
  data
) => {

  const response = await fetch(
    `${API_URL}/`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify(data)
    }
  );

  const result = await response.json();

  if (!response.ok) {

    throw new Error(
      result.message ||
      "Không thể thêm sân"
    );
  }

  return result;
};


/* =========================================================
   UPDATE FIELD
========================================================= */

export const updateField = async (
  fieldID,
  data
) => {

  const response = await fetch(
    `${API_URL}/${fieldID}`,
    {
      method: "PUT",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify(data)
    }
  );

  const result = await response.json();

  if (!response.ok) {

    throw new Error(
      result.message ||
      "Không thể cập nhật sân"
    );
  }

  return result;
};


/* =========================================================
   UPDATE FIELD STATUS
========================================================= */

export const updateFieldStatus = async (
  fieldID,
  status
) => {

  const response = await fetch(
    `${API_URL}/${fieldID}/status`,
    {
      method: "PATCH",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        Status: status
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {

    throw new Error(
      result.message ||
      "Không thể cập nhật trạng thái sân"
    );
  }

  return result;
};


/* =========================================================
   UPDATE PRICE
========================================================= */

export const updateFieldPrice = async (
  priceID,
  data
) => {

  const response = await fetch(
    `${API_URL}/price/${priceID}`,
    {
      method: "PUT",

      headers: {
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify(data)
    }
  );

  const result = await response.json();

  if (!response.ok) {

    throw new Error(
      result.message ||
      "Không thể cập nhật giá"
    );
  }

  return result;
};


/* =========================================================
   DELETE FIELD
========================================================= */

export const deleteField = async (
  fieldID
) => {

  const response = await fetch(
    `${API_URL}/${fieldID}`,
    {
      method: "DELETE"
    }
  );

  const result = await response.json();

  if (!response.ok) {

    throw new Error(
      result.message ||
      "Không thể xóa sân"
    );
  }

  return result;
};
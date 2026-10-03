const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:5000"
).replace(/\/$/, "");


const BOOKINGS_API =
  `${API_BASE_URL}/api/bookings`;


const requestJson = async (
  url,
  options = {}
) => {
  const response =
    await fetch(
      url,
      options
    );


  let data = null;


  try {
    data =
      await response.json();
  } catch {
    data = null;
  }


  if (!response.ok) {
    const error =
      new Error(
        data?.message ||
        data?.error ||
        `Request failed (${response.status})`
      );


    error.status =
      response.status;


    error.code =
      data?.code || "";


    error.data =
      data;


    throw error;
  }


  return data;
};


// ============================================================
// T123-60 BE-06
// CREATE BOOKING
// ============================================================

export const createBooking =
  async (payload) => {
    return requestJson(
      `${BOOKINGS_API}/`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            payload
          ),
      }
    );
  };
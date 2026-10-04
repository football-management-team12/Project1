const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:5000"
).replace(/\/$/, "");


const BOOKINGS_API =
  `${API_BASE_URL}/api/bookings`;


const parseResponse = async (
  response
) => {

  let result = null;

  try {
    result = await response.json();
  } catch {
    result = null;
  }


  if (!response.ok) {

    const error =
      new Error(
        result?.message ||
        `Booking API lỗi HTTP ${response.status}`
      );

    error.status =
      response.status;

    error.code =
      result?.code;

    error.data =
      result;

    throw error;
  }


  return result;
};


/* =========================================================
   CUSTOMER - CREATE BOOKING
========================================================= */

export const createBooking =
  async (data) => {

    const response =
      await fetch(
        `${BOOKINGS_API}/`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              data
            ),
        }
      );


    return parseResponse(
      response
    );
  };


/* =========================================================
   STAFF / ADMIN - GET BOOKINGS
========================================================= */

export const getAllBookings =
  async (
    managerUserID,
    filters = {}
  ) => {

    const params =
      new URLSearchParams();


    params.set(
      "adminUserID",
      String(managerUserID)
    );


    if (
      filters.status
    ) {
      params.set(
        "status",
        filters.status
      );
    }


    if (
      filters.search?.trim()
    ) {
      params.set(
        "search",
        filters.search.trim()
      );
    }


    const response =
      await fetch(
        `${BOOKINGS_API}/?${params.toString()}`
      );


    return parseResponse(
      response
    );
  };


/* =========================================================
   BOOKING DETAIL
========================================================= */

export const getBookingDetail =
  async (bookingID) => {

    const response =
      await fetch(
        `${BOOKINGS_API}/${encodeURIComponent(
          bookingID
        )}`
      );


    return parseResponse(
      response
    );
  };


/* =========================================================
   STAFF / ADMIN - UPDATE STATUS
========================================================= */

export const updateBookingStatus =
  async (
    bookingID,
    status,
    managerUserID
  ) => {

    const response =
      await fetch(
        `${BOOKINGS_API}/${encodeURIComponent(
          bookingID
        )}/status`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              Status:
                status,

              AdminUserID:
                managerUserID,
            }),
        }
      );


    return parseResponse(
      response
    );
  };
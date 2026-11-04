import {
  apiRequest,
} from "./api";


// =========================================================
// CUSTOMER - CREATE BOOKING
// =========================================================

export const createBooking =
  async (data) => {

    const payload = {
      ...(data || {}),
    };


    /*
      T123-72

      Backend lấy UserID từ JWT.

      Dù BookingConfirm cũ vẫn truyền
      UserID thì service này loại bỏ trước
      khi gửi.
    */

    delete payload.UserID;

    delete payload.AdminUserID;


    return apiRequest(
      "/api/bookings/",
      {
        method:
          "POST",

        body:
          JSON.stringify(
            payload
          ),
      }
    );
  };


// =========================================================
// STAFF / ADMIN - GET BOOKINGS
//
// managerUserID vẫn để trong function parameter
// để BookingManagement S1 không phải sửa.
//
// Nhưng không gửi ID này cho backend nữa.
// =========================================================

export const getAllBookings =
  async (
    managerUserID,
    filters = {}
  ) => {

    void managerUserID;


    const params =
      new URLSearchParams();


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


    const query =
      params.toString();


    return apiRequest(
      `/api/bookings/${
        query
          ? `?${query}`
          : ""
      }`,
      {
        method:
          "GET",
      }
    );
  };


// =========================================================
// STAFF / ADMIN - BOOKING DETAIL
// =========================================================

export const getBookingDetail =
  async (
    bookingID
  ) => {

    return apiRequest(
      `/api/bookings/${encodeURIComponent(
        bookingID
      )}`,
      {
        method:
          "GET",
      }
    );
  };


// =========================================================
// STAFF / ADMIN - UPDATE STATUS
//
// managerUserID được giữ lại chỉ để tương thích UI S1.
// =========================================================

export const updateBookingStatus =
  async (
    bookingID,
    status,
    managerUserID
  ) => {

    void managerUserID;


    return apiRequest(
      `/api/bookings/${encodeURIComponent(
        bookingID
      )}/status`,
      {
        method:
          "PATCH",

        body:
          JSON.stringify({
            Status:
              status,
          }),
      }
    );
  };


// =========================================================
// CUSTOMER - BOOKING HISTORY
//
// Không dùng:
// /customer-bookings/5
//
// Dùng:
// /customer-bookings/me
// =========================================================

export const getCustomerBookings =
  async (
    userID,
    filters = {}
  ) => {

    /*
      Giữ userID trong parameter
      để BookingHistory cũ không vỡ.
    */

    void userID;


    const params =
      new URLSearchParams();


    if (
      filters.status
    ) {
      params.set(
        "status",
        filters.status
      );
    }


    const query =
      params.toString();


    return apiRequest(
      `/api/customer-bookings/me${
        query
          ? `?${query}`
          : ""
      }`,
      {
        method:
          "GET",
      }
    );
  };


// =========================================================
// CUSTOMER - BOOKING DETAIL
// =========================================================

export const getCustomerBookingDetail =
  async (
    userID,
    bookingID
  ) => {

    void userID;


    return apiRequest(
      `/api/customer-bookings/me/${encodeURIComponent(
        bookingID
      )}`,
      {
        method:
          "GET",
      }
    );
  };

  // =========================================================
// UC06 - DEPOSIT
// =========================================================

export const getDepositInfo =
  async (
    bookingID
  ) => {

    return apiRequest(
      `/api/bookings/${encodeURIComponent(
        bookingID
      )}/deposit`,
      {
        method:
          "GET",
      }
    );
  };


export const createDeposit =
  async (
    bookingID
  ) => {

    return apiRequest(
      `/api/bookings/${encodeURIComponent(
        bookingID
      )}/deposit`,
      {
        method:
          "POST",
      }
    );
  };


export const updateDepositDemoStatus =
  async (
    paymentID,
    status
  ) => {

    return apiRequest(
      `/api/payments/${encodeURIComponent(
        paymentID
      )}/demo-status`,
      {
        method:
          "PATCH",

        body:
          JSON.stringify({
            status,
          }),
      }
    );
  };
import {
  apiRequest,
  clearAuthStorage,
  getAccessToken,
} from "./api";


const USER_KEY =
  "user";

const ACCESS_TOKEN_KEY =
  "accessToken";


// ============================================================
// NORMALIZE BACKEND USER
//
// Backend mới:
// userId, fullName, role...
//
// Frontend S1:
// UserID, FullName, Role...
//
// Chuẩn hóa về format cũ để không phá code S1.
// ============================================================

export const normalizeUser = (
  rawUser
) => {
  if (!rawUser) {
    return null;
  }


  const userID =
    rawUser.UserID ??
    rawUser.userId;


  if (!userID) {
    return null;
  }


  return {
    UserID:
      userID,

    FullName:
      rawUser.FullName ??
      rawUser.fullName ??
      "",

    Email:
      rawUser.Email ??
      rawUser.email ??
      "",

    Phone:
      rawUser.Phone ??
      rawUser.phone ??
      "",

    Role:
      String(
        rawUser.Role ??
        rawUser.role ??
        ""
      )
        .trim()
        .toUpperCase(),

    Status:
      String(
        rawUser.Status ??
        rawUser.status ??
        "ACTIVE"
      )
        .trim()
        .toUpperCase(),
  };
};


// ============================================================
// GET SAVED USER
// ============================================================

export const getStoredUser = () => {
  try {
    const rawUser =
      localStorage.getItem(
        USER_KEY
      );

    return rawUser
      ? normalizeUser(
          JSON.parse(
            rawUser
          )
        )
      : null;

  } catch {
    return null;
  }
};


// ============================================================
// SAVE LOGIN
// ============================================================

const saveAuth = (
  accessToken,
  user
) => {
  const normalizedUser =
    normalizeUser(
      user
    );


  if (
    !accessToken ||
    !normalizedUser
  ) {
    throw new Error(
      "Phản hồi đăng nhập không hợp lệ"
    );
  }


  localStorage.setItem(
    ACCESS_TOKEN_KEY,
    accessToken
  );


  localStorage.setItem(
    USER_KEY,
    JSON.stringify(
      normalizedUser
    )
  );


  window.dispatchEvent(
    new Event(
      "auth-changed"
    )
  );


  return normalizedUser;
};


// ============================================================
// LOGIN
// ============================================================

export const loginUser = async (
  account,
  password
) => {
  const result =
    await apiRequest(
      "/api/auth/login",
      {
        method:
          "POST",

        auth:
          false,

        redirectOnUnauthorized:
          false,

        body:
          JSON.stringify({
            account,
            password,
          }),
      }
    );


  if (!result?.success) {
    throw new Error(
      result?.message ||
      "Đăng nhập thất bại"
    );
  }


  const user =
    saveAuth(
      result.accessToken,
      result.user
    );


  return {
    accessToken:
      result.accessToken,

    user,
  };
};

export const registerUser = async (userData) => {
  const result = await apiRequest("/api/auth/register", {
    method: "POST",
    auth: false,
    redirectOnUnauthorized: false,
    body: JSON.stringify(userData),
  });
  if (!result?.success) {
    throw new Error(result?.message || "Đăng ký thất bại");
  }
  return result;
};

export const otpRequest = (path, body) => apiRequest(`/api/auth/${path}`, {
  method: "POST", auth: false, redirectOnUnauthorized: false,
  body: JSON.stringify(body),
});


// ============================================================
// GET CURRENT USER FROM JWT
// ============================================================

export const getCurrentUser =
  async () => {

    const result =
      await apiRequest(
        "/api/auth/me",
        {
          method:
            "GET",
        }
      );


    const user =
      normalizeUser(
        result?.user
      );


    if (!user) {
      throw new Error(
        "Không nhận được thông tin người dùng"
      );
    }


    localStorage.setItem(
      USER_KEY,
      JSON.stringify(
        user
      )
    );


    window.dispatchEvent(
      new Event(
        "auth-changed"
      )
    );


    return user;
  };


// ============================================================
// CHECK LOGIN
// ============================================================

export const isLoggedIn = () =>
  Boolean(
    getAccessToken() &&
    getStoredUser()?.UserID
  );


// ============================================================
// LOGOUT
// ============================================================

export const logoutUser = () => {
  clearAuthStorage();


  localStorage.removeItem(
    "bookingDraft"
  );


  sessionStorage.removeItem(
    "bookingDraft"
  );
};

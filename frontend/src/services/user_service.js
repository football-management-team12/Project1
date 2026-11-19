import {
  apiRequest,
} from "./api";


const USER_KEY =
  "user";


// ============================================================
// PROFILE -> FORMAT USER CŨ
//
// Code cũ đang dùng:
// UserID
// FullName
// Email
// Phone
// Role
// Status
// ============================================================

const profileToStoredUser = (
  profile
) => {

  if (!profile?.userId) {
    return null;
  }


  return {

    UserID:
      profile.userId,

    Username:
      profile.username ?? "",

    FullName:
      profile.fullName ?? "",

    Email:
      profile.email ?? "",

    Phone:
      profile.phone ?? "",

    Role:
      String(
        profile.role ?? ""
      )
        .trim()
        .toUpperCase(),

    Status:
      String(
        profile.status ?? "ACTIVE"
      )
        .trim()
        .toUpperCase(),
  };
};


// ============================================================
// UPDATE LOCAL STORAGE
//
// Khi sửa FullName/Email/Phone,
// Navbar phải đổi ngay mà không cần login lại.
// ============================================================

const syncStoredUser = (
  profile
) => {

  const nextUser =
    profileToStoredUser(
      profile
    );


  if (!nextUser) {
    return;
  }


  let currentUser = {};


  try {

    currentUser =
      JSON.parse(
        localStorage.getItem(
          USER_KEY
        )
        ||
        "{}"
      );

  } catch {

    currentUser = {};
  }


  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      ...currentUser,
      ...nextUser,
    })
  );


  window.dispatchEvent(
    new Event(
      "auth-changed"
    )
  );
};


// ============================================================
// UC03
//
// GET /api/users/me
// ============================================================

export const getMyProfile =
  async () => {

    const profile =
      await apiRequest(
        "/api/users/me",
        {
          method:
            "GET",
        }
      );


    syncStoredUser(
      profile
    );


    return profile;
  };


// ============================================================
// UC03
//
// PUT /api/users/me
// ============================================================

export const updateMyProfile =
  async ({
    fullName,
    email,
    phone,
  }) => {

    const result =
      await apiRequest(
        "/api/users/me",
        {
          method:
            "PUT",

          body:
            JSON.stringify({
              fullName,
              email,
              phone,
            }),
        }
      );


    if (
      !result?.success
      ||
      !result?.user
    ) {

      throw new Error(
        result?.message ||
        "Không thể cập nhật thông tin cá nhân"
      );
    }


    syncStoredUser(
      result.user
    );


    return result;
  };
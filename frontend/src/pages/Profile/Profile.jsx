import {
  useEffect,
  useState,
} from "react";

import {
  BadgeCheck,
  CircleUserRound,
  Mail,
  Pencil,
  Phone,
  Save,
  UserRound,
  X,
} from "lucide-react";

import Navbar
  from "../../components/Navbar/Navbar";

import Footer
  from "../../components/Footer/Footer";

import {
  getMyProfile,
  updateMyProfile,
} from "../../services/user_service";

import "./Profile.css";


const EMPTY_FORM = {

  fullName:
    "",

  email:
    "",

  phone:
    "",
};


const profileToForm = (
  profile
) => ({

  fullName:
    profile?.fullName ?? "",

  email:
    profile?.email ?? "",

  phone:
    profile?.phone ?? "",
});


const roleLabel = (
  role
) => {

  const normalizedRole =
    String(
      role || ""
    )
      .trim()
      .toUpperCase();


  if (
    normalizedRole === "ADMIN"
  ) {

    return "Quản trị viên";
  }


  return "Khách hàng";
};


function Profile({ adminView = false }) {

  const [
    profile,
    setProfile,
  ] =
    useState(null);


  const [
    form,
    setForm,
  ] =
    useState(
      EMPTY_FORM
    );


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    saving,
    setSaving,
  ] =
    useState(false);


  const [
    editing,
    setEditing,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState("");


  const [
    success,
    setSuccess,
  ] =
    useState("");


  // =========================================================
  // LOAD PROFILE
  // =========================================================

  useEffect(() => {

    let active =
      true;


    const loadProfile =
      async () => {

        try {

          setLoading(
            true
          );

          setError("");


          const data =
            await getMyProfile();


          if (!active) {
            return;
          }


          setProfile(
            data
          );


          setForm(
            profileToForm(
              data
            )
          );

        } catch (
          requestError
        ) {

          if (!active) {
            return;
          }


          setError(
            requestError?.message
            ||
            "Không thể tải thông tin cá nhân"
          );

        } finally {

          if (active) {

            setLoading(
              false
            );
          }
        }
      };


    loadProfile();


    return () => {

      active =
        false;
    };

  }, []);


  // =========================================================
  // INPUT
  // =========================================================

  const handleChange = (
    event
  ) => {

    const {
      name,
      value,
    } = event.target;


    setForm(
      (current) => ({

        ...current,

        [name]:
          value,
      })
    );


    setError("");

    setSuccess("");
  };


  // =========================================================
  // EDIT
  // =========================================================

  const handleEdit = () => {

    setForm(
      profileToForm(
        profile
      )
    );


    setError("");

    setSuccess("");

    setEditing(
      true
    );
  };


  // =========================================================
  // CANCEL
  //
  // KHÔNG GỌI API
  // =========================================================

  const handleCancel = () => {

    setForm(
      profileToForm(
        profile
      )
    );


    setError("");

    setSuccess("");

    setEditing(
      false
    );
  };


  // =========================================================
  // VALIDATION
  // =========================================================

  const validate = () => {

    const fullName =
      form.fullName.trim();


    const email =
      form.email
        .trim()
        .toLowerCase();


    const phone =
      form.phone.trim();


    if (
      !fullName
      ||
      !email
      ||
      !phone
    ) {

      return (
        "Vui lòng nhập đầy đủ họ tên, email và số điện thoại"
      );
    }


    if (
      fullName.length > 100
    ) {

      return (
        "Họ và tên không được vượt quá 100 ký tự"
      );
    }


    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {

      return (
        "Email không đúng định dạng"
      );
    }


    if (
      !/^0\d{9}$/.test(
        phone
      )
    ) {

      return (
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
      );
    }


    return "";
  };


  // =========================================================
  // SAVE
  // =========================================================

  const handleSubmit =
    async (
      event
    ) => {

      event.preventDefault();


      if (saving) {
        return;
      }


      const validationError =
        validate();


      if (
        validationError
      ) {

        setError(
          validationError
        );

        setSuccess("");

        return;
      }


      try {

        setSaving(
          true
        );

        setError("");

        setSuccess("");


        const result =
          await updateMyProfile({

            fullName:
              form.fullName.trim(),

            email:
              form.email
                .trim()
                .toLowerCase(),

            phone:
              form.phone.trim(),
          });


        setProfile(
          result.user
        );


        setForm(
          profileToForm(
            result.user
          )
        );


        setEditing(
          false
        );


        setSuccess(
          result.message
          ||
          "Cập nhật thông tin thành công"
        );

      } catch (
        requestError
      ) {

        setError(
          requestError?.message
          ||
          "Không thể cập nhật thông tin cá nhân"
        );

      } finally {

        setSaving(
          false
        );
      }
    };


  return (

    <div className={`profile-page-shell${adminView ? " profile-page-shell-admin" : ""}`}>

      {!adminView && <Navbar />}


      <main className="profile-page">

        <div className="profile-container">


          {/* ===============================================
              HEADING
          =============================================== */}

          <div className="profile-heading">

            <div>

              <span className="profile-eyebrow">
                TÀI KHOẢN CỦA TÔI
              </span>


              <h1>
                Thông tin cá nhân
              </h1>


              <p>
                Xem và cập nhật thông tin tài khoản đang đăng nhập.
              </p>

            </div>

          </div>


          {
            loading
              ? (

                <div className="profile-state-card">
                  Đang tải thông tin cá nhân...
                </div>

              )
              :
              !profile
                ? (

                  <div className="profile-state-card profile-state-error">
                    {
                      error
                      ||
                      "Không tìm thấy thông tin cá nhân"
                    }
                  </div>

                )
                : (

                  <div className="profile-layout">


                    {/* =====================================
                        PROFILE SUMMARY
                    ===================================== */}

                    <aside className="profile-summary-card">

                      <div className="profile-avatar-large">

                        <CircleUserRound
                          size={54}
                          strokeWidth={1.6}
                        />

                      </div>


                      <h2>
                        {profile.fullName}
                      </h2>


                      <span className="profile-username">

                        @
                        {
                          profile.username
                          ||
                          "user"
                        }

                      </span>


                      <div className="profile-role-badge">

                        <BadgeCheck
                          size={16}
                        />

                        {
                          roleLabel(
                            profile.role
                          )
                        }

                      </div>


                      <div className="profile-summary-divider" />


                      <div className="profile-summary-row">

                        <Mail
                          size={17}
                        />

                        <span>
                          {profile.email}
                        </span>

                      </div>


                      <div className="profile-summary-row">

                        <Phone
                          size={17}
                        />

                        <span>
                          {profile.phone}
                        </span>

                      </div>


                      <div className="profile-summary-row">

                        <UserRound
                          size={17}
                        />

                        <span>

                          Trạng thái:{" "}

                          {
                            profile.status
                          }

                        </span>

                      </div>

                    </aside>


                    {/* =====================================
                        PROFILE FORM
                    ===================================== */}

                    <section className="profile-form-card">

                      <div className="profile-card-header">

                        <div>

                          <h2>
                            Hồ sơ người dùng
                          </h2>


                          <p>
                            Username, vai trò và trạng thái không thể thay đổi tại đây.
                          </p>

                        </div>


                        {
                          !editing
                          &&
                          (

                            <button
                              type="button"
                              className="profile-edit-button"
                              onClick={
                                handleEdit
                              }
                            >

                              <Pencil
                                size={16}
                              />

                              Chỉnh sửa

                            </button>
                          )
                        }

                      </div>


                      {
                        error
                        &&
                        (

                          <div className="profile-message profile-message-error">
                            {error}
                          </div>
                        )
                      }


                      {
                        success
                        &&
                        (

                          <div className="profile-message profile-message-success">
                            {success}
                          </div>
                        )
                      }


                      <form
                        onSubmit={
                          handleSubmit
                        }
                        className="profile-form"
                      >


                        {/* USERNAME */}

                        <div className="profile-field">

                          <label>
                            Tên đăng nhập
                          </label>


                          <input
                            value={
                              profile.username
                              ||
                              ""
                            }
                            disabled
                            readOnly
                          />


                          <small>
                            Tên đăng nhập không thể thay đổi.
                          </small>

                        </div>


                        {/* FULL NAME */}

                        <div className="profile-field">

                          <label htmlFor="profile-full-name">
                            Họ và tên
                          </label>


                          <input
                            id="profile-full-name"
                            name="fullName"
                            value={
                              form.fullName
                            }
                            onChange={
                              handleChange
                            }
                            disabled={
                              !editing
                              ||
                              saving
                            }
                            maxLength={100}
                            autoComplete="name"
                          />

                        </div>


                        {/* EMAIL */}

                        <div className="profile-field">

                          <label htmlFor="profile-email">
                            Email
                          </label>


                          <input
                            id="profile-email"
                            name="email"
                            type="email"
                            value={
                              form.email
                            }
                            onChange={
                              handleChange
                            }
                            disabled={
                              !editing
                              ||
                              saving
                            }
                            autoComplete="email"
                          />

                        </div>


                        {/* PHONE */}

                        <div className="profile-field">

                          <label htmlFor="profile-phone">
                            Số điện thoại
                          </label>


                          <input
                            id="profile-phone"
                            name="phone"
                            value={
                              form.phone
                            }
                            onChange={
                              handleChange
                            }
                            disabled={
                              !editing
                              ||
                              saving
                            }
                            inputMode="numeric"
                            maxLength={10}
                            autoComplete="tel"
                          />

                        </div>


                        {/* ROLE / STATUS */}

                        <div className="profile-readonly-grid">

                          <div className="profile-field">

                            <label>
                              Vai trò
                            </label>


                            <input
                              value={
                                roleLabel(
                                  profile.role
                                )
                              }
                              disabled
                              readOnly
                            />

                          </div>


                          <div className="profile-field">

                            <label>
                              Trạng thái
                            </label>


                            <input
                              value={
                                profile.status
                                ||
                                ""
                              }
                              disabled
                              readOnly
                            />

                          </div>

                        </div>


                        {
                          editing
                          &&
                          (

                            <div className="profile-actions">

                              <button
                                type="button"
                                className="profile-cancel-button"
                                onClick={
                                  handleCancel
                                }
                                disabled={
                                  saving
                                }
                              >

                                <X
                                  size={17}
                                />

                                Hủy

                              </button>


                              <button
                                type="submit"
                                className="profile-save-button"
                                disabled={
                                  saving
                                }
                              >

                                <Save
                                  size={17}
                                />

                                {
                                  saving
                                    ? "Đang lưu..."
                                    : "Lưu thay đổi"
                                }

                              </button>

                            </div>
                          )
                        }

                      </form>

                    </section>

                  </div>
                )
          }

        </div>

      </main>


      {!adminView && <Footer />}

    </div>
  );
}


export default Profile;

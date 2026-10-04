import {
  useNavigate,
  useOutletContext,
} from "react-router-dom";

function Admin() {
  const navigate = useNavigate();

  const {
    user,
    role,
    isAdmin,
  } = useOutletContext();

  return (
    <>
      <div className="title-row">
        <div>
          <h1>TỔNG QUAN</h1>

          <p>
            Xin chào{" "}
            <strong>
              {user?.FullName ||
                user?.Email ||
                "Tài khoản quản lý"}
            </strong>
          </p>
        </div>
      </div>

      <div className="cards">
        {isAdmin && (
          <div className="card">
            <p>Quản lý sân bóng</p>

            <h2>⚽</h2>

            <button
              type="button"
              className="edit-btn"
              onClick={() =>
                navigate("/admin/fields")
              }
            >
              Truy cập
            </button>
          </div>
        )}

        <div className="card">
          <p>Quản lý đặt sân</p>

          <h2>📅</h2>

          <button
            type="button"
            className="edit-btn"
            onClick={() =>
              navigate("/admin/bookings")
            }
          >
            Truy cập
          </button>
        </div>

        <div className="card">
          <p>Vai trò hiện tại</p>

          <h2
            style={{
              fontSize: "22px",
            }}
          >
            {role}
          </h2>
        </div>
      </div>
    </>
  );
}

export default Admin;
import { useEffect, useState } from "react";
import { getFields } from "../../services/field_service";
import "./Admin.css";

function Admin() {
    const [user] = useState(() => {
        const userData = localStorage.getItem("user");

        if (userData) {
            return JSON.parse(userData);
        }

        return null;
    });

    const [fields, setFields] = useState([]);
    const [editField, setEditField] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const fetchFields = async () => {
            try {
                const data = await getFields();

                if (!cancelled) {
                    setFields(data);
                }
            } catch (err) {
                console.log(err);
            }
        };

        fetchFields();

        return () => {
            cancelled = true;
        };
    }, []);

    const totalFields = fields.length;

    const activeFields = fields.filter(
        (field) => field.status === "AVAILABLE"
    ).length;

    const maintenanceFields = fields.filter(
        (field) => field.status !== "AVAILABLE"
    ).length;

    return (
        <div className="admin-container">

            {/* SIDEBAR */}
            <aside className="sidebar">
                <h2>⚽ SÂN BÓNG</h2>

                <ul>
                    <li>Tổng quan</li>
                    <li className="active">Quản lý sân bóng</li>
                    <li>Quản lý đặt sân</li>
                    <li>Quản lý khách hàng</li>
                    <li>Quản lý nhân viên</li>
                    <li>Hóa đơn & thanh toán</li>
                    <li>Thống kê & báo cáo</li>
                    <li>Cài đặt</li>
                </ul>

                <div className="logout">
                    ↪ Đăng xuất
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="admin-content">

                {/* HEADER */}
                <div className="top-header">
                    <input placeholder="🔍 Tìm kiếm nhanh..." />

                    <div className="admin-user">
                        <span>🔔</span>

                        <div>
                            <b>
                                {user?.FullName || "Admin sân bóng"}
                            </b>

                            <small>
                                Quản trị viên
                            </small>
                        </div>
                    </div>
                </div>

                {/* TITLE */}
                <div className="title-row">
                    <h1>QUẢN LÝ SÂN BÓNG</h1>

                    <button className="add-btn">
                        + Thêm sân mới
                    </button>
                </div>

                {/* CARDS */}
                <div className="cards">

                    <div className="card">
                        <p>Tổng số sân</p>
                        <h2>{totalFields}</h2>
                    </div>

                    <div className="card">
                        <p>Đang hoạt động</p>
                        <h2>{activeFields}</h2>
                    </div>

                    <div className="card">
                        <p>Đang bảo trì</p>
                        <h2>{maintenanceFields}</h2>
                    </div>

                    <div className="card">
                        <p>Đã đặt hôm nay</p>
                        <h2>0</h2>
                    </div>

                </div>

                {/* FILTER */}
                <div className="filter">

                    <input placeholder="🔍 Tìm kiếm tên sân..." />

                    <select>
                        <option>Loại sân</option>
                        <option>5 player</option>
                        <option>7 player</option>
                        <option>11 player</option>
                    </select>

                    <select>
                        <option>Trạng thái</option>
                        <option>AVAILABLE</option>
                        <option>MAINTENANCE</option>
                    </select>

                </div>

                {/* TABLE */}
                <div className="table-box">

                    <table>

                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Tên sân</th>
                                <th>Loại sân</th>
                                <th>Địa điểm</th>
                                <th>Mô tả</th>
                                <th>Trạng thái</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>

                        <tbody>

                            {fields.map((field) => (
                                <tr key={field.id}>

                                    <td>{field.id}</td>

                                    <td>{field.name}</td>

                                    <td>{field.type}</td>

                                    <td>{field.address}</td>

                                    <td>
                                        {field.description || "-"}
                                    </td>

                                    <td>
                                        <span
                                            className={
                                                field.status === "AVAILABLE"
                                                    ? "status available"
                                                    : "status maintenance"
                                            }
                                        >
                                            {field.status}
                                        </span>
                                    </td>

                                    <td>
                                        <button
                                            className="edit-btn"
                                            onClick={() => setEditField(field)}
                                        >
                                            Xem
                                        </button>
                                    </td>

                                </tr>
                            ))}

                        </tbody>

                    </table>

                </div>

            </main>

            {/* POPUP */}
            {editField && (
                <div className="modal">

                    <div className="modal-content">

                        <h2>Thông tin sân</h2>

                        <label>Tên sân</label>
                        <input
                            type="text"
                            value={editField.name}
                            readOnly
                        />

                        <label>Loại sân</label>
                        <input
                            type="text"
                            value={editField.type}
                            readOnly
                        />

                        <label>Địa điểm</label>
                        <input
                            type="text"
                            value={editField.address}
                            readOnly
                        />

                        <label>Mô tả</label>
                        <textarea
                            value={editField.description || ""}
                            readOnly
                        />

                        <label>Trạng thái</label>
                        <input
                            type="text"
                            value={editField.status}
                            readOnly
                        />

                        <button
                            className="cancel-btn"
                            onClick={() => setEditField(null)}
                        >
                            Đóng
                        </button>

                    </div>

                </div>
            )}

        </div>
    );
}

export default Admin;


import { useEffect, useMemo, useState } from "react";
import {
    getFields,
    updateFieldPrice,
    createField
} from "../../services/field_service";

import "./Admin.css";


const EMPTY_FIELD = {
    FieldName: "",
    FieldType: "5 player",
    Location: "",
    Image: "",
    Status: "AVAILABLE",
    StartTime: "06:00",
    EndTime: "16:00",
    Price: ""
};


function Admin() {

    const [user, setUser] = useState(null);
    const [fields, setFields] = useState([]);

    const [editField, setEditField] = useState(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newField, setNewField] = useState(EMPTY_FIELD);

    const [searchText, setSearchText] = useState("");
    const [fieldType, setFieldType] = useState("");
    const [status, setStatus] = useState("");

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [adding, setAdding] = useState(false);
    const [deletingFieldID, setDeletingFieldID] = useState(null);


    // =========================================================
    // LOAD DATA
    // =========================================================

    useEffect(() => {

        const storedUser = localStorage.getItem("user");

        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch {
                localStorage.removeItem("user");
            }
        }

        loadFields();

    }, []);


    const loadFields = async () => {

        try {

            setLoading(true);

            const data = await getFields();

            setFields(
                Array.isArray(data) ? data : []
            );

        } catch (error) {

            console.error(error);
            alert("Không thể tải danh sách sân");

        } finally {

            setLoading(false);
        }
    };


    // =========================================================
    // STATISTICS
    // =========================================================

    const stats = useMemo(() => {

        const uniqueFields = [
            ...new Map(
                fields.map(field => [
                    field.FieldID,
                    field
                ])
            ).values()
        ];

        return {
            total: uniqueFields.length,

            available: uniqueFields.filter(
                field => field.Status === "AVAILABLE"
            ).length,

            maintenance: uniqueFields.filter(
                field => field.Status !== "AVAILABLE"
            ).length
        };

    }, [fields]);


    // =========================================================
    // FILTER
    // =========================================================

    const fieldTypes = useMemo(
        () => [
            ...new Set(
                fields
                    .map(field => field.FieldType)
                    .filter(Boolean)
            )
        ],
        [fields]
    );


    const filteredFields = useMemo(() => {

        return fields.filter(field => {

            const matchName =
                (field.FieldName || "")
                    .toLowerCase()
                    .includes(
                        searchText.trim().toLowerCase()
                    );

            const matchType =
                !fieldType ||
                field.FieldType === fieldType;

            const matchStatus =
                !status ||
                field.Status === status;

            return (
                matchName &&
                matchType &&
                matchStatus
            );
        });

    }, [
        fields,
        searchText,
        fieldType,
        status
    ]);


    // =========================================================
    // HELPER
    // =========================================================

    const isValidTime = (
        startTime,
        endTime
    ) => {

        if (!startTime || !endTime) {
            alert("Vui lòng nhập đầy đủ khung giờ");
            return false;
        }

        if (startTime >= endTime) {
            alert(
                "Giờ kết thúc phải lớn hơn giờ bắt đầu"
            );
            return false;
        }

        return true;
    };


    const formatPrice = price =>
        Number(price || 0)
            .toLocaleString("vi-VN");


    const updateNewField = (
        key,
        value
    ) => {

        setNewField(prev => ({
            ...prev,
            [key]: value
        }));
    };


    const updateEditField = (
        key,
        value
    ) => {

        setEditField(prev => ({
            ...prev,
            [key]: value
        }));
    };


    // =========================================================
    // ADD FIELD
    // =========================================================

    const handleAddField = async () => {

        if (!newField.FieldName.trim()) {
            alert("Vui lòng nhập tên sân");
            return;
        }

        if (!newField.Location.trim()) {
            alert("Vui lòng nhập địa điểm");
            return;
        }

        if (
            !isValidTime(
                newField.StartTime,
                newField.EndTime
            )
        ) {
            return;
        }

        const price = Number(newField.Price);

        if (
            Number.isNaN(price) ||
            price < 0
        ) {
            alert("Giá sân không hợp lệ");
            return;
        }


        try {

            setAdding(true);

            await createField({
                ...newField,
                FieldName:
                    newField.FieldName.trim(),

                Location:
                    newField.Location.trim(),

                Price:
                    price
            });

            setShowAddModal(false);
            setNewField(EMPTY_FIELD);

            await loadFields();

            alert("Thêm sân thành công");

        } catch (error) {

            console.error(error);

            alert(
                error.message ||
                "Không thể thêm sân"
            );

        } finally {

            setAdding(false);
        }
    };


    // =========================================================
    // EDIT PRICE
    // =========================================================

    const openEdit = field => {

        if (!field.PriceID) {

            alert(
                "Sân này chưa có bảng giá"
            );

            return;
        }

        setEditField({
            ...field,

            StartTime:
                field.StartTime?.slice(0, 5) || "",

            EndTime:
                field.EndTime?.slice(0, 5) || ""
        });
    };


    const handleSaveEdit = async () => {

        if (!editField?.PriceID) {
            return;
        }

        if (
            !isValidTime(
                editField.StartTime,
                editField.EndTime
            )
        ) {
            return;
        }

        const price =
            Number(editField.Price);

        if (
            Number.isNaN(price) ||
            price < 0
        ) {
            alert("Giá sân không hợp lệ");
            return;
        }


        try {

            setSaving(true);

            await updateFieldPrice(
                editField.PriceID,
                {
                    StartTime:
                        editField.StartTime,

                    EndTime:
                        editField.EndTime,

                    Price:
                        price
                }
            );

            setEditField(null);

            await loadFields();

            alert(
                "Cập nhật giá thành công"
            );

        } catch (error) {

            console.error(error);

            alert(
                error.message ||
                "Không thể cập nhật"
            );

        } finally {

            setSaving(false);
        }
    };


    // =========================================================
    // DELETE FIELD
    // =========================================================

    const handleDeleteField = async field => {

        const confirmDelete =
            window.confirm(
                `Bạn có chắc muốn xóa "${field.FieldName}"?\n\n` +
                "Toàn bộ bảng giá của sân cũng sẽ bị xóa."
            );

        if (!confirmDelete) {
            return;
        }


        try {

            setDeletingFieldID(
                field.FieldID
            );

            const response = await fetch(
                `http://127.0.0.1:5000/api/fields/${field.FieldID}`,
                {
                    method: "DELETE"
                }
            );

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message ||
                    "Không thể xóa sân"
                );
            }

            await loadFields();

            alert(
                result.message ||
                "Xóa sân thành công"
            );

        } catch (error) {

            console.error(error);

            alert(
                error.message ||
                "Không thể xóa sân"
            );

        } finally {

            setDeletingFieldID(null);
        }
    };


    // =========================================================
    // LOGOUT
    // =========================================================

    const handleLogout = () => {

        if (
            !window.confirm(
                "Bạn có muốn đăng xuất?"
            )
        ) {
            return;
        }

        localStorage.removeItem("user");
        window.location.href = "/login";
    };


    // =========================================================
    // UI
    // =========================================================

    return (

        <div className="admin-container">


            {/* SIDEBAR */}

            <aside className="sidebar">

                <h2>
                    ⚽ SÂN BÓNG
                </h2>

                <ul className="sidebar-menu">

                    <li>
                        Tổng quan
                    </li>

                    <li className="active">
                        Quản lý sân bóng
                    </li>

                    <li>
                        Quản lý đặt sân
                    </li>

                    <li>
                        Quản lý khách hàng
                    </li>

                    <li>
                        Quản lý nhân viên
                    </li>

                    <li>
                        Hóa đơn & thanh toán
                    </li>

                    <li>
                        Thống kê & báo cáo
                    </li>

                    <li>
                        Cài đặt
                    </li>

                </ul>

                <button
                    className="logout"
                    onClick={handleLogout}
                >
                    ↪ Đăng xuất
                </button>

            </aside>


            {/* MAIN */}

            <main className="admin-content">


                {/* HEADER */}

                <div className="top-header">

                    <input
                        placeholder="🔍 Tìm kiếm nhanh..."
                    />

                    <div className="admin-user">

                        <span>
                            🔔
                        </span>

                        <div>

                            <b>
                                {
                                    user?.FullName ||
                                    "Admin sân bóng"
                                }
                            </b>

                            <small>
                                Quản trị viên
                            </small>

                        </div>

                    </div>

                </div>


                {/* TITLE */}

                <div className="title-row">

                    <h1>
                        QUẢN LÝ SÂN BÓNG
                    </h1>

                    <button
                        className="add-btn"
                        onClick={() =>
                            setShowAddModal(true)
                        }
                    >
                        + Thêm sân mới
                    </button>

                </div>


                {/* STATISTICS */}

                <div className="cards">

                    <div className="card">
                        <p>Tổng số sân</p>
                        <h2>{stats.total}</h2>
                    </div>

                    <div className="card">
                        <p>Đang hoạt động</p>
                        <h2>{stats.available}</h2>
                    </div>

                    <div className="card">
                        <p>Đang bảo trì</p>
                        <h2>{stats.maintenance}</h2>
                    </div>

                    <div className="card">
                        <p>Đã đặt hôm nay</p>
                        <h2>0</h2>
                    </div>

                </div>


                {/* FILTER */}

                <div className="filter">

                    <input
                        placeholder="🔍 Tìm kiếm tên sân..."
                        value={searchText}
                        onChange={e =>
                            setSearchText(
                                e.target.value
                            )
                        }
                    />

                    <select
                        value={fieldType}
                        onChange={e =>
                            setFieldType(
                                e.target.value
                            )
                        }
                    >

                        <option value="">
                            Loại sân
                        </option>

                        {
                            fieldTypes.map(type => (
                                <option
                                    key={type}
                                    value={type}
                                >
                                    {type}
                                </option>
                            ))
                        }

                    </select>


                    <select
                        value={status}
                        onChange={e =>
                            setStatus(
                                e.target.value
                            )
                        }
                    >

                        <option value="">
                            Trạng thái
                        </option>

                        <option value="AVAILABLE">
                            AVAILABLE
                        </option>

                        <option value="MAINTENANCE">
                            MAINTENANCE
                        </option>

                    </select>

                </div>


                {/* TABLE */}

                <div className="table-box">

                    <table>

                        <thead>

                            <tr>

                                <th>Tên sân</th>
                                <th>Loại sân</th>
                                <th>Địa điểm</th>
                                <th>Khung giờ</th>
                                <th>Giá / giờ</th>
                                <th>Trạng thái</th>
                                <th>Thao tác</th>

                            </tr>

                        </thead>


                        <tbody>

                            {
                                loading ? (

                                    <tr>

                                        <td
                                            colSpan="7"
                                            style={{
                                                textAlign:
                                                    "center"
                                            }}
                                        >
                                            Đang tải...
                                        </td>

                                    </tr>

                                ) : filteredFields.length === 0 ? (

                                    <tr>

                                        <td
                                            colSpan="7"
                                            style={{
                                                textAlign:
                                                    "center"
                                            }}
                                        >
                                            Không có dữ liệu
                                        </td>

                                    </tr>

                                ) : (

                                    filteredFields.map(
                                        (field, index) => {

                                            const firstRow =
                                                index === 0 ||
                                                filteredFields[
                                                    index - 1
                                                ].FieldID !==
                                                field.FieldID;

                                            return (

                                                <tr
                                                    key={
                                                        field.PriceID
                                                            ? `price-${field.PriceID}`
                                                            : `field-${field.FieldID}`
                                                    }
                                                >

                                                    <td>
                                                        {
                                                            field.FieldName
                                                        }
                                                    </td>

                                                    <td>
                                                        {
                                                            field.FieldType
                                                        }
                                                    </td>

                                                    <td>
                                                        {
                                                            field.Location
                                                        }
                                                    </td>

                                                    <td>
                                                        {
                                                            field.StartTime
                                                                ?.slice(
                                                                    0,
                                                                    5
                                                                ) ||
                                                            "--"
                                                        }

                                                        {" - "}

                                                        {
                                                            field.EndTime
                                                                ?.slice(
                                                                    0,
                                                                    5
                                                                ) ||
                                                            "--"
                                                        }
                                                    </td>

                                                    <td>
                                                        <strong>
                                                            {
                                                                formatPrice(
                                                                    field.Price
                                                                )
                                                            }đ
                                                        </strong>
                                                    </td>

                                                    <td>

                                                        <span
                                                            className={
                                                                field.Status ===
                                                                "AVAILABLE"
                                                                    ? "status available"
                                                                    : "status maintenance"
                                                            }
                                                        >
                                                            {
                                                                field.Status
                                                            }
                                                        </span>

                                                    </td>

                                                    <td>

                                                        <div
                                                            style={{
                                                                display:
                                                                    "flex",
                                                                gap:
                                                                    "8px",
                                                                flexWrap:
                                                                    "wrap"
                                                            }}
                                                        >

                                                            <button
                                                                className="edit-btn"
                                                                onClick={() =>
                                                                    openEdit(
                                                                        field
                                                                    )
                                                                }
                                                                disabled={
                                                                    !field.PriceID
                                                                }
                                                            >
                                                                Sửa
                                                            </button>


                                                            {
                                                                firstRow && (

                                                                    <button
                                                                        className="delete-btn"
                                                                        disabled={
                                                                            deletingFieldID ===
                                                                            field.FieldID
                                                                        }
                                                                        onClick={() =>
                                                                            handleDeleteField(
                                                                                field
                                                                            )
                                                                        }
                                                                    >
                                                                        {
                                                                            deletingFieldID ===
                                                                            field.FieldID
                                                                                ? "Đang xóa..."
                                                                                : "Xóa sân"
                                                                        }
                                                                    </button>

                                                                )
                                                            }

                                                        </div>

                                                    </td>

                                                </tr>
                                            );
                                        }
                                    )
                                )
                            }

                        </tbody>

                    </table>

                </div>

            </main>


            {/* =================================================
                ADD FIELD MODAL
            ================================================= */}

            {
                showAddModal && (

                    <div className="modal">

                        <div className="modal-content">

                            <h2>
                                Thêm sân mới
                            </h2>


                            <label>
                                Tên sân
                            </label>

                            <input
                                placeholder="Ví dụ: Sân 3"
                                value={newField.FieldName}
                                onChange={e =>
                                    updateNewField(
                                        "FieldName",
                                        e.target.value
                                    )
                                }
                            />


                            <label>
                                Loại sân
                            </label>

                            <select
                                value={newField.FieldType}
                                onChange={e =>
                                    updateNewField(
                                        "FieldType",
                                        e.target.value
                                    )
                                }
                            >

                                <option value="5 player">
                                    5 player
                                </option>

                                <option value="7 player">
                                    7 player
                                </option>

                                <option value="11 player">
                                    11 player
                                </option>

                            </select>


                            <label>
                                Địa điểm
                            </label>

                            <input
                                placeholder="Ví dụ: Hà Nội"
                                value={newField.Location}
                                onChange={e =>
                                    updateNewField(
                                        "Location",
                                        e.target.value
                                    )
                                }
                            />


                            <label>
                                URL hình ảnh
                            </label>

                            <input
                                placeholder="Không bắt buộc"
                                value={newField.Image}
                                onChange={e =>
                                    updateNewField(
                                        "Image",
                                        e.target.value
                                    )
                                }
                            />


                            <label>
                                Trạng thái
                            </label>

                            <select
                                value={newField.Status}
                                onChange={e =>
                                    updateNewField(
                                        "Status",
                                        e.target.value
                                    )
                                }
                            >

                                <option value="AVAILABLE">
                                    AVAILABLE
                                </option>

                                <option value="MAINTENANCE">
                                    MAINTENANCE
                                </option>

                            </select>


                            <label>
                                Giờ bắt đầu
                            </label>

                            <input
                                type="time"
                                value={newField.StartTime}
                                onChange={e =>
                                    updateNewField(
                                        "StartTime",
                                        e.target.value
                                    )
                                }
                            />


                            <label>
                                Giờ kết thúc
                            </label>

                            <input
                                type="time"
                                value={newField.EndTime}
                                onChange={e =>
                                    updateNewField(
                                        "EndTime",
                                        e.target.value
                                    )
                                }
                            />


                            <label>
                                Giá / giờ
                            </label>

                            <input
                                type="number"
                                min="0"
                                step="1000"
                                placeholder="Ví dụ: 350000"
                                value={newField.Price}
                                onChange={e =>
                                    updateNewField(
                                        "Price",
                                        e.target.value
                                    )
                                }
                            />


                            <button
                                className="save-btn"
                                disabled={adding}
                                onClick={handleAddField}
                            >
                                {
                                    adding
                                        ? "Đang thêm..."
                                        : "Thêm sân"
                                }
                            </button>


                            <button
                                className="cancel-btn"
                                disabled={adding}
                                onClick={() => {

                                    setShowAddModal(
                                        false
                                    );

                                    setNewField(
                                        EMPTY_FIELD
                                    );
                                }}
                            >
                                Hủy
                            </button>

                        </div>

                    </div>
                )
            }


            {/* =================================================
                EDIT PRICE MODAL
            ================================================= */}

            {
                editField && (

                    <div className="modal">

                        <div className="modal-content">

                            <h2>
                                Sửa giá sân
                            </h2>

                            <p>
                                <b>
                                    {
                                        editField.FieldName
                                    }
                                </b>
                            </p>


                            <label>
                                Giờ bắt đầu
                            </label>

                            <input
                                type="time"
                                value={
                                    editField.StartTime
                                }
                                onChange={e =>
                                    updateEditField(
                                        "StartTime",
                                        e.target.value
                                    )
                                }
                            />


                            <label>
                                Giờ kết thúc
                            </label>

                            <input
                                type="time"
                                value={
                                    editField.EndTime
                                }
                                onChange={e =>
                                    updateEditField(
                                        "EndTime",
                                        e.target.value
                                    )
                                }
                            />


                            <label>
                                Giá tiền
                            </label>

                            <input
                                type="number"
                                min="0"
                                step="1000"
                                value={
                                    editField.Price ?? ""
                                }
                                onChange={e =>
                                    updateEditField(
                                        "Price",
                                        e.target.value
                                    )
                                }
                            />


                            <button
                                className="save-btn"
                                disabled={saving}
                                onClick={
                                    handleSaveEdit
                                }
                            >
                                {
                                    saving
                                        ? "Đang lưu..."
                                        : "Lưu thay đổi"
                                }
                            </button>


                            <button
                                className="cancel-btn"
                                disabled={saving}
                                onClick={() =>
                                    setEditField(null)
                                }
                            >
                                Hủy
                            </button>

                        </div>

                    </div>
                )
            }

        </div>
    );
}


export default Admin;
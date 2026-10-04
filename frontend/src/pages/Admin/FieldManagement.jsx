import {
  useEffect,
  useState,
} from "react";

import {
  Navigate,
  useOutletContext,
} from "react-router-dom";

import {
  getFields,
  updateFieldPrice,
} from "../../services/field_service";
import "./FieldManagement.css";

function FieldManagement() {
  const { isAdmin } =
    useOutletContext();

  const [fields, setFields] =
    useState([]);

  const [editField, setEditField] =
    useState(null);

  const loadFields = async () => {
    try {
      const data = await getFields();

      setFields(
        Array.isArray(data)
          ? data
          : []
      );
    } catch (error) {
      console.error(
        "LOAD FIELDS ERROR:",
        error
      );
    }
  };

  useEffect(() => {
    if (!isAdmin) {
      return undefined;
    }

    let active = true;

    getFields()
      .then((data) => {
        if (!active) {
          return;
        }

        setFields(
          Array.isArray(data)
            ? data
            : []
        );
      })
      .catch((error) => {
        console.error(
          "LOAD FIELDS ERROR:",
          error
        );
      });

    return () => {
      active = false;
    };
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <Navigate
        to="/admin/bookings"
        replace
      />
    );
  }

  const totalFields =
    new Set(
      fields.map(
        (field) => field.FieldID
      )
    ).size;

  const activeFields =
    new Set(
      fields
        .filter(
          (field) =>
            field.Status ===
            "AVAILABLE"
        )
        .map(
          (field) => field.FieldID
        )
    ).size;

  const maintenanceFields =
    new Set(
      fields
        .filter(
          (field) =>
            field.Status !==
            "AVAILABLE"
        )
        .map(
          (field) => field.FieldID
        )
    ).size;

  return (
    <>
      <div className="title-row">
        <h1>QUẢN LÝ SÂN BÓNG</h1>

        <button className="add-btn">
          + Thêm sân mới
        </button>
      </div>

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

      <div className="filter">
        <input
          placeholder="🔍 Tìm kiếm tên sân..."
        />

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
            {fields.map((field) => (
              <tr
                key={
                  field.FieldID +
                  "-" +
                  field.StartTime
                }
              >
                <td>
                  {field.FieldName}
                </td>

                <td>
                  {field.FieldType}
                </td>

                <td>
                  {field.Location}
                </td>

                <td>
                  <div className="time">
                    {field.StartTime}

                    {" - "}

                    {field.EndTime}
                  </div>
                </td>

                <td>
                  <strong>
                    {Number(
                      field.Price || 0
                    ).toLocaleString(
                      "vi-VN"
                    )}
                    đ
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
                    {field.Status}
                  </span>
                </td>

                <td>
                  <button
                    className="edit-btn"
                    onClick={() =>
                      setEditField(field)
                    }
                  >
                    Sửa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editField && (
        <div className="modal">
          <div className="modal-content">
            <h2>
              Sửa giá sân
            </h2>

            <label>
              Giờ bắt đầu
            </label>

            <input
              type="time"
              value={
                editField.StartTime
              }
              onChange={(event) =>
                setEditField({
                  ...editField,

                  StartTime:
                    event.target.value,
                })
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
              onChange={(event) =>
                setEditField({
                  ...editField,

                  EndTime:
                    event.target.value,
                })
              }
            />

            <label>
              Giá tiền
            </label>

            <input
              type="number"
              value={
                editField.Price
              }
              onChange={(event) =>
                setEditField({
                  ...editField,

                  Price:
                    event.target.value,
                })
              }
            />

            <button
              className="save-btn"
              onClick={async () => {
                await updateFieldPrice(
                  editField.FieldID,
                  {
                    StartTime:
                      editField.StartTime,

                    EndTime:
                      editField.EndTime,

                    Price:
                      Number(
                        editField.Price
                      ),
                  }
                );

                setEditField(null);

                loadFields();
              }}
            >
              Lưu thay đổi
            </button>

            <button
              className="cancel-btn"
              onClick={() =>
                setEditField(null)
              }
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default FieldManagement;
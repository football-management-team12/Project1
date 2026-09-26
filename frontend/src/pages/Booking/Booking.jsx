import { useMemo, useState } from "react";
import {
  Search,
  CalendarDays,
  ArrowRight,
} from "lucide-react";

import Navbar from "../../components/Navbar/Navbar";

import fields from "../../data/fields";

import {
  MIN_FIELD_PRICE,
  calculateBookingPrice,
  formatPrice,
} from "../../utils/pricing";

import "./Booking.css";

const timeSlots = [
  {
    id: 1,
    label: "06:00 - 07:30",
    start: "06:00",
    end: "07:30",
    status: "available",
  },
  {
    id: 2,
    label: "07:30 - 09:00",
    start: "07:30",
    end: "09:00",
    status: "available",
  },
  {
    id: 3,
    label: "16:00 - 17:30",
    start: "16:00",
    end: "17:30",
    status: "booked",
  },
  {
    id: 4,
    label: "17:30 - 19:00",
    start: "17:30",
    end: "19:00",
    status: "available",
  },
  {
    id: 5,
    label: "19:00 - 20:30",
    start: "19:00",
    end: "20:30",
    status: "available",
  },
  {
    id: 6,
    label: "20:30 - 22:00",
    start: "20:30",
    end: "22:00",
    status: "available",
  },
];

function Booking() {
  const [selectedField, setSelectedField] = useState(
    fields[0]?.id || null
  );

  const [selectedSlot, setSelectedSlot] = useState(null);

  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");

  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchStatus, setSearchStatus] = useState("all");
  const [searchType, setSearchType] = useState("all");

  const [bookingDate, setBookingDate] =
    useState("2026-03-20");

  const filteredFields = useMemo(() => {
    return fields.filter((field) => {
      const matchKeyword = field.name
        .toLowerCase()
        .includes(searchKeyword.toLowerCase());

      const matchStatus =
        searchStatus === "all" ||
        field.status === searchStatus;

      const matchType =
        searchType === "all" ||
        field.type === searchType;

      return (
        matchKeyword &&
        matchStatus &&
        matchType
      );
    });
  }, [
    searchKeyword,
    searchStatus,
    searchType,
  ]);

  const currentField = fields.find(
    (field) => field.id === selectedField
  );

  const selectedPrice = selectedSlot
    ? calculateBookingPrice(
        selectedSlot.start,
        selectedSlot.end
      )
    : 0;

  const handleSearch = (event) => {
    event.preventDefault();

    setSearchKeyword(keyword);
    setSearchStatus(status);
    setSearchType(type);

    const firstMatchedField = fields.find((field) => {
      const matchKeyword = field.name
        .toLowerCase()
        .includes(keyword.toLowerCase());

      const matchStatus =
        status === "all" ||
        field.status === status;

      const matchType =
        type === "all" ||
        field.type === type;

      return (
        matchKeyword &&
        matchStatus &&
        matchType
      );
    });

    if (firstMatchedField) {
      setSelectedField(firstMatchedField.id);
    }

    setSelectedSlot(null);
  };

  const handleSelectField = (fieldId) => {
    setSelectedField(fieldId);
    setSelectedSlot(null);
  };

  const handleSelectSlot = (slot) => {
    if (slot.status === "booked") {
      return;
    }

    setSelectedSlot(slot);
  };

  return (
    <>
      <Navbar />

      <main className="booking-page">
        {/* FILTER */}
        <section className="booking-filter">
          <form
            className="booking-container filter-grid"
            onSubmit={handleSearch}
          >
            <div className="filter-group search-group">
              <label>
                SỐ/TÊN SÂN
              </label>

              <div className="search-input">
                <Search size={18} />

                <input
                  type="text"
                  placeholder="Nhập số/tên sân (vd: Sân 01, Sân 02...)"
                  value={keyword}
                  onChange={(e) =>
                    setKeyword(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="filter-group">
              <label>
                TRẠNG THÁI
              </label>

              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value)
                }
              >
                <option value="all">
                  Tất cả trạng thái
                </option>

                <option value="Còn sân">
                  Còn sân
                </option>

                <option value="Đang sửa chữa">
                  Đang sửa chữa
                </option>
              </select>
            </div>

            <div className="filter-group">
              <label>
                LOẠI SÂN
              </label>

              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value)
                }
              >
                <option value="all">
                  Tất cả loại sân
                </option>

                <option value="Sân 5 người">
                  Sân 5 người
                </option>

                <option value="Sân 7 người">
                  Sân 7 người
                </option>

                <option value="Sân 11 người">
                  Sân 11 người
                </option>
              </select>
            </div>

            <button
              type="submit"
              className="search-btn"
            >
              <Search size={18} />
              Tìm sân
            </button>
          </form>
        </section>

        {/* CONTENT */}
        <section className="booking-content">
          <div className="booking-container booking-layout">

            {/* LEFT */}
            <aside className="field-sidebar">
              <h3>
                CHỌN SÂN
              </h3>

              <div className="field-list">
                {filteredFields.length > 0 ? (
                  filteredFields.map((field) => (
                    <button
                      key={field.id}
                      type="button"
                      className={
                        selectedField === field.id
                          ? "field-item active"
                          : "field-item"
                      }
                      onClick={() =>
                        handleSelectField(field.id)
                      }
                    >
                      <img
                        src={field.image}
                        alt={field.name}
                      />

                      <div>
                        <strong>
                          {field.name}
                        </strong>

                        <span>
                          {field.type}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <p>
                    Không tìm thấy sân phù hợp.
                  </p>
                )}
              </div>
            </aside>

            {/* RIGHT */}
            <div className="booking-main">
              {currentField ? (
                <>
                  <div className="booking-header-card">
                    <div>
                      <h1>
                        LỊCH ĐẶT SÂN
                      </h1>

                      <div className="booking-meta">
                        <span>
                          Sân:
                          <strong>
                            {" "}
                            {currentField.name}
                          </strong>
                        </span>

                        <span>
                          Giá từ:
                          <strong>
                            {" "}
                            {formatPrice(
                              MIN_FIELD_PRICE
                            )}
                            đ/h
                          </strong>
                        </span>

                        <span>
                          Loại:
                          <b>
                            {" "}
                            {currentField.type}
                          </b>
                        </span>
                      </div>
                    </div>

                    <label className="date-btn">
                      <CalendarDays size={18} />

                      <span>
                        Ngày đặt:
                      </span>

                      <input
                        type="date"
                        value={bookingDate}
                        onChange={(e) => {
                          setBookingDate(
                            e.target.value
                          );

                          setSelectedSlot(null);
                        }}
                      />
                    </label>
                  </div>

                  <div className="schedule-card">
                    <div className="schedule-head">
                      <div>GIỜ</div>
                      <div>TRẠNG THÁI</div>
                    </div>

                    {timeSlots.map((slot) => {
                      const isSelected =
                        selectedSlot?.id ===
                        slot.id;

                      const isBooked =
                        slot.status === "booked";

                      return (
                        <button
                          type="button"
                          className={`schedule-row ${
                            isSelected
                              ? "selected"
                              : ""
                          } ${
                            isBooked
                              ? "disabled"
                              : ""
                          }`}
                          key={slot.id}
                          disabled={isBooked}
                          onClick={() =>
                            handleSelectSlot(slot)
                          }
                        >
                          <div className="time-cell">
                            {slot.label}
                          </div>

                          <div
                            className={
                              isBooked
                                ? "status-cell booked"
                                : "status-cell available"
                            }
                          >
                            {isBooked
                              ? "Đã đặt"
                              : "Trống"}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="booking-bottom">
                    <div className="booking-legend">
                      <div>
                        <span className="legend-dot green" />
                        Trống (Có thể chọn)
                      </div>

                      <div>
                        <span className="legend-dot red" />
                        Đã đặt (Không thể chọn)
                      </div>
                    </div>

                    <div className="booking-summary">
                      {selectedSlot && (
                        <div className="booking-price">
                          <span>
                            Tạm tính:
                          </span>

                          <strong>
                            {formatPrice(
                              selectedPrice
                            )}
                            đ
                          </strong>
                        </div>
                      )}

                      <button
                        type="button"
                        className="continue-btn"
                        disabled={!selectedSlot}
                      >
                        Tiếp tục đặt sân
                        <ArrowRight size={19} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="booking-header-card">
                  <h2>
                    Không tìm thấy thông tin sân.
                  </h2>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

export default Booking;
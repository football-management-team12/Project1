import { useState } from "react";
import { Search, CalendarDays, ArrowRight } from "lucide-react";

import Navbar from "../../components/Navbar/Navbar";
import "./Booking.css";

import field1 from "../../assets/images/san1.jpg";

function Booking() {
  const [selectedField, setSelectedField] = useState(1);

  const fields = [
    {
      id: 1,
      name: "Sân 01",
      type: "Sân 7 người",
      image: field1,
    },
    {
      id: 2,
      name: "Sân 02",
      type: "Sân 7 người",
      image: field1,
    },
    {
      id: 3,
      name: "Sân 03",
      type: "Sân 7 người",
      image: field1,
    },
    {
      id: 4,
      name: "Sân 04",
      type: "Sân 7 người",
      image: field1,
    },
    {
      id: 5,
      name: "Sân 05",
      type: "Sân 7 người",
      image: field1,
    },
  ];

  const timeSlots = [
    {
      time: "06:00 - 07:30",
      status: "available",
    },
    {
      time: "07:30 - 09:00",
      status: "available",
    },
    {
      time: "16:00 - 17:30",
      status: "booked",
    },
    {
      time: "17:30 - 19:00",
      status: "available",
    },
    {
      time: "19:00 - 20:30",
      status: "available",
    },
    {
      time: "20:30 - 22:00",
      status: "available",
    },
  ];

  return (
    <>
      <Navbar />

      <main className="booking-page">

        {/* FILTER */}
        <section className="booking-filter">
          <div className="booking-container filter-grid">

            <div className="filter-group search-group">
              <label>SỐ/TÊN SÂN</label>

              <div className="search-input">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Nhập số/tên sân (vd: Sân 01, Sân 02...)"
                />
              </div>
            </div>

            <div className="filter-group">
              <label>TRẠNG THÁI</label>

              <select>
                <option>Tất cả trạng thái</option>
                <option>Trống</option>
                <option>Đã đặt</option>
              </select>
            </div>

            <div className="filter-group">
              <label>LOẠI SÂN</label>

              <select>
                <option>Sân 7 người</option>
                <option>Sân 5 người</option>
              </select>
            </div>

            <button className="search-btn">
              <Search size={18} />
              Tìm sân
            </button>

          </div>
        </section>

        {/* CONTENT */}
        <section className="booking-content">
          <div className="booking-container booking-layout">

            {/* LEFT */}
            <aside className="field-sidebar">
              <h3>CHỌN SÂN</h3>

              <div className="field-list">
                {fields.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    className={
                      selectedField === field.id
                        ? "field-item active"
                        : "field-item"
                    }
                    onClick={() => setSelectedField(field.id)}
                  >
                    <img src={field.image} alt={field.name} />

                    <div>
                      <strong>{field.name}</strong>
                      <span>{field.type}</span>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            {/* RIGHT */}
            <div className="booking-main">

              <div className="booking-header-card">
                <div>
                  <h1>LỊCH ĐẶT SÂN</h1>

                  <div className="booking-meta">
                    <span>
                      Đơn giá:
                      <strong> 300.000đ/h</strong>
                    </span>

                    <span>
                      Loại: <b>Cỏ nhân tạo 7 người</b>
                    </span>
                  </div>
                </div>

                <button className="date-btn">
                  <CalendarDays size={18} />
                  <span>Ngày đặt: 20/03/2026</span>
                  <span>⌄</span>
                </button>
              </div>

              <div className="schedule-card">

                <div className="schedule-head">
                  <div>GIỜ</div>
                  <div>TRẠNG THÁI</div>
                </div>

                {timeSlots.map((slot, index) => (
                  <div className="schedule-row" key={index}>
                    <div className="time-cell">
                      {slot.time}
                    </div>

                    <div
                      className={
                        slot.status === "available"
                          ? "status-cell available"
                          : "status-cell booked"
                      }
                    >
                      {slot.status === "available"
                        ? "Trống"
                        : "Đã đặt"}
                    </div>
                  </div>
                ))}

              </div>

              <div className="booking-bottom">

                <div className="booking-legend">
                  <div>
                    <span className="legend-dot green"></span>
                    Trống (Có thể chọn)
                  </div>

                  <div>
                    <span className="legend-dot red"></span>
                    Đã đặt (Không thể chọn)
                  </div>
                </div>

                <button className="continue-btn">
                  Tiếp tục đặt sân
                  <ArrowRight size={19} />
                </button>

              </div>

            </div>
          </div>
        </section>

      </main>
    </>
  );
}

export default Booking;
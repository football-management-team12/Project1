import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useParams,
} from "react-router-dom";

import {
  CalendarDays,
  CheckCircle2,
  Lightbulb,
  Car,
  ShowerHead,
  Wifi,
  CupSoda,
  Shirt,
  MapPin,
  Star,
} from "lucide-react";

import Navbar from "../../components/Navbar/Navbar";
import Footer from "../../components/Footer/Footer";
import FieldCard from "../../components/FieldCard/FieldCard";

import fields from "../../data/fields";

import {
  MIN_FIELD_PRICE,
  calculateBookingPrice,
  formatPrice,
} from "../../utils/pricing";

import "./FieldDetail.css";

const timeSlots = [
  {
    id: 1,
    label: "06:00 – 07:30",
    start: "06:00",
    end: "07:30",
    available: true,
  },
  {
    id: 2,
    label: "07:30 – 09:00",
    start: "07:30",
    end: "09:00",
    available: false,
  },
  {
    id: 3,
    label: "17:30 – 19:00",
    start: "17:30",
    end: "19:00",
    available: true,
  },
  {
    id: 4,
    label: "19:00 – 20:30",
    start: "19:00",
    end: "20:30",
    available: true,
  },
  {
    id: 5,
    label: "20:30 – 22:00",
    start: "20:30",
    end: "22:00",
    available: true,
  },
];

function FieldDetail() {
  const { id } = useParams();

  const field = useMemo(() => {
    return fields.find(
      (item) => item.id === Number(id)
    );
  }, [id]);

  const [selectedImage, setSelectedImage] =
    useState(field?.image || "");

  const [date, setDate] = useState("");

  const [selectedSlot, setSelectedSlot] =
    useState(timeSlots[2]);

  useEffect(() => {
    if (field) {
      setSelectedImage(field.image);
    }
  }, [field]);

  if (!field) {
    return (
      <>
        <Navbar />

        <main className="field-detail-page">
          <div className="field-detail-container">
            <section className="field-information-card">
              <h1>
                Không tìm thấy sân
              </h1>

              <p>
                Sân bạn đang tìm kiếm không tồn tại
                hoặc đã bị xóa.
              </p>

              <Link
                to="/fields"
                className="booking-back-button"
              >
                Quay lại danh sách sân
              </Link>
            </section>
          </div>
        </main>

        <Footer />
      </>
    );
  }

  const gallery = [
    field.image,
    field.image,
    field.image,
    field.image,
  ];

  const similarFields = fields
    .filter(
      (item) =>
        item.id !== field.id &&
        item.type === field.type
    )
    .slice(0, 3);

  const totalPrice =
    calculateBookingPrice(
      selectedSlot.start,
      selectedSlot.end
    );

  return (
    <>
      <Navbar />

      <main className="field-detail-page">
        <div className="field-detail-breadcrumb-wrapper">
          <div className="field-detail-breadcrumb">
            <Link to="/">
              Trang chủ
            </Link>

            <span>/</span>

            <Link to="/fields">
              Danh sách sân
            </Link>

            <span>/</span>

            <strong>
              {field.name}
            </strong>
          </div>
        </div>

        <div className="field-detail-container">
          <div className="field-detail-layout">
            <div className="field-detail-main">
              <section className="field-gallery">
                <div className="field-gallery-main">
                  <img
                    src={selectedImage}
                    alt={field.name}
                  />
                </div>

                <div className="field-gallery-thumbnails">
                  {gallery.map(
                    (image, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`field-gallery-thumb ${
                          selectedImage === image &&
                          index === 0
                            ? "field-gallery-thumb--active"
                            : ""
                        }`}
                        onClick={() =>
                          setSelectedImage(image)
                        }
                      >
                        <img
                          src={image}
                          alt={`${field.name} ${index + 1}`}
                        />
                      </button>
                    )
                  )}
                </div>
              </section>

              <section className="field-information-card">
                <div className="field-information-header">
                  <div>
                    <h1>
                      {field.name} – {field.center}
                    </h1>

                    <div className="field-meta">
                      <span className="field-badge">
                        {field.type}
                      </span>

                      <span className="field-badge">
                        {field.status}
                      </span>

                      <span className="field-rating-info">
                        <Star
                          size={15}
                          fill="currentColor"
                        />

                        <strong>
                          {field.rating}
                        </strong>

                        <span>
                          ({field.reviews} đánh giá)
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="field-information-price">
                    <span>
                      GIÁ TỪ
                    </span>

                    <strong>
                      {formatPrice(
                        MIN_FIELD_PRICE
                      )}
                      đ/giờ
                    </strong>
                  </div>
                </div>

                <div className="field-information-divider" />

                <div className="field-information-section">
                  <h2>
                    Mô tả sân
                  </h2>

                  <p>
                    {field.description}
                  </p>
                </div>

                <div className="field-information-section">
                  <h2>
                    Tiện ích
                  </h2>

                  <div className="field-utilities">
                    <div className="field-utility">
                      <span>
                        <Lightbulb size={18} />
                      </span>
                      Đèn LED
                    </div>

                    <div className="field-utility">
                      <span>
                        <Car size={18} />
                      </span>
                      Bãi đỗ xe
                    </div>

                    <div className="field-utility">
                      <span>
                        <ShowerHead size={18} />
                      </span>
                      Phòng tắm
                    </div>

                    <div className="field-utility">
                      <span>
                        <Wifi size={18} />
                      </span>
                      Wi-Fi miễn phí
                    </div>

                    <div className="field-utility">
                      <span>
                        <CupSoda size={18} />
                      </span>
                      Nước uống
                    </div>

                    <div className="field-utility">
                      <span>
                        <Shirt size={18} />
                      </span>
                      Áo tập
                    </div>
                  </div>
                </div>

                <div className="field-bottom-information">
                  <div className="field-rules">
                    <h2>
                      Quy định sử dụng
                    </h2>

                    <p>
                      <CheckCircle2 size={16} />
                      Có mặt trước giờ đá 15 phút
                      để nhận sân.
                    </p>

                    <p>
                      <CheckCircle2 size={16} />
                      Không sử dụng giày đinh sắt
                      trên mặt cỏ.
                    </p>

                    <p>
                      <CheckCircle2 size={16} />
                      Hủy hoặc đổi lịch trước tối
                      thiểu 6 giờ.
                    </p>
                  </div>

                  <div className="field-address-box">
                    <h2>
                      Địa chỉ cơ sở
                    </h2>

                    <div>
                      <MapPin size={18} />

                      <p>
                        Số 18 đường Nguyễn Hữu Thọ,
                        Phường Tân Phong, Quận 7,
                        TP. Hồ Chí Minh
                      </p>
                    </div>

                    <a
                      href="https://maps.google.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Xem chỉ đường →
                    </a>
                  </div>
                </div>
              </section>
            </div>

            <aside className="booking-sidebar">
              <h2>
                Chọn lịch đặt sân
              </h2>

              <div className="booking-form-group">
                <label>
                  NGÀY ĐẶT
                </label>

                <div className="booking-date">
                  <CalendarDays size={18} />

                  <input
                    type="date"
                    value={date}
                    onChange={(e) =>
                      setDate(e.target.value)
                    }
                  />
                </div>
              </div>

              <div className="booking-form-group">
                <label>
                  KHUNG GIỜ CÒN TRỐNG
                </label>

                <div className="booking-time-list">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={!slot.available}
                      className={`booking-time ${
                        selectedSlot.id === slot.id
                          ? "booking-time--selected"
                          : ""
                      }`}
                      onClick={() =>
                        slot.available &&
                        setSelectedSlot(slot)
                      }
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="booking-form-group">
                <label>
                  THỜI LƯỢNG (CỐ ĐỊNH)
                </label>

                <div className="booking-duration">
                  90 phút
                </div>
              </div>

              <div className="booking-sidebar-divider" />

              <div className="booking-total">
                <span>
                  Tạm tính
                </span>

                <strong>
                  {formatPrice(totalPrice)}đ
                </strong>
              </div>

              <p className="booking-note">
                Giá được tính theo đúng khung giờ
                trong bảng giá và chưa bao gồm các
                dịch vụ bổ sung.
              </p>

              <Link
                to={`/booking?field=${field.id}&date=${date}&time=${encodeURIComponent(
                  selectedSlot.label
                )}`}
                className="booking-now-button"
              >
                Đặt sân ngay
              </Link>

              <Link
                to="/fields"
                className="booking-back-button"
              >
                Quay lại
              </Link>
            </aside>
          </div>

          <section className="similar-fields">
            <h2>
              Sân tương tự
            </h2>

            <p>
              Khám phá thêm các sân thành phần
              tại cùng cơ sở {field.center}.
            </p>

            <div className="similar-fields-grid">
              {similarFields.map((item) => (
                <FieldCard
                  key={item.id}
                  id={item.id}
                  image={item.image}
                  name={item.name}
                  status={item.status}
                  type={item.type}
                  rating={item.rating}
                  price={MIN_FIELD_PRICE}
                />
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}

export default FieldDetail;

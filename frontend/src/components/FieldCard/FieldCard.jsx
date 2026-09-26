import { Link } from "react-router-dom";
import { MapPin, Users } from "lucide-react";

import fieldImage from "../../assets/images/football-field1.jpg";
import "./FieldCard.css";


function FieldCard({
  id,
  name,
  address,
  type,
  status,
  slots = []
}) {

  const hasAvailableSlot = slots.some(
    slot => slot.available
  );


  const minPrice =
    slots.length > 0
      ? Math.min(
          ...slots.map(
            slot => Number(slot.Price || 0)
          )
        )
      : 0;


  return (

    <article className="field-card">


      {/* ẢNH SÂN */}

      <div className="field-image-wrapper">

        <img
          src={fieldImage}
          alt={name}
          className="field-image"
        />

      </div>


      {/* NỘI DUNG */}

      <div className="field-content">


        {/* TÊN SÂN */}

        <div className="field-title-row">

          <h3 title={name}>
            {name}
          </h3>

        </div>


        {/* THÔNG TIN */}

        <div className="field-info">

          <div className="field-info-row">

            <MapPin size={16} />

            <span>
              {address}
            </span>

          </div>


          <div className="field-info-row">

            <Users size={16} />

            <span>
              {type}
            </span>

          </div>

        </div>


        {/* KHUNG GIỜ */}

        <div className="field-slots">

          <div className="field-slots-title">
            KHUNG GIỜ
          </div>


          {
            slots.length === 0 ? (

              <div className="field-no-slot">
                Chưa có bảng giá
              </div>

            ) : (

              slots.map(slot => (

                <div

                  key={slot.PriceID}

                  className={
                    slot.available
                      ? "field-slot available"
                      : "field-slot booked"
                  }
                >

                  <div>

                    <strong>

                      {slot.StartTime}

                      {" - "}

                      {slot.EndTime}

                    </strong>


                    <span>

                      {
                        Number(
                          slot.Price || 0
                        ).toLocaleString("vi-VN")
                      }

                      đ

                    </span>

                  </div>


                  <small>

                    {
                      slot.available
                        ? "Trống"
                        : "Đã đặt"
                    }

                  </small>

                </div>

              ))

            )
          }

        </div>


        <div className="field-divider" />


        {/* GIÁ + CHỌN SÂN */}

        <div className="field-bottom">

          <div>

            <span className="price-label">
              GIÁ THUÊ TỪ
            </span>


            <strong>

              {
                minPrice.toLocaleString(
                  "vi-VN"
                )
              }

              đ/h

            </strong>

          </div>


          {
            hasAvailableSlot &&
            status === "AVAILABLE" ? (

              <Link

                to={`/booking?fieldId=${id}`}

                className="field-detail-button"
              >
                Chọn sân
              </Link>

            ) : (

              <button

                className="
                  field-detail-button
                  field-disabled
                "

                disabled
              >
                Hết lịch
              </button>

            )
          }

        </div>

      </div>

    </article>
  );
}


export default FieldCard;
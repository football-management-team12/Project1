import { useNavigate } from "react-router-dom";

import {
  MapPin,
  Users,
} from "lucide-react";

import fieldImage
  from "../../assets/images/football-field.jpg";

import "./FieldCard.css";


function FieldCard({
  id,
  name,
  address,
  type,
  status,
  slots = [],
}) {

  const navigate =
    useNavigate();


  const getCurrentUser = () => {

    try {

      return JSON.parse(
        localStorage.getItem("user")
      );

    } catch {

      return null;
    }
  };


  /* =========================================================
     MIN PRICE
  ========================================================= */

  const prices =
    slots
      .map(
        (slot) =>
          Number(slot.Price)
      )
      .filter(
        (price) =>
          !Number.isNaN(price)
      );


  const minPrice =
    prices.length > 0
      ? Math.min(...prices)
      : 0;


  const fieldAvailable =
    status === "AVAILABLE";


  /* =========================================================
     OPEN BOOKING
  ========================================================= */

  const handleChooseField = () => {

    if (!fieldAvailable) {
      return;
    }


    const bookingUrl =
      /booking?fieldId=${id};


    const user =
      getCurrentUser();


    if (!user) {

      navigate(
        `/login?redirect=${encodeURIComponent(
          bookingUrl
        )}`
      );

      return;
    }


    navigate(
      bookingUrl
    );
  };


  return (

    <article
      className="field-card"
    >

      {/* IMAGE */}

      <div
        className="field-image-wrapper"
      >

        <img
          src={fieldImage}
          alt={name}
          className="field-image"
        />


        <span
          className={
            fieldAvailable
              ? "field-status field-status--available"
              : "field-status field-status--maintenance"
          }
        >

          {
            fieldAvailable
              ? "Đang hoạt động"
              : "Bảo trì"
          }

        </span>

      </div>


      {/* CONTENT */}

      <div
        className="field-content"
      >

        <div
          className="field-title-row"
        >

          <h3 title={name}>
            {name}
          </h3>

        </div>


        {/* FIELD INFO */}

        <div
          className="field-info"
        >

          <div
            className="field-info-row"
          >

            <MapPin size={16} />

            <span>
              {address}
            </span>

          </div>


          <div
            className="field-info-row"
          >

            <Users size={16} />

            <span>
              {type}
            </span>

          </div>

        </div>


        {/* TIME SLOTS */}

        <div
          className="field-slots"
        >

          <div
            className="field-slots-title"
          >
            KHUNG GIỜ
          </div>


          {
            slots.length === 0
              ? (

                <div
                  className="field-no-slot"
                >
                  Chưa có khung giờ
                </div>

              )
              : (

                slots.map(
                  (slot) => (

                    <div
                      key={slot.PriceID}
                      className="field-slot"
                    >

                      <strong>

                        {
                          slot.StartTime
                        }

                        {" - "}

                        {
                          slot.EndTime
                        }

                      </strong>

                    </div>

                  )
                )

              )
          }

        </div>


        <div
          className="field-divider"
        />


        {/* BOTTOM */}

        <div
          className="field-bottom"
        >

          <div>

            <span
              className="price-label"
            >
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


          <button

            type="button"

            disabled={
              !fieldAvailable
            }

            className={
              fieldAvailable
                ? "field-detail-button"
                : "field-detail-button field-disabled"
            }

            onClick={
              handleChooseField
            }

          >

            {
              fieldAvailable
                ? "Xem lịch / Đặt sân"
                : "Bảo trì"
            }

          </button>

        </div>

      </div>

    </article>
  );
}


export default FieldCard;
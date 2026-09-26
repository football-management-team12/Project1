import {
  Link
} from "react-router-dom";

import {
  CalendarDays,
  MapPin,
  Users
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

  selectedDate,

  slots = []

}) {


  /* =========================================================
     AVAILABLE SLOT
  ========================================================= */

  const hasAvailableSlot =
    slots.some(
      slot =>
        slot.available
    );


  /* =========================================================
     MIN PRICE
  ========================================================= */

  const prices =
    slots
      .map(
        slot =>
          Number(
            slot.Price
          )
      )
      .filter(
        price =>
          !Number.isNaN(
            price
          )
      );


  const minPrice =
    prices.length > 0

      ? Math.min(
          ...prices
        )

      : 0;


  /* =========================================================
     STATUS
  ========================================================= */

  const fieldAvailable =
    status === "AVAILABLE";


  /* =========================================================
     JSX
  ========================================================= */

  return (

    <article
      className="
        field-card
      "
    >


      {/* IMAGE */}

      <div
        className="
          field-image-wrapper
        "
      >

        <img

          src={
            fieldImage
          }

          alt={
            name
          }

          className="
            field-image
          "

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
        className="
          field-content
        "
      >


        {/* TITLE */}

        <div
          className="
            field-title-row
          "
        >

          <h3
            title={
              name
            }
          >

            {name}

          </h3>

        </div>


        {/* INFORMATION */}

        <div
          className="
            field-info
          "
        >

          <div
            className="
              field-info-row
            "
          >

            <MapPin
              size={16}
            />

            <span>
              {address}
            </span>

          </div>


          <div
            className="
              field-info-row
            "
          >

            <Users
              size={16}
            />

            <span>
              {type}
            </span>

          </div>


          <div
            className="
              field-info-row
            "
          >

            <CalendarDays
              size={16}
            />

            <span>
              {selectedDate}
            </span>

          </div>

        </div>


        {/* SLOT */}

        <div
          className="
            field-slots
          "
        >

          <div
            className="
              field-slots-title
            "
          >
            KHUNG GIỜ
          </div>


          {
            slots.length === 0
            ? (

              <div
                className="
                  field-no-slot
                "
              >
                Chưa có bảng giá
              </div>

            )
            : (

              slots.map(
                slot => (

                  <div

                    key={
                      slot.PriceID
                    }

                    className={
                      slot.available

                        ? "field-slot available"

                        : "field-slot booked"
                    }

                  >


                    {/* TIME + PRICE */}

                    <div
                      className="
                        field-slot-main
                      "
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


                      <span
                        className="
                          field-slot-price
                        "
                      >

                        {
                          Number(
                            slot.Price ||
                            0
                          ).toLocaleString(
                            "vi-VN"
                          )
                        }

                        đ

                      </span>

                    </div>


                    {/* STATUS */}

                    <span
                      className="
                        field-slot-status
                      "
                    >

                      {
                        slot.available
                          ? "Trống"
                          : (
                            slot.reason
                            ===
                            "FIELD_UNAVAILABLE"
                              ? "Bảo trì"
                              : "Đã đặt"
                          )
                      }

                    </span>

                  </div>

                )
              )
            )
          }

        </div>


        <div
          className="
            field-divider
          "
        />


        {/* BOTTOM */}

        <div
          className="
            field-bottom
          "
        >

          <div>

            <span
              className="
                price-label
              "
            >
              GIÁ THUÊ TỪ
            </span>


            <strong>

              {
                minPrice
                  .toLocaleString(
                    "vi-VN"
                  )
              }

              đ/h

            </strong>

          </div>


          {
            fieldAvailable
            &&
            hasAvailableSlot
            ? (

              <Link

                to={
                  `/booking?fieldId=${id}&date=${selectedDate}`
                }

                className="
                  field-detail-button
                "
              >

                Chọn sân

              </Link>

            )
            : (

              <button

                type="button"

                disabled

                className="
                  field-detail-button
                  field-disabled
                "
              >

                {
                  fieldAvailable
                    ? "Hết lịch"
                    : "Bảo trì"
                }

              </button>

            )
          }

        </div>

      </div>

    </article>
  );
}


export default FieldCard;
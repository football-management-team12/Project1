import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import "./FieldCard.css";


const formatTime = (value) => {
  if (!value) {
    return "--:--";
  }

  const text =
    String(value);

  const match =
    text.match(
      /(\d{1,2}):(\d{2})/
    );

  if (!match) {
    return text;
  }

  return `${match[1].padStart(
    2,
    "0"
  )}:${match[2]}`;
};


const formatPrice = (value) => {
  const amount =
    Number(value || 0);

  return new Intl.NumberFormat(
    "vi-VN"
  ).format(amount);
};


const normalizeStatus = (status) =>
  String(status || "")
    .trim()
    .toUpperCase();


const FieldCard = ({
  id,
  name,
  address,
  type,
  status,
  slots = [],
  selectedDate = "",
  availabilityLoaded = false,
  availabilityLoading = false,
  availabilityError = "",
  hasAvailableSlot = false,
}) => {

  const navigate =
    useNavigate();


  const normalizedStatus =
    normalizeStatus(status);


  const fieldUnavailable =
    normalizedStatus &&
    normalizedStatus !==
      "AVAILABLE";


  // =========================================================
  // MIN PRICE
  // =========================================================

  const minPrice =
    useMemo(() => {

      const prices =
        slots
          .map(
            (slot) =>
              Number(
                slot.Price ??
                slot.price ??
                0
              )
          )
          .filter(
            (price) =>
              Number.isFinite(
                price
              ) &&
              price > 0
          );


      return prices.length > 0
        ? Math.min(...prices)
        : null;

    }, [slots]);


  const availableSlotExists =
    hasAvailableSlot ||
    slots.some(
      (slot) =>
        slot.available === true
    );


  const canBook =
    Boolean(selectedDate) &&
    availabilityLoaded &&
    !fieldUnavailable &&
    availableSlotExists;


  // =========================================================
  // CURRENT USER
  // =========================================================

  const getCurrentUser = () => {
    try {
      const rawUser =
        localStorage.getItem(
          "user"
        );

      if (!rawUser) {
        return null;
      }

      return JSON.parse(
        rawUser
      );

    } catch {
      return null;
    }
  };


  // =========================================================
  // BOOKING
  // =========================================================

  const handleBooking = () => {

    if (!canBook) {
      return;
    }


    const params =
      new URLSearchParams({
        fieldId:
          String(id),

        date:
          selectedDate,
      });


    const bookingUrl =
      `/booking?${params.toString()}`;


    const user =
      getCurrentUser();


    // =======================================================
    // NOT LOGGED IN
    // =======================================================

    if (!user?.UserID) {

      navigate(
        `/login?redirect=${encodeURIComponent(
          bookingUrl
        )}`
      );

      return;
    }


    // =======================================================
    // LOGGED IN
    // =======================================================

    navigate(
      bookingUrl
    );
  };


  return (
    <article className="field-card">

      <div
        className="field-card-cover"
        aria-hidden="true"
      >
        <span>
          SÂN BÓNG
        </span>
      </div>


      <div className="field-card-body">

        <div className="field-card-title-row">

          <div>
            <h2>
              {name || `Sân ${id}`}
            </h2>

            <p className="field-card-type">
              {type || "Sân bóng"}
            </p>
          </div>


          {fieldUnavailable && (
            <span className="field-status field-status-maintenance">
              Bảo trì
            </span>
          )}

        </div>


        <p className="field-card-address">
          {address ||
            "Chưa cập nhật địa chỉ"}
        </p>


        {minPrice !== null && (
          <p className="field-card-price">

            Từ{" "}

            <strong>
              {formatPrice(
                minPrice
              )}
              đ
            </strong>

            {" "}/ khung giờ

          </p>
        )}


        <div className="field-card-availability">

          {!selectedDate && (
            <p className="field-card-hint">
              Chọn ngày ở phía trên để kiểm tra lịch trống.
            </p>
          )}


          {selectedDate &&
            availabilityLoading && (
              <p className="field-card-hint">
                Đang kiểm tra lịch...
              </p>
            )}


          {selectedDate &&
            !availabilityLoading &&
            availabilityError && (
              <p className="field-card-error">
                {availabilityError}
              </p>
            )}


          {selectedDate &&
            !availabilityLoading &&
            !availabilityError &&
            fieldUnavailable && (
              <p className="field-card-error">
                Sân đang bảo trì và không thể đặt trong thời gian này.
              </p>
            )}


          {selectedDate &&
            !availabilityLoading &&
            !availabilityError &&
            !fieldUnavailable &&
            availabilityLoaded &&
            slots.length === 0 && (
              <p className="field-card-hint">
                Sân chưa có khung giá để đặt.
              </p>
            )}


          {selectedDate &&
            !availabilityLoading &&
            !availabilityError &&
            !fieldUnavailable &&
            availabilityLoaded &&
            slots.length > 0 && (

              <div className="field-slot-list">

                {slots.map(
                  (slot, index) => {

                    const available =
                      slot.available ===
                      true;


                    const slotKey =
                      slot.PriceID ??
                      `${slot.StartTime ||
                        slot.startTime}-${slot.EndTime ||
                        slot.endTime}-${index}`;


                    return (
                      <div
                        key={slotKey}
                        className={`field-slot ${
                          available
                            ? "field-slot-available"
                            : "field-slot-unavailable"
                        }`}
                      >

                        <div>

                          <strong>
                            {formatTime(
                              slot.StartTime ??
                              slot.startTime
                            )}

                            {" - "}

                            {formatTime(
                              slot.EndTime ??
                              slot.endTime
                            )}
                          </strong>


                          {(slot.Price ??
                            slot.price) !==
                            undefined && (

                            <span>
                              {formatPrice(
                                slot.Price ??
                                slot.price
                              )}
                              đ
                            </span>

                          )}

                        </div>


                        <span className="field-slot-state">
                          {available
                            ? "Trống"
                            : "Đã đặt"}
                        </span>

                      </div>
                    );
                  }
                )}

              </div>
            )}

        </div>


        <button
          type="button"
          className="field-card-booking-button"
          disabled={!canBook}
          onClick={handleBooking}
        >
          {fieldUnavailable
            ? "Sân đang bảo trì"
            : !selectedDate
              ? "Chọn ngày để đặt sân"
              : canBook
                ? "Đặt sân"
                : "Không có khung giờ trống"}
        </button>

      </div>

    </article>
  );
};


export default FieldCard;
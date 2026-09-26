export const PRICE_SLOTS = [
  {
    time: "06:00 - 09:00",
    start: "06:00",
    end: "09:00",
    price: 350000,
    note: "Buổi sáng",
  },
  {
    time: "09:00 - 16:00",
    start: "09:00",
    end: "16:00",
    price: 280000,
    note: "Giờ thấp điểm",
  },
  {
    time: "16:00 - 18:00",
    start: "16:00",
    end: "18:00",
    price: 400000,
    note: "Buổi chiều",
  },
  {
    time: "18:00 - 21:00",
    start: "18:00",
    end: "21:00",
    price: 650000,
    note: "Giờ cao điểm",
    highlight: true,
  },
  {
    time: "21:00 - 23:00",
    start: "21:00",
    end: "23:00",
    price: 450000,
    note: "Buổi tối",
  },
];

export const MIN_FIELD_PRICE = Math.min(
  ...PRICE_SLOTS.map((item) => item.price)
);

export function formatPrice(price) {
  return Number(price).toLocaleString("vi-VN");
}

function timeToMinutes(time) {
  const [hour, minute] = time
    .split(":")
    .map(Number);

  return hour * 60 + minute;
}

export function calculateBookingPrice(
  startTime,
  endTime
) {
  const bookingStart =
    timeToMinutes(startTime);

  const bookingEnd =
    timeToMinutes(endTime);

  let total = 0;

  PRICE_SLOTS.forEach((slot) => {
    const slotStart =
      timeToMinutes(slot.start);

    const slotEnd =
      timeToMinutes(slot.end);

    const overlapStart = Math.max(
      bookingStart,
      slotStart
    );

    const overlapEnd = Math.min(
      bookingEnd,
      slotEnd
    );

    if (overlapEnd > overlapStart) {
      const minutes =
        overlapEnd - overlapStart;

      const hours =
        minutes / 60;

      total += slot.price * hours;
    }
  });

  return total;
}
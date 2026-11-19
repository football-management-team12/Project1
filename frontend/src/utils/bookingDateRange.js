export function dateRangeError(from, to) {
  const valid = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= "1900-01-01" &&
      value <= "9998-12-31"
    );
  };
  if (!valid(from) || !valid(to)) return "Vui lòng chọn đủ ngày hợp lệ.";
  if (from > to) return "Từ ngày không được sau đến ngày.";
  return "";
}

export function formatBookingDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

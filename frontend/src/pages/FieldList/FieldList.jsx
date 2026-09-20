import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import Navbar from "../../components/Navbar/Navbar";
import FieldCard from "../../components/FieldCard/FieldCard";

import "./FieldList.css";

function FieldList() {
  const [fields, setFields] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [fieldType, setFieldType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("http://localhost:5000/api/fields")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Không thể kết nối đến server");
        }

        return response.json();
      })
      .then((result) => {
        if (result.success) {
          setFields(result.data);
        } else {
          setError(result.message || "Không thể lấy danh sách sân");
        }
      })
      .catch((error) => {
        console.error("Lỗi khi lấy danh sách sân:", error);
        setError("Không thể kết nối đến server");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const filteredFields = fields.filter((field) => {
    const matchKeyword = field.name
      .toLowerCase()
      .includes(keyword.toLowerCase());

    const matchLocation =
      location === "" || field.address === location;

    const matchFieldType =
      fieldType === "" || field.type === fieldType;

    return matchKeyword && matchLocation && matchFieldType;
  });

  const locations = [
    ...new Set(fields.map((field) => field.address)),
  ];

  const fieldTypes = [
    ...new Set(fields.map((field) => field.type)),
  ];

  const handleSearch = () => {
    // Bo loc da duoc xu ly truc tiep bang state.
    // Nut nay giu de nguoi dung chu dong thuc hien tim kiem.
  };

  return (
    <>
      <Navbar />

      <main className="field-list-page">
        <section className="field-filter-section">
          <div className="field-filter">

            {/* TEN SAN */}
            <div className="field-filter__group field-filter__name">
              <label>TÊN SÂN BÓNG</label>

              <div className="field-filter__input-wrapper">
                <Search size={19} />

                <input
                  type="text"
                  placeholder="Nhập tên sân..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
              </div>
            </div>

            {/* KHU VUC */}
            <div className="field-filter__group">
              <label>KHU VỰC</label>

              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              >
                <option value="">Tất cả khu vực</option>

                {locations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            {/* LOAI SAN */}
            <div className="field-filter__group">
              <label>LOẠI SÂN</label>

              <select
                value={fieldType}
                onChange={(e) => setFieldType(e.target.value)}
              >
                <option value="">Tất cả loại sân</option>

                {fieldTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            {/* TIM KIEM */}
            <button
              className="field-filter__submit"
              onClick={handleSearch}
            >
              <Search size={18} />
              Tìm sân
            </button>

          </div>
        </section>

        <section className="field-list-container">

          <div className="field-list__heading">
            <div>
              <h1>DANH SÁCH SÂN BÓNG</h1>

              <p>
                Tìm và đặt sân nhanh chóng, tiện lợi,
                đầy đủ dịch vụ tiện ích đi kèm
              </p>
            </div>

            {!loading && !error && (
              <span className="field-list__result">
                Tìm thấy {filteredFields.length} kết quả
              </span>
            )}
          </div>

          {/* LOADING */}
          {loading && (
            <div className="field-list__empty">
              <h2>Đang tải dữ liệu...</h2>
              <p>Vui lòng chờ trong giây lát.</p>
            </div>
          )}

          {/* ERROR */}
          {!loading && error && (
            <div className="field-list__empty">
              <h2>Không thể tải danh sách sân</h2>
              <p>{error}</p>
            </div>
          )}

          {/* DANH SACH SAN */}
          {!loading && !error && filteredFields.length > 0 && (
            <div className="field-list__grid">
              {filteredFields.map((field) => (
                <FieldCard
                  key={field.id}
                  id={field.id}
                  image={field.image}
                  name={field.name}
                  address={field.address}
                  type={field.type}
                />
              ))}
            </div>
          )}

          {/* KHONG CO KET QUA */}
          {!loading &&
            !error &&
            filteredFields.length === 0 && (
              <div className="field-list__empty">
                <Search size={40} />

                <h2>Không tìm thấy sân bóng</h2>

                <p>
                  Hãy thử thay đổi từ khóa hoặc bộ lọc.
                </p>
              </div>
            )}

        </section>
      </main>
    </>
  );
}

export default FieldList;
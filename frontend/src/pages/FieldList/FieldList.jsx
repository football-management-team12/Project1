import { useState } from "react";
import { Search } from "lucide-react";

import Navbar from "../../components/Navbar/Navbar";
import FieldCard from "../../components/FieldCard/FieldCard";

import field1 from "../../assets/images/football-field.jpg";

import "./FieldList.css";

const fields = [
  {
    id: 1,
    name: "Sân bóng Sport Link ABC",
    address: "Chu Văn An, Bình Thạnh, TP.HCM",
    type: "Sân cỏ nhân tạo 7 người",
    rating: 4.8,
    price: 300000,
    image: field1,
  },
  {
    id: 2,
    name: "Sân bóng B",
    address: "Đào Duy Từ, Quận 10, TP.HCM",
    type: "Sân tiêu chuẩn 11 người",
    rating: 4.9,
    price: 800000,
    image: field1,
  },
  {
    id: 3,
    name: "Sân bóng PT",
    address: "Lý Thường Kiệt, Quận 11, TP.HCM",
    type: "Sân 7 người / 5 người",
    rating: 4.7,
    price: 350000,
    image: field1,
  },
  {
    id: 4,
    name: "Sân bóng 789",
    address: "Bình Quới, Bình Thạnh, TP.HCM",
    type: "Sân 7 người ven sông",
    rating: 4.5,
    price: 280000,
    image: field1,
  },
  {
    id: 5,
    name: "Sân bóng Club",
    address: "Quốc Hương, Quận 2, TP.HCM",
    type: "Sân 5 người cao cấp",
    rating: 4.6,
    price: 400000,
    image: field1,
  },
  {
    id: 6,
    name: "Sân bóng Tân Bình Arena",
    address: "Cộng Hòa, Tân Bình, TP.HCM",
    type: "Sân 7 người mái che",
    rating: 4.4,
    price: 320000,
    image: field1,
  },
];

function FieldList() {
  const [keyword, setKeyword] = useState("");

  const filteredFields = fields.filter((field) =>
    field.name
      .toLowerCase()
      .includes(keyword.toLowerCase())
  );

  return (
    <>
      <Navbar />

      <main className="field-list-page">
        <section className="field-filter-section">
          <div className="field-filter">

            <div className="field-filter__group field-filter__name">
              <label>TÊN SÂN BÓNG</label>

              <div className="field-filter__input-wrapper">
                <Search size={19} />

                <input
                  type="text"
                  placeholder="Nhập tên sân (vd: Phú Thọ, Tân Bình...)"
                  value={keyword}
                  onChange={(e) =>
                    setKeyword(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="field-filter__group">
              <label>KHU VỰC</label>

              <select>
                <option>Tất cả quận huyện</option>
                <option>Bình Thạnh</option>
                <option>Tân Bình</option>
                <option>Quận 10</option>
                <option>Quận 11</option>
              </select>
            </div>

            <div className="field-filter__group">
              <label>LOẠI SÂN</label>

              <select>
                <option>Sân 7 người</option>
                <option>Sân 5 người</option>
                <option>Sân 11 người</option>
              </select>
            </div>

            <button className="field-filter__submit">
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

            <span className="field-list__result">
              Tìm thấy {filteredFields.length} kết quả
            </span>
          </div>

          <div className="field-list__grid">
            {filteredFields.map((field) => (
              <FieldCard
                key={field.id}
                id={field.id}
                image={field.image}
                name={field.name}
                address={field.address}
                type={field.type}
                rating={field.rating}
                price={field.price}
              />
            ))}
          </div>

        </section>
      </main>
    </>
  );
}

export default FieldList;
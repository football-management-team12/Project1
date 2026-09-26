import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import Navbar from "../../components/Navbar/Navbar";
import FieldCard from "../../components/FieldCard/FieldCard";

import fields from "../../data/fields";
import { MIN_FIELD_PRICE } from "../../utils/pricing";

import "./FieldList.css";

function FieldList() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("Sân 7 người");

  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchStatus, setSearchStatus] = useState("all");
  const [searchType, setSearchType] =
    useState("Sân 7 người");

  const [currentPage, setCurrentPage] = useState(1);

  const itemsPerPage = 8;

  const filteredFields = useMemo(() => {
    return fields.filter((field) => {
      const matchKeyword = field.name
        .toLowerCase()
        .includes(searchKeyword.toLowerCase());

      const matchStatus =
        searchStatus === "all" ||
        field.status === searchStatus;

      const matchType =
        searchType === "all" ||
        field.type === searchType;

      return (
        matchKeyword &&
        matchStatus &&
        matchType
      );
    });
  }, [
    searchKeyword,
    searchStatus,
    searchType,
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(
      filteredFields.length / itemsPerPage
    )
  );

  const displayedFields = filteredFields.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSearch = (event) => {
    event.preventDefault();

    setSearchKeyword(keyword);
    setSearchStatus(status);
    setSearchType(type);
    setCurrentPage(1);
  };

  return (
    <>
      <Navbar />

      <main className="field-list-page">
        <section className="field-filter-section">
          <form
            className="field-filter"
            onSubmit={handleSearch}
          >
            <div className="field-filter__group field-filter__name">
              <label>
                SỐ/TÊN SÂN
              </label>

              <div className="field-filter__input-wrapper">
                <Search size={18} />

                <input
                  type="text"
                  placeholder="Nhập số/tên sân (vd: Sân 01, Sân 02...)"
                  value={keyword}
                  onChange={(e) =>
                    setKeyword(e.target.value)
                  }
                />
              </div>
            </div>

            <div className="field-filter__group">
              <label>
                TRẠNG THÁI
              </label>

              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value)
                }
              >
                <option value="all">
                  Tất cả trạng thái
                </option>

                <option value="Còn sân">
                  Còn sân
                </option>

                <option value="Đang sửa chữa">
                  Đang sửa chữa
                </option>
              </select>
            </div>

            <div className="field-filter__group">
              <label>
                LOẠI SÂN
              </label>

              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value)
                }
              >
                <option value="all">
                  Tất cả loại sân
                </option>

                <option value="Sân 5 người">
                  Sân 5 người
                </option>

                <option value="Sân 7 người">
                  Sân 7 người
                </option>

                <option value="Sân 11 người">
                  Sân 11 người
                </option>
              </select>
            </div>

            <button
              type="submit"
              className="field-filter__submit"
            >
              <Search size={18} />
              Tìm sân
            </button>
          </form>
        </section>

        <section className="field-list-container">
          <div className="field-list__heading">
            <div>
              <h1>
                DANH SÁCH SÂN
              </h1>

              <p>
                Tìm và đặt sân nhanh chóng,
                tiện lợi, đầy đủ dịch vụ tiện
                ích đi kèm
              </p>
            </div>

            <span className="field-list__result">
              Tổng cộng {filteredFields.length} sân
            </span>
          </div>

          {displayedFields.length > 0 ? (
            <div className="field-list__grid">
              {displayedFields.map(
                (field) => (
                  <FieldCard
                    key={field.id}
                    id={field.id}
                    image={field.image}
                    name={field.name}
                    status={field.status}
                    type={field.type}
                    rating={field.rating}
                    price={MIN_FIELD_PRICE}
                  />
                )
              )}
            </div>
          ) : (
            <div className="field-list__empty">
              <Search size={42} />

              <h2>
                Không tìm thấy sân
              </h2>

              <p>
                Hãy thử thay đổi tiêu chí
                tìm kiếm.
              </p>
            </div>
          )}

          {filteredFields.length > 0 && (
            <div className="field-pagination">
              <button
                type="button"
                className="field-pagination__navigation"
                disabled={currentPage === 1}
                onClick={() =>
                  setCurrentPage(
                    Math.max(
                      currentPage - 1,
                      1
                    )
                  )
                }
              >
                ‹
                <span>
                  Trang trước
                </span>
              </button>

              {Array.from(
                {
                  length: totalPages,
                },
                (_, index) => index + 1
              ).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() =>
                    setCurrentPage(page)
                  }
                  className={`field-pagination__page ${
                    currentPage === page
                      ? "field-pagination__page--active"
                      : ""
                  }`}
                >
                  {page}
                </button>
              ))}

              <button
                type="button"
                className="field-pagination__navigation"
                disabled={
                  currentPage === totalPages
                }
                onClick={() =>
                  setCurrentPage(
                    Math.min(
                      currentPage + 1,
                      totalPages
                    )
                  )
                }
              >
                <span>
                  Trang sau
                </span>
                ›
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default FieldList;

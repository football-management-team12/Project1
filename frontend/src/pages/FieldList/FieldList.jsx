import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { Search } from "lucide-react";

import Navbar from "../../components/Navbar/Navbar";
import FieldCard from "../../components/FieldCard/FieldCard";
import { getFields } from "../../services/field_service";

import "./FieldList.css";

function FieldList() {
  const [fields, setFields] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [fieldType, setFieldType] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadFields();
  }, []);

  const loadFields = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getFields();

      const grouped = Object.values(
        data.reduce((result, row) => {
          if (!result[row.FieldID]) {
            result[row.FieldID] = {
              FieldID: row.FieldID,
              FieldName: row.FieldName,
              FieldType: row.FieldType,
              Location: row.Location,
              Status: row.Status,
              prices: [],
            };
          }

          if (
            row.PriceID !== null &&
            row.PriceID !== undefined
          ) {
            result[row.FieldID].prices.push({
              PriceID: row.PriceID,
              StartTime: row.StartTime?.slice(0, 5),
              EndTime: row.EndTime?.slice(0, 5),
              Price: Number(row.Price || 0),
            });
          }

          return result;
        }, {})
      );

      setFields(grouped);
    } catch (loadError) {
      console.error(loadError);

      setError(
        loadError.message ||
        "Không thể tải danh sách sân bóng"
      );
    } finally {
      setLoading(false);
    }
  };

  const locations = useMemo(
    () => [
      ...new Set(
        fields
          .map((field) => field.Location)
          .filter(Boolean)
      ),
    ],
    [fields]
  );

  const fieldTypes = useMemo(
    () => [
      ...new Set(
        fields
          .map((field) => field.FieldType)
          .filter(Boolean)
      ),
    ],
    [fields]
  );

  const filteredFields = useMemo(() => {
    const normalizedKeyword = keyword
      .trim()
      .toLowerCase();

    return fields.filter((field) => {
      const fieldName = String(
        field.FieldName || ""
      ).toLowerCase();

      const matchKeyword = fieldName.includes(
        normalizedKeyword
      );

      const matchLocation =
        !location || field.Location === location;

      const matchType =
        !fieldType || field.FieldType === fieldType;

      return (
        matchKeyword &&
        matchLocation &&
        matchType
      );
    });
  }, [
    fields,
    keyword,
    location,
    fieldType,
  ]);

  return (
    <>
      <Navbar />

      <main className="field-list-page">
        <section className="field-filter-section">
          <div className="field-filter">

            <div className="field-filter__group field-filter__name">
              <label>TÊN SÂN BÓNG</label>

              <div className="field-filter__input-wrapper">
                <Search size={18} />

                <input
                  type="text"
                  placeholder="Nhập tên sân..."
                  value={keyword}
                  onChange={(event) =>
                    setKeyword(event.target.value)
                  }
                />
              </div>
            </div>

            <div className="field-filter__group">
              <label>KHU VỰC</label>

              <select
                value={location}
                onChange={(event) =>
                  setLocation(event.target.value)
                }
              >
                <option value="">
                  Tất cả khu vực
                </option>

                {locations.map((item) => (
                  <option
                    key={item}
                    value={item}
                  >
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-filter__group">
              <label>LOẠI SÂN</label>

              <select
                value={fieldType}
                onChange={(event) =>
                  setFieldType(event.target.value)
                }
              >
                <option value="">
                  Tất cả loại sân
                </option>

                {fieldTypes.map((type) => (
                  <option
                    key={type}
                    value={type}
                  >
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="field-filter__submit"
              onClick={loadFields}
            >
              <Search size={18} />
              Tìm sân
            </button>

          </div>
        </section>

        <section className="field-list-container">
          <div className="field-list__heading">

            <div>
              <h1>
                DANH SÁCH SÂN BÓNG
              </h1>

              <p>
                Chọn sân để xem lịch trống theo ngày và đặt sân.
              </p>
            </div>

            <span className="field-list__result">
              Tìm thấy {filteredFields.length} sân
            </span>

          </div>

          {loading ? (
            <div className="field-list__empty">
              <div className="field-loading-spinner" />

              <h2>
                Đang tải danh sách sân...
              </h2>
            </div>
          ) : error ? (
            <div className="field-list__empty">
              <h2>
                Không thể tải dữ liệu
              </h2>

              <p>
                {error}
              </p>

              <button
                type="button"
                onClick={loadFields}
              >
                Thử lại
              </button>
            </div>
          ) : filteredFields.length === 0 ? (
            <div className="field-list__empty">
              <h2>
                Không tìm thấy sân
              </h2>

              <p>
                Hãy thử thay đổi bộ lọc.
              </p>
            </div>
          ) : (
            <div className="field-list__grid">

              {filteredFields.map((field) => (
                <FieldCard
                  key={field.FieldID}
                  id={field.FieldID}
                  name={field.FieldName}
                  address={field.Location}
                  type={field.FieldType}
                  status={field.Status}
                  slots={field.prices}
                />
              ))}

            </div>
          )}
        </section>
      </main>
    </>
  );
}

export default FieldList;
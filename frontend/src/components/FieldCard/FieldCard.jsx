import { Link } from "react-router-dom";
import "./FieldCard.css";

function LocationIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function FieldCard({
  image,
  name,
  address,
  price,
  type = "Sân 7 Người",
}) {
  return (
    <article className="field-card">
      <div className="field-image-wrapper">
        <img
          src={image}
          alt={name}
          className="field-image"
        />

        <span className="field-type">
          {type}
        </span>
      </div>

      <div className="field-content">
        <h3>{name}</h3>

        <div className="field-address">
          <LocationIcon />
          <span>{address}</span>
        </div>

        <div className="field-divider"></div>

        <div className="field-bottom">
          <div>
            <span className="price-label">
              Giá từ
            </span>

            <strong>
              {price}/giờ
            </strong>
          </div>

          <Link
            to="/san-bong"
            className="field-detail-button"
          >
            Chi tiết
          </Link>
        </div>
      </div>
    </article>
  );
}

export default FieldCard;
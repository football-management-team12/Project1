import { Link } from "react-router-dom";
import {
  MapPin,
  Users,
  Star,
} from "lucide-react";

import "./FieldCard.css";

function FieldCard({
  id,
  image,
  name,
  address,
  price,
  type = "Sân 7 người",
  rating = 4.8,
}) {
  return (
    <article className="field-card">
      <div className="field-image-wrapper">
        <img
          src={image}
          alt={name}
          className="field-image"
        />
      </div>

      <div className="field-content">
        <div className="field-title-row">
          <h3 title={name}>
            {name}
          </h3>

          <div className="field-rating">
            <Star
              size={17}
              fill="currentColor"
            />
            <span>{rating}</span>
          </div>
        </div>

        <div className="field-info">
          <div className="field-info-row">
            <MapPin size={16} />
            <span>{address}</span>
          </div>

          <div className="field-info-row">
            <Users size={16} />
            <span>{type}</span>
          </div>
        </div>

        <div className="field-divider" />

        <div className="field-bottom">
          <div>
            <span className="price-label">
              GIÁ THUÊ TỪ
            </span>

            <strong>
              {typeof price === "number"
                ? price.toLocaleString("vi-VN")
                : price}
              đ/h
            </strong>
          </div>

          <Link
            to={id ? `/fields/${id}` : "/fields"}
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
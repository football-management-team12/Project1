"""Shared, validated query filters for public field list/availability."""
import re


def parse_field_type(args):
    values = args.getlist("FieldType") + args.getlist("fieldType")
    if not values:
        return None
    if len(values) != 1:
        raise ValueError("Chỉ truyền một bộ lọc FieldType")
    match = re.fullmatch(r"(5|7|11)(?:\s+player)?", values[0].strip(), re.IGNORECASE)
    if not match:
        raise ValueError("FieldType chỉ nhận 5, 7, 11 hoặc 5 player, 7 player, 11 player")
    return match.group(1)


def field_type_clause(field_type, column="FieldType"):
    # column is a hard-coded server identifier, never request input.
    if field_type is None:
        return "", ()
    return f" AND LOWER(LTRIM(RTRIM({column}))) IN (?, ?)", (field_type, f"{field_type} player")


def parse_available_only(args):
    values = args.getlist("availableOnly")
    if not values:
        return False
    if len(values) != 1 or values[0].lower() not in ("true", "false"):
        raise ValueError("availableOnly phải là true hoặc false")
    return values[0].lower() == "true"

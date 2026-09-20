from database import get_connection


def get_all_fields():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT
            FieldID,
            FieldName,
            Location,
            FieldType,
            Description,
            Image,
            Status
        FROM dbo.FootballFields
        WHERE Status = 'AVAILABLE'
    """)

    rows = cursor.fetchall()

    fields = []

    for row in rows:
        fields.append({
            "id": row.FieldID,
            "name": row.FieldName,
            "address": row.Location,
            "type": row.FieldType,
            "description": row.Description,
            "image": row.Image,
            "status": row.Status
        })

    cursor.close()
    conn.close()

    return fields
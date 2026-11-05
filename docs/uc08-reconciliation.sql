-- UC08 evidence query: SELECT only. No fixtures or production data are modified.
SELECT
    B.BookingID, I.InvoiceID, B.TotalAmount,
    COALESCE(SUM(CASE WHEN P.Status = 'SUCCESS' AND P.PaymentType = 'DEPOSIT'
        THEN P.Amount ELSE 0 END), 0) AS DepositAmount,
    COALESCE(SUM(CASE WHEN P.Status = 'SUCCESS'
        AND P.PaymentType IN ('DEPOSIT', 'FINAL_PAYMENT')
        THEN P.Amount ELSE 0 END), 0) AS PaidAmount,
    B.TotalAmount - COALESCE(SUM(CASE WHEN P.Status = 'SUCCESS'
        AND P.PaymentType IN ('DEPOSIT', 'FINAL_PAYMENT')
        THEN P.Amount ELSE 0 END), 0) AS RemainingAmount,
    F.FieldID, F.IsArchived
FROM Bookings B
LEFT JOIN Invoices I ON I.BookingID = B.BookingID
LEFT JOIN Payments P ON P.BookingID = B.BookingID
LEFT JOIN FootballFields F ON F.FieldID = B.FieldID
GROUP BY B.BookingID, I.InvoiceID, B.TotalAmount, F.FieldID, F.IsArchived
ORDER BY B.BookingID;

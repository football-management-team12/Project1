-- Append-only history for attendance, corrected cancellations and reused audits.
IF OBJECT_ID('dbo.BookingOperationEvents', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BookingOperationEvents (
        EventID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        BookingID INT NOT NULL REFERENCES dbo.Bookings(BookingID),
        EventType VARCHAR(40) NOT NULL,
        ActorUserID INT NOT NULL REFERENCES dbo.Users(UserID),
        OccurredAt DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        Details NVARCHAR(MAX) NOT NULL,
        CONSTRAINT CK_BookingOperationEventJson CHECK (ISJSON(Details)=1)
    );
    CREATE INDEX IX_BookingOperations_Booking ON dbo.BookingOperationEvents(BookingID,EventID DESC);
END;

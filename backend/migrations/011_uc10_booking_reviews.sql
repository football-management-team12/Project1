-- UC10 additive migration. Run in SSMS on the database used by this backend.
-- Does not modify Bookings, Payments, Invoices or existing customer data.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dbo.BookingReviews', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.BookingReviews (
            ReviewID INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_BookingReviews PRIMARY KEY,
            BookingID INT NOT NULL CONSTRAINT FK_BookingReviews_Bookings REFERENCES dbo.Bookings(BookingID),
            UserID INT NOT NULL CONSTRAINT FK_BookingReviews_Users REFERENCES dbo.Users(UserID),
            FieldID INT NOT NULL CONSTRAINT FK_BookingReviews_Fields REFERENCES dbo.FootballFields(FieldID),
            Rating TINYINT NOT NULL CONSTRAINT CK_BookingReviews_Rating CHECK (Rating BETWEEN 1 AND 5),
            Comment NVARCHAR(1000) NOT NULL CONSTRAINT CK_BookingReviews_Comment
                CHECK (LEN(LTRIM(RTRIM(Comment))) BETWEEN 1 AND 1000),
            CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_BookingReviews_CreatedAt DEFAULT SYSUTCDATETIME(),
            CONSTRAINT UQ_BookingReviews_Booking UNIQUE (BookingID)
        );
        CREATE INDEX IX_BookingReviews_Field_Created
            ON dbo.BookingReviews(FieldID,CreatedAt DESC,ReviewID DESC)
            INCLUDE (Rating);
    END
    ELSE IF COL_LENGTH('dbo.BookingReviews','ReviewID') IS NULL
         OR COL_LENGTH('dbo.BookingReviews','BookingID') IS NULL
         OR COL_LENGTH('dbo.BookingReviews','UserID') IS NULL
         OR COL_LENGTH('dbo.BookingReviews','FieldID') IS NULL
         OR COL_LENGTH('dbo.BookingReviews','Rating') IS NULL
         OR COL_LENGTH('dbo.BookingReviews','Comment') IS NULL
         OR COL_LENGTH('dbo.BookingReviews','CreatedAt') IS NULL
    BEGIN
        THROW 50010, 'BookingReviews exists with an incompatible schema. Inspect before applying UC10.', 1;
    END;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
SELECT DB_NAME() AS TargetDatabase, OBJECT_ID(N'dbo.BookingReviews',N'U') AS ReviewsTableID;

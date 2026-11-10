-- UC10 ADMIN replies. Apply 011 first, then run this file on the backend's DB.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dbo.BookingReviews',N'U') IS NULL
        THROW 50012, 'Apply migration 011 before 012.', 1;
    IF OBJECT_ID(N'dbo.BookingReviewReplies',N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.BookingReviewReplies (
            ReviewID INT NOT NULL CONSTRAINT PK_BookingReviewReplies PRIMARY KEY
                CONSTRAINT FK_BookingReviewReplies_Review REFERENCES dbo.BookingReviews(ReviewID),
            AdminUserID INT NOT NULL CONSTRAINT FK_BookingReviewReplies_Admin REFERENCES dbo.Users(UserID),
            Comment NVARCHAR(1000) NOT NULL CONSTRAINT CK_BookingReviewReplies_Comment
                CHECK (LEN(LTRIM(RTRIM(Comment))) BETWEEN 1 AND 1000),
            CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_BookingReviewReplies_Created DEFAULT SYSUTCDATETIME(),
            UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_BookingReviewReplies_Updated DEFAULT SYSUTCDATETIME()
        );
    END
    ELSE IF COL_LENGTH('dbo.BookingReviewReplies','ReviewID') IS NULL
         OR COL_LENGTH('dbo.BookingReviewReplies','AdminUserID') IS NULL
         OR COL_LENGTH('dbo.BookingReviewReplies','Comment') IS NULL
         OR COL_LENGTH('dbo.BookingReviewReplies','CreatedAt') IS NULL
         OR COL_LENGTH('dbo.BookingReviewReplies','UpdatedAt') IS NULL
        THROW 50013, 'BookingReviewReplies exists with an incompatible schema. Inspect before applying 012.', 1;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
SELECT DB_NAME() AS TargetDatabase,OBJECT_ID(N'dbo.BookingReviewReplies',N'U') AS RepliesTableID;

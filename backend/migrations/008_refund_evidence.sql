-- Existing refunds stay intact; evidence is mandatory for new confirmations in API.
IF COL_LENGTH('dbo.BookingDepositRefunds', 'TransactionReference') IS NULL
    ALTER TABLE dbo.BookingDepositRefunds ADD TransactionReference NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.BookingDepositRefunds', 'EvidenceData') IS NULL
    ALTER TABLE dbo.BookingDepositRefunds ADD EvidenceData VARBINARY(MAX) NULL;
IF COL_LENGTH('dbo.BookingDepositRefunds', 'EvidenceMimeType') IS NULL
    ALTER TABLE dbo.BookingDepositRefunds ADD EvidenceMimeType VARCHAR(40) NULL;
IF COL_LENGTH('dbo.BookingDepositRefunds', 'EvidenceFileName') IS NULL
    ALTER TABLE dbo.BookingDepositRefunds ADD EvidenceFileName NVARCHAR(150) NULL;

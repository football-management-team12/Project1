-- SQL Server: preserve existing requests; older requests have no refund account.
IF COL_LENGTH('dbo.BookingCancellationRequests', 'RefundBankName') IS NULL
    ALTER TABLE dbo.BookingCancellationRequests ADD RefundBankName NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.BookingCancellationRequests', 'RefundAccountNumber') IS NULL
    ALTER TABLE dbo.BookingCancellationRequests ADD RefundAccountNumber VARCHAR(34) NULL;
IF COL_LENGTH('dbo.BookingCancellationRequests', 'RefundAccountHolder') IS NULL
    ALTER TABLE dbo.BookingCancellationRequests ADD RefundAccountHolder NVARCHAR(100) NULL;

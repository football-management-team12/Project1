-- UC15: run against the application's database before starting the new backend.
-- Existing fields, prices, bookings, payments and archive metadata are preserved.
SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.FootballFields', 'IsArchived') IS NULL
    ALTER TABLE dbo.FootballFields ADD IsArchived BIT NOT NULL
        CONSTRAINT DF_UC15_Fields_IsArchived DEFAULT (0) WITH VALUES;

IF COL_LENGTH('dbo.FootballFields', 'ArchivedAt') IS NULL
    ALTER TABLE dbo.FootballFields ADD ArchivedAt DATETIME2(0) NULL;

IF COL_LENGTH('dbo.FootballFields', 'ArchivedBy') IS NULL
    ALTER TABLE dbo.FootballFields ADD ArchivedBy INT NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints D
    INNER JOIN sys.columns C ON C.object_id=D.parent_object_id AND C.column_id=D.parent_column_id
    WHERE D.parent_object_id=OBJECT_ID('dbo.FootballFields') AND C.name='IsArchived'
)
    ALTER TABLE dbo.FootballFields ADD CONSTRAINT DF_UC15_Fields_IsArchived DEFAULT (0) FOR IsArchived;

COMMIT TRANSACTION;

# PostgreSQL operations

PostgreSQL is the only application runtime store. Provision a dedicated role and database; restrict the listener and require TLS with certificate verification for remote connections. See `.env.example` for non-secret configuration.

## Migrations

Startup takes a schema advisory lock and applies transactional, checksummed migrations. `schema_migrations` tracks structural versions; `data_migrations` tracks release data cleanup independently. Do not edit applied contracts in place. Back up before upgrading and verify a candidate against synthetic legacy records.

For 0.20.0, retired settings are removed from session/preferences configuration, obsolete game/demo records are deleted, game invitations are revoked, old game views become neutral retained notices, and obsolete rendering metrics are removed. Display revisions and unrelated source records are preserved. Tolerant reads also handle historical shapes without making them valid publishing inputs.

## Backups

`npm run backup -- --out /path/to/private-backups/new-backup.dump` creates and verifies a new custom-format PostgreSQL dump; the destination must not already exist. Use private output directories outside the checkout and a service-owned credential file. Retain schema, data and roles needed for recovery; test restoration into an isolated database before trusting a backup. Never point tests at the production database.

## One-way legacy import

`npm run migrate:sqlite -- --from /path/to/private-snapshot.sqlite` supports the known legacy schema only. Stop the target application and use an empty PostgreSQL database. The importer snapshots SQLite consistently, checks integrity/table shapes, imports every source table transactionally and verifies row counts/fingerprints before commit. Startup then applies current data cleanup. There is no SQLite runtime or SQLite backup command.

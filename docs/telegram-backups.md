# Telegram backups

Administrators configure backups on the **Integrations** page.

## Telegram setup

1. Create a bot through `@BotFather` and copy its token.
2. Add the bot to the target private chat, group, or channel. For a channel, grant the bot permission to post messages.
3. Enter the numeric chat ID (for example, `-100...`) or the channel `@username`.
4. Save the integration. The server validates both the bot token and the target chat before storing the token encrypted.

The standard Telegram Bot API accepts documents up to 50 MB. MT Workspace keeps a small safety margin and rejects a larger generated archive with a visible error instead of attempting a partial backup.

## Backup contents

The generated `mt-workspace-backup_<date>.tar.gz` archive contains:

- `manifest.json` with the creation date, build revision, schema version, checksums, and an HMAC signature;
- `database.json` with all application tables except the migration ledger;
- `media/` with catalog media files.

The HMAC key and integration encryption key are derived from `JWT_SECRET`. Keep that secret stable: an archive from another installation or from the same installation after changing `JWT_SECRET` is intentionally rejected.

## Automatic schedule

Automatic backups can run daily or weekly at a selected local time. The IANA timezone is stored with the schedule so daylight-saving changes are calculated correctly. A worker checks due schedules once per minute and records every successful or failed attempt in `backup_runs`.

## Restore

Restore is admin-only and accepts the original `.tar.gz` archive. Before changing data, the server validates the format, HMAC signature, database checksum, and every media checksum. During restore the workspace enters maintenance mode. Media are staged with rollback copies, and database replacement runs in one PostgreSQL transaction. If validation or the database transaction fails, the original media are restored.

The reverse proxy permits restore uploads up to 55 MB, matching Telegram's document limit with protocol overhead.

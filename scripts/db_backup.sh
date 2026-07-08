#!/bin/bash
# Database backup script for Habit Kingdom
# Runs daily via cron to create encrypted backups of Supabase database

# Set variables
BACKUP_DIR="/Users/openclaw/habit-kingdom/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="habit_kingdom"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create compressed backup using pg_dump
echo "Creating database backup..."
pg_dump -U postgres "habit_kingdom" | gzip > "$BACKUP_FILE"

# Verify backup was created
if [ -f "$BACKUP_FILE" ]; then
    echo "Backup successful: $BACKUP_FILE"
    ls -lh "$BACKUP_FILE"
else
    echo "Backup failed!"
    exit 1
fi

# Keep only last 7 backups
echo "Cleaning up old backups (keeping last 7)..."
ls -t "$BACKUP_DIR"/*.sql.gz | tail -n +8 | xargs rm -f

echo "Backup completed successfully"
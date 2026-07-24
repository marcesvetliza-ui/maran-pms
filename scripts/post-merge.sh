#!/bin/bash
set -e

npm install

# drizzle-kit push can prompt for confirmation when adding constraints to
# existing tables. Pipe a newline so it always picks the safe default
# ("add the constraint without truncating the table") without hanging.
printf '\n' | npm run db:push

#!/bin/bash
# Uploads the landing page (site/) to www.vulkara.net at all-inkl over FTPS or SFTP (lftp, mirror: files gone from
# site/ are removed there too). Refuses while the legal pages still have placeholders.
#   FTP_HOST=w0123456.kasserver.com FTP_USER=... FTP_PASSWORD=... [FTP_DIR=/] [FTP_PROTOCOL=ftps|sftp] bash tools/deploy_site.sh
# SFTP when FTP_PROTOCOL=sftp or the user name starts with "sftp" (an SFTP account of the KAS); its host key is kept at
# the first connection and checked from then on. Use an account of its own, limited to the website's folder.
# On a Mac: brew install lftp
set -euo pipefail
cd "$(dirname "$0")/.."
: "${FTP_HOST:?}" "${FTP_USER:?}" "${FTP_PASSWORD:?}"
node tools/build_site_pages.mjs
node tools/build_site.mjs
if grep -rl '{{' site --include=*.html; then
  echo "Placeholders left in the pages above (site/legal.local.json or VK_LEGAL): not uploaded." >&2
  exit 1
fi
PROTOCOL=${FTP_PROTOCOL:-$([[ $FTP_USER == sftp* ]] && echo sftp || echo ftps)}
if [ "$PROTOCOL" = sftp ]; then
  URL="sftp://$FTP_HOST"
  SETTINGS="set sftp:connect-program 'ssh -a -x -o StrictHostKeyChecking=accept-new';"
else
  URL="ftp://$FTP_HOST"
  SETTINGS="set ftp:ssl-force true; set ftp:ssl-protect-data true; set ssl:verify-certificate true;"
fi
# the password reaches lftp in its environment, not on the command line (where other processes could read it)
export LFTP_PASSWORD="$FTP_PASSWORD"
lftp -e "
  $SETTINGS set net:max-retries 2;
  open --env-password -u '$FTP_USER' '$URL';
  mirror --reverse --delete --verbose --exclude-glob legal.local.json site/ ${FTP_DIR:-.};
  quit"
echo "uploaded to $FTP_HOST ${FTP_DIR:-.} over $PROTOCOL"

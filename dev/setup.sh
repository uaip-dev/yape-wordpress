#!/bin/sh
# One-time setup of the local site: install WordPress, activate the plugin, import a
# generated sample PDF and create a test page. Run from anywhere: sh dev/setup.sh
set -e
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1 # Git Bash on Windows: don't rewrite container paths.

wp() { docker compose run --rm -T cli wp "$@"; }

# Wait for the web container to copy WordPress into the shared volume.
i=0
until docker compose exec -T wordpress test -f /var/www/html/wp-includes/version.php 2>/dev/null; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "WordPress files did not appear"; exit 1; }
  sleep 2
done

# Strong random admin password (security plugins reject weak ones), kept in the
# git-ignored dev/.data/admin-password.txt.
mkdir -p .data
PASSFILE=.data/admin-password.txt
[ -s "$PASSFILE" ] || node -e "process.stdout.write(require('crypto').randomBytes(18).toString('base64url'))" > "$PASSFILE"
ADMIN_PASS=$(cat "$PASSFILE")

if ! wp core is-installed >/dev/null 2>&1; then
  wp core install --url=http://localhost:8095 --title="YAPE dev" \
    --admin_user=admin --admin_password="$ADMIN_PASS" --admin_email=admin@example.com --skip-email
else
  wp user update admin --user_pass="$ADMIN_PASS" --skip-email >/dev/null
fi
wp rewrite structure '/%postname%/' --hard >/dev/null
wp plugin activate uaip-yet-another-pdf-editor

if [ -z "$(wp post list --post_type=page --name=viewer-test --field=ID)" ]; then
  node make-sample-pdf.mjs .data/sample.pdf
  docker compose exec -T -u 33 wordpress mkdir -p /var/www/html/wp-content/uploads
  docker compose cp .data/sample.pdf wordpress:/var/www/html/wp-content/uploads/yape-sample-src.pdf
  docker compose exec -T wordpress chown 33:33 /var/www/html/wp-content/uploads/yape-sample-src.pdf
  ID=$(wp media import /var/www/html/wp-content/uploads/yape-sample-src.pdf --title="Sample document" --porcelain | tr -d '\r')
  URL=$(wp post get "$ID" --field=guid | tr -d '\r')
  CONTENT="<!-- wp:paragraph --><p>Block:</p><!-- /wp:paragraph -->
<!-- wp:yape/pdf {\"id\":$ID,\"url\":\"$URL\",\"title\":\"Sample document\"} /-->
<!-- wp:paragraph --><p>Shortcode, 500px, no download, click to load:</p><!-- /wp:paragraph -->
<!-- wp:shortcode -->[yape_pdf id=\"$ID\" height=\"500px\" download=\"no\" load=\"click\"]<!-- /wp:shortcode -->"
  wp post create --post_type=page --post_status=publish --post_title="Viewer test" --post_name=viewer-test --post_content="$CONTENT" --porcelain
fi
echo "Site ready: http://localhost:8095/viewer-test/  (user: admin, password in dev/.data/admin-password.txt)"

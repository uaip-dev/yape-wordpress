<?php
/**
 * Plugin Name:       UAIP Yet Another PDF Editor
 * Plugin URI:        https://github.com/uaip-dev/yape-wordpress
 * Description:       PDF viewer and editor for WordPress. Visitors can read, search, highlight, draw, add text, sign and fill in PDFs in the browser, then download their copy. Free, no premium version.
 * Version:           0.1.0
 * Requires at least: 6.5
 * Requires PHP:      7.4
 * Author:            UAIP
 * Author URI:        https://uaip.dev/
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       uaip-yet-another-pdf-editor
 *
 * @package YetAnotherPdfEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'YAPE_VERSION', '0.1.0' );
define( 'YAPE_FILE', __FILE__ );
define( 'YAPE_DIR', plugin_dir_path( __FILE__ ) );
define( 'YAPE_URL', plugin_dir_url( __FILE__ ) );
define( 'YAPE_BASENAME', plugin_basename( __FILE__ ) );

spl_autoload_register(
	static function ( $class_name ) {
		if ( 0 !== strpos( $class_name, 'Yape_' ) ) {
			return;
		}
		$file = 'class-' . str_replace( '_', '-', strtolower( $class_name ) ) . '.php';
		foreach ( array( 'includes/', 'includes/admin/' ) as $dir ) {
			$path = YAPE_DIR . $dir . $file;
			if ( is_readable( $path ) ) {
				require_once $path;
				return;
			}
		}
	}
);

register_activation_hook( __FILE__, array( 'Yape_Settings', 'install_defaults' ) );

add_action(
	'plugins_loaded',
	static function () {
		Yape_Plugin::instance()->boot();
	}
);

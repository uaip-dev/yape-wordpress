<?php
/**
 * Uninstall: removes settings only when the site owner opted in.
 * PDFs in the Media Library are never touched.
 *
 * @package YetAnotherPdfEditor
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/**
 * Deletes this plugin's data for the current site if "Delete settings on uninstall" is on.
 */
function yape_uninstall_site() {
	$settings = get_option( 'yape_settings', array() );
	if ( is_array( $settings ) && ! empty( $settings['delete_data'] ) ) {
		delete_option( 'yape_settings' );
	}
}

if ( is_multisite() ) {
	foreach ( get_sites(
		array(
			'fields' => 'ids',
			'number' => 0,
		)
	) as $yape_site_id ) {
		switch_to_blog( $yape_site_id );
		yape_uninstall_site();
		restore_current_blog();
	}
} else {
	yape_uninstall_site();
}

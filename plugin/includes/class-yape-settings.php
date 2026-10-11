<?php
/**
 * Settings storage: one option holding every setting.
 *
 * @package YetAnotherPdfEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reads and sanitises the `yape_settings` option.
 */
final class Yape_Settings {

	const OPTION = 'yape_settings';

	const TOOLBAR_KEYS = array( 'sidebar', 'search', 'zoom', 'download', 'print', 'fullscreen', 'annotate' );

	const ZOOMS = array( 'auto', 'page-width', 'page-fit', 'page-actual', '0.5', '0.75', '1', '1.25', '1.5', '2' );

	/**
	 * Cached settings for this request.
	 *
	 * @var array|null
	 */
	private static $cache = null;

	/**
	 * Default values.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'height'             => '800px',
			'zoom'               => 'auto',
			'load'               => 'scroll',
			'theme'              => 'light',
			'new_tab'            => true,
			'sidebar_open'       => false,
			'toolbar_sidebar'    => true,
			'toolbar_search'     => true,
			'toolbar_zoom'       => true,
			'toolbar_download'   => true,
			'toolbar_print'      => true,
			'toolbar_fullscreen' => true,
			'toolbar_annotate'   => true,
			'delete_data'        => false,
		);
	}

	/**
	 * All settings merged over the defaults.
	 *
	 * @return array
	 */
	public static function all() {
		if ( null === self::$cache ) {
			$stored      = get_option( self::OPTION, array() );
			self::$cache = array_merge( self::defaults(), is_array( $stored ) ? $stored : array() );
		}
		return self::$cache;
	}

	/**
	 * One setting.
	 *
	 * @param string $key Setting name.
	 * @return mixed
	 */
	public static function get( $key ) {
		$all = self::all();
		return isset( $all[ $key ] ) ? $all[ $key ] : null;
	}

	/**
	 * Activation: store the defaults without overwriting existing values.
	 */
	public static function install_defaults() {
		add_option( self::OPTION, self::defaults() );
	}

	/**
	 * Clears the per-request cache (after saving).
	 */
	public static function flush() {
		self::$cache = null;
	}

	/**
	 * Sanitises a CSS height such as "800px", "80vh" or "600". Returns '' when invalid.
	 *
	 * @param mixed $value Raw value.
	 * @return string
	 */
	public static function sanitize_height( $value ) {
		$value = strtolower( trim( (string) $value ) );
		if ( '' === $value ) {
			return '';
		}
		if ( preg_match( '/^\d{1,4}(\.\d+)?$/', $value ) ) {
			return $value . 'px';
		}
		if ( preg_match( '/^\d{1,4}(\.\d+)?(px|vh|svh|dvh|em|rem)$/', $value ) ) {
			return $value;
		}
		return '';
	}

	/**
	 * Settings API sanitize callback.
	 *
	 * @param mixed $input Submitted values.
	 * @return array
	 */
	public static function sanitize( $input ) {
		$input    = is_array( $input ) ? $input : array();
		$defaults = self::defaults();
		$clean    = array();

		$height          = self::sanitize_height( isset( $input['height'] ) ? $input['height'] : '' );
		$clean['height'] = '' !== $height ? $height : $defaults['height'];

		$zoom          = isset( $input['zoom'] ) ? (string) $input['zoom'] : '';
		$clean['zoom'] = in_array( $zoom, self::ZOOMS, true ) ? $zoom : $defaults['zoom'];

		$load          = isset( $input['load'] ) ? (string) $input['load'] : '';
		$clean['load'] = in_array( $load, array( 'scroll', 'click' ), true ) ? $load : $defaults['load'];

		$theme          = isset( $input['theme'] ) ? (string) $input['theme'] : '';
		$clean['theme'] = in_array( $theme, array( 'light', 'dark', 'auto' ), true ) ? $theme : $defaults['theme'];

		$booleans = array( 'new_tab', 'sidebar_open', 'delete_data' );
		foreach ( self::TOOLBAR_KEYS as $key ) {
			$booleans[] = 'toolbar_' . $key;
		}
		foreach ( $booleans as $key ) {
			$clean[ $key ] = ! empty( $input[ $key ] );
		}

		self::flush();
		return $clean;
	}
}

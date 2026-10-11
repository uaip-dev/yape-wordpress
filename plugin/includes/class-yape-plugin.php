<?php
/**
 * Plugin orchestrator.
 *
 * @package YetAnotherPdfEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Boots the plugin's components once.
 */
final class Yape_Plugin {

	/**
	 * Singleton instance.
	 *
	 * @var Yape_Plugin|null
	 */
	private static $instance = null;

	/**
	 * Whether boot() already ran.
	 *
	 * @var bool
	 */
	private $booted = false;

	/**
	 * Returns the shared instance.
	 *
	 * @return Yape_Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Registers all hooks.
	 */
	public function boot() {
		if ( $this->booted ) {
			return;
		}
		$this->booted = true;

		( new Yape_Assets() )->register_hooks();
		( new Yape_Block() )->register_hooks();
		( new Yape_Shortcode() )->register_hooks();

		if ( is_admin() ) {
			( new Yape_Admin() )->register_hooks();
		}
	}
}

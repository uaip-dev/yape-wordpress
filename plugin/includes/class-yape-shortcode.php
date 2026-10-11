<?php
/**
 * [yape_pdf] shortcode.
 *
 * @package YetAnotherPdfEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Shortcode for classic content, widgets and page builders.
 *
 * Example: [yape_pdf id="123" height="70vh" page="2" download="no"]
 */
final class Yape_Shortcode {

	/**
	 * Hooks.
	 */
	public function register_hooks() {
		add_action( 'init', array( $this, 'register' ) );
	}

	/**
	 * Registers the shortcode.
	 */
	public function register() {
		add_shortcode( 'yape_pdf', array( $this, 'render' ) );
	}

	/**
	 * Maps yes/no style values to show/hide.
	 *
	 * @param mixed $value Attribute value.
	 * @return string '', 'show' or 'hide'.
	 */
	public static function toggle( $value ) {
		$value = strtolower( trim( (string) $value ) );
		if ( in_array( $value, array( 'yes', 'on', 'true', '1', 'show' ), true ) ) {
			return 'show';
		}
		if ( in_array( $value, array( 'no', 'off', 'false', '0', 'hide' ), true ) ) {
			return 'hide';
		}
		return '';
	}

	/**
	 * Renders the shortcode.
	 *
	 * @param array|string $atts Attributes.
	 * @return string
	 */
	public function render( $atts ) {
		$atts = shortcode_atts(
			array(
				'id'         => 0,
				'url'        => '',
				'title'      => '',
				'height'     => '',
				'width'      => '',
				'page'       => 1,
				'zoom'       => '',
				'load'       => '',
				'sidebar'    => '',
				'search'     => '',
				'zoombar'    => '',
				'download'   => '',
				'print'      => '',
				'fullscreen' => '',
				'annotate'   => '',
				'toolbar'    => '',
				'thumbnails' => '',
			),
			$atts,
			'yape_pdf'
		);

		$sidebar_open = self::toggle( $atts['thumbnails'] );

		return Yape_Renderer::render(
			array(
				'id'          => absint( $atts['id'] ),
				'url'         => (string) $atts['url'],
				'title'       => sanitize_text_field( $atts['title'] ),
				'height'      => (string) $atts['height'],
				'maxWidth'    => (string) $atts['width'],
				'page'        => absint( $atts['page'] ),
				'zoom'        => (string) $atts['zoom'],
				'load'        => (string) $atts['load'],
				'sidebarOpen' => 'show' === $sidebar_open ? 'open' : ( 'hide' === $sidebar_open ? 'closed' : '' ),
				'toolbar'     => 'hide' === self::toggle( $atts['toolbar'] ) || 'none' === $atts['toolbar'] ? 'none' : '',
				'sidebar'     => self::toggle( $atts['sidebar'] ),
				'search'      => self::toggle( $atts['search'] ),
				'zoombar'     => self::toggle( $atts['zoombar'] ),
				'download'    => self::toggle( $atts['download'] ),
				'print'       => self::toggle( $atts['print'] ),
				'fullscreen'  => self::toggle( $atts['fullscreen'] ),
				'annotate'    => self::toggle( $atts['annotate'] ),
			)
		);
	}
}

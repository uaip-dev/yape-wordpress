<?php
/**
 * The yape/pdf block.
 *
 * @package YetAnotherPdfEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers the block from blocks/pdf/block.json and renders it on the server.
 */
final class Yape_Block {

	/**
	 * Hooks.
	 */
	public function register_hooks() {
		add_action( 'init', array( $this, 'register' ) );
	}

	/**
	 * Registers the block type and passes settings to the editor script.
	 */
	public function register() {
		register_block_type(
			YAPE_DIR . 'blocks/pdf',
			array( 'render_callback' => array( $this, 'render' ) )
		);

		wp_add_inline_script(
			Yape_Assets::EDITOR,
			'window.yapeBlock = ' . wp_json_encode( Yape_Assets::editor_data() ) . ';',
			'before'
		);
	}

	/**
	 * Server render.
	 *
	 * @param array $attributes Block attributes.
	 * @return string
	 */
	public function render( $attributes ) {
		$a = wp_parse_args( is_array( $attributes ) ? $attributes : array(), array() );

		$height = isset( $a['height'] ) ? Yape_Settings::sanitize_height( $a['height'] ) : '';
		if ( '' === $height ) {
			$height = Yape_Settings::get( 'height' );
		}
		$wrapper = get_block_wrapper_attributes(
			array(
				'class' => 'yape-pdf is-theme-' . Yape_Settings::get( 'theme' ),
				'style' => '--yape-height:' . $height . ';',
			)
		);

		$options = array(
			'id'          => isset( $a['id'] ) ? $a['id'] : 0,
			'url'         => isset( $a['url'] ) ? $a['url'] : '',
			'title'       => isset( $a['title'] ) ? $a['title'] : '',
			'height'      => $height,
			'page'        => isset( $a['page'] ) ? $a['page'] : 1,
			'zoom'        => isset( $a['zoom'] ) ? $a['zoom'] : '',
			'load'        => isset( $a['load'] ) ? $a['load'] : '',
			'sidebarOpen' => isset( $a['sidebarOpen'] ) ? $a['sidebarOpen'] : '',
			'toolbar'     => isset( $a['toolbar'] ) ? $a['toolbar'] : '',
		);
		$map = array(
			'showSidebar'    => 'sidebar',
			'showSearch'     => 'search',
			'showZoom'       => 'zoombar',
			'showDownload'   => 'download',
			'showPrint'      => 'print',
			'showFullscreen' => 'fullscreen',
			'showAnnotate'   => 'annotate',
		);
		foreach ( $map as $attr => $opt ) {
			$value           = isset( $a[ $attr ] ) ? (string) $a[ $attr ] : '';
			$options[ $opt ] = in_array( $value, array( 'show', 'hide' ), true ) ? $value : '';
		}

		return Yape_Renderer::render( $options, $wrapper );
	}
}

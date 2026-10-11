<?php
/**
 * Registers scripts, the viewer Script Module and styles.
 *
 * @package YetAnotherPdfEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Asset registration. Nothing is enqueued until a viewer is rendered.
 */
final class Yape_Assets {

	const MODULE = 'yape-viewer';
	const STYLE  = 'yape-viewer';
	const EDITOR = 'yape-block-editor';

	/**
	 * Whether a viewer was rendered on this request.
	 *
	 * @var bool
	 */
	private static $used = false;

	/**
	 * Hooks.
	 */
	public function register_hooks() {
		add_action( 'init', array( $this, 'register' ), 5 );
		add_action( 'wp_footer', array( $this, 'print_viewer_data' ), 5 );
	}

	/**
	 * Registers the module, style and editor script.
	 */
	public function register() {
		wp_register_script_module( self::MODULE, YAPE_URL . 'build/viewer/index.js', array(), YAPE_VERSION );
		wp_register_style( self::STYLE, YAPE_URL . 'build/viewer/viewer.css', array(), YAPE_VERSION );

		wp_register_script(
			self::EDITOR,
			YAPE_URL . 'build/block/index.js',
			array( 'wp-blocks', 'wp-element', 'wp-i18n', 'wp-block-editor', 'wp-components', 'wp-data' ),
			YAPE_VERSION,
			true
		);
		wp_set_script_translations( self::EDITOR, 'yet-another-pdf-editor' );
	}

	/**
	 * Data for the block editor script (printed only where the editor loads it).
	 *
	 * @return array
	 */
	public static function editor_data() {
		$s       = Yape_Settings::all();
		$toolbar = array();
		foreach ( Yape_Settings::TOOLBAR_KEYS as $key ) {
			$toolbar[ $key ] = (bool) $s[ 'toolbar_' . $key ];
		}
		return array(
			'viewerUrl' => add_query_arg( 'ver', YAPE_VERSION, YAPE_URL . 'build/viewer/index.js' ),
			'defaults'  => array(
				'height'      => $s['height'],
				'zoom'        => $s['zoom'],
				'newTab'      => (bool) $s['new_tab'],
				'sidebarOpen' => (bool) $s['sidebar_open'],
				'toolbar'     => $toolbar,
			),
		);
	}

	/**
	 * Enqueues the viewer for a shortcode or block render.
	 */
	public static function enqueue_viewer() {
		self::$used = true;
		wp_enqueue_script_module( self::MODULE );
		wp_enqueue_style( self::STYLE );
	}

	/**
	 * Prints translated viewer strings once, when a viewer is on the page.
	 */
	public function print_viewer_data() {
		if ( ! self::$used ) {
			return;
		}
		$data = array( 'i18n' => self::viewer_strings() );
		wp_print_inline_script_tag(
			wp_json_encode( $data, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE ),
			array(
				'type' => 'application/json',
				'id'   => 'yape-viewer-data',
			)
		);
	}

	/**
	 * Translatable strings used by the front-end viewer.
	 *
	 * @return array
	 */
	public static function viewer_strings() {
		return array(
			'loadPdf'           => __( 'Load PDF', 'yet-another-pdf-editor' ),
			'loading'           => __( 'Loading PDF…', 'yet-another-pdf-editor' ),
			'toolbar'           => __( 'PDF toolbar', 'yet-another-pdf-editor' ),
			'sidebar'           => __( 'Toggle sidebar', 'yet-another-pdf-editor' ),
			'thumbnails'        => __( 'Thumbnails', 'yet-another-pdf-editor' ),
			'outline'           => __( 'Outline', 'yet-another-pdf-editor' ),
			'noOutline'         => __( 'This document has no outline.', 'yet-another-pdf-editor' ),
			'previous'          => __( 'Previous page', 'yet-another-pdf-editor' ),
			'next'              => __( 'Next page', 'yet-another-pdf-editor' ),
			'page'              => __( 'Page', 'yet-another-pdf-editor' ),
			/* translators: 1: current page number, 2: total number of pages. */
			'pageOf'            => __( 'Page %1$s of %2$s', 'yet-another-pdf-editor' ),
			/* translators: %s: total number of pages. */
			'ofPages'           => __( 'of %s', 'yet-another-pdf-editor' ),
			'zoomIn'            => __( 'Zoom in', 'yet-another-pdf-editor' ),
			'zoomOut'           => __( 'Zoom out', 'yet-another-pdf-editor' ),
			'zoom'              => __( 'Zoom', 'yet-another-pdf-editor' ),
			'zoomAuto'          => __( 'Automatic', 'yet-another-pdf-editor' ),
			'zoomPageFit'       => __( 'Page fit', 'yet-another-pdf-editor' ),
			'zoomPageWidth'     => __( 'Page width', 'yet-another-pdf-editor' ),
			'zoomActual'        => __( 'Actual size', 'yet-another-pdf-editor' ),
			'search'            => __( 'Search', 'yet-another-pdf-editor' ),
			'searchPlaceholder' => __( 'Find in document', 'yet-another-pdf-editor' ),
			'findPrevious'      => __( 'Previous match', 'yet-another-pdf-editor' ),
			'findNext'          => __( 'Next match', 'yet-another-pdf-editor' ),
			/* translators: 1: current match number, 2: total matches. */
			'matchOf'           => __( '%1$s of %2$s', 'yet-another-pdf-editor' ),
			'noMatches'         => __( 'No matches', 'yet-another-pdf-editor' ),
			'close'             => __( 'Close', 'yet-another-pdf-editor' ),
			'download'          => __( 'Download', 'yet-another-pdf-editor' ),
			'print'             => __( 'Print', 'yet-another-pdf-editor' ),
			'preparingPrint'    => __( 'Preparing to print…', 'yet-another-pdf-editor' ),
			'fullscreen'        => __( 'Full screen', 'yet-another-pdf-editor' ),
			'exitFullscreen'    => __( 'Exit full screen', 'yet-another-pdf-editor' ),
			'passwordPrompt'    => __( 'This PDF is password protected.', 'yet-another-pdf-editor' ),
			'passwordWrong'     => __( 'Incorrect password. Try again.', 'yet-another-pdf-editor' ),
			'password'          => __( 'Password', 'yet-another-pdf-editor' ),
			'open'              => __( 'Open', 'yet-another-pdf-editor' ),
			'error'             => __( 'The PDF could not be displayed.', 'yet-another-pdf-editor' ),
			'openDirectly'      => __( 'Open the PDF', 'yet-another-pdf-editor' ),
			/* translators: %s: page number. */
			'pageThumbnail'     => __( 'Page %s', 'yet-another-pdf-editor' ),
			'annotate'                 => __( 'Annotate and sign', 'yet-another-pdf-editor' ),
			'highlight'                => __( 'Highlight', 'yet-another-pdf-editor' ),
			'draw'                     => __( 'Draw', 'yet-another-pdf-editor' ),
			'text'                     => __( 'Add text', 'yet-another-pdf-editor' ),
			'image'                    => __( 'Add image', 'yet-another-pdf-editor' ),
			'signature'                => __( 'Add signature', 'yet-another-pdf-editor' ),
			'color'                    => __( 'Colour', 'yet-another-pdf-editor' ),
			'size'                     => __( 'Size', 'yet-another-pdf-editor' ),
			'small'                    => __( 'Small', 'yet-another-pdf-editor' ),
			'medium'                   => __( 'Medium', 'yet-another-pdf-editor' ),
			'large'                    => __( 'Large', 'yet-another-pdf-editor' ),
			'undo'                     => __( 'Undo', 'yet-another-pdf-editor' ),
			'redo'                     => __( 'Redo', 'yet-another-pdf-editor' ),
			'deleteSelected'           => __( 'Delete selected', 'yet-another-pdf-editor' ),
			'done'                     => __( 'Done', 'yet-another-pdf-editor' ),
			'addSignature'             => __( 'Add your signature', 'yet-another-pdf-editor' ),
			'drawSignature'            => __( 'Draw', 'yet-another-pdf-editor' ),
			'typeSignature'            => __( 'Type', 'yet-another-pdf-editor' ),
			'typeSignaturePlaceholder' => __( 'Type your name', 'yet-another-pdf-editor' ),
			'clear'                    => __( 'Clear', 'yet-another-pdf-editor' ),
			'cancel'                   => __( 'Cancel', 'yet-another-pdf-editor' ),
			'add'                      => __( 'Add', 'yet-another-pdf-editor' ),
			'signatureAdded'           => __( 'Signature added. Drag it into place.', 'yet-another-pdf-editor' ),
			'color_black'              => __( 'Black', 'yet-another-pdf-editor' ),
			'color_blue'               => __( 'Blue', 'yet-another-pdf-editor' ),
			'color_red'                => __( 'Red', 'yet-another-pdf-editor' ),
			'color_green'              => __( 'Green', 'yet-another-pdf-editor' ),
			'color_orange'             => __( 'Orange', 'yet-another-pdf-editor' ),
			'color_yellow'             => __( 'Yellow', 'yet-another-pdf-editor' ),
			'color_pink'               => __( 'Pink', 'yet-another-pdf-editor' ),
		);
	}
}

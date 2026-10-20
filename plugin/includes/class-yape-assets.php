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
		wp_set_script_translations( self::EDITOR, 'uaip-yet-another-pdf-editor' );
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
			'loadPdf'           => __( 'Load PDF', 'uaip-yet-another-pdf-editor' ),
			'loading'           => __( 'Loading PDF…', 'uaip-yet-another-pdf-editor' ),
			'toolbar'           => __( 'PDF toolbar', 'uaip-yet-another-pdf-editor' ),
			'sidebar'           => __( 'Toggle sidebar', 'uaip-yet-another-pdf-editor' ),
			'thumbnails'        => __( 'Thumbnails', 'uaip-yet-another-pdf-editor' ),
			'outline'           => __( 'Outline', 'uaip-yet-another-pdf-editor' ),
			'noOutline'         => __( 'This document has no outline.', 'uaip-yet-another-pdf-editor' ),
			'previous'          => __( 'Previous page', 'uaip-yet-another-pdf-editor' ),
			'next'              => __( 'Next page', 'uaip-yet-another-pdf-editor' ),
			'page'              => __( 'Page', 'uaip-yet-another-pdf-editor' ),
			/* translators: 1: current page number, 2: total number of pages. */
			'pageOf'            => __( 'Page %1$s of %2$s', 'uaip-yet-another-pdf-editor' ),
			/* translators: %s: total number of pages. */
			'ofPages'           => __( 'of %s', 'uaip-yet-another-pdf-editor' ),
			'zoomIn'            => __( 'Zoom in', 'uaip-yet-another-pdf-editor' ),
			'zoomOut'           => __( 'Zoom out', 'uaip-yet-another-pdf-editor' ),
			'zoom'              => __( 'Zoom', 'uaip-yet-another-pdf-editor' ),
			'zoomAuto'          => __( 'Automatic', 'uaip-yet-another-pdf-editor' ),
			'zoomPageFit'       => __( 'Page fit', 'uaip-yet-another-pdf-editor' ),
			'zoomPageWidth'     => __( 'Page width', 'uaip-yet-another-pdf-editor' ),
			'zoomActual'        => __( 'Actual size', 'uaip-yet-another-pdf-editor' ),
			'search'            => __( 'Search', 'uaip-yet-another-pdf-editor' ),
			'searchPlaceholder' => __( 'Find in document', 'uaip-yet-another-pdf-editor' ),
			'findPrevious'      => __( 'Previous match', 'uaip-yet-another-pdf-editor' ),
			'findNext'          => __( 'Next match', 'uaip-yet-another-pdf-editor' ),
			/* translators: 1: current match number, 2: total matches. */
			'matchOf'           => __( '%1$s of %2$s', 'uaip-yet-another-pdf-editor' ),
			'noMatches'         => __( 'No matches', 'uaip-yet-another-pdf-editor' ),
			'close'             => __( 'Close', 'uaip-yet-another-pdf-editor' ),
			'download'          => __( 'Download', 'uaip-yet-another-pdf-editor' ),
			'print'             => __( 'Print', 'uaip-yet-another-pdf-editor' ),
			'preparingPrint'    => __( 'Preparing to print…', 'uaip-yet-another-pdf-editor' ),
			'fullscreen'        => __( 'Full screen', 'uaip-yet-another-pdf-editor' ),
			'exitFullscreen'    => __( 'Exit full screen', 'uaip-yet-another-pdf-editor' ),
			'passwordPrompt'    => __( 'This PDF is password protected.', 'uaip-yet-another-pdf-editor' ),
			'passwordWrong'     => __( 'Incorrect password. Try again.', 'uaip-yet-another-pdf-editor' ),
			'password'          => __( 'Password', 'uaip-yet-another-pdf-editor' ),
			'open'              => __( 'Open', 'uaip-yet-another-pdf-editor' ),
			'error'             => __( 'The PDF could not be displayed.', 'uaip-yet-another-pdf-editor' ),
			'openDirectly'      => __( 'Open the PDF', 'uaip-yet-another-pdf-editor' ),
			/* translators: %s: page number. */
			'pageThumbnail'     => __( 'Page %s', 'uaip-yet-another-pdf-editor' ),
			'annotate'                 => __( 'Annotate and sign', 'uaip-yet-another-pdf-editor' ),
			'highlight'                => __( 'Highlight', 'uaip-yet-another-pdf-editor' ),
			'draw'                     => __( 'Draw', 'uaip-yet-another-pdf-editor' ),
			'text'                     => __( 'Add text', 'uaip-yet-another-pdf-editor' ),
			'image'                    => __( 'Add image', 'uaip-yet-another-pdf-editor' ),
			'signature'                => __( 'Add signature', 'uaip-yet-another-pdf-editor' ),
			'color'                    => __( 'Colour', 'uaip-yet-another-pdf-editor' ),
			'size'                     => __( 'Size', 'uaip-yet-another-pdf-editor' ),
			'small'                    => __( 'Small', 'uaip-yet-another-pdf-editor' ),
			'medium'                   => __( 'Medium', 'uaip-yet-another-pdf-editor' ),
			'large'                    => __( 'Large', 'uaip-yet-another-pdf-editor' ),
			'undo'                     => __( 'Undo', 'uaip-yet-another-pdf-editor' ),
			'redo'                     => __( 'Redo', 'uaip-yet-another-pdf-editor' ),
			'deleteSelected'           => __( 'Delete selected', 'uaip-yet-another-pdf-editor' ),
			'done'                     => __( 'Done', 'uaip-yet-another-pdf-editor' ),
			'addSignature'             => __( 'Add your signature', 'uaip-yet-another-pdf-editor' ),
			'drawSignature'            => __( 'Draw', 'uaip-yet-another-pdf-editor' ),
			'typeSignature'            => __( 'Type', 'uaip-yet-another-pdf-editor' ),
			'typeSignaturePlaceholder' => __( 'Type your name', 'uaip-yet-another-pdf-editor' ),
			'clear'                    => __( 'Clear', 'uaip-yet-another-pdf-editor' ),
			'cancel'                   => __( 'Cancel', 'uaip-yet-another-pdf-editor' ),
			'add'                      => __( 'Add', 'uaip-yet-another-pdf-editor' ),
			'signatureAdded'           => __( 'Signature added. Drag it into place.', 'uaip-yet-another-pdf-editor' ),
			'color_black'              => __( 'Black', 'uaip-yet-another-pdf-editor' ),
			'color_blue'               => __( 'Blue', 'uaip-yet-another-pdf-editor' ),
			'color_red'                => __( 'Red', 'uaip-yet-another-pdf-editor' ),
			'color_green'              => __( 'Green', 'uaip-yet-another-pdf-editor' ),
			'color_orange'             => __( 'Orange', 'uaip-yet-another-pdf-editor' ),
			'color_yellow'             => __( 'Yellow', 'uaip-yet-another-pdf-editor' ),
			'color_pink'               => __( 'Pink', 'uaip-yet-another-pdf-editor' ),
			'flipbook'                 => __( 'Flipbook', 'uaip-yet-another-pdf-editor' ),
			/* translators: 1: first page shown, 2: second page shown, 3: total number of pages. */
			'pagesOf'                  => __( 'Pages %1$s–%2$s of %3$s', 'uaip-yet-another-pdf-editor' ),
			'openViewer'               => __( 'Open in document viewer', 'uaip-yet-another-pdf-editor' ),
			/* translators: %s: document title. */
			'openFlipbook'             => __( 'Open flipbook: %s', 'uaip-yet-another-pdf-editor' ),
		);
	}
}

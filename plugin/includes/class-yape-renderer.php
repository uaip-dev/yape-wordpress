<?php
/**
 * Server-side markup for a viewer (shared by the block, shortcode and compatibility layer).
 *
 * @package YetAnotherPdfEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Builds the viewer HTML: a figure with a plain link fallback and a JSON config.
 * The PDF URL is placed in the markup only, never in a request query string.
 */
final class Yape_Renderer {

	/**
	 * Normalised options accepted by render(). Each toolbar entry is '', 'show' or 'hide'.
	 * `mode` is '' (document viewer) or 'flipbook'; `cover`, `rtl` and `lightbox` are
	 * flipbook options ('', 'show' or 'hide').
	 *
	 * @return array
	 */
	public static function option_defaults() {
		return array(
			'id'          => 0,
			'url'         => '',
			'title'       => '',
			'height'      => '',
			'page'        => 1,
			'zoom'        => '',
			'load'        => '',
			'sidebarOpen' => '',
			'toolbar'     => '',
			'sidebar'     => '',
			'search'      => '',
			'zoombar'     => '',
			'download'    => '',
			'print'       => '',
			'fullscreen'  => '',
			'annotate'    => '',
			'maxWidth'    => '',
			'mode'        => '',
			'cover'       => '',
			'rtl'         => '',
			'lightbox'    => '',
		);
	}

	/**
	 * Resolves the PDF URL and title from an attachment ID or URL.
	 *
	 * @param array $o Options.
	 * @return array|null { url, title } or null when there is nothing to show.
	 */
	public static function resolve_document( array $o ) {
		$id = absint( $o['id'] );
		if ( $id ) {
			$post = get_post( $id );
			if ( $post && 'attachment' === $post->post_type && 'application/pdf' === $post->post_mime_type ) {
				$parent = $post->post_parent ? get_post( $post->post_parent ) : null;
				if ( $parent && 'publish' !== $parent->post_status && ! current_user_can( 'read_post', $parent->ID ) ) {
					return null;
				}
				$url = wp_get_attachment_url( $id );
				if ( $url ) {
					return array(
						'url'   => $url,
						'title' => '' !== $o['title'] ? $o['title'] : get_the_title( $post ),
					);
				}
			}
		}

		$url = trim( (string) $o['url'] );
		if ( '' === $url ) {
			return null;
		}
		$url = esc_url_raw( $url, array( 'http', 'https' ) );
		if ( '' === $url ) {
			return null;
		}
		$title = '' !== $o['title'] ? $o['title'] : rawurldecode( wp_basename( (string) wp_parse_url( $url, PHP_URL_PATH ) ) );
		return array(
			'url'   => $url,
			'title' => $title,
		);
	}

	/**
	 * Client config for the viewer.
	 *
	 * @param array $o   Options.
	 * @param array $doc Resolved document.
	 * @return array
	 */
	public static function config( array $o, array $doc ) {
		$s = Yape_Settings::all();

		if ( 'none' === $o['toolbar'] ) {
			$toolbar = false;
		} else {
			$toolbar = array();
			$map     = array(
				'sidebar'    => 'sidebar',
				'search'     => 'search',
				'zoom'       => 'zoombar',
				'download'   => 'download',
				'print'      => 'print',
				'fullscreen' => 'fullscreen',
				'annotate'   => 'annotate',
			);
			foreach ( $map as $key => $opt ) {
				$value           = (string) $o[ $opt ];
				$toolbar[ $key ] = '' === $value ? (bool) $s[ 'toolbar_' . $key ] : ( 'show' === $value );
			}
		}

		$zoom = (string) $o['zoom'];
		$load = (string) $o['load'];

		$config = array(
			'url'         => $doc['url'],
			'title'       => $doc['title'],
			'zoom'        => in_array( $zoom, Yape_Settings::ZOOMS, true ) ? $zoom : $s['zoom'],
			'load'        => in_array( $load, array( 'scroll', 'click' ), true ) ? $load : $s['load'],
			'newTab'      => (bool) $s['new_tab'],
			'sidebarOpen' => '' === $o['sidebarOpen'] ? (bool) $s['sidebar_open'] : ( 'open' === $o['sidebarOpen'] ),
			'toolbar'     => $toolbar,
		);
		$page   = absint( $o['page'] );
		if ( $page > 1 ) {
			$config['page'] = $page;
		}
		if ( self::is_flipbook( $o ) ) {
			$config['mode']     = 'flipbook';
			$config['flipbook'] = array(
				'cover'    => 'hide' !== $o['cover'],
				'rtl'      => 'show' === $o['rtl'],
				'lightbox' => 'show' === $o['lightbox'],
			);
		}

		/**
		 * Filters the viewer configuration passed to the browser.
		 *
		 * @param array $config Viewer configuration.
		 * @param array $o      Normalised render options.
		 */
		return apply_filters( 'yape_viewer_config', $config, $o );
	}

	/**
	 * Whether the options ask for a flipbook.
	 *
	 * @param array $o Options.
	 * @return bool
	 */
	public static function is_flipbook( array $o ) {
		return 'flipbook' === $o['mode'];
	}

	/**
	 * Preview image of the PDF's first page for a lightbox cover. WordPress makes one at
	 * upload when the server has Imagick with PDF support; otherwise the browser draws it.
	 *
	 * @param array $o Options.
	 * @return string Image URL or ''.
	 */
	public static function cover_image( array $o ) {
		$id = absint( $o['id'] );
		if ( ! $id ) {
			return '';
		}
		$src = wp_get_attachment_image_src( $id, 'large' );
		return $src ? (string) $src[0] : '';
	}

	/**
	 * Renders the viewer.
	 *
	 * @param array  $options            Options (see option_defaults()).
	 * @param string $wrapper_attributes Pre-built wrapper attributes (blocks), or '' to build them here.
	 * @return string
	 */
	public static function render( array $options, $wrapper_attributes = '' ) {
		$o   = array_merge( self::option_defaults(), $options );
		$doc = self::resolve_document( $o );
		if ( ! $doc ) {
			return '';
		}

		Yape_Assets::enqueue_viewer();

		$config = self::config( $o, $doc );
		$height = Yape_Settings::sanitize_height( $o['height'] );
		if ( '' === $height ) {
			$height = Yape_Settings::get( 'height' );
		}
		$theme = Yape_Settings::get( 'theme' );

		if ( '' === $wrapper_attributes ) {
			$style = '--yape-height:' . $height . ';';
			$max   = Yape_Settings::sanitize_height( $o['maxWidth'] );
			if ( '' !== $max && false === strpos( $max, 'vh' ) ) {
				$style .= 'max-width:' . $max . ';';
			}
			$wrapper_attributes = sprintf(
				'class="%s" style="%s"',
				esc_attr( 'yape-pdf is-theme-' . $theme ),
				esc_attr( $style )
			);
		}

		$label = '' !== $doc['title'] ? $doc['title'] : __( 'PDF document', 'uaip-yet-another-pdf-editor' );

		if ( ! empty( $config['flipbook']['lightbox'] ) ) {
			// Only the cover is on the page; it links to the PDF until the script takes over.
			$wrapper_attributes = preg_replace( '/class="/', 'class="is-lightbox ', $wrapper_attributes, 1 );
			$max                = Yape_Settings::sanitize_height( $o['maxWidth'] );
			if ( '' !== $max && false === strpos( $max, 'vh' ) ) {
				$wrapper_attributes = preg_replace( '/style="/', 'style="--yape-cover-width:' . esc_attr( $max ) . ';', $wrapper_attributes, 1 );
			}
			$image = self::cover_image( $o );
			$art   = '' !== $image
				? sprintf( '<img src="%s" alt="" loading="lazy" decoding="async">', esc_url( $image ) )
				: '';
			return sprintf(
				'<figure %1$s><div class="yape-pdf__frame yape-pdf__frame--cover" data-yape="%2$s"><a class="yape-pdf__cover" href="%3$s"><span class="yape-pdf__cover-art">%4$s</span><span class="yape-pdf__cover-title">%5$s</span></a></div></figure>',
				$wrapper_attributes,
				esc_attr( wp_json_encode( $config ) ),
				esc_url( $doc['url'] ),
				$art,
				esc_html( $label )
			);
		}

		return sprintf(
			'<figure %1$s><div class="yape-pdf__frame" data-yape="%2$s"><a class="yape-pdf__fallback" href="%3$s">%4$s</a></div></figure>',
			$wrapper_attributes,
			esc_attr( wp_json_encode( $config ) ),
			esc_url( $doc['url'] ),
			esc_html( $label )
		);
	}
}

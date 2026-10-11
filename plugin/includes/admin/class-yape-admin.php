<?php
/**
 * Settings screen (Settings > PDF Viewer).
 *
 * @package YetAnotherPdfEditor
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * One plain settings page built on the Settings API. No notices, no upsells.
 */
final class Yape_Admin {

	const PAGE  = 'yape-settings';
	const GROUP = 'yape_settings_group';

	/**
	 * Hooks.
	 */
	public function register_hooks() {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'settings' ) );
		add_filter( 'plugin_action_links_' . YAPE_BASENAME, array( $this, 'action_links' ) );
	}

	/**
	 * Adds the page under Settings.
	 */
	public function menu() {
		add_options_page(
			__( 'PDF Viewer', 'yet-another-pdf-editor' ),
			__( 'PDF Viewer', 'yet-another-pdf-editor' ),
			'manage_options',
			self::PAGE,
			array( $this, 'render_page' )
		);
	}

	/**
	 * "Settings" link on the Plugins screen.
	 *
	 * @param array $links Existing links.
	 * @return array
	 */
	public function action_links( $links ) {
		$url = admin_url( 'options-general.php?page=' . self::PAGE );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'yet-another-pdf-editor' ) . '</a>' );
		return $links;
	}

	/**
	 * Registers the setting, sections and fields.
	 */
	public function settings() {
		register_setting(
			self::GROUP,
			Yape_Settings::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( 'Yape_Settings', 'sanitize' ),
				'default'           => Yape_Settings::defaults(),
			)
		);

		add_settings_section( 'yape_viewer', __( 'Viewer defaults', 'yet-another-pdf-editor' ), '__return_false', self::PAGE );
		add_settings_section( 'yape_toolbar', __( 'Toolbar', 'yet-another-pdf-editor' ), array( $this, 'toolbar_intro' ), self::PAGE );
		add_settings_section( 'yape_other', __( 'Data', 'yet-another-pdf-editor' ), '__return_false', self::PAGE );

		$this->field( 'height', __( 'Height', 'yet-another-pdf-editor' ), 'yape_viewer', 'text', __( 'For example 800px or 80vh.', 'yet-another-pdf-editor' ) );
		$this->field(
			'zoom',
			__( 'Zoom', 'yet-another-pdf-editor' ),
			'yape_viewer',
			array(
				'auto'        => __( 'Automatic', 'yet-another-pdf-editor' ),
				'page-width'  => __( 'Page width', 'yet-another-pdf-editor' ),
				'page-fit'    => __( 'Page fit', 'yet-another-pdf-editor' ),
				'page-actual' => __( 'Actual size', 'yet-another-pdf-editor' ),
				'0.5'         => '50%',
				'0.75'        => '75%',
				'1'           => '100%',
				'1.25'        => '125%',
				'1.5'         => '150%',
				'2'           => '200%',
			)
		);
		$this->field(
			'load',
			__( 'Loading', 'yet-another-pdf-editor' ),
			'yape_viewer',
			array(
				'scroll' => __( 'When scrolled into view (recommended)', 'yet-another-pdf-editor' ),
				'click'  => __( 'When the visitor clicks "Load PDF"', 'yet-another-pdf-editor' ),
			)
		);
		$this->field(
			'theme',
			__( 'Colours', 'yet-another-pdf-editor' ),
			'yape_viewer',
			array(
				'light' => __( 'Light', 'yet-another-pdf-editor' ),
				'dark'  => __( 'Dark', 'yet-another-pdf-editor' ),
				'auto'  => __( 'Follow the visitor’s system setting', 'yet-another-pdf-editor' ),
			)
		);
		$this->field( 'new_tab', __( 'Open links in a new tab', 'yet-another-pdf-editor' ), 'yape_viewer', 'checkbox' );

		$this->field( 'toolbar_sidebar', __( 'Sidebar (thumbnails and outline)', 'yet-another-pdf-editor' ), 'yape_toolbar', 'checkbox' );
		$this->field( 'sidebar_open', __( 'Open the sidebar on load', 'yet-another-pdf-editor' ), 'yape_toolbar', 'checkbox' );
		$this->field( 'toolbar_search', __( 'Search', 'yet-another-pdf-editor' ), 'yape_toolbar', 'checkbox' );
		$this->field( 'toolbar_zoom', __( 'Zoom', 'yet-another-pdf-editor' ), 'yape_toolbar', 'checkbox' );
		$this->field( 'toolbar_download', __( 'Download', 'yet-another-pdf-editor' ), 'yape_toolbar', 'checkbox' );
		$this->field( 'toolbar_print', __( 'Print', 'yet-another-pdf-editor' ), 'yape_toolbar', 'checkbox' );
		$this->field( 'toolbar_fullscreen', __( 'Full screen', 'yet-another-pdf-editor' ), 'yape_toolbar', 'checkbox' );

		$this->field(
			'delete_data',
			__( 'Delete settings on uninstall', 'yet-another-pdf-editor' ),
			'yape_other',
			'checkbox',
			__( 'Your PDFs in the Media Library are never deleted.', 'yet-another-pdf-editor' )
		);
	}

	/**
	 * Toolbar section description.
	 */
	public function toolbar_intro() {
		echo '<p>' . esc_html__( 'Buttons shown by default. Each block can override these.', 'yet-another-pdf-editor' ) . '</p>';
	}

	/**
	 * Adds one field.
	 *
	 * @param string       $key     Setting key.
	 * @param string       $label   Label.
	 * @param string       $section Section id.
	 * @param string|array $type    'text', 'checkbox' or an array of select options.
	 * @param string       $help    Help text.
	 */
	private function field( $key, $label, $section, $type, $help = '' ) {
		add_settings_field(
			'yape_' . $key,
			$label,
			array( $this, 'render_field' ),
			self::PAGE,
			$section,
			array(
				'key'       => $key,
				'type'      => $type,
				'help'      => $help,
				'label_for' => 'checkbox' === $type ? null : 'yape_' . $key,
			)
		);
	}

	/**
	 * Renders one field.
	 *
	 * @param array $args Field arguments.
	 */
	public function render_field( $args ) {
		$key   = $args['key'];
		$value = Yape_Settings::get( $key );
		$name  = Yape_Settings::OPTION . '[' . $key . ']';
		$id    = 'yape_' . $key;

		if ( is_array( $args['type'] ) ) {
			echo '<select id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '">';
			foreach ( $args['type'] as $option => $text ) {
				printf(
					'<option value="%s"%s>%s</option>',
					esc_attr( $option ),
					selected( (string) $value, (string) $option, false ),
					esc_html( $text )
				);
			}
			echo '</select>';
		} elseif ( 'checkbox' === $args['type'] ) {
			printf(
				'<label><input type="checkbox" id="%1$s" name="%2$s" value="1"%3$s> %4$s</label>',
				esc_attr( $id ),
				esc_attr( $name ),
				checked( (bool) $value, true, false ),
				esc_html__( 'Enabled', 'yet-another-pdf-editor' )
			);
		} else {
			printf(
				'<input type="text" class="regular-text" id="%1$s" name="%2$s" value="%3$s">',
				esc_attr( $id ),
				esc_attr( $name ),
				esc_attr( (string) $value )
			);
		}

		if ( '' !== $args['help'] ) {
			echo '<p class="description">' . esc_html( $args['help'] ) . '</p>';
		}
	}

	/**
	 * Renders the page.
	 */
	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'PDF Viewer', 'yet-another-pdf-editor' ); ?></h1>
			<p>
				<?php
				printf(
					/* translators: 1: block name, 2: shortcode example. */
					esc_html__( 'Add PDFs with the %1$s block or the %2$s shortcode.', 'yet-another-pdf-editor' ),
					'<strong>' . esc_html__( 'PDF Viewer', 'yet-another-pdf-editor' ) . '</strong>',
					'<code>[yape_pdf id="123"]</code>'
				);
				?>
			</p>
			<form action="options.php" method="post">
				<?php
				settings_fields( self::GROUP );
				do_settings_sections( self::PAGE );
				submit_button();
				?>
			</form>
		</div>
		<?php
	}
}

<?php
/**
 * New Mexico Cherokee Community Theme functions and definitions
 *
 * @link https://developer.wordpress.org/themes/basics/theme-functions/
 *
 * @package NMCC
 */

if ( ! function_exists( 'nmcc_setup' ) ) :
	/**
	 * Sets up theme defaults and registers support for various WordPress features.
	 */
	function nmcc_setup() {
		// Add support for editor styles.
		add_theme_support( 'editor-styles' );

		// Enqueue the main editor style.
		add_editor_style( array(
			'style.css',
			'assets/css/editor-style.css'
		) );

		// Support responsive embedded content.
		add_theme_support( 'responsive-embeds' );

		// Register pattern categories.
		if ( function_exists( 'register_block_pattern_category' ) ) {
			register_block_pattern_category(
				'nmcc',
				array(
					'label'       => __( 'New Mexico Cherokee Community', 'nmcc' ),
					'description' => __( 'Custom page and section layouts for the NMCC website.', 'nmcc' ),
				)
			);
		}
	}
endif;
add_action( 'after_setup_theme', 'nmcc_setup' );

/**
 * Enqueue block editor assets for custom RichText formats.
 */
function nmcc_block_editor_assets() {
	wp_enqueue_script(
		'nmcc-editor-formats',
		get_theme_file_uri( '/assets/js/editor.js' ),
		array( 'wp-rich-text', 'wp-element', 'wp-editor', 'wp-components', 'wp-compose' ),
		'1.0.0',
		true
	);

	wp_enqueue_style(
		'nmcc-editor-style',
		get_theme_file_uri( '/assets/css/editor-style.css' ),
		array(),
		'1.0.0'
	);
}
add_action( 'enqueue_block_editor_assets', 'nmcc_block_editor_assets' );

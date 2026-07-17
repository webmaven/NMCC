<?php
/**
 * PHPUnit bootstrap file for NMCC Theme
 *
 * @package NMCC
 */

// Load Composer autoloader to load dependencies like PHPUnit Polyfills
if ( file_exists( dirname( __DIR__ ) . '/vendor/autoload.php' ) ) {
    require_once dirname( __DIR__ ) . '/vendor/autoload.php';
}

$_tests_dir = getenv( 'WP_TESTS_DIR' );

if ( ! $_tests_dir ) {
    $_tests_dir = rtrim( sys_get_temp_dir(), '/\\' ) . '/wordpress-tests-lib';
}

if ( ! file_exists( $_tests_dir . '/includes/functions.php' ) ) {
    echo "Could not find $_tests_dir/includes/functions.php" . PHP_EOL;
    exit( 1 );
}

// Give access to tests_add_filter() function.
require_once $_tests_dir . '/includes/functions.php';

/**
 * Manually register and load the theme during WordPress bootstrap.
 */
function _manually_load_theme() {
    // Register the parent directory as a theme directory so WordPress finds our theme.
    register_theme_directory( dirname( __DIR__, 2 ) );
    
    // Select our theme folder name.
    $theme_slug = basename( dirname( __DIR__ ) );
    switch_theme( $theme_slug );
}
tests_add_filter( 'muplugins_loaded', '_manually_load_theme' );

// Start up the WP testing environment.
require $_tests_dir . '/includes/bootstrap.php';

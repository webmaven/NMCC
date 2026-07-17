<?php
/**
 * Class ThemeSetupTest
 *
 * @package NMCC
 */

class ThemeSetupTest extends WP_UnitTestCase {

    /**
     * Test that our core hooks are successfully bound in the WordPress lifecycle.
     */
    public function test_hooks_are_bound() {
        $this->assertNotFalse( has_action( 'after_setup_theme', 'nmcc_setup' ) );
        $this->assertNotFalse( has_action( 'enqueue_block_editor_assets', 'nmcc_block_editor_assets' ) );
    }

    /**
     * Test that theme setup registers expected standard features.
     */
    public function test_theme_features_support() {
        // Ensure setup runs in context.
        nmcc_setup();

        $this->assertTrue( current_theme_supports( 'editor-styles' ) );
        $this->assertTrue( current_theme_supports( 'responsive-embeds' ) );
    }

    /**
     * Test that the custom pattern category 'nmcc' is successfully registered.
     */
    public function test_pattern_category_registration() {
        nmcc_setup();

        $registry = WP_Block_Pattern_Categories_Registry::get_instance();
        $this->assertTrue( $registry->is_registered( 'nmcc' ) );
        
        $category = $registry->get_registered( 'nmcc' );
        $this->assertEquals( 'New Mexico Cherokee Community', $category['label'] );
    }

    /**
     * Test that our custom block editor formats script and style are correctly enqueued.
     */
    public function test_assets_registration() {
        nmcc_block_editor_assets();

        $this->assertTrue( wp_script_is( 'nmcc-editor-formats', 'registered' ) );
        $this->assertTrue( wp_style_is( 'nmcc-editor-style', 'registered' ) );
    }
}

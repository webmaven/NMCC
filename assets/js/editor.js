/**
 * Gutenberg Editor Extension: Inline Bilingual Styles
 *
 * Registers custom RichText format types in the WordPress Block Editor
 * to allow highlighting text and applying "ᏣᎳᎩ" (Syllabary) and "Translit"
 * styles with proper accessibility lang attributes.
 *
 * @package NMCC
 */

( function( wp ) {
    if ( ! wp || ! wp.richText || ! wp.element ) {
        return;
    }

    var registerFormatType = wp.richText.registerFormatType;
    var toggleFormat = wp.richText.toggleFormat;
    
    // Support compatibility for WordPress 6.0+ where RichTextToolbarButton moved to blockEditor
    var RichTextToolbarButton = wp.blockEditor 
        ? wp.blockEditor.RichTextToolbarButton 
        : ( wp.editor ? wp.editor.RichTextToolbarButton : null );

    if ( ! RichTextToolbarButton ) {
        return;
    }

    // 1. Register "ᏣᎳᎩ (Syllabary)" Inline Format
    registerFormatType( 'nmcc/cherokee-syllabary', {
        title: 'ᏣᎳᎩ (Cherokee Syllabary)',
        tagName: 'span',
        className: 'cherokee-syllabary',
        attributes: {
            lang: 'lang'
        },
        edit: function( props ) {
            var isActive = props.isActive;
            var value = props.value;
            var onChange = props.onChange;

            return wp.element.createElement( RichTextToolbarButton, {
                icon: 'editor-textcolor',
                title: 'ᏣᎳᎩ (Cherokee Syllabary)',
                onClick: function() {
                    onChange( toggleFormat( value, {
                        type: 'nmcc/cherokee-syllabary',
                        attributes: {
                            lang: 'chr'
                        }
                    } ) );
                },
                isActive: isActive,
            } );
        }
    } );

    // 2. Register "Cherokee Translit" Inline Format
    registerFormatType( 'nmcc/cherokee-translit', {
        title: 'Cherokee Translit',
        tagName: 'span',
        className: 'cherokee-translit',
        attributes: {
            lang: 'lang'
        },
        edit: function( props ) {
            var isActive = props.isActive;
            var value = props.value;
            var onChange = props.onChange;

            return wp.element.createElement( RichTextToolbarButton, {
                icon: 'translation',
                title: 'Cherokee Translit',
                onClick: function() {
                    onChange( toggleFormat( value, {
                        type: 'nmcc/cherokee-translit',
                        attributes: {
                            lang: 'chr-Latn'
                        }
                    } ) );
                },
                isActive: isActive,
            } );
        }
    } );
} )( window.wp );

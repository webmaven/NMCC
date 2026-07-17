/**
 * Jest Unit Test: Gutenberg Inline Bilingual Formats
 *
 * Verifies that the editor.js script correctly registers the
 * custom RichText formats with standard block parameters and lang bindings.
 *
 * @package NMCC
 */

describe('Gutenberg Inline Bilingual Formats registration', () => {
    let mockRegisterFormatType;

    beforeEach(() => {
        // Reset modules and mock definitions before each test
        jest.resetModules();

        mockRegisterFormatType = jest.fn();

        // Setup global window.wp mockup representing Gutenberg block API
        global.window = {};
        global.wp = {
            richText: {
                registerFormatType: mockRegisterFormatType,
                toggleFormat: jest.fn(),
            },
            element: {
                createElement: jest.fn((comp, props) => ({ comp, props })),
            },
            blockEditor: {
                RichTextToolbarButton: 'RichTextToolbarButton',
            }
        };
        global.window.wp = global.wp;
    });

    afterEach(() => {
        // Clean up globals after test runs
        delete global.window;
        delete global.wp;
    });

    test('should register custom bilingual format types successfully', () => {
        // Load the script to trigger registrations
        require('../assets/js/editor.js');

        // Verify registerFormatType was called exactly twice
        expect(mockRegisterFormatType).toHaveBeenCalledTimes(2);

        // Verify "nmcc/cherokee-syllabary" registration parameters
        expect(mockRegisterFormatType).toHaveBeenCalledWith(
            'nmcc/cherokee-syllabary',
            expect.objectContaining({
                title: 'ᏣᎳᎩ (Cherokee Syllabary)',
                tagName: 'span',
                className: 'cherokee-syllabary',
                attributes: expect.objectContaining({
                    lang: 'lang'
                }),
                edit: expect.any(Function),
            })
        );

        // Verify "nmcc/cherokee-translit" registration parameters
        expect(mockRegisterFormatType).toHaveBeenCalledWith(
            'nmcc/cherokee-translit',
            expect.objectContaining({
                title: 'Cherokee Translit',
                tagName: 'span',
                className: 'cherokee-translit',
                attributes: expect.objectContaining({
                    lang: 'lang'
                }),
                edit: expect.any(Function),
            })
        );
    });
});
// ᏣᎳᎩ ᏗᏓᏤᎵᎩ

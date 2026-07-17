#!/usr/bin/env python3
"""
NMCC WordPress Block Theme Structural Test Runner

Performs static integrity testing on theme.json and parses Full Site Editing (FSE)
HTML block templates to verify strict nesting rules for Gutenberg block comments,
ensuring perfect rendering on the frontend and inside the WordPress editor.

@package NMCC
"""

import json
import os
import re
import sys

def test_theme_json():
    print("Testing theme.json structural syntax and schema settings...")
    theme_json_path = os.path.join(os.path.dirname(__file__), '../theme.json')
    if not os.path.exists(theme_json_path):
        print("FAIL: theme.json not found!")
        return False
    
    try:
        with open(theme_json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"FAIL: theme.json contains invalid JSON syntax: {e}")
        return False

    # Check top-level settings
    if "settings" not in data:
        print("FAIL: theme.json is missing top-level 'settings' block!")
        return False

    # Check palette colors
    palette = data.get("settings", {}).get("color", {}).get("palette", [])
    color_slugs = {color.get("slug") for color in palette}
    required_colors = {"clay", "sage", "soft-cream", "warm-alabaster", "warm-charcoal"}
    missing_colors = required_colors - color_slugs
    if missing_colors:
        print(f"FAIL: theme.json palette is missing required color slugs: {missing_colors}")
        return False

    # Check font families
    font_families = data.get("settings", {}).get("typography", {}).get("fontFamilies", [])
    font_slugs = {font.get("slug") for font in font_families}
    required_fonts = {"noto-serif", "noto-sans"}
    missing_fonts = required_fonts - font_slugs
    if missing_fonts:
        print(f"FAIL: theme.json is missing required font family slugs: {missing_fonts}")
        return False

    # Check color/font editing guardrails
    custom_color = data.get("settings", {}).get("color", {}).get("custom", True)
    custom_font_size = data.get("settings", {}).get("typography", {}).get("customFontSize", True)
    if custom_color is not False:
        print("FAIL: theme.json allows custom color pickers! Must be set to false.")
        return False
    if custom_font_size is not False:
        print("FAIL: theme.json allows custom font sizes! Must be set to false.")
        return False

    print("PASS: theme.json configuration is structurally sound!")
    return True


def test_block_templates():
    print("\nTesting FSE templates and template parts block nesting integrity...")
    root_dir = os.path.join(os.path.dirname(__file__), '..')
    dirs_to_check = [os.path.join(root_dir, 'templates'), os.path.join(root_dir, 'parts')]
    
    errors = 0
    checked_files = 0

    # Match Gutenberg FSE block comments:
    # 1. Open Block: <!-- wp:slug {...} -->
    # 2. Self-Closing Block: <!-- wp:slug /-->
    # 3. Close Block: <!-- /wp:slug -->
    block_pattern = re.compile(r'<!--\s+(/?wp:[\w/-]+)(.*?)\s*-->')

    for directory in dirs_to_check:
        if not os.path.exists(directory):
            continue
        
        for filename in os.listdir(directory):
            if not filename.endswith('.html'):
                continue
            
            checked_files += 1
            file_path = os.path.join(directory, filename)
            
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            matches = block_pattern.findall(content)
            stack = []
            
            for tag, attributes in matches:
                tag = tag.strip()
                attrs_stripped = attributes.strip()
                # 1. Self-closing block: starts with wp: and ends with /
                if tag.startswith('wp:') and attrs_stripped.endswith('/'):
                    continue
                # 2. Open block
                elif tag.startswith('wp:'):
                    stack.append((tag, filename))
                # 3. Close block
                elif tag.startswith('/wp:'):
                    expected_open = tag[1:] # strip '/'
                    if not stack:
                        print(f"FAIL: {filename} has unexpected close tag {tag} without matching open tag!")
                        errors += 1
                        break
                    
                    open_tag, file_ref = stack.pop()
                    if open_tag != expected_open:
                        print(f"FAIL: {filename} has mismatched close tag {tag}. Expected closure for {open_tag}!")
                        errors += 1
                        break
            
            # If stack is not empty after file read completes
            if stack:
                for open_tag, file_ref in stack:
                    print(f"FAIL: {filename} contains unclosed block {open_tag}!")
                    errors += 1

    if errors == 0:
        print(f"PASS: Verified {checked_files} FSE template HTML files! All block tags are properly nested and balanced.")
        return True
    else:
        print(f"FAIL: Found {errors} structural issues inside template files!")
        return False


if __name__ == '__main__':
    theme_ok = test_theme_json()
    templates_ok = test_block_templates()
    
    if theme_ok and templates_ok:
        print("\nSUCCESS: All structural and syntax validation checks passed!")
        sys.exit(0)
    else:
        print("\nFAILURE: One or more validation checks failed!")
        sys.exit(1)

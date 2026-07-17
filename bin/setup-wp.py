#!/usr/bin/env python3
"""
Lightweight WordPress SQLite Local Server Setup Script

Downloads WordPress Core, installs the SQLite integration drop-in,
symlinks our NMCC theme, and sets up a local PHP server context for taking screenshots.

@package NMCC
"""

import os
import shutil
import urllib.request
import zipfile

def setup():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    wp_dir = os.path.join(root_dir, '.wordpress_local')
    
    print("Setting up local SQLite-based WordPress environment...")
    
    if os.path.exists(wp_dir):
        print(f"Removing existing directory: {wp_dir}")
        shutil.rmtree(wp_dir)
        
    os.makedirs(wp_dir, exist_ok=True)
    
    # 1. Download WordPress Core
    wp_zip = os.path.join(wp_dir, 'wordpress.zip')
    print("Downloading WordPress Core...")
    urllib.request.urlretrieve('https://wordpress.org/latest.zip', wp_zip)
    
    print("Extracting WordPress Core...")
    with zipfile.ZipFile(wp_zip, 'r') as zip_ref:
        zip_ref.extractall(wp_dir)
        
    # Move extracted files to the main .wordpress_local directory
    extracted_dir = os.path.join(wp_dir, 'wordpress')
    for item in os.listdir(extracted_dir):
        shutil.move(os.path.join(extracted_dir, item), wp_dir)
    os.rmdir(extracted_dir)
    os.remove(wp_zip)
    
    # 2. Download SQLite Database Integration plugin
    sqlite_zip = os.path.join(wp_dir, 'sqlite-plugin.zip')
    print("Downloading SQLite Integration Plugin...")
    urllib.request.urlretrieve('https://downloads.wordpress.org/plugin/sqlite-database-integration.zip', sqlite_zip)
    
    print("Extracting SQLite Integration Plugin...")
    plugin_dir = os.path.join(wp_dir, 'wp-content', 'plugins')
    os.makedirs(plugin_dir, exist_ok=True)
    with zipfile.ZipFile(sqlite_zip, 'r') as zip_ref:
        zip_ref.extractall(plugin_dir)
    os.remove(sqlite_zip)
    
    # 3. Setup SQLite drop-in db.php
    print("Setting up SQLite db.php drop-in...")
    db_php_src = os.path.join(plugin_dir, 'sqlite-database-integration', 'db.copy')
    db_php_dest = os.path.join(wp_dir, 'wp-content', 'db.php')
    shutil.copy(db_php_src, db_php_dest)
    
    # Edit db.php to define the correct SQLite path
    with open(db_php_dest, 'r', encoding='utf-8') as f:
        db_content = f.read()
    
    # Update SQLite database directory location references
    db_content = db_content.replace("define( 'DB_DIR', WP_CONTENT_DIR . '/database/' );", "define( 'DB_DIR', WP_CONTENT_DIR . '/database/' );")
    with open(db_php_dest, 'w', encoding='utf-8') as f:
        f.write(db_content)
        
    # 4. Create wp-config.php from sample
    print("Configuring wp-config.php...")
    sample_config = os.path.join(wp_dir, 'wp-config-sample.php')
    config_file = os.path.join(wp_dir, 'wp-config.php')
    
    with open(sample_config, 'r', encoding='utf-8') as f:
        config_content = f.read()
        
    # Inject SQLite activation trigger into wp-config.php
    config_content = config_content.replace("<?php", "<?php\n// Activate SQLite database integration\ndefine( 'DB_ENGINE', 'sqlite' );\n")
    
    with open(config_file, 'w', encoding='utf-8') as f:
        f.write(config_content)
        
    # 5. Link our theme directory
    theme_dest = os.path.join(wp_dir, 'wp-content', 'themes', 'NMCC')
    if os.path.exists(theme_dest):
        if os.path.islink(theme_dest):
            os.unlink(theme_dest)
        else:
            shutil.rmtree(theme_dest)
            
    print("Symlinking NMCC theme directory into WordPress installation...")
    os.symlink(root_dir, theme_dest)
    
    print("\nSUCCESS: WordPress SQLite setup complete!")
    print(f"To start the server, run: php -S 127.0.0.1:8000 -t {wp_dir}")

if __name__ == '__main__':
    setup()

#!/usr/bin/env python3
"""
NMCC WordPress Theme Screenshot Automation Script

Performs the initial WordPress setup on the running local SQLite server,
activates the NMCC block theme, and takes a professional 1200x900 screenshot.

@package NMCC
"""

import os
import sqlite3
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options as ChromeOptions

def setup_wordpress_database():
    print("Checking SQLite database to activate NMCC theme directly...")
    wp_content_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../.wordpress_local/wp-content'))
    db_path = os.path.join(wp_content_dir, 'database', '.ht.sqlite')
    
    if not os.path.exists(db_path):
        print("Database not found yet. The install wizard will create it.")
        return False
        
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # We need to set template and stylesheet option values to 'NMCC'
        # Options are in 'wp_options' table
        print("Activating NMCC theme directly in the SQLite database...")
        cursor.execute("UPDATE wp_options SET option_value = 'NMCC' WHERE option_name IN ('template', 'stylesheet', 'current_theme')")
        conn.commit()
        
        # Verify
        cursor.execute("SELECT option_name, option_value FROM wp_options WHERE option_name IN ('template', 'stylesheet')")
        rows = cursor.fetchall()
        print(f"Active Theme Settings: {rows}")
        
        conn.close()
        return True
    except Exception as e:
        print(f"Error updating SQLite database directly: {e}")
        return False

def main():
    print("Initializing Webdriver for screenshot capture...")
    
    # Try Chrome first (headless)
    try:
        chrome_options = ChromeOptions()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--window-size=1200,900")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        driver = webdriver.Chrome(options=chrome_options)
        print("Using Google Chrome in headless mode.")
    except Exception as e:
        print(f"Chrome initialization failed: {e}. Falling back to Safari.")
        # Try Safari as native macOS fallback
        try:
            driver = webdriver.Safari()
            driver.set_window_size(1200, 900)
            print("Using Safari.")
        except Exception as se:
            print(f"Safari failed: {se}.")
            print("Ensure Google Chrome is installed, or Safari's 'Allow Remote Automation' is toggled in Safari > Develop menu.")
            return

    try:
        # Step 1: Visit WordPress installation
        print("Visiting local WordPress environment at http://127.0.0.1:8000...")
        driver.get("http://127.0.0.1:8000")
        time.sleep(4)
        
        current_url = driver.current_url
        print(f"Current page URL: {current_url}")
        
        # Step 2: Handle installation wizard if present
        if "setup-config" in current_url or "install.php" in current_url:
            print("WordPress installation page detected. Performing automated setup...")
            
            # Select language if continue button is present
            try:
                lang_btn = driver.find_element(By.ID, "language-continue")
                lang_btn.click()
                print("Selected English language. Waiting for setup form to load...")
                time.sleep(3)
            except Exception:
                pass
                
            # Fill out administrative installation form with explicit WebdriverWait
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC
            
            try:
                print("Waiting for form inputs to render...")
                # Wait up to 10 seconds for the weblog_title field to be fully present and visible
                title_field = WebDriverWait(driver, 10).until(
                    EC.visibility_of_element_located((By.ID, "weblog_title"))
                )
                title_field.send_keys("New Mexico Cherokee Community")
                
                # Fill in username (ID is user_login, name is user_name)
                username_field = driver.find_element(By.ID, "user_login")
                username_field.send_keys("admin")
                
                # Fill in password
                pass_field = driver.find_element(By.ID, "pass1")
                pass_field.clear()
                pass_field.send_keys("password")
                
                # Check confirm weak password checkbox (name is pw_weak)
                try:
                    weak_check = driver.find_element(By.NAME, "pw_weak")
                    if not weak_check.is_selected():
                        weak_check.click()
                        print("Confirmed weak password usage.")
                except Exception:
                    pass
                    
                # Fill in email and click submit
                driver.find_element(By.ID, "admin_email").send_keys("info@nmcherokee.org")
                driver.find_element(By.ID, "submit").click()
                print("WordPress installation submitted. Waiting 10 seconds for database migration...")
                time.sleep(10)
            except Exception as e:
                print(f"Error filling setup form: {e}")
                
        # Step 3: Directly update SQLite db to activate NMCC theme
        setup_wordpress_database()
        
        # Step 4: Visit homepage with NMCC activated
        print("Navigating to home page with NMCC activated...")
        driver.get("http://127.0.0.1:8000")
        time.sleep(5) # Give block styles and fonts time to fully render
        
        # Take screenshot of the exact viewport
        screenshot_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../screenshot.png'))
        driver.save_screenshot(screenshot_path)
        print(f"\nSUCCESS: Captured 1200x900 theme screenshot and saved to: {screenshot_path}")

    finally:
        driver.quit()

if __name__ == '__main__':
    main()

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function verifyRsvpPositioning() {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: false });
    const page = await browser.newPage({ viewport: { width: 820, height: 1200 } });

    // Navigate to an actual event page with RSVP
    // Using one of the existing event pages (bride-groom, aqilxaqil, etc.)
    console.log('Navigating to event page...');
    await page.goto('http://localhost:3001/bride-groom', { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for the page to fully load
    await page.waitForTimeout(2000);

    console.log('Taking initial screenshot...');
    await page.screenshot({ path: 'rsvp-initial.png' });

    // Dismiss the envelope cover first (click on the seal or center)
    console.log('Dismissing envelope cover by clicking center...');
    await page.locator('.env-cover').click({ position: { x: 400, y: 600 } });
    await page.waitForTimeout(2000); // Wait for animation

    // Check if envelope is gone
    const envStillThere = await page.locator('.env-cover').count();
    if (envStillThere === 0) {
      console.log('Envelope dismissed successfully');
    } else {
      console.log('Envelope still visible, waiting longer...');
      await page.waitForTimeout(1500);
    }

    // Look for RSVP button/circle in the footer
    // The RSVP circle is typically at the bottom center
    console.log('Looking for RSVP button...');

    // Try to find and click the RSVP circle
    const rsvpCircle = page.locator('.footer-rsvp, [onclick*="rsvp"], button:has-text("RSVP")');
    const rsvpCount = await rsvpCircle.count();
    console.log(`Found ${rsvpCount} RSVP elements`);

    if (rsvpCount > 0) {
      console.log('Clicking RSVP button...');
      await rsvpCircle.first().click();
      await page.waitForTimeout(500);

      console.log('Taking screenshot after RSVP click...');
      await page.screenshot({ path: 'rsvp-opened.png' });

      // Look for Accept button
      console.log('Looking for Accept button...');
      const acceptBtn = page.locator('button:has-text("Accept")');
      const acceptCount = await acceptBtn.count();
      console.log(`Found ${acceptCount} Accept buttons`);

      if (acceptCount > 0) {
        console.log('Clicking Accept button...');
        await acceptBtn.first().click();
        await page.waitForTimeout(500);

        console.log('Taking screenshot after Accept click...');
        await page.screenshot({ path: 'rsvp-form-open.png' });

        // Measure positions
        const rsvpCard = page.locator('.rsvp-popup, .contact-card.rsvp-popup');
        const footer = page.locator('.footer-container, .preview-footer-enter');

        if (await rsvpCard.count() > 0) {
          const cardBox = await rsvpCard.first().boundingBox();
          console.log('RSVP Card position:', cardBox);

          if (await footer.count() > 0) {
            const footerBox = await footer.first().boundingBox();
            console.log('Footer position:', footerBox);

            if (cardBox && footerBox) {
              const gap = footerBox.y - (cardBox.y + cardBox.height);
              console.log(`Gap between RSVP card and footer: ${gap}px`);

              if (gap >= 10) {
                console.log('✓ RSVP card positioning looks good - sufficient spacing above footer');
              } else {
                console.log('⚠ Warning: RSVP card might be too close to footer');
              }
            }
          }
        }
      }
    } else {
      console.log('Could not find RSVP button - checking for alternate selectors...');

      // Try finding by aria-label or other attributes
      const allButtons = page.locator('button, [role="button"]');
      const count = await allButtons.count();
      console.log(`Found ${count} button elements total`);

      // Take a screenshot to see what's on the page
      await page.screenshot({ path: 'rsvp-page-debug.png' });
    }

    console.log('Verification complete!');
    console.log('Screenshots saved:');
    console.log('  - rsvp-initial.png: Initial state');
    console.log('  - rsvp-opened.png: After clicking RSVP');
    console.log('  - rsvp-form-open.png: After clicking Accept');
    console.log('  - rsvp-page-debug.png: Page debug (if RSVP not found)');

  } catch (error) {
    console.error('Error during verification:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

verifyRsvpPositioning();

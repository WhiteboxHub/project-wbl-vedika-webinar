const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  console.log('Navigating to login...');
  await page.goto('http://localhost:5173/login');
  
  console.log('Logging in...');
  await page.type('input[type="email"]', 'instructor@example.com');
  await page.type('input[type="password"]', 'webinar123');
  await page.click('button[type="submit"]');
  
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  
  console.log('Navigating to classroom...');
  // Note: we can't navigate to /class/... directly because location.state will be empty
  // Instead, let's navigate to dashboard, wait for the session list, and click "Join as Host"
  
  await page.goto('http://localhost:5173/dashboard');
  
  console.log('Clicking the first session...');
  await page.waitForSelector('.glass-panel h3'); // Wait for session cards
  const sessions = await page.$$('.glass-panel');
  if (sessions.length > 0) {
    await sessions[0].click();
    await page.waitForTimeout(1000);
    
    // Now we should be on SessionDetail, click Join as Host
    console.log('Clicking Join as Host...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const hostBtn = btns.find(b => b.textContent.includes('Join as Host'));
      if (hostBtn) hostBtn.click();
    });
    
    await page.waitForTimeout(5000); // Wait 5 seconds on the classroom page to capture any errors
  } else {
    console.log('No sessions found!');
  }
  
  await browser.close();
  console.log('Done.');
})();

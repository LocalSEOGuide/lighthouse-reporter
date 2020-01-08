// Dependencies
// DEBUG
const log = require('why-is-node-running');

const lighthouse = require('lighthouse');
const chrome_launcher = require('chrome-launcher');
const db = require('./database');
const file = require('./file');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Read the config file
dotenv.config();

// Lighthouse options
const options = {
  chromeFlags: ['--headless', '--no-sandbox']
};

// A config, don't know what it does
const config = {
  extends: 'lighthouse:default'
};

// Connect the database
db.connect(() => {
  // Check for files in the input folder
  const input_files = fs.readdirSync(path.join(__dirname, 'input'));
  if (input_files.length > 0) {
    // We have an input file, so let's process it
    console.log('Got a file! Process it...');
    processFile(path.join(__dirname, 'input', input_files[0]));
  }else{
    // TODO: Check to see if it is time to rerun old URLs and remove expired ones
    doAutomaticReporting();
  }
});

// Read file from path, parse CSV data, and generate reports
async function processFile (path) {
  file.readCsv(path, (data) => {
    generateBulkReports(data).then(() => {
      const promises = [];

      // Set this to be run once per month for three months
      for (let i = 0; i < data.length; i++) {
        const row = data[i];

        // Get the URL and the template (to avoid case sensitivity)
        let url;
        let template;

        for (let prop in row) {
          if (prop.toLowerCase() == 'url') {
            url = row[prop];
          }
          if (prop.toLowerCase() == 'template') {
            template = row[prop];
          }
        }

        // Store this URL in the database to be automagically run later
        promises.push(db.insertURL(url, template));
      }

      // Close database when all queries are finished
      Promise.all(promises)
        .then(() => {
          closeDatabase();
        })
        .catch((e) => {
          console.error(e);
        });
    });
  });
}

// Check the database for URLs that need to be run again
async function doAutomaticReporting () {
  const urlsToUpdate = [];

  // What's the current date?
  const results = await db.getUrlsThatNeedUpdating();

  console.log(`Found ${results.rows.length} URLs to automatically update.`);

  results.rows.forEach(row => {
    urlsToUpdate.push({
      url: row.url,
      template: row.template
    });

    db.updateLatestDateForURL(row.id);
  });

  // Do reports for all URLs that need updating
  await generateBulkReports(urlsToUpdate);

  // Now, remove all URLs that have expired
  await db.removeExpiredUrls();

  // Finally close the connection
  closeDatabase();
}

// Generate reports from a bulk list of URLs
async function generateBulkReports (data) {
  // For each URL
  for (let i = 0; i < data.length; i++) {
    const row = data[i]; // The current row

    // Get the URL and the template
    let url;
    let template;

    for (let prop in row) {
      if (prop.toLowerCase() == 'url') {
        url = row[prop];
      }
      if (prop.toLowerCase() == 'template') {
        template = row[prop];
      }
    }

    // Generate a lighthouse report
    try {
      console.log('Performing audit');
      const lhr = await performAudit(url, options);

      // Store the report in the database
      console.log('Inserting report');
      await db.insertReport(lhr, template);
    }catch (err) {
      console.error(err);
    }
  }
}

// Finally close the connection
function closeDatabase () {
  db.disconnect();
}

// This function launches lighthouse and returns a report (USE AWAIT)
function performAudit (url, opts, config = null) {
  return chrome_launcher.launch({ chromeFlags: opts.chromeFlags }).then(chrome => {
    opts.port = chrome.port;

    return lighthouse(url, opts, config).then(results => {
      return chrome.kill().then(() => results.lhr).catch(err => console.error(err));
    }).catch(up => {
      console.log('Killing Chrome to prevent hanging.');
      chrome.kill(); // <-- Kill chrome anyway
      throw up; // <- ha ha
    });
  });
}

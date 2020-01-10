// Dependencies
const lighthouse = require('lighthouse');
const chrome_launcher = require('chrome-launcher');
const db = require('./database');
const file = require('./file');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Environment variables
dotenv.config();

// Is this a recurring report?
let should_repeat = false;

if (process.argv.length > 2) {
  console.log('$$$This report will re-run once a month for 90 days.');
  should_repeat = true;
}else{
  console.log('$$$This report will only run once.');
}

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
async function processFile (file_path) {
  file.readCsv(file_path, (data) => {
    generateBulkReports(data).then((reports) => {
      const csv_header = [
        {id: 'url', title: 'URL'},
        {id: 'template', title: 'Template'},
        {id: 'performance', title: 'Performance'},
        {id: 'accessibility', title: 'Accessibility'},
        {id: 'bestPractices', title: 'Best Practices'},
        {id: 'seo', title: 'SEO'},
        {id: 'pwa', title: 'Progressive Web App'}
      ];

      const csv_records = [];

      reports.forEach((report) => {
        const performance_score = report.lhr.categories['performance'].score;
        const accessibility_score = report.lhr.categories['accessibility'].score;
        const best_practices_score = report.lhr.categories['best-practices'].score;
        const seo_score = report.lhr.categories['seo'].score;
        const pwa_score = report.lhr.categories['pwa'].score;

        csv_records.push({
          url: report.url,
          template: report.template,
          performance: performance_score,
          accessibility: accessibility_score,
          bestPractices: best_practices_score,
          seo: seo_score,
          pwa: pwa_score,
        });
      });

      const out_path = path.join(__dirname, 'output', 'output.csv');
      const csv_writer = createCsvWriter({
        path: out_path,
        header: csv_header
      });

      csv_writer.writeRecords(csv_records)
        .then(() => {
          console.log('Finished writing records to output file.');
        }).catch(err => {
          console.error(err);
        });

      // Handle pushing URLs into the database, if necessary
      const promises = [];

      if (should_repeat) {
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
      }

      // Close database when all queries are finished
      Promise.all(promises)
        .then(() => {
          closeDatabase();
        })
        .catch((e) => {
          console.error(e);
        });
    }).catch(e => {
      console.error(e);
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
  // Capture the reports to return when finished
  const all_reports = [];

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

      all_reports.push({
        url: url,
        template: template,
        lhr: lhr,
      });

      // Store the report in the database
      console.log('Inserting report');
      await db.insertReport(lhr, template);
    }catch (err) {
      console.error(err);
    }
  }

  return all_reports;
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

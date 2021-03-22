// Load environment variables
const dotenv = require('dotenv');
dotenv.config();

// dependencies
const lighthouse = require('lighthouse');
const chrome_launcher = require('chrome-launcher');
const db = require('./database');
const fs = require('fs');
const path = require('path');
const neat_csv = require('neat-csv');

// Is this a recurring report or no?
let should_repeat = false;

// For how long should this URL automatically be reported on?
let auto_report_lifetime = 90; // Days

// How frequently should this report be rerun
let auto_report_interval = 30; // Days between reports

// Get the args
// If auto report
if (process.argv.length > 2) {
  should_repeat = process.argv[2] == 'auto';
}

// If interval is supplied
if (should_repeat) {
  if (process.argv.length > 3) {
    auto_report_interval = parseInt(process.argv[3]);
  }

  // If lifetime is supplied
  if (process.argv.length > 4) {
    auto_report_lifetime = parseInt(process.argv[4]);
  }
}

// Validate arguments
if (isNaN(auto_report_interval) || isNaN(auto_report_lifetime) ||
                auto_report_interval < 1 || auto_report_lifetime < 1) {
  console.log('$$$Sorry, please check your input.');
  process.exit(1);
}

if (should_repeat) {
  console.log('$$$This report will run every ' + auto_report_interval + ' days for ' + auto_report_lifetime + ' days.');
}else{
  console.log('$$$This report will only run once.');
}

// Lighthouse options
const options = {
  chromeFlags: ['--headless', '--disable-dev-shm-usage', '--no-sandbox']
};

// A config, don't know what it does
const config = {
  extends: 'lighthouse:default',
  settings: {
    throttling: {
      cpuSlowdownMultiplier: 2
    }
  }
};

// Perform the audit (returns the final report, if successful)
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
  }).catch(downTheGauntlet => {
    throw downTheGauntlet; // <-- CHALLENGE ACCEPTED
  });
}

// Take a list of urls and templates and do the whole reporting thing
// Generate report, then parse and store in the database
async function doReporting (urls_and_templates, budgets) {
  // Loop through all of the urls and templates
  for (let i = 0; i < urls_and_templates.length; i++) {
    // Get the URL and Template
    let url;
    let template;

    for (const prop in urls_and_templates[i]) {
      if (prop.toLowerCase().includes('url')) {
        url = urls_and_templates[i][prop];
      } else if (prop.toLowerCase().includes('template')) {
        template = urls_and_templates[i][prop];
      }
    }

    // Logging
    console.log(urls_and_templates[i]);

    if (budgets) {
      options.budgets = budgets;
    }

    // Perform the audit (catch error if needed)
    try {
      const report = await performAudit(url, options, config);

      // Check for errors and proceed if all is well
      if (report['runtimeError'] != null) {
        console.error(report['runtimeError']['message']);
      }else{
        // Generate insert the report into the database tables
        await parseReportAndStore(url, template, report);
      }
    } catch (e) {
      console.error(e);
    }
  }
}

// This function parses the report and stores in the correct tables
async function parseReportAndStore (url, template, report) {
  // Get the values as needed
  const fetch_time = report['fetchTime'];
  let page_size = report['audits']['total-byte-weight']['numericValue'];
  const first_contentful_paint = report['audits']['first-contentful-paint']['numericValue'];
  const max_potential_fid = report['audits']['max-potential-fid']['numericValue'];
  const time_to_interactive = report['audits']['interactive']['numericValue'];
  const first_meaningful_paint = report['audits']['first-meaningful-paint']['numericValue'];
  const first_cpu_idle = report['audits']['first-cpu-idle']['numericValue'];
  const largest_contentful_paint = report['audits']['largest-contentful-paint']['numericValue'];
  const cumulative_layout_shift = report['audits']['cumulative-layout-shift']['numericValue'];
  const total_blocking_time = report['audits']['total-blocking-time']['numericValue'];
  const speed_index = report['audits']['speed-index']['numericValue'];

  // These are lists and will have to be iterated
  const network_resources = report['audits']['network-requests']['details']['items'];
  const savings_opportunities = [];

  // Loop through the audits to find savings opportunities
  for (const audit_name in report['audits']) {
    if (!report['audits'].hasOwnProperty(audit_name)) {
      continue; // <-- Sanity check
    }

    const audit = report['audits'][audit_name];

    if (audit.hasOwnProperty('details') && audit['details'] != null) {
      if (audit['details']['type'] == 'opportunity') {
        savings_opportunities.push({
          audit_text: audit['title'],
          estimated_savings: audit['details']['overallSavingsMs']
        });
      }
    }
  }

  // Locate all diagnostics
  const diagnostics = [];
  let current_list_of_items = [];

  // These are the diagnostics we care about
  //  mainthread-work-breakdown
  //  bootup-time
  //  font-display
  //  third-party-summary
  //  dom-size

  // Main thread work breakdown
  if (report['audits']['mainthread-work-breakdown']['score'] != 1 &&
      report['audits']['mainthread-work-breakdown']['score'] != undefined) {
        report['audits']['mainthread-work-breakdown']['details']['items'].forEach(item => {
          current_list_of_items.push({
            label: item['groupLabel'],
            value: item['duration']
          });
        });
  }
  diagnostics.push({
    diagnostic_id: 'mainthread-work-breakdown',
    items: current_list_of_items,
  });
  current_list_of_items = [];

  // bootup-time
  if (report['audits']['bootup-time']['score'] != 1 &&
      report['audits']['bootup-time']['score'] != undefined) {
        report['audits']['bootup-time']['details']['items'].forEach(item => {
          current_list_of_items.push({
            label: item['url'],
            value: item['total']
          });
        });
  }
  diagnostics.push({
    diagnostic_id: 'bootup-time',
    items: current_list_of_items,
  });
  current_list_of_items = [];

  // font-display
  if (report['audits']['font-display']['score'] != 1 &&
      report['audits']['font-display']['score'] != undefined) {
        report['audits']['font-display']['details']['items'].forEach(item => {
          current_list_of_items.push({
            label: item['url'],
            value: item['wastedMs']
          });
        });
  }
  diagnostics.push({
    diagnostic_id: 'font-display',
    items: current_list_of_items,
  });
  current_list_of_items = [];

  // third-party-summary
  if (report['audits']['third-party-summary']['score'] != 1 &&
      report['audits']['third-party-summary']['score'] != undefined) {
        report['audits']['third-party-summary']['details']['items'].forEach(item => {
          current_list_of_items.push({
            label: item['entity']['text'],
            value: item['blockingTime']
          });
        });
  }
  diagnostics.push({
    diagnostic_id: 'third-party-summary',
    items: current_list_of_items,
  });
  current_list_of_items = [];

  // dom-size
  if (report['audits']['dom-size']['score'] != 1 &&
      report['audits']['dom-size']['score'] != undefined) {
        report['audits']['dom-size']['details']['items'].forEach(item => {
          current_list_of_items.push({
            label: item['statistic'],
            value: item['value']
          });
        });
  }
  diagnostics.push({
    diagnostic_id: 'dom-size',
    items: current_list_of_items,
  });

  // V6.0 Grab the budget metrics
  const performance_budget = [];
  const timing_budget = [];

  if (report['audits']['performance-budget'] && report['audits']['performance-budget']['details']) {
    for (const item of report['audits']['performance-budget']['details']['items']) {
      const item_label = item['label'];
      const item_request_count = item['requestCount'] || 0;
      const item_transfer_size = item['transferSize'] || 0;
      let item_count_over_budget = 0;
      if (item['countOverBudget'] != null) {
        item_count_over_budget = item['countOverBudget'].replace(/\D/g, '')
      }
      const item_size_over_budget = item['sizeOverBudget'] || 0;

      performance_budget.push({
        item_label,
        item_request_count,
        item_transfer_size,
        item_count_over_budget,
        item_size_over_budget
      });
    }
  }

  if (report['audits']['timing-budget'] && report['audits']['timing-budget']['details']) {
    for (const item of report['audits']['timing-budget']['details']['items']) {
      const item_label = item['label'];
      const item_measurement = item['measurement'] || 0;
      const item_over_budget = item['overBudget'] || 0;

      timing_budget.push({
        item_label,
        item_measurement,
        item_over_budget,
      });
    }
  }

  // Perform some conversions
  page_size = page_size / 1024; // <-- Convert KB to MB

  // Prepare the queries
  const raw_reports_query_text = `INSERT INTO raw_reports (
                                              url,
                                              template,
                                              fetch_time,
                                              report
                                            )
                                            VALUES (
                                              $1, $2, $3, $4
                                            )`;

  const gds_audit_query_text = `INSERT INTO gds_audits (
                                              url,
                                              template,
                                              fetch_time,
                                              page_size,
                                              first_contentful_paint,
                                              max_potential_fid,
                                              time_to_interactive,
                                              first_meaningful_paint,
                                              first_cpu_idle,
                                              largest_contentful_paint,
                                              cumulative_layout_shift,
                                              total_blocking_time,
                                              speed_index
                                            )
                                            VALUES (
                                              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                                            )`;

  const resource_chart_query_text = `INSERT INTO resource_chart (
                                                  audit_url,
                                                  template,
                                                  fetch_time,
                                                  resource_url,
                                                  resource_type,
                                                  start_time,
                                                  end_time
                                                 )
                                                 VALUES (
                                                   $1, $2, $3, $4, $5, $6, $7
                                                 )`;

  const savings_opportunities_query_text = `INSERT INTO savings_opportunities(
                                                          audit_url,
                                                          template,
                                                          fetch_time,
                                                          audit_text,
                                                          estimated_savings
                                                        )
                                                        VALUES (
                                                          $1, $2, $3, $4, $5
                                                        )`;

  const diagnostics_query_text = `INSERT INTO diagnostics(
                                                          audit_url,
                                                          template,
                                                          fetch_time,
                                                          diagnostic_id,
                                                          item_label,
                                                          item_value
                                                        )
                                                        VALUES (
                                                          $1, $2, $3, $4, $5, $6
                                                        )`;

  const performance_budget_query_text = `INSERT INTO budgets(
                                                          audit_url,
                                                          template,
                                                          fetch_time,
                                                          budget_type,
                                                          item_label,
                                                          item_request_count,
                                                          item_transfer_size,
                                                          item_count_over_budget,
                                                          item_size_over_budget
                                                        )
                                                        VALUES (
                                                          $1, $2, $3, $4, $5, $6, $7, $8, $9
                                                        )`;

  const timing_budget_query_text = `INSERT INTO budgets(
                                                          audit_url,
                                                          template,
                                                          fetch_time,
                                                          budget_type,
                                                          item_label,
                                                          item_time,
                                                          item_time_over_budget
                                                        )
                                                        VALUES (
                                                          $1, $2, $3, $4, $5, $6, $7
                                                        )`;

  // Prepare the params for the queries
  let raw_reports_query_params = [
    url,
    template,
    fetch_time,
    report
  ];

  let gds_audit_query_params = [
    url,
    template,
    fetch_time,
    page_size,
    first_contentful_paint,
    max_potential_fid,
    time_to_interactive,
    first_meaningful_paint,
    first_cpu_idle,
    largest_contentful_paint,
    cumulative_layout_shift,
    total_blocking_time,
    speed_index
  ];

  // Execute the queries
  await db.query(raw_reports_query_text, raw_reports_query_params);
  await db.query(gds_audit_query_text, gds_audit_query_params);

  // Insert all resources from the resource table into the resource chart table
  for (let i = 0; i < network_resources.length; i++) {
    const resource = network_resources[i];

    // Filter undefined resource types
    let resource_type = resource['resourceType'];
    if (resource_type == null) {
      resource_type = 'Other';
    }

    const resource_chart_query_params = [
      url,
      template,
      fetch_time,
      resource['url'],
      resource_type,
      resource['startTime'],
      resource['endTime']
    ];
    db.query(resource_chart_query_text, resource_chart_query_params);
  }

  // Insert each savings opportunity into the correct table
  for (let i = 0; i < savings_opportunities.length; i++) {
    const opportunity = savings_opportunities[i];

    const savings_opportunities_query_params = [
      url,
      template,
      fetch_time,
      opportunity['audit_text'],
      opportunity['estimated_savings']
    ];
    db.query(savings_opportunities_query_text, savings_opportunities_query_params);
  }

  // Insert each budget row (if any)
  for (let i = 0; i < performance_budget.length; i++) {
    const item = performance_budget[i];

    const performance_budget_query_params = [
      url,
      template,
      fetch_time,
      'performance',
      item.item_label,
      item.item_request_count,
      item.item_transfer_size,
      item.item_count_over_budget,
      item.item_size_over_budget
    ];

    db.query(performance_budget_query_text, performance_budget_query_params);
  }

  // Insert each budget row (if any)
  for (let i = 0; i < timing_budget.length; i++) {
    const item = timing_budget[i];

    const timing_budget_query_params = [
      url,
      template,
      fetch_time,
      'timing',
      item.item_label,
      item.item_measurement,
      item.item_over_budget,
    ];

    db.query(timing_budget_query_text, timing_budget_query_params);
  }

  // Insert each diagnostic audit into the correct table
  for (let i = 0; i < diagnostics.length; i++) {
    const diag = diagnostics[i];

    for (let j = 0; j < diag['items'].length; j++) {
      const item = diag['items'][j];

      const diagnostics_query_params = [
        url,
        template,
        fetch_time,
        diag['diagnostic_id'],
        item['label'],
        item['value']
      ];

      db.query(diagnostics_query_text, diagnostics_query_params);
    }
  }
}

// Process a file
async function processFile (file_path, budgets) {
  try {
    // Read the file
    const file = fs.readFileSync(file_path);
    const csv_data = await neat_csv(file);

    let hasUrl = false;
    let hasTemplate = false;

    for (const prop in csv_data[0]) {
      if (prop.toLowerCase().includes('url')) {
        hasUrl = true;
      } else if (prop.toLowerCase().includes('template')) {
        hasTemplate = true;
      }
    }

    // Validate that input CSV has URL and Template columns
    if (!hasUrl || !hasTemplate) {
      console.log('$$$Sorry, please make sure your CSV contains two columns labeled \'URL\' and \'Template\'.');
      db.disconnect();
      process.exit(-1);
    }else{
      console.log('All good!');
    }

    // Do reporting on the file
    await doReporting(csv_data, budgets);

    // Recurring reports should be saved in the DB
    if (should_repeat) {
      for (let i = 0; i < csv_data.length; i++) {
        const record = csv_data[i];

        const url = record['URL'];
        const template = record['Template'];

        await db.query(`DELETE FROM urls WHERE url = $1`, [url]);
        await db.query(`INSERT INTO urls(url, template, interval, lifetime) VALUES($1, $2, $3, $4)`, [url, template, auto_report_interval, auto_report_lifetime]);
      }
    }

    // All done!
    console.log('Finished reporting!');
    db.disconnect();
  }catch (err) {
    console.log('$$$Something went wrong trying to read that file.');
    console.error(err);
  }
}

async function doAutomaticReporting () {
  console.log('No file provided, doing automatic reporting...');

  // Read all URLs that need updating from the database
  // If the latest date is longer ago than the interval in days, we need to update
  const db_rows_that_need_updating = await db.query(`SELECT * FROM urls WHERE latest_date < now() - (interval::varchar(255) || 'days')::interval`);
  const urls_that_need_updating = [];

  db_rows_that_need_updating['rows'].forEach(async row => {
    urls_that_need_updating.push({
      URL: row['url'],
      Template: row['template'],
    });

    // Update the latest date for this report
    await db.query(`UPDATE urls SET latest_date = CURRENT_DATE WHERE id = $1`, [ row['id'] ]);
  });

  await doReporting(urls_that_need_updating);

  // Now delete all the URLs that need deleting
  console.log('Cleaning up old URLs from the DB...');
  await db.query(`DELETE FROM urls WHERE start_date < now() - (lifetime::varchar(255) || 'days')::interval`);

  console.log('Done automatically reporting!');

  db.disconnect();
}

// Let's get started
// Connect to the database
db.connect(() => {
  // Check for file input
  const input_files = fs.readdirSync(path.join(__dirname, 'input'));

  // Check for budget file
  let budget_file;

  if (fs.existsSync(path.join(__dirname, 'input', 'budget.json'))) {
    budget_file = JSON.parse(fs.readFileSync(path.join(__dirname, 'input', 'budget.json')));
  }

  if (input_files.length > 0) {
    for (const file of input_files) {
      if (file.endsWith('.csv')) {
        console.log('We got a file! Process it...');
        processFile(path.join(__dirname, 'input', file), budget_file);
        break;
      }
    }
  }else{
    doAutomaticReporting();
  }

  // If there is, this is an initial report
  // If there is NOT, this is an automatic report
  // Get the correct list of URLs
  // Run the reports
  // If this is an AUTOMATIC run, we are done
  // Otherwise, save the list of URLs in the database (if not exists)
});

// Dependencies
const pg = require('pg');

// The postgres client
let client;

// Construct a postgres client and connect it
function connect (callback) {
  client = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS
  });

  // Connect to the database and handle errors
  client.connect((err) => {
    if (err) {
      console.error(err);
    }else{
      console.log('Connected to the database!');

      // Make sure the database tables exist
      client.query(`CREATE TABLE IF NOT EXISTS
                      reports(
                        id SERIAL PRIMARY KEY,
                        lhr json NOT NULL,
                        template VARCHAR (255)
                      )`
                  );

      client.query(`CREATE TABLE IF NOT EXISTS
                      urls(
                        id SERIAL PRIMARY KEY,
                        url VARCHAR (2048) NOT NULL,
                        template VARCHAR (255),
                        first_date DATE NOT NULL DEFAULT CURRENT_DATE,
                        latest_date DATE NOT NULL DEFAULT CURRENT_DATE
                      )`
                  );

      // Call the callback
      callback();
    }
  });
}

// Disconnect from the database
function disconnect () {
  client.end(err => {
    console.log('Disconnected from database');

    if (err) {
      console.log('There was an error during disconnection', err.stack);
    }
  });
}

// Insert a report into the database
function insertReport (lighthouseReport, template) {
  const queryText = 'INSERT INTO reports(lhr, template) VALUES($1, $2)';
  const values = [lighthouseReport, template];
  return client.query(queryText, values);
}

// Insert an URL into the database for automatic running later
function insertURL (url, template) {
  // First, remove URL if it exists
  removeURL(url);

  const queryText = `INSERT INTO urls(url, template) VALUES($1, $2)`;
  const values = [url, template];
  return client.query(queryText, values);
}

function removeURL (url) {
  const queryText = `DELETE FROM urls WHERE url = $1`;
  const values = [url];
  return client.query(queryText, values);
}

// Execute a query to request a report
function queryReports (query, callback) {
  client.query(query, callback);
}

// Get the URLs that need updating
function getUrlsThatNeedUpdating () {
  const queryText = `SELECT * FROM urls WHERE latest_date < now() - '30 days'::interval`;
  return client.query(queryText);
}

// Update the latest date for an URL
function updateLatestDateForURL (id) {
  const queryText = `UPDATE urls SET latest_date = CURRENT_DATE WHERE id = $1`;
  const values = [id];
  return client.query(queryText, values);
}

// Remove URLs more than 90 days old
function removeExpiredUrls () {
  const queryText = `DELETE FROM urls WHERE first_date < now() - '91 days'::interval`;
  return client.query(queryText);
}

// Export the relevant functions
module.exports = {
  connect,
  disconnect,
  insertReport,
  queryReports,
  insertURL,
  getUrlsThatNeedUpdating,
  updateLatestDateForURL,
  removeExpiredUrls
}

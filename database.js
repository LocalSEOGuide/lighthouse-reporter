// dependencies
const { Client } = require('pg');

let client;

async function connect (callback) {
  client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASS
  });

  // Connect to the database and handle errors
  try {
    console.log('Connecting...');
    await client.connect();
    console.log('Connected!');
    callback();
  } catch (error) {
    console.error(error);
  }
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

async function query (query_text, query_params) {
  try {
    const result = await client.query(query_text, query_params);
    return result;
  }catch (err) {
    console.error(err);
  }
}

module.exports = {
  connect,
  disconnect,
  query
};

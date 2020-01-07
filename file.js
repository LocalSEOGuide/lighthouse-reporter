// Dependencies
const csv_parser = require('csv-parser');
const fs = require('fs');

// Read CSV as JSON object
function readCsv (path, callback) {
  const data = [];

  // Read the CSV and return the data via callback
  fs.createReadStream(path)
    .pipe(csv_parser())
    .on('data', (row) => {
      data.push(row);
    })
    .on('end', () => {
      callback(data);
    });
}

module.exports = {
  readCsv
};

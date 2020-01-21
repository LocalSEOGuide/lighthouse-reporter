
# Lighthouse Reporter

This tool generates lighthouse reports, parses the data, and stores it in a Cloud SQL database. The data is then pulled into GDS to create reports.

## Preparation

Clone the repository. Install the dependencies as usual:

    npm install

Create a folder called 'input' in the root directory of the project. This folder will contain the CSV of URLs to generate reports.

Also, create a file called '.env' in the root directory of the project. This needs to contain four environment variables for your database connection, like so (don't include the square brackets):

    DB_HOST=[address of your CloudSQL database]
    DB_USER=[postgres username]
    DB_PASS=[password for database user]
    DB_NAME=[name of the database]
    
NOTE: The Dockerfile is not needed if you aren't going to Dockerize this application.

## Usage

Place a CSV of URLs in the 'input' folder. The CSV should have two columns: URL and Template. Here's an example:

| URL                             | Template         |
|---------------------------------|------------------|
| https://example.com             | Home Page        |
| https://example.com/about-us    | Information Page |
| https://example.com/product/123 | Product Page     |

Run the tool by calling the start script:

    npm start

The tool will generate lighthouse reports and store them in the database.

### Automatic Reporting

The tool can run reports automatically for a specified duration of time. To do that, simply setup a crontab that executes the tool every day with an empty 'input' folder. This will run the tool in maintainence mode, and it will automatically report on URLs stored in the database.

To setup an automated report, place a CSV of URLs in the input folder just like usual. Add the following parameters to the command:

    npm start auto 30 90
    
The numbers can be replaced with whatever values you'd like. This example will automatically generate reports for the specified CSV of URLs every 30 days for the next 90 days.

## Creating A New Report

### Creating the database views

First, log in to the Cloud SQL database (or whatever PostgresSQL database you're using). Run the following queries to create four new views for the new property (using Target as an example):

    CREATE VIEW target_gds_audits AS SELECT * FROM gds_audits WHERE url LIKE '%target.com%';
    CREATE VIEW target_savings_opportunities AS SELECT * FROM savings_opportunities WHERE audit_url LIKE '%target.com%';
    CREATE VIEW target_diagnostics AS SELECT * FROM diagnostics WHERE audit_url LIKE '%target.com%';
    CREATE VIEW target_resource_chart AS SELECT * FROM resource_chart WHERE audit_url LIKE '%target.com%';

### Creating the data sources

Now, go into GDS and create four new data sources. Select 'PostgreSQL' as the source type and input the credentials for the Cloud SQL database. Choose one of the four views you created in the previous step, so that there is a data source for each of the four views.

### Creating the new GDS report

Go to the template report here: https://datastudio.google.com/open/174e2h3Y8WVk1i7ufD4yxJ8aWfPG8ImOA. In the upper right corner select the button to create a copy of the report.

![Copy report button](https://github.com/LocalSEOGuide/lighthouse-reporter/blob/master/docs/docs_copy_report.jpg "Copy Report")

It will ask you to select data sources to replace the ones in the original report. Choose the views you created previously. Using Target as an example, that should look like this:

![Set sources](https://github.com/LocalSEOGuide/lighthouse-reporter/blob/master/docs/docs_set_sources.jpg "Set sources")

The new report should populate with data from the views you previously created.

## Database Structure

These are the tables used by the tool. In general, rows will be queried by the URL of the audit, and the time the report was fetched (fetch_time).

### raw_reports

0. id - SERIAL PRIMARY KEY - For unique identification
1. url - VARCHAR(2048) - The URL of the report
2. template - VARCHAR(2048) - The template to which this page belongs
3. fetch_time - TIMESTAMP - The fetch_time of the report where this request originated
4. report - json - The raw JSON of the report

### urls

This table stores URLs that will be updated automatically.

0. id - SERIAL PRIMARY KEY - For unique identification
1. url - VARCHAR(2048) - The URL of the report
2. template - VARCHAR(2048) - The template to which this page belongs
3. start_date - timestamp - The date this report was started
4. latest_date - timestamp - The date of the latest report
5. interval - DECIMAL - The number of days between updates
6. lifetime - DECIMAL - The number of days this URL should reported on before being discontinued.

### gds_audits

This table contains the basic performance metrics.

0. id - SERIAL PRIMARY KEY - For unique identification
1. url - VARCHAR(2048) - The URL of the report
2. template - VARCHAR(2048) - The template to which this page belongs
3. fetch_time - TIMESTAMP - The time the report was run
4. page_size - DECIMAL - The page size in KBs
5. first_contentful_paint - DECIMAL - The FCP in milliseconds
6. max_potential_fid - DECIMAL - The Maximum FID in milliseconds
7. time_to_interactive - DECIMAL - The TTI in milliseconds
8. first_meaningful_paint - DECIMAL - The FMP in milliseconds
9. first_cpu_idle - DECIMAL - The FCI in milliseconds

### resource_chart

This table contains information about resource requests performed during an audit.

0. id - SERIAL PRIMARY KEY - For unique identification
1. audit_url - VARCHAR(2048) - The URL of the page where this request originated
2. template - VARCHAR(2048) - The template to which this page belongs
3. fetch_time - TIMESTAMP - The fetch_time of the report where this request originated
4. resource_url - VARCHAR(2048) - The URL of the requested resource
5. resource_type - VARCHAR(2048) - The type of resource (Script, Stylesheet, etc.)
6. start_time - DECIMAL - The time the request started in milliseconds
7. end_time - DECIMAL - The time the request ended in milliseconds

### savings_opportunities

This table contains information about the savings opportunities found during an audit.

0. id - SERIAL PRIMARY KEY - For unique identification
1. audit_url - VARCHAR(2048) - The URL of the page where this request originated
2. template - VARCHAR(2048) - The template to which this page belongs
3. fetch_time - TIMESTAMP - The fetch_time of the report where this request originated
4. audit_text - VARCHAR(2048) - The name of the audit in question
5. estimated_savings - DECIMAL - The estimated time saved in milliseconds

### diagnostics

This table contains some useful page statistics.

0. id - SERIAL PRIMARY KEY - For unique identification
1. audit_url - VARCHAR(2048) - The URL of the page where this request originated
2. template - VARCHAR(2048) - The template to which this page belongs
3. fetch_time - TIMESTAMP - The fetch_time of the report where this request originated
4. diagnostic_id - VARCHAR(2048) - The ID of the audit in question
5. item_label - VARCHAR(2048) - The label for the specific item in that audit
6. item_value - DECIMAL - The numeric value for the item in question

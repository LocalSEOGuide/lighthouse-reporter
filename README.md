
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

Previously, we needed to create new views for each set of lighthouse reports we run. This is no longer the case. It is now possible to connect all your lighthouse reports to a single data source and use the filters in the report to define the data you'd like to use.

### Prepare your data source

Connect your data source where you store your lighthouse data to data studio by creating a new data source.

### Creating the new GDS report

Go to the template report here: https://datastudio.google.com/reporting/8b00983e-0baa-4806-9fbb-f04032d37b57. In the upper right corner select the button to create a copy of the report.

![Copy report button](https://github.com/LocalSEOGuide/lighthouse-reporter/blob/master/docs/docs_copy_report.jpg "Copy Report")

It will ask you to select data sources to replace the ones in the original report. Choose the data sources you created previously. Using Target as an example, that should look like this:

![Set sources](https://github.com/LocalSEOGuide/lighthouse-reporter/blob/master/docs/docs_set_sources.jpg "Set sources")

The new report should populate with data from the data sources you previously created.

### Adjusting the filters

Once the report is duplicated, select Resource -> Manage Filters. Edit the filters labels 'url_filter' and 'url_filter_2' to match the domain of the site you are auditing. For example, if you are auditing pages on target.com:

![Edit filter](https://github.com/LocalSEOGuide/lighthouse-reporter/blob/master/docs/gds_filter.jpg "Edit filter")

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

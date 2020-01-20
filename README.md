
# Lighthouse Reporter

This tool generates lighthouse reports, parses the data, and stores it in a Cloud SQL database. The data is then pulled into GDS to create reports.

## Slack Usage

Simply @ Jarvis and tell him to run the lighthouse-reporter script. Attach a CSV of URLs with two columns: URL and Template (case-sensitive.)

Here are some examples:

This will cause Jarvis to run a report on the attached CSV and store the result in the database.

    @jarvis lighthouse-reporter

 If you add the word `auto`, Jarvis will run the report and automatically repeat the report every 30 days for the next 90 days:

    @jarvis lighthouse-reporter auto

By default, the automatic reports occur every 30 days for 90 days. If you'd like to specify the frequency and lifetime of an automatic report, you may do so like this.

    @jarvis lighthouse-reporter auto 15 100

That will make jarvis run the report automatically every 15 days for the next 100 days.

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

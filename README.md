# lighthouse-reporter
A NodeJS program that generates lighthouse reports and stores them in Cloud SQL.

This will be run two ways
1. By calling @jarvis lighthouse-reporter and passing a CSV file with the columns "URL" and "Template".
2. A crontab that will check every day and update the URLs that need to be updated.

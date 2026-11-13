# Household Bill Lookup

A mobile-friendly browser app for this monthly CSV format:

`HouseHoldNo, AccountNo, Name, Arrears, Current Month Bill, Total Bill`

Search an exact household number to view its name, consumer number, arrears, current bill, and total amount. If a number appears more than once, all exact matches are shown.

## Important: hosting and data sharing

This repository contains the portal code only. It must not contain the original CSV, `data.enc`, or the shared passphrase.

GitHub Pages can host the static app, but it does not provide a secure place for this sensitive billing database. The app reads and encrypts the selected CSV in the browser; it does not upload records to a server or synchronize them between team members. A browser's uploaded file and search results are available only in that browser session.

To let multiple field staff look up the same current records, deploy the app and data on an organization-approved server with appropriate access controls. Do not publish consumer records—even an encrypted copy—or the passphrase to a public GitHub repository. The shared-passphrase browser encryption is not a substitute for server-side authentication and cannot protect data from a compromised website serving modified code.

## Local use

Open the app from a secure HTTPS origin or localhost in a modern browser. Choose the CSV and set a new strong passphrase (at least 20 characters) to encrypt it locally and download `data.enc`. The current browser can search its in-memory records for that session. The encrypted download can only be opened by selecting it in a browser with the passphrase; it does not make records available to other devices by itself.

Keep the original CSV and `data.enc` out of source control. `.gitignore` excludes CSV, Excel, and `data.enc` files by default.

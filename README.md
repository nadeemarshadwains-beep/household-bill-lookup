# Household Bill Lookup

A mobile-friendly browser app for this monthly CSV format:

`HouseHoldNo, AccountNo, Name, Arrears, Current Month Bill, Total Bill`

Search an exact household number to view its name, consumer number, arrears, current bill, and total amount. If a number appears more than once, all exact matches are shown.

## Data storage and sharing

The repository and GitHub Pages site contain the portal code only. They must not contain the original CSV, `data.enc`, or the shared passphrase.

The app encrypts the selected CSV in the browser with AES-256-GCM and saves only the encrypted copy in that browser's IndexedDB storage. On later visits from the same browser on the same device, enter the passphrase to unlock the saved copy; re-uploading the CSV is not necessary. The passphrase is not stored. Locking the portal clears decrypted records from the current page, and the login screen can forget the saved encrypted copy.

Browser storage is device- and browser-specific. Each team device must be initialized once with the CSV or by selecting the encrypted `data.enc` backup, then unlocked with the passphrase. Browser storage clearing, private browsing, or device loss may remove its saved copy. Updating one device does not synchronize other devices. The app downloads `data.enc` as a backup when data is prepared or updated.

GitHub Pages does not securely host or synchronize the billing database. To provide centrally synchronized records, use an organization-approved server with appropriate access controls. Do not publish consumer records—even an encrypted copy—or the passphrase to a public GitHub repository. The shared-passphrase browser encryption is not a substitute for server-side authentication and cannot protect data from a compromised website serving modified code.

## Local use

Open the app from a secure HTTPS origin or localhost in a modern browser. Choose the CSV and set a new strong passphrase (at least 20 characters) to encrypt and save it in that browser, and download `data.enc` as a backup. On the next visit, enter the passphrase to unlock the locally saved records. To initialize another device, select the CSV once or import the encrypted backup and enter the same passphrase.

Keep the original CSV and `data.enc` out of source control. `.gitignore` excludes CSV, Excel, and `data.enc` files by default.

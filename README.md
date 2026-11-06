# Personal Expense Tracker

A small web app for keeping track of income, everyday expenses and monthly budgets. It brings your records together so you can see where your money goes without maintaining a spreadsheet.

Built with **Node.js, Express and SQLite**, with plain HTML, CSS and JavaScript on the frontend.

![Sign-in page](screenshots/sign-in.png)

## What you can do

- Create a private account and keep your records separate from other users.
- Add income and expenses, then edit or delete entries when needed.
- Search your history and filter it by month, category or transaction type.
- Check monthly income, spending, net balance and savings rate.
- See spending by category and compare weekly income with expenses.
- Set monthly category budgets and see how much is left to spend.
- Download a CSV statement of the records you are viewing.
- Use the same website on a phone, tablet or desktop.

Accounts start empty. There are no preset users, transactions or budgets, and the sign-in page does not show financial figures. All totals come from the entries you save. The built-in categories are just labels to help organise those entries.

## Run it locally

Install **Node.js 24 or newer**, then run:

```bash
git clone https://github.com/diwanpinjari/Expense_track.git
cd Expense_track
npm install
npm start
```

Open **http://localhost:3100** and choose **Create an account**.

On Windows, you can also double-click **Start Expense Tracker.bat**. Keep its terminal window open while using the app. If the browser opens before the server is ready, refresh the page once.

If PowerShell blocks `npm`, use `npm.cmd install` and `npm.cmd start` instead.

For development, `npm run dev` restarts the server when its source files change. There is no frontend build step.

## How it works

Express serves the website and handles the API. SQLite stores accounts, transactions and budgets in `data/expenses.db`. Once the dependencies are installed, the app runs locally without an internet connection or an external database service.

Amounts are stored as integer paise to keep calculations exact. Reports and budget figures are calculated from the ledger, so changing or deleting an entry also changes the totals.

Passwords are stored as salted scrypt hashes. Sessions use HTTP-only cookies, write requests require CSRF tokens, and database queries are restricted to the signed-in user. CSV exports escape fields and neutralise spreadsheet formulas.

## A few details about the totals

- **Net balance** is income minus expenses for the selected month. It is not a bank balance.
- **Savings rate** is net balance divided by income. A dash is shown when no income has been recorded.
- **Weekly charts** group days 1–7, 8–14, 15–21, 22–28 and 29–31.
- **Budgets** apply to a category in a particular month. Going over a limit shows a warning but does not stop you recording an expense.

Transactions are entered manually. Bank connections, payment processing and automatic recurring entries are not included.

## Tests

```bash
npm test
```

The 14 tests cover money and date validation, empty accounts, sign-in, account isolation, transaction changes, monthly totals, budgets, CSV export and database constraints. They use a separate in-memory database and do not touch your saved records.

Browser checks are documented in [VERIFICATION.md](VERIFICATION.md).

## Project layout

```text
server.js                 Express server, authentication and API
db.js                     SQLite schema and category definitions
lib.js                    Money, date, password and CSV helpers
public/
  index.html              Website entry point
  app.js                  Screens and browser interactions
  styles.css              Desktop and mobile styles
  favicon.svg             App icon
test/app.test.js          Automated tests
screenshots/              Screens captured from the running app
Start Expense Tracker.bat Windows launcher
```

## Your data

The `data` folder is created on the first run and is excluded from Git. Refreshing the page or restarting the server does not reset your records.

To make a backup, stop the server and copy the entire `data` folder. Restore it with the server stopped. Deleting that folder removes all local accounts and records; the next start creates an empty database.

The server listens on `127.0.0.1`, so it is available only on your computer. To use another port in PowerShell:

```powershell
$env:PORT=3101
npm.cmd start
```

Then open `http://localhost:3101`. The Windows launcher uses port 3100.

---

Software Engineering project — **E PRAVEENA · 26AG5A0517**.

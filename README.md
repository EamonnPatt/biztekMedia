# Biztek Media

Sells ad space on the screens inside the gym. Advertisers build their own video, image or text ad in the **Ad Studio**, pick zones and a schedule, watch the price update live, and pay with **Helcim**.

Runs on ordinary PHP web hosting with a MySQL database, such as GoDaddy cPanel hosting. No Node.js needed.

```
public_html/       the website: upload its contents into your host's public_html
  index.html         landing page
  editor.html        ad studio
  api.php            the small entry file the studio talks to
  admin.php          orders page
  css/ js/ img/
biztek-private/    code and settings: upload next to public_html, NOT inside it
  config.sample.php  copy to config.php and fill in
  lib/               PHP code (API, orders page, pricing)
  storage/           created automatically: uploaded videos/images and sign-ins
```

## Set it up on GoDaddy (cPanel)

**1. Database.** cPanel → **MySQL Databases**:
- Create a database (for example `biztek`). cPanel shows its full name, such as `abc123_biztek`.
- Create a user with a strong password.
- Under **Add User To Database**, add that user with **ALL PRIVILEGES**.

You can also reuse a database you already have: the tables are named `bz_orders` and `bz_uploads`, so they won't clash with anything.

**2. Settings.** In `biztek-private`, copy `config.sample.php` to `config.php` and fill in:
- `db_name`, `db_user`, `db_pass`: the full names from step 1.
- `admin_password`: the password for your orders page.
- `notify_email`: where new orders are emailed. Optional.
- `from_email`: an address on your own domain, for those emails.
- Leave `helcim_api_token` empty for now, so the site runs in demo mode.

**3. PHP version.** cPanel → **Select PHP Version** (or **MultiPHP Manager**): choose **PHP 8.1 or newer**.

**4. Upload.** cPanel → **File Manager**:
1. Zip the `biztek-private` folder on your computer, upload the zip to your **home folder** (the one that *contains* `public_html`), then **Extract** it.
2. Zip the *contents* of `public_html`, upload them into your host's **public_html**, and **Extract**.
   - If another site already lives there, back it up first, or put this site in a subfolder or subdomain folder instead. It works in either.
   - The home folder should end up with `public_html` and `biztek-private` side by side.

The database tables and the `storage` folder are created automatically on first use.

**5. HTTPS.** cPanel → **SSL/TLS Status** → **Run AutoSSL**, or use your GoDaddy SSL certificate. The site must load as `https://` before you take real payments.

**6. Try it.**
- Open your domain, click **Open the ad studio**, build an ad and check out. It runs in demo mode, so no charge.
- Open `yourdomain.com/admin.php`, sign in, and you'll see the order with download links for its files.

**7. Go live.** Put your Helcim API token in `config.php` as `helcim_api_token`. You get it from Helcim → Integrations → API Access, with permission to process transactions. The next checkout opens Helcim's real card form.

## Deploy from GitHub (optional)

Instead of uploading zips, cPanel can pull the site from a GitHub repo. `.cpanel.yml` tells it what to copy where.

1. Push this folder to a GitHub repo. `config.php` and `storage/` are in `.gitignore`, so your passwords and advertisers' files never go to GitHub.
2. cPanel → **Git Version Control** → **Create**:
   - **Clone URL:** your repo's URL.
   - **Repository Path:** something like `repositories/biztek`. Keep it **outside** `public_html`.
   - A **private** repo needs an SSH key: cPanel → **SSH Access** → generate a key, then add the public key to the repo on GitHub under **Settings → Deploy keys**, read-only. Then use the SSH clone URL (`git@github.com:…`).
3. Open the repo's **Manage → Pull or Deploy** tab and click **Deploy HEAD Commit**.
4. Create `biztek-private/config.php` on the server once, as in step 2 above. Deploys never overwrite it.

To publish later changes: push to GitHub, then in cPanel click **Update from Remote**, then **Deploy HEAD Commit**.

## How a payment works

1. The studio uploads each video or image **in small pieces**. The piece size adapts to your host's PHP upload limit, so large videos work on shared hosting without changing any PHP settings. Each file is checked to be the image or video type it claims to be.
2. `api.php?r=checkout` recalculates the price **on the server** and saves a pending order. The rate comes from the real uploaded files, not from what the browser says. It then asks Helcim for a secure checkout session.
3. Helcim's card form opens. Card details go straight to Helcim.
4. On success, `api.php?r=confirm` checks Helcim's signature with a secret only the server knows. If the signature can't be reproduced, it asks Helcim's API directly. Before marking the order paid it also checks that:
   - the payment is approved,
   - the amount matches the order,
   - the transaction hasn't already been used for another order.

## Orders

`yourdomain.com/admin.php` lists paid orders, with unpaid checkouts on request. For each order it shows:
- the advertiser's details and schedule
- a download link for each video or image
- a download of the full ad layout: every layer's position, timing and animation, as JSON

With `notify_email` set, each new order is also emailed to you. If emails don't arrive, check spam and make sure `from_email` is an address on your own domain.

Uploaded files live in `biztek-private/storage/uploads`. Watch your hosting disk space; `max_upload_mb` in `config.php` caps each file. Uploads that were started but never finished are cleaned up after a day.

## Change prices, zones and screens

All rates live in the `CONFIG` block at the top of `public_html/js/pricing.js`:
- base rates and the length curve
- zones, with their names, screen counts and weights
- plays per hour, time of day, term discounts
- add-ons, minimum order, currency and tax

The landing page, the studio and the PHP server all read that one block, so a change shows up everywhere.

**Keep it valid JSON:** double quotes, no comments, no trailing commas. The server reads it too. If you change the *formulas* (not just the numbers), update `biztek-private/lib/pricing.php` to match.

**Before launch:** these are placeholders. Set them to match the real gym and your policies:
- the zone names and screen counts
- the review times (48h, or 24h with rush)
- the content guidelines in the FAQ
- the currency (`CAD`)

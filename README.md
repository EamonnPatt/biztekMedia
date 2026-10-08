# Biztek Media

Sells ad space on the screens inside the gym. Advertisers build their own video, image or text ad in the **Ad Studio**, pick a schedule, watch the price update live, and pay with **Helcim**. Every ad plays on every screen in the gym.

Runs on ordinary PHP web hosting with a MySQL database, such as GoDaddy cPanel hosting. No Node.js needed.

```
public_html/       the website: upload its contents into your host's public_html
  index.html         landing page
  editor.html        ad studio
  api.php            the small entry file the studio talks to
  admin.php          orders page
  css/ js/ img/
biztek-private/    code and settings: upload next to public_html, NOT inside it
  config.php         your settings and passwords: you create it (step 2), it is never in git
  lib/               PHP code (API, orders page, pricing)
  storage/           created automatically: uploaded videos/images and sign-ins
```

## Set it up on GoDaddy (cPanel)

**1. Database.** cPanel → **MySQL Databases**:
- Create a database (for example `biztek`). cPanel shows its full name, such as `abc123_biztek`.
- Create a user with a strong password.
- Under **Add User To Database**, add that user with **ALL PRIVILEGES**.

You can also reuse a database you already have: the tables are named `bz_orders` and `bz_uploads`, so they won't clash with anything.

**2. Settings.** In `biztek-private`, create `config.php` with this in it:

```php
<?php
return [
    'db_host' => 'localhost',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',
    'helcim_api_token' => '',
    'admin_password' => '',
    'notify_email' => '',
    'from_email' => '',
    'timezone' => 'America/Toronto',
    'max_upload_mb' => 250,
];
```

Then fill in:
- `db_name`, `db_user`, `db_pass`: the full names from step 1, exactly as cPanel shows them. Capitals count.
- `admin_password`: the password for your orders page.
- `notify_email`: where new orders are emailed. Separate several addresses with commas, such as `'contact@northumberlandfitness.com, anthony@biztekmedia.ca'`. Each gets its own email. Optional.
- `mail_log`: a file path. Emails are written there instead of being sent, for testing on a computer that can't send email. Leave it out on the live site.
- `from_email`: an address on your own domain, such as `info@biztekmedia.ca`. Order emails and customer receipts come from it, and customers reply to it.
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

To test on the live site later without charging cards, add `'demo' => true,` to `config.php`. Checkouts then complete without payment and orders are marked demo, while your Helcim token stays in place. Remove it (or set it to `false`) to take payments again.
- On the orders page, click **Test Helcim connection**. It opens a $1.00 checkout session, as every real checkout does, and tells you whether Helcim accepted your token. Nothing is charged.
- Place one real order with your own card, check it appears on the orders page as **paid** and that the receipt email arrives, then refund it in Helcim.

## Tests

From the project folder on your computer (needs PHP 8.1+; Node.js too for the price comparison):

```
php tests/run.php                           # pricing, payment signature checks, deploy files
php tests/run.php https://biztekmedia.ca    # also checks the live site after you deploy
```

The live checks confirm the site is out of demo mode, reaches its database, sends `http://` to `https://`, and runs the same prices as your code, which shows the latest commit was deployed.

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
2. `api.php?r=checkout` recalculates the price **on the server** and saves a pending order. The ad type comes from the real uploaded files, not from what the browser says. It then asks Helcim for a secure checkout session.
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

Each customer is emailed a receipt when they pay: order number, campaign, price breakdown, card and transaction, and what happens next. With `notify_email` set, each new order is also emailed to every address in it. If emails don't arrive, check spam, make sure `from_email` is an address on your own domain, and turn on SPF and DKIM in cPanel → **Email Deliverability**.

Uploaded files live in `biztek-private/storage/uploads`. Watch your hosting disk space; `max_upload_mb` in `config.php` caps each file. Uploads that were started but never finished are cleaned up after a day.

## Sending ads to the ad player

The gym's TVs run a separate site, the ad player, that keeps its ads in the **same database** as this one (tables `bz_tv_ads`, `bz_tv_media` and `bz_tv_media_chunks`). When a customer pays, this site copies their video or image into those tables as a **paused** ad, with their start date, end date and a note of what they booked. It happens right after the payment goes through, without slowing down the checkout. Nothing reaches a TV until you open the player's admin panel, check the ad, set **Plays per loop** to match the booking, and switch it on. That's the review the customer is promised.

- The player shows one video, image or text slide per ad. Only the order's main video (or image) is copied. If the customer's design has more layers (text, shapes), the ad's private notes in the player say how many, and **Download full layout (JSON)** on the orders page has them. A text-only order becomes a text slide.
- On the orders page each order shows where its ad is: **On the player, paused**, **live**, or **Not sent** with the reason. A **Send to player** button appears when it isn't there, to retry a failure or to send a demo order. Demo orders are never sent on their own, so a test can't reach the TVs. Sending the same order twice is refused.
- The player creates its tables the first time its site is opened. If it never has been, the order says so; open the player once and press **Send to player**.
- Two optional settings in `config.php`:
  - `'player_publish' => false` turns the automatic send off (the button still works).
  - `'player_table_prefix' => 'xx_'` is for a player whose tables don't start with the same prefix as this site's `table_prefix`.
- Videos are copied into the database, so mind its size. Uploads on this site stay in `biztek-private/storage/uploads` as well.

## Change prices

Every ad is a 6-second spot on every screen, and video, image and text cost the same. The price depends only on how often the ad plays, how many 4-week blocks it runs, and the add-ons. All rates live in the `CONFIG` block at the top of `public_html/js/pricing.js`:
- `plays`: each play rate (1 play per minute, or per 2, 3 or 4 minutes) and its price for 4 weeks
- `periodWeeks` and `weeks`: runs are booked in 4-week blocks, from 4 to 24 weeks
- `duration`: the spot length in seconds
- add-ons, minimum order, currency and tax (`taxRate` 0.13 adds 13% HST on top of the listed prices)

The landing page, the studio and the PHP server all read that one block, so a change shows up everywhere.

**Keep it valid JSON:** double quotes, no comments, no trailing commas. The server reads it too. If you change the *formulas* (not just the numbers), update `biztek-private/lib/pricing.php` to match.

**Before launch:** these are placeholders. Set them to match the real gym and your policies:
- the review times (48h, or 24h with rush)
- the content guidelines in the FAQ
- the currency (`CAD`)

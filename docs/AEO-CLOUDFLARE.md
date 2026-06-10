# Cloudflare: allow AI crawlers

The live site currently serves **Cloudflare-managed** robots.txt rules that block GPTBot, ClaudeBot, Google-Extended, CCBot, and others. The repo [`robots.txt`](../robots.txt) alone will not override those rules while **Block AI bots** is enabled.

## Required dashboard step

1. Log in to [Cloudflare](https://dash.cloudflare.com) for **revforgehq.com**
2. Go to **Security → Bots**
3. Turn **Block AI bots** **Off** (or allow-list the bots you want)
4. Confirm https://www.revforgehq.com/robots.txt no longer shows `Disallow: /` for GPTBot / ClaudeBot / Google-Extended / CCBot

After disabling the managed block, the repo `robots.txt` (deployed via Pages) provides explicit `Allow: /` rules and the sitemap directive.

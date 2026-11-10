<p align="center">
  <a href="https://hproxy.com/residential-proxies"><img src="icons/hproxy.svg" alt="HProxy" width="72" height="72"></a>
</p>

<h1 align="center">HProxy for n8n</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@hproxy/n8n-nodes-hproxy"><img src="https://img.shields.io/npm/v/@hproxy/n8n-nodes-hproxy?style=flat-square&color=0158FF&labelColor=0B1220" alt="npm version"></a>
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/License-MIT-0158FF?style=flat-square&labelColor=0B1220" alt="License: MIT"></a>
  <a href="https://hproxy.com/residential-proxies"><img src="https://img.shields.io/badge/Website-hproxy.com-0158FF?style=flat-square&labelColor=0B1220" alt="Website: hproxy.com"></a>
</p>

This is an n8n community node. It lets you use [HProxy](https://hproxy.com/residential-proxies) in your n8n workflows.

HProxy sells [residential proxies](https://hproxy.com/residential-proxies) with rotating and sticky sessions and runs a free proxy list, a proxy checker and an IP lookup.

With this node a workflow can generate ready-to-use proxy lines from your plan, keep an eye on your plans, traffic and balance, pull working proxies from the free list, check any proxy, and look up where an IP address is. The free tools need no account and no key.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/n8n-community-license) workflow automation platform.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Example workflows](#example-workflows) · [When something goes wrong](#when-something-goes-wrong) · [Compatibility](#compatibility) · [HProxy works with](#hproxy-works-with) · [Resources](#resources) · [Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation) in the n8n community nodes documentation. In short, on a self-hosted n8n:

1. Go to **Settings > Community Nodes** and select **Install**.
2. Enter `@hproxy/n8n-nodes-hproxy` as the npm package name.
3. Confirm that you understand the risks of installing community code, and select **Install**.

The node then shows up as **HProxy** in the nodes panel.

## Credentials

The Account, Plan and Proxy operations act on your HProxy account and need an API key. The Free Tool operations need none.

1. Sign in to your [HProxy dashboard](https://hproxy.com/dashboard) and open **Settings > API keys**.
2. Create a key. Tick **Read plans**: it covers every operation of this node except Get Balance and never spends money. Get Balance reads your wallet and also needs **Place orders**.
3. Copy the key. It starts with `hpx_` and is shown only once.
4. In n8n, create a new **HProxy API** credential and paste the key. n8n checks it right away with `GET /api/v1/me`.

The key travels in the `X-API-Key` header to `https://hproxy.com` and nowhere else. More about keys and permissions: [Authentication](https://hproxy.com/docs/authentication).

## Operations

| Resource | Operation | What it does | API |
| --- | --- | --- | --- |
| Proxy | Generate | Ready-to-use proxy lines from one of your plans | `POST /api/v1/plans/{id}/generate` |
| Plan | Get | One plan with its traffic left, read live | `GET /api/v1/plans/{id}` |
| Plan | Get Many | The plans on your account | `GET /api/v1/plans` |
| Plan | Get Traffic | Bytes, requests and success rate over time | `GET /api/v1/plans/{id}/stats` |
| Account | Get Balance | Your wallet balance | `GET /api/v1/wallet` |
| Account | Get Bandwidth History | Traffic used per day and per plan | `GET /api/v1/usage` |
| Free Tool | Get Free Proxies | Working public proxies from the free list | `GET /api/proxy-list` |
| Free Tool | Check Proxies | A live test of up to 1,000 proxies | `POST /api/proxy-check` |
| Free Tool | Look Up IP | Country, city, network and ISP of an address | `GET /api/ip/{ip}` |

Every plan field accepts a plan picked from a list, its ID, or an expression.

### Proxy: Generate

Pick a plan, how many lines you want (1 to 5,000), HTTP or SOCKS5, and rotating or sticky sessions. Sticky lines keep their IP for the session length you set. **Country** takes a two-letter code or a country name. Under **Targeting** you can add a city, a state, a network by AS number, an internet provider, the device type of the exit IP, exclusion lists, strict targeting and UDP for SOCKS5. Each plan takes the fields its network supports, and HProxy answers with a clear message when one does not apply.

The node returns one item per line. Each line arrives ready to use, in the form `host:port:username:password`:

```json
{
  "line": "example.hproxy.com:10000:USERNAME:PASSWORD",
  "productId": "residential-premium",
  "planId": "cmjfmhhpd004c4i4hqsk3mzrr"
}
```

Generating lines costs nothing. Traffic counts only when the lines carry requests, and every line draws on the same plan balance.

### Plan: Get, Get Many, Get Traffic

**Get Many** lists your active plans, or all of them with **Status: All**. **Get** reads one plan and refreshes its balance from the network on the call:

```json
{
  "id": "cmjfmhhpd004c4i4hqsk3mzrr",
  "productId": "residential-premium",
  "status": "active",
  "dataGbTotal": 10,
  "dataGbRemaining": 3.2,
  "label": "customer-1042"
}
```

**Get Traffic** returns the points and totals of a Residential Premium plan over the last 1 to 30 days, by hour or by day.

### Account: Get Balance, Get Bandwidth History

**Get Balance** returns the wallet in cents, for example `{ "balanceCents": 25765, "currency": "USD" }`. **Get Bandwidth History** returns the GB used per day and per plan over the last 1 to 365 days, optionally for one plan.

### Free Tool: Get Free Proxies

Working public proxies from the [free proxy list](https://hproxy.com/free-proxy-list), one item each. Filter by anonymity, country, network, latency, uptime, port, protocol and /24 subnet, and sort by uptime to get the most reliable ones first. With **Simplify** on, each item keeps the ten most used fields:

```json
{
  "ip": "203.0.113.7",
  "port": 1080,
  "protocols": ["socks5"],
  "anonymity": "elite",
  "country_code": "US",
  "city": "New York",
  "asn_org": "Example Hosting",
  "latency_ms": 142,
  "uptime_pct": 71.4,
  "last_verified_at": "2026-07-22T15:41:09Z"
}
```

### Free Tool: Check Proxies

Enter up to 1,000 proxies, one per line or separated by commas, as `ip:port`, `host:port:user:pass` or `user:pass@host:port`. An expression can hand in a list from earlier nodes. HProxy tests each one live and the node returns one item per proxy with `status` (alive, dead, unchecked and more), protocols, anonymity, latency, exit IP and location.

### Free Tool: Look Up IP

Enter one public IPv4 or IPv6 address, such as `8.8.8.8`, and get its country, region, city, timezone, network and ISP.

## Example workflows

- **Lines for a scraper.** Schedule Trigger, then HProxy **Generate** with Count 10, Country US and sticky sessions of 30 minutes, then write each `line` to the file, sheet or queue your scraper reads.
- **Low balance alert.** Schedule Trigger once a day, HProxy **Get Balance**, an IF node on `balanceCents`, and a message to Slack or email when it drops below your threshold.
- **Plan running low.** Schedule Trigger, HProxy **Get Many**, an IF node on `dataGbRemaining`, and a reminder to top up.
- **Fresh free proxies, tested from HProxy.** HProxy **Get Free Proxies** with Protocols SOCKS5 and Min Uptime 70, then HProxy **Check Proxies** with **Execute Once** on and `{{ $input.all().map(item => item.json.ip + ':' + item.json.port).join('\n') }}` as Proxies, then keep the items whose `alive` is true.
- **Where do these visitors come from.** Any list of IP addresses, then HProxy **Look Up IP** to add country, city and network to each.
- **From an AI agent.** The node is usable as a tool, so an n8n AI Agent can look up an IP, check a proxy or fetch free proxies when a conversation needs it.

## When something goes wrong

The node shows what HProxy answered and what to do next:

- **HProxy did not accept the API key**: paste a current key into the HProxy credential.
- **This API key lacks the permission this operation needs**: create a key with **Read plans**, plus **Place orders** for Get Balance.
- **HProxy found no plan with this ID on your account**: pick the plan from the list. Generating also needs an active plan with traffic left.
- **HProxy asked to slow down**: wait the number of seconds shown before the next run.
- A field HProxy cannot use comes back with HProxy's own sentence, which names the field and the rule.

Each message carries a request ID when HProxy sent one. Include it if you write to [support](mailto:support@hproxy.com).

## Compatibility

Built and tested against n8n-workflow 2.46. The node uses n8n's declarative style with no runtime dependencies and needs no environment variables or file access.

## HProxy works with

- **AI assistants (MCP):** add `https://mcp.hproxy.com/mcp` as a remote MCP server in Claude, ChatGPT, Cursor or Gemini to use the free proxy list, proxy checker and IP lookup as tools. No key and nothing to install. The line for each assistant is on [hproxy.com/tools/ai](https://hproxy.com/tools/ai).
- **Command line:** the `hproxy` command lists, checks and looks up proxies from a terminal or a script, and serves the same tools as a local MCP server. [Install it](https://hproxy.com/proxy-checker#command-line).
- **Chrome:** the [HProxy extension](https://hproxy.com/extension) connects Chrome through your own proxy in one click and checks what it does.
- **REST API:** everything this node does and more, documented at [hproxy.com/docs](https://hproxy.com/docs), with an OpenAPI description at [hproxy.com/openapi.json](https://hproxy.com/openapi.json).
- **Free proxy list:** [hproxy.com/free-proxy-list](https://hproxy.com/free-proxy-list), updated every few minutes.
- **Residential proxies:** plans, countries and sessions on [hproxy.com/residential-proxies](https://hproxy.com/residential-proxies).

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/installation-and-management/gui-installation)
- [HProxy API documentation](https://hproxy.com/docs)
- [Plans and line generation](https://hproxy.com/docs/proxy-api/plans)
- [Free proxy list API](https://hproxy.com/docs/free-proxy-list)

## Version history

- **0.1.1:** the same node, published through npm's trusted publishing from GitHub Actions.
- **0.1.0:** first release. Proxy Generate, Plan Get, Get Many and Get Traffic, Account Get Balance and Get Bandwidth History, and the free tools Get Free Proxies, Check Proxies and Look Up IP.

## License

[MIT](LICENSE.md)

# Changelog

## 0.2.0

Every operation now sits on the object it acts on, as n8n's verification review asked.

- Get Free Proxies is now **Proxy > Get Many**, next to Proxy > Generate.
- Check Proxies is now **Proxy > Check**.
- Look Up IP is now **IP Address > Get**, on the new IP Address resource.
- The Free Tool resource is removed.
- The HProxy API credential shows only on the operations that use a key (Account, Plan and Proxy > Generate), through a display condition on resource and operation. Proxy > Get Many, Proxy > Check and IP Address > Get stay free and keyless.
- Workflows built with 0.1.x that used the free tools need those operations picked again.

## 0.1.1

The same node as 0.1.0, now published through npm's trusted publishing from GitHub Actions, and the workflows run on current actions (checkout 7.0.1, setup-node 7.1.0, Node 24).

## 0.1.0

First release.

- Proxy: Generate, ready-to-use proxy lines from a plan, one item per line, with count, HTTP or SOCKS5, rotating or sticky sessions, country and the targeting each plan takes.
- Plan: Get, Get Many and Get Traffic.
- Account: Get Balance and Get Bandwidth History.
- Free Tool: Get Free Proxies, Check Proxies and Look Up IP, without an API key.
- The HProxy API credential, tested with `GET /api/v1/me`.

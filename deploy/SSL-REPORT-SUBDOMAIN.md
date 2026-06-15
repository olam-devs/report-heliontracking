# SSL for report.heliontracking.com

The app is working locally (`curl http://127.0.0.1:3002/api/health`).

Browser error `ERR_CERT_COMMON_NAME_INVALID` means nginx is using a certificate
that does **not** include `report.heliontracking.com` (only `heliontracking.com`).

## 1. Confirm DNS

`report.heliontracking.com` must point to the VPS IP (same as main site).

```cmd
nslookup report.heliontracking.com
```

## 2. Allow ACME on port 80 (one-time)

```cmd
cd C:\helion\_repo\fleet-incident-reporter
git pull
deploy\vps-nginx-reload.cmd
```

The HTTP server block now serves `/.well-known/acme-challenge/` for win-acme.

## 3. Add subdomain to your certificate (win-acme)

On the VPS:

```cmd
cd C:\win-acme
wacs.exe
```

Typical path (menus vary slightly by version):

1. **M** — Manage renewals (or create new certificate)
2. Select the existing **heliontracking.com** renewal
3. **Edit** / add hostnames — include **all** of:
   - `heliontracking.com`
   - `www.heliontracking.com`
   - `report.heliontracking.com`
4. Run renewal / reissue

win-acme should write updated files to:

```
C:\nginx\nginx-1.30.0\ssl\heliontracking.com-chain.pem
C:\nginx\nginx-1.30.0\ssl\heliontracking.com-key.pem
```

Then:

```cmd
cd C:\nginx\nginx-1.30.0
set NGINX=
nginx -t
nginx -s reload
```

## 4. Verify

```cmd
curl -v https://report.heliontracking.com/api/health
```

In the TLS output, the certificate should list `report.heliontracking.com` in SANs.

## 5. HSTS in browser

If Edge still blocks after the cert is fixed, clear HSTS for the host:

- Open `edge://net-internals/#hsts`
- **Delete domain security policies** → `report.heliontracking.com`
- Retry https://report.heliontracking.com

## CMSV safety

This only updates the TLS certificate files and reloads nginx.
Tomcat (8080), middleware PM2, and CMS services are not restarted.

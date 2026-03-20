# OpenClaw Configuration Guide

## Network Binding Configuration

By default, OpenClaw binds to localhost (127.0.0.1) only. To make it accessible from other machines on your network, you need to bind to all interfaces (0.0.0.0).

### Bind Options

| Option     | Description                       | Use Case             |
| ---------- | --------------------------------- | -------------------- |
| `loopback` | Binds to 127.0.0.1 only           | Default, most secure |
| `lan`      | Binds to 0.0.0.0 (all interfaces) | Local network access |
| `tailnet`  | Binds to Tailscale interface      | VPN access only      |
| `auto`     | Automatic selection               | Let OpenClaw decide  |

### Method 1: Configure Command (Recommended for Existing Installations)

```bash
# Open the gateway configuration
openclaw configure --section gateway

# Set bind to "lan" when prompted
# Then restart the service
systemctl restart openclaw
```

### Method 2: Manual Service Edit

Edit the systemd service file:

```bash
nano /etc/systemd/system/openclaw.service
```

Modify the `ExecStart` line to include `--bind lan`:

```ini
[Service]
ExecStart=/usr/bin/openclaw gateway --port 18789 --bind lan
```

Apply changes:

```bash
systemctl daemon-reload
systemctl restart openclaw
```

### Method 3: Environment Variable

You can also set the bind mode via environment variable:

```bash
# Add to /etc/environment or the systemd service file
OPENCLAW_BIND=lan
```

## Verification

Check the current binding:

```bash
openclaw gateway status
```

Output should show:

```
bind: lan
listener: 0.0.0.0:18789
```

## Security Considerations

When binding to all interfaces (`lan`):

1. **Token Authentication**: OpenClaw uses token-based authentication. The token is generated on first run and displayed in the startup output.

2. **Firewall**: Consider adding firewall rules to restrict access:

   ```bash
   # Allow only specific IP ranges
   ufw allow from 192.168.31.0/24 to any port 18789
   ```

3. **Reverse Proxy**: For production use, consider placing OpenClaw behind a reverse proxy (nginx, Caddy) with SSL:

   ```nginx
   server {
       listen 443 ssl;
       server_name openclaw.yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:18789;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

4. **Never expose directly to the internet**: The gateway provides administrative access to your system. Always use VPN, reverse proxy with authentication, or Tailscale for remote access.

## Remote Access Options

### SSH Tunnel (Most Secure for Temporary Access)

```bash
# On your local machine
ssh -N -L 18789:127.0.0.1:18789 root@<server-ip>

# Then access in browser
http://localhost:18789
```

### Tailscale (Recommended for Permanent Remote Access)

1. Install Tailscale on both machines
2. Set OpenClaw bind to `tailnet`:

   ```bash
   openclaw configure --section gateway
   # Set bind to "tailnet"
   systemctl restart openclaw
   ```

3. Access via Tailscale IP: `http://<tailscale-ip>:18789`

## Troubleshooting

### Gateway Not Starting

```bash
# Check logs
journalctl -u openclaw -f

# Common issues:
# - Port already in use: lsof -i :18789
# - Permission denied: ensure running as root or correct user
```

### Cannot Connect from Remote

1. Verify binding: `openclaw gateway status` should show `0.0.0.0:18789`
2. Check firewall: `ufw status` or `iptables -L -n`
3. Verify network connectivity: `ping <server-ip>`

### Token Authentication Issues

```bash
# Regenerate token
openclaw doctor --generate-gateway-token

# View current token
openclaw gateway status
```

## Additional Resources

- [OpenClaw Gateway Documentation](https://docs.openclaw.ai/gateway)
- [OpenClaw Security Guide](https://docs.openclaw.ai/gateway/security)
- [OpenClaw Troubleshooting](https://docs.openclaw.ai/gateway/troubleshooting)

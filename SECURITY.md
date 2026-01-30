# Security Policy

## Prototype Status

This project is a **research prototype** demonstrating fraud detection concepts. It is not intended for production deployment without additional security hardening.

## Production Deployment Checklist

Before deploying to production, ensure the following:

### API Key Management
- Store all API keys in **Vercel Environment Variables** (or equivalent secrets manager)
- Never commit credentials to version control
- Rotate keys periodically and after any potential exposure

### Data Protection
- Encrypt sensitive data at rest and in transit
- Implement proper access controls for investigation data
- Log access to sensitive endpoints for audit trails

### Infrastructure
- Enable HTTPS-only connections
- Configure appropriate CORS policies
- Implement rate limiting on API endpoints
- Use CSP headers to prevent XSS attacks

### Compliance Considerations
- Healthcare data may be subject to HIPAA requirements
- Government contract data is public but aggregated insights may have sensitivity
- Consult legal counsel before operationalizing any fraud investigation workflow

## Reporting Vulnerabilities

If you discover a security issue, please open a GitHub issue or contact the maintainer directly. This is a research project, so responsible disclosure is appreciated but formal bug bounty programs are not in place.

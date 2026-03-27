# Contributing

Thanks for considering a contribution.

## Development Setup

```bash
npm install
npm test
npm start
```

The app serves:

- Receiver: `http://localhost:3000/`
- Sender: `http://localhost:3000/send.html`

## Project Scope

This project intentionally favors a small, easy-to-understand codebase over a large framework-heavy architecture. Please keep changes focused and avoid adding unnecessary dependencies.

## Before Opening a Pull Request

- Run `npm test`
- Update docs if behavior or configuration changes
- Keep the sender/receiver flow working for both local-only and tunnel-based setups
- Preserve the current one-sender/one-receiver model unless a change explicitly revisits that design

## Security Notes

- Do not commit secrets, tokens, private certs, or captured recordings
- For internet-exposed setups, prefer `SESSION_TOKEN`
- Avoid posting vulnerability details publicly before a maintainer has had a chance to review them

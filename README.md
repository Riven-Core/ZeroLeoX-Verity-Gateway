# ZeroLeoX Verity Gateway

Secure bridge between a supported Minecraft server-side integration and an AI provider.

## Architecture

Minecraft -> ZeroLeoX Verity -> Gateway -> AI provider -> Verity

## Important limitation

A normal Minecraft Bedrock mobile client/add-on cannot freely make arbitrary HTTPS
requests. The live gateway connection therefore needs a supported server-side
component (for example a Bedrock Dedicated Server integration).

## Local test

Requires Node.js 20+.

1. Set environment variables from `.env.example`.
2. Start:
   `npm start`
3. Health:
   `GET /health`
4. Chat:
   `POST /chat`

Example body:

```json
{
  "provider": "gemini",
  "playerName": "CubeArchitect0",
  "message": "Verity hola, ¿cómo estás?",
  "mood": 50,
  "history": []
}
```

Header:

`Authorization: Bearer YOUR_GATEWAY_TOKEN`

## Security

- API keys stay on the gateway.
- The Minecraft client must never receive provider API keys.
- Set a long random `GATEWAY_TOKEN`.
- Do not commit `.env` or real secrets to GitHub.

## Next integration step

Connect the Verity Bedrock server-side script to:

`POST https://YOUR-GATEWAY/chat`

Then return `reply` to the player and update the Verity mood/voice systems.

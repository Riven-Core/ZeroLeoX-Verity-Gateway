# ZeroLeoX Verity Gateway v2

Gateway for ZeroLeoX Verity using Gemini only.

## Architecture

Minecraft -> ZeroLeoX Verity -> Gateway -> Gemini -> Verity

## Environment variables

Set these in Render:

- `GATEWAY_TOKEN` = your private gateway token
- `GEMINI_API_KEY` = your Gemini API key
- `GEMINI_MODEL` = `gemini-2.5-flash`

Never put real keys in GitHub.

## Gemini authentication

This version sends the Gemini key through the `x-goog-api-key` request header instead of putting it in the URL. This supports Google's current authorization-key flow.

## Endpoints

### Health

`GET /health`

### Chat

`POST /chat`

Header:

`Authorization: Bearer YOUR_GATEWAY_TOKEN`

JSON:

```json
{
  "playerName": "ZeroLeoX",
  "message": "Hola Verity, ¿cómo estás?",
  "mood": 70,
  "history": []
}
```

The gateway returns:

```json
{
  "ok": true,
  "reply": "<Verity> ...",
  "mood": 70
}
```

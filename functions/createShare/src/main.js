import { Client, TablesDB, ID } from 'node-appwrite';

const sendDiscordAlert = async (webhookUrl, { status, message, payload, response, ip }) => {
  try {
    const color =
      status >= 500 ? 0xe74c3c
      : status >= 400 ? 0xe67e22
      : 0x2ecc71;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: `⚠️ [${status}] Appwrite Function Error`,
            color,
            fields: [
              { name: '📋 Message', value: message, inline: false },
              { name: '🌐 IP', value: ip ?? 'unknown', inline: true },
              { name: '🕐 Time', value: new Date().toISOString(), inline: true },
              {
                name: '📦 Request Payload',
                value: payload
                  ? `\`\`\`json\n${JSON.stringify(payload, null, 2).slice(0, 900)}\n\`\`\``
                  : '_empty_',
                inline: false,
              },
              {
                name: '📤 Response Body',
                value: response
                  ? `\`\`\`json\n${JSON.stringify(response, null, 2).slice(0, 900)}\n\`\`\``
                  : '_empty_',
                inline: false,
              },
            ],
            footer: { text: 'Appwrite Function Logger' },
          },
        ],
      }),
    });
  } catch (_) {
    // never let logging crash the function
  }
};

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
  const ip = req.headers['x-appwrite-client-ip'];
  const body = req.bodyJson ?? {};

  log(`[REQUEST] ${req.method} from ${ip} — body: ${JSON.stringify(body)}`);

  // Helper: send response AND log it
  const respond = (responseBody, status) => {
    log(`[RESPONSE ${status}] ${JSON.stringify(responseBody)}`);
    return res.json(responseBody, status);
  };

  // Helper: 400 + Discord alert
  const badRequest = async (message) => {
    const responseBody = { error: 'Bad Request', message };
    error(`[400] ${message}`);
    await sendDiscordAlert(WEBHOOK_URL, {
      status: 400,
      message,
      payload: body,
      response: responseBody,
      ip,
    });
    return respond(responseBody, 400);
  };

  if (req.method !== 'POST') {
    return respond({ error: 'Method Not Allowed' }, 405);
  }

  const { tracks } = body;

  if (!Array.isArray(tracks) || tracks.length === 0) {
    return badRequest('Missing or invalid parameter: tracks must be a non-empty array');
  }

  const REQUIRED_TRACK_FIELDS = ['$id', 'trackUrl'];
  const ALLOWED_TRACK_FIELDS = [
    '$id', 'trackName', 'authorName', 'authorUrl', 'trackUrl',
    'thumbnail', 'licenseName', 'licenseUrl', 'volume',
    'isPublic', 'fileId', 'category', 'isPremiumOnly', 'moods', 'tags',
  ];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];

    if (typeof track !== 'object' || track === null) {
      return badRequest(`Track at index ${i} must be an object`);
    }

    for (const field of REQUIRED_TRACK_FIELDS) {
      if (!track[field]) {
        return badRequest(`Track at index ${i} is missing required field: ${field}`);
      }
    }

    const unknownFields = Object.keys(track).filter(
      (k) => !ALLOWED_TRACK_FIELDS.includes(k)
    );
    if (unknownFields.length > 0) {
      return badRequest(`Track at index ${i} contains unknown fields: ${unknownFields.join(', ')}`);
    }
  }

  try {
    const db = new TablesDB(client);

    const row = await db.createRow(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_SHARES_TABLE_NAME,
      ID.unique(),
      { tracks: JSON.stringify(tracks) }
    );

    log(`Created share: ${row.$id} with ${tracks.length} track(s)`);

    const responseBody = { success: true, data: { id: row.$id, createdAt: row.$createdAt } };
    return respond(responseBody, 201);

  } catch (e) {
    const alertAndRespond = async (status, label, responseBody) => {
      error(`${label}: ${e.message}`);
      await sendDiscordAlert(WEBHOOK_URL, {
        status,
        message: e.message,
        payload: body,
        response: responseBody,
        ip,
      });
      return respond(responseBody, status);
    };

    if (e?.code === 401) {
      return alertAndRespond(401, 'Auth error', { error: 'Unauthorized', message: 'Invalid API credentials' });
    }

    if (e?.code === 403) {
      return alertAndRespond(403, 'Permission error', { error: 'Forbidden', message: 'Insufficient permissions to access this resource' });
    }

    return alertAndRespond(500, 'Unhandled error', { error: 'Internal Server Error', message: 'An unexpected error occurred.' });
  }
};
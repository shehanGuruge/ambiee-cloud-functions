import { Client, TablesDB, ID } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  if (req.method !== "POST") {
    return res.json({ error: "Method Not Allowed" }, 405);
  }

  const { tracks } = req.bodyJson ?? {};

  // Validate tracks array
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return res.json(
      {
        error: "Bad Request",
        message: "Missing or invalid parameter: tracks must be a non-empty array",
      },
      400
    );
  }

  // Validate each track
  const REQUIRED_TRACK_FIELDS = ["$id", "trackUrl"];
  const ALLOWED_TRACK_FIELDS = [
    "$id", "trackName", "authorName", "authorUrl", "trackUrl",
    "thumbnail", "licenseName", "licenseUrl", "volume",
    "isPublic", "fileId", "category", "isPremiumOnly", "moods", 
    "tags"
  ];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];

    if (typeof track !== "object" || track === null) {
      return res.json(
        { error: "Bad Request", message: `Track at index ${i} must be an object` },
        400
      );
    }

    for (const field of REQUIRED_TRACK_FIELDS) {
      if (!track[field]) {
        return res.json(
          { error: "Bad Request", message: `Track at index ${i} is missing required field: ${field}` },
          400
        );
      }
    }

    const unknownFields = Object.keys(track).filter(
      (k) => !ALLOWED_TRACK_FIELDS.includes(k)
    );
    if (unknownFields.length > 0) {
      return res.json(
        { error: "Bad Request", message: `Track at index ${i} contains unknown fields: ${unknownFields.join(", ")}` },
        400
      );
    }
  }

  try {
    const db = new TablesDB(client);

    const row = await db.createRow(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_SHARES_TABLE_NAME,
      ID.unique(),
      {
        tracks: JSON.stringify(tracks),
      }
    );

    log(`Created share: ${row.$id} with ${tracks.length} track(s)`);

    return res.json(
      {
        success: true,
        data: {
          id: row.$id,
          createdAt: row.$createdAt,
        },
      },
      201
    );
  } catch (e) {
    if (e?.code === 401) {
      error(`Auth error: ${e.message}`);
      return res.json({ error: "Unauthorized", message: "Invalid API credentials" }, 401);
    }

    if (e?.code === 403) {
      error(`Permission error: ${e.message}`);
      return res.json({ error: "Forbidden", message: "Insufficient permissions to access this resource" }, 403);
    }

    error(`Unhandled database error: ${e.message}`);
    return res.json(
      { error: "Internal Server Error", message: "An unexpected error occurred. Please try again later." },
      500
    );
  }
};
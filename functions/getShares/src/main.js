import { Client, Query, TablesDB } from 'node-appwrite';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key'] ?? '');

  if (req.method !== "POST") {
    return res.json({ error: "Method Not Allowed" }, 405);
  }

  const code = req.bodyJson?.code;

  if (!code || typeof code !== "string" || code.trim() === "") {
    return res.json(
      { error: "Bad Request", message: "Missing or invalid required parameter: code" },
      400
    );
  }

  try {
    const db = new TablesDB(client);

    const response = await db.listRows(
      process.env.APPWRITE_DATABASE_ID,
      process.env.APPWRITE_SHARES_TABLE_NAME,
      [Query.equal("$id", code.trim())]
    );

    if (response.rows.length === 0) {
      return res.json(
        { error: "Not Found", message: `Share with code '${code}' does not exist` },
        404
      );
    }

    const share = response.rows[0];

    // Parse the stringified tracks back into a proper array
    let tracks;
    try {
      tracks = JSON.parse(share.tracks);
    } catch {
      error(`Failed to parse tracks for share: ${share.$id}`);
      return res.json(
        { error: "Internal Server Error", message: "Share data is corrupted" },
        500
      );
    }

    log(`Fetched share: ${share.$id} with ${tracks.length} track(s)`);

    return res.json(
      {
        success: true,
        data: {
          id: share.$id,
          tracks,
        },
      },
      200
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
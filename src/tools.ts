import { z } from "zod";
export type Args = Record<string, unknown>;
export interface Tool {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: string[];
  body?: string[];
  write?: boolean;
  public?: boolean;
  sensitive?: boolean;
  socket?: "chat" | "streaming";
  scope: string;
  docs: string;
}
const uuid = z.string().uuid();
const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
const text = z.string().min(1).max(10000);
const short = z.string().min(1).max(500);
const integer = z.number().int().nonnegative().safe();
const channelId = integer.positive();
const url = z
  .string()
  .url()
  .max(2048)
  .refine(
    (v) => ["https:", "http:"].includes(new URL(v).protocol),
    "Use an HTTP(S) URL",
  );
const obj = <S extends z.ZodRawShape>(s: S) => z.object(s).strict();
export const tools: Tool[] = [];
function add(
  name: string,
  description: string,
  path: string,
  schema: z.ZodTypeAny,
  scope: string,
  docs: string,
  extra: Partial<Tool> = {},
) {
  tools.push({
    name: `restream_${name}`,
    description,
    path,
    schema,
    scope,
    docs: `https://developers.restream.io${docs}`,
    method: "GET",
    ...extra,
  });
}
add(
  "list_platforms",
  "List supported streaming platforms. Public endpoint.",
  "/v2/platform/all",
  obj({}),
  "public",
  "/public-api/platforms",
  { public: true },
);
add(
  "list_ingest_servers",
  "List available RTMP ingest servers. Public endpoint.",
  "/v2/server/all",
  obj({}),
  "public",
  "/public-api/servers",
  { public: true },
);
add(
  "get_profile",
  "Read the connected Restream profile.",
  "/v2/user/profile",
  obj({}),
  "profile.read",
  "/private-api/profile",
);
add(
  "get_selected_ingest",
  "Read the selected ingest server ID.",
  "/v2/user/ingest",
  obj({}),
  "channels.read",
  "/private-api/selected-ingest",
);
add(
  "get_stream_key",
  "Retrieve sensitive encoder stream key and SRT URL; do not publish the result.",
  "/v2/user/streamKey",
  obj({}),
  "stream.read",
  "/private-api/stream-key",
  { sensitive: true },
);
add(
  "get_chat_url",
  "Retrieve the sensitive chat embed URL; do not publish the result.",
  "/v2/user/webchat/url",
  obj({}),
  "chat.read",
  "/private-api/chat-url",
  { sensitive: true },
);
add(
  "list_channels",
  "List channels connected to the Restream account.",
  "/v2/user/channels",
  obj({}),
  "channels.read",
  "/channels/channels",
);
add(
  "get_channel",
  "Read a channel by numeric ID.",
  "/v2/user/channels/{channelId}",
  obj({ channelId }),
  "channels.read",
  "/channels/channel",
);
const channel = obj({
  platformId: z.union([
    z.literal(29),
    z.literal(37),
    z.literal(49),
    z.literal(60),
    z.literal(61),
    z.literal(68),
    z.literal(72),
    z.literal(73),
    z.literal(74),
    z.literal(78),
    z.literal(79),
    z.literal(80),
    z.literal(81),
    z.literal(82),
  ]),
  streamUrl: z.string().url().max(2048).optional(),
  streamKey: short.optional(),
  displayName: short.optional(),
  rtmpUsername: short.optional(),
  rtmpPassword: short.optional(),
  instagramUsername: short.optional(),
}).superRefine((a, c) => {
  if (
    [29, 49, 60, 61, 72, 74, 78, 81, 82].includes(a.platformId) &&
    !a.streamUrl
  )
    c.addIssue({ code: "custom", message: "This platform requires streamUrl" });
  if (
    [37, 49, 60, 61, 68, 72, 73, 74, 79, 80].includes(a.platformId) &&
    !a.streamKey
  )
    c.addIssue({ code: "custom", message: "This platform requires streamKey" });
});
add(
  "create_channel",
  "Add a supported manually configured channel. Sends stream credentials to Restream. Writes must be enabled.",
  "/v2/user/channels",
  channel,
  "channels.write",
  "/channels/channel-add",
  {
    method: "POST",
    write: true,
    body: [
      "platformId",
      "streamUrl",
      "streamKey",
      "displayName",
      "rtmpUsername",
      "rtmpPassword",
      "instagramUsername",
    ],
  },
);
add(
  "delete_channel",
  "Delete a channel; this can interrupt delivery to upcoming or live destinations.",
  "/v2/user/channels/{channelId}",
  obj({ channelId }),
  "channels.write",
  "/channels/channel-delete",
  { method: "DELETE", write: true },
);
add(
  "list_upcoming_events",
  "List upcoming events, optionally filtering source (1 Studio, 2 encoder, 3 video) and scheduled state.",
  "/v2/user/events/upcoming",
  obj({
    source: z.number().int().min(1).max(3).optional(),
    scheduled: z.boolean().optional(),
  }),
  "stream.read",
  "/events/upcoming-events",
  { query: ["source", "scheduled"] },
);
add(
  "list_in_progress_events",
  "List events currently in progress.",
  "/v2/user/events/in-progress",
  obj({}),
  "stream.read",
  "/events/in-progress-events",
);
add(
  "list_event_history",
  "List one page of finished and missed events. Increase page to continue; server caps limit at 100.",
  "/v2/user/events/history",
  obj({
    page: integer.positive().max(100000).default(1),
    limit: integer.positive().max(100).default(20),
  }),
  "stream.read",
  "/events/events-history",
  { query: ["page", "limit"] },
);
add(
  "get_event",
  "Read event metadata and destinations.",
  "/v2/user/events/{eventId}",
  obj({ eventId: uuid }),
  "stream.read",
  "/events/event",
);
const event = obj({
  streamType: z.enum(["studio", "encoder", "file"]),
  title: short.optional(),
  description: text.optional(),
  scheduledFor: z.string().datetime({ offset: true }).optional(),
  fileId: uuid.optional(),
  loopsCount: integer.max(9).optional(),
}).superRefine((a, c) => {
  if (a.streamType === "file" && !a.fileId)
    c.addIssue({ code: "custom", message: "fileId required for file events" });
  if (
    a.streamType !== "file" &&
    (a.fileId !== undefined || a.loopsCount !== undefined)
  )
    c.addIssue({
      code: "custom",
      message: "fileId and loopsCount apply only to file events",
    });
});
add(
  "create_event",
  "Create Studio, encoder or stored-video event. Does not start streaming or add destinations.",
  "/v2/user/events/new",
  event,
  "stream.write",
  "/events/event-create",
  {
    method: "POST",
    write: true,
    body: [
      "streamType",
      "title",
      "description",
      "scheduledFor",
      "fileId",
      "loopsCount",
    ],
  },
);
const destFields = {
  channelId,
  streamingOrientation: z.enum(["horizontal", "vertical"]).optional(),
  title: short.optional(),
  description: text.optional(),
  privacyStatus: z.enum(["private", "public", "unlisted"]).optional(),
  videoCategoryId: id.optional(),
  latencyPreference: z.enum(["normal", "low", "ultraLow"]).optional(),
  useEmbeddedClosedCaptions: z.boolean().optional(),
  createEventPost: z.boolean().optional(),
  reuseExistingBroadcastId: id.optional(),
  enableMonetization: z.boolean().optional(),
  adsFrequency: z.enum(["low", "medium", "high"]).optional(),
};
add(
  "add_event_destination",
  "Attach a supported channel; YouTube/Embed Player require title. createEventPost may publish a scheduled broadcast externally. Facebook, Instagram, TikTok, LinkedIn and X are not supported by this endpoint.",
  "/v2/user/events/{eventId}/destinations",
  obj({ eventId: uuid, ...destFields }).refine(
    (a) => !a.enableMonetization || !!a.adsFrequency,
    "adsFrequency required for monetization",
  ),
  "stream.write",
  "/events/event-destination-add",
  { method: "POST", write: true, body: Object.keys(destFields) },
);
add(
  "delete_event_destination",
  "Detach a destination from a scheduled event. Cannot detach from live or finished events; keeps the channel.",
  "/v2/user/events/{eventId}/destinations/{destinationId}",
  obj({ eventId: uuid, destinationId: uuid }),
  "stream.write",
  "/events/event-destination-delete",
  { method: "DELETE", write: true },
);
for (const [name, path, description, docs] of [
  [
    "get_event_stream_key",
    "streamKey",
    "Retrieve sensitive event stream key and SRT URL.",
    "/events/event-stream-key",
  ],
  [
    "get_event_srt_keys",
    "srt/streamKey",
    "Retrieve sensitive event SRT keys; requires Business or Enterprise plan.",
    "/events/event-srt-stream-keys",
  ],
  [
    "list_event_recordings",
    "recordings",
    "List video and audio recordings and expiry times.",
    "/events/events-recordings",
  ],
  [
    "list_event_transcripts",
    "recordings/transcriptions",
    "List generated transcript status and temporary download URLs; does not create transcripts.",
    "/events/events-recording-transcriptions",
  ],
  [
    "get_viewer_analytics",
    "analytics/viewers",
    "Read aggregate and per-channel viewer analytics. 404 can mean no stream analytics.",
    "/analytics/event-analytics-viewers",
  ],
  [
    "get_chat_analytics",
    "analytics/messages",
    "Read aggregate and per-channel chat metrics.",
    "/analytics/event-analytics-messages",
  ],
])
  add(
    name,
    description,
    `/v2/user/events/{eventId}/${path}`,
    obj({ eventId: uuid }),
    path.startsWith("recordings") ? "storage.read" : "stream.read",
    docs,
    { sensitive: path.includes("streamKey") },
  );
add(
  "get_event_chat_history",
  "Read a page of chat messages. Pass either pageToken or timestamp, never both. Return cursors are preserved.",
  "/v2/user/events/{eventId}/chat/history",
  obj({
    eventId: uuid,
    pageSize: integer.positive().max(1000).default(100),
    pageToken: z.string().min(1).max(2048).optional(),
    timestamp: integer.optional(),
  }).refine(
    (a) => !(a.pageToken !== undefined && a.timestamp !== undefined),
    "pageToken and timestamp are mutually exclusive",
  ),
  "chat.read",
  "/events/event-chat-history",
  { query: ["pageSize", "pageToken", "timestamp"] },
);
add(
  "get_chat_export_url",
  "Generate a one-time chat history download link; does not fetch external content.",
  "/v2/user/events/{eventId}/chat/history/download-url",
  obj({ eventId: uuid }),
  "chat.read",
  "/events/events-chat-history-download-url",
  { method: "POST" },
);
add(
  "get_recording_download_url",
  "Generate a temporary download URL for a recording filename returned by list_event_recordings.",
  "/v2/user/events/{eventId}/recordings/download-url",
  obj({
    eventId: uuid,
    fileName: short.refine(
      (s) => !s.includes("/") && !s.includes("\\") && s !== "." && s !== "..",
      "Use the returned filename, not a path",
    ),
  }),
  "storage.read",
  "/events/events-recording-download-url",
  { method: "POST", body: ["fileName"] },
);
add(
  "list_storage_files",
  "List video storage files and processing status.",
  "/v2/user/storage/files",
  obj({}),
  "storage.read",
  "/storage/storage-files",
);
add(
  "get_storage_file",
  "Read a video storage file by ID.",
  "/v2/user/storage/files/{fileId}",
  obj({ fileId: id }),
  "storage.read",
  "/storage/storage-file",
);
add(
  "get_storage_download_url",
  "Generate a temporary storage file download URL.",
  "/v2/user/storage/files/{fileId}/download-url",
  obj({ fileId: id }),
  "storage.read",
  "/storage/storage-file-download-url",
  { method: "POST" },
);
add(
  "list_clip_projects",
  "List a page of clip projects; use returned nextCursor to continue.",
  "/v2/user/clips/projects",
  obj({
    limit: integer.positive().max(100).default(20),
    cursor: z.string().min(1).max(2048).optional(),
    sortBy: z.enum(["CreatedAt", "LastActivity"]).optional(),
  }),
  "clips.read",
  "/clips/clips-projects",
  { query: ["limit", "cursor", "sortBy"] },
);
add(
  "get_clip_project",
  "Read clip generation progress, clips and posting history.",
  "/v2/user/clips/projects/{projectId}",
  obj({ projectId: id }),
  "clips.read",
  "/clips/clips-project-details",
);
add(
  "get_clip_download_url",
  "Retrieve a temporary clip download URL.",
  "/v2/user/clips/{clipId}/download",
  obj({ clipId: id }),
  "clips.read",
  "/clips/clips-download",
);
const clipFields = {
  sourceType: z.enum(["VideoStorageFile", "Event", "PublicUrl"]),
  videoStorageFileId: uuid.optional(),
  eventId: uuid.optional(),
  publicUrl: url.optional(),
  title: short.optional(),
  singleClipMode: z.boolean().optional(),
  forceReprocess: z.boolean().optional(),
  selectedTimeRange: obj({
    startOffsetSeconds: z.number().min(0),
    endOffsetSeconds: z.number().positive(),
  }).optional(),
};
add(
  "create_clip_project",
  "Generate clips asynchronously from a stored file, past event or public video URL. Can consume plan allowance; forceReprocess regenerates clips. Poll get_clip_project.",
  "/v2/user/clips/projects",
  obj(clipFields).superRefine((a, c) => {
    const key = {
      VideoStorageFile: "videoStorageFileId",
      Event: "eventId",
      PublicUrl: "publicUrl",
    }[a.sourceType] as "videoStorageFileId" | "eventId" | "publicUrl";
    if (!a[key])
      c.addIssue({ code: "custom", message: `${key} required for sourceType` });
    for (const k of ["videoStorageFileId", "eventId", "publicUrl"] as const)
      if (k !== key && a[k] !== undefined)
        c.addIssue({
          code: "custom",
          message: "Only provide the selected source field",
        });
    const r = a.selectedTimeRange;
    if (
      r &&
      (r.endOffsetSeconds - r.startOffsetSeconds < 10 ||
        (a.singleClipMode && r.endOffsetSeconds - r.startOffsetSeconds > 600))
    )
      c.addIssue({
        code: "custom",
        message:
          "Range must be at least 10 seconds; singleClipMode caps it at 600 seconds",
      });
  }),
  "clips.write",
  "/clips/clips-project-create",
  { method: "POST", write: true, body: Object.keys(clipFields) },
);
for (const [name, path, doc] of [
  ["brands", "brands", "brands/studio-brands"],
  ["fonts", "fonts", "fonts/studio-fonts"],
  [
    "countdown_music",
    "audio/countdown-music",
    "audio/studio-audio-countdown-music",
  ],
  ["audio_backgrounds", "audio-backgrounds", "audio/studio-audio-backgrounds"],
])
  add(
    `list_${name}`,
    `List Studio ${name.replaceAll("_", " ")}.`,
    `/v2/user/studio/${path}`,
    obj({}),
    "studio.read",
    `/studio/${doc}`,
  );
for (const kind of ["caption", "ticker", "qr_code"] as const) {
  const plural = kind === "qr_code" ? "qr-codes" : `${kind}s`;
  const param = kind === "qr_code" ? "qrCodeId" : `${kind}Id`;
  const docName = kind.replaceAll("_", "-");
  const base = `/v2/user/studio/${plural}`;
  const docs = `/studio/${plural}/studio-${docName}`;
  add(
    `list_${kind}s`,
    `List Studio ${plural}, optionally by brand.`,
    base,
    obj({ brandId: uuid.optional() }),
    "studio.read",
    `${docs}s`,
    { query: ["brandId"] },
  );
  add(
    `get_${kind}`,
    `Read a Studio ${kind.replaceAll("_", " ")}.`,
    `${base}/{${param}}`,
    obj({ [param]: uuid }),
    "studio.read",
    docs,
  );
  const fields: z.ZodRawShape =
    kind === "qr_code"
      ? { title: short, link: url, shouldShowTitle: z.boolean().optional() }
      : kind === "caption"
        ? { text, secondaryText: z.string().max(10000).optional() }
        : { text };
  add(
    `create_${kind}`,
    `Create a reusable Studio ${kind.replaceAll("_", " ")}. Does not toggle it on screen.`,
    base,
    obj({ brandId: uuid, ...fields }),
    "studio.write",
    `${docs}-create`,
    { method: "POST", write: true, body: ["brandId", ...Object.keys(fields)] },
  );
  const update =
    kind === "ticker"
      ? fields
      : Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, v.optional()]),
        );
  add(
    `update_${kind}`,
    `Update a Studio ${kind.replaceAll("_", " ")}.`,
    `${base}/{${param}}`,
    obj({ [param]: uuid, ...update }).refine(
      (a) => Object.keys(fields).some((k) => a[k] !== undefined),
      "Supply at least one update field",
    ),
    "studio.write",
    `${docs}-update`,
    { method: "PATCH", write: true, body: Object.keys(fields) },
  );
  add(
    `delete_${kind}`,
    `Permanently delete a Studio ${kind.replaceAll("_", " ")}.`,
    `${base}/{${param}}`,
    obj({ [param]: uuid }),
    "studio.write",
    `${docs}-delete`,
    { method: "DELETE", write: true },
  );
  if (kind !== "caption")
    add(
      `reorder_${kind}s`,
      `Set the order of Studio ${plural}.`,
      `${base}/order`,
      obj({
        ids: z
          .array(uuid)
          .min(1)
          .max(1000)
          .refine(
            (a) => new Set(a).size === a.length,
            "Duplicate IDs not allowed",
          ),
      }),
      "studio.write",
      `${docs}-reorder`,
      { method: "PATCH", write: true, body: ["ids"] },
    );
}
for (const kind of ["chat", "streaming"] as const)
  add(
    `observe_${kind}`,
    `Collect a bounded window of ${kind} WebSocket events, then disconnect. No background subscription or message sending.`,
    "",
    obj({
      durationSeconds: integer.min(1).max(20).default(5),
      maxEvents: integer.min(1).max(100).default(25),
    }),
    kind === "chat" ? "chat.read" : "stream.read",
    kind === "chat"
      ? "/chat/getting-started"
      : "/private-api/streaming-updates",
    { socket: kind },
  );
export function requestFor(tool: Tool, args: Args) {
  const path = tool.path.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = String(args[k]);
    if (!/^[A-Za-z0-9_-]+$/.test(v)) throw new Error("Invalid path identifier");
    return encodeURIComponent(v);
  });
  const query = new URLSearchParams();
  for (const k of tool.query ?? [])
    if (args[k] !== undefined) query.set(k, String(args[k]));
  const body = tool.body
    ? Object.fromEntries(
        tool.body.filter((k) => args[k] !== undefined).map((k) => [k, args[k]]),
      )
    : undefined;
  return { path: path + (query.size ? `?${query}` : ""), body };
}
